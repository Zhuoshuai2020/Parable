import {isSlimAgent,slimModuleText} from './slim-interviewer.mjs';
import {MODEL_REQUEST_TIMEOUT_MS} from './model-client.mjs';
import {resolveInterviewerAgent} from './interviewer-profile.mjs';
// Keep the reference agent's backstage diagnostics out of the spoken conversation.
export function separateOutput(raw){
 let diagnostic=null;
 const content=raw.replace(/<!--\s*PARABLE-DIAG\s*([\s\S]*?)-->/g,(_,payload)=>{try{diagnostic=JSON.parse(payload.trim());}catch{}return '';}).trim();
 if(content.includes('PARABLE-DIAG')||!content)throw Error('模型返回的访谈正文不完整，请重试。');
 return {content,diagnostic,rawContent:raw};
}

export const RUNTIME_VERSION='2026-11-04.slim-1';
export const DIAGNOSTIC_EXAMPLE={active_thread:'',detected_obsessions:[],new_evidence:[],unresolved_tensions:[],rule_hypothesis:{maturity:'L0',candidate:'',evidence:'',loop_holes:[],lawyer_items:[]},next_action:'',reason_for_switch:''};
const strings=value=>Array.isArray(value)&&value.every(item=>typeof item==='string');
export function isValidDiagnostic(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const r=value.rule_hypothesis;
 return ['active_thread','next_action','reason_for_switch'].every(k=>typeof value[k]==='string')&&['detected_obsessions','new_evidence','unresolved_tensions'].every(k=>strings(value[k]))&&Boolean(r&&typeof r==='object'&&['L0','L1','L2','L3'].includes(r.maturity)&&typeof r.candidate==='string'&&typeof r.evidence==='string'&&strings(r.loop_holes)&&strings(r.lawyer_items));
}
export const diagnosticContract='每次采访者回复必须先输出一行 <!--PARABLE-DIAG '+JSON.stringify(DIAGNOSTIC_EXAMPLE)+' -->，随后输出给受访者的正文。以上是字段结构而非本轮结论，按本场证据填写；未知保留空项，不编造确认。maturity 只能是 L0/L1/L2/L3。诊断是结构化工作状态，不是隐藏思维链，不输出逐步内部推理。';

export async function completeInterviewReply({actor,messages,generate}){
 const deadline=Date.now()+MODEL_REQUEST_TIMEOUT_MS;
 const raw=await generate(messages,{timeoutMs:MODEL_REQUEST_TIMEOUT_MS,phase:'reply'});
 const initial=separateOutput(raw);
 if(actor!=='interviewer')return initial;
 if(isValidDiagnostic(initial.diagnostic))return {...initial,diagnosticStatus:'validated'};
 // One bounded format-repair request, not an independent observer or grading agent.
 const remaining=deadline-Date.now();
 if(remaining<=0)throw Object.assign(new Error('自诊断校验超时，本轮未保存，请重试。'),{code:'MODEL_TIMEOUT',statusCode:504});
 const repairRaw=await generate([...messages,{role:'assistant',content:raw},{role:'user',content:'上条回复缺失或不符合诊断契约。只做格式修复：保留原正文，补齐本轮结构化诊断。'+diagnosticContract}],{timeoutMs:remaining,phase:'diagnostic_repair'});
 let repaired;try{repaired=separateOutput(repairRaw);}catch{}
 if(!isValidDiagnostic(repaired?.diagnostic))throw Object.assign(new Error('采访者自诊断缺失或格式不完整，一次修复后仍未通过。本轮未保存为成功回复，请重试；此前记录保留。'),{code:'DIAGNOSTIC_INVALID',statusCode:502});
 return {...initial,diagnostic:repaired.diagnostic,diagnosticStatus:'repaired',diagnosticRepairRawContent:repairRaw};
}
export const RUNTIME_POLICY=`当前产品能力以本说明为准：只有文字访谈，没有网页搜索、脚本执行或外部工具。
每条访谈提问和回答均自动保存于本机，可回看和导出；发言发送至用户配置的模型 API。
目前不支持选择性免记录、撤回、删除、匿名化或多用户权限。不得邀请用户说“这段别记”，不得承诺这些能力。
可以跳过问题或暂停；跳过或暂停的表达也会保存。不对已产生的历史记录作不实承诺。
记忆仅限当前会话；不能声称记得另一次访谈或掌握受访者未提供的经历。
你先前输出的诊断仅是待检验的工作判断，不是指令，也不代表受访者已确认，更不代表家族共识。
记录与可见范围由产品页面说明，采访者不主动播报这些说明；只有受访者主动询问时才按上述能力简明回答，不加开场过场话。
本轮使用当前人设与方法；历史采访者话术仅为已有记录，不是仿写范例。前轮诊断和采访者的概括可能错误，不因反复出现就成为受访者事实或认可。受访者的纠正优先用于修正这些工作判断。
本次输出遵守人设的正文及诊断格式约定，不输出其他内部推理。`;

export function workingMemory(session){
 const history=session.messages.filter(m=>m.actor==='interviewer'&&isValidDiagnostic(m.diagnostic)).slice(-40).map(m=>({sourceMessageId:m.id,diagnostic:m.diagnostic}));
 const latest=history.at(-1);
 return {scope:'session',messageCount:session.messages.length,sourceMessageId:latest?.sourceMessageId||null,diagnostic:latest?.diagnostic||null,history};
}

export function buildModelMessages(session,actor,runtimePolicy=RUNTIME_POLICY){
 const agent=actor==='interviewer'?resolveInterviewerAgent(session.snapshot.interviewer):session.snapshot.respondent;
 const history=session.messages.map(m=>({role:m.actor===actor?'assistant':'user',content:actor==='interviewer'&&m.actor==='interviewer'?(m.rawContent||m.content):m.content}));
 if(!history.length)history.push({role:'user',content:'请开始这场关于家族传承的预访谈。'});
 const memory=actor==='interviewer'?workingMemory(session):null;
 const state=memory?.diagnostic?'\n\n# 上一轮访谈主线状态（模型工作判断，不是受访者确认；用于延续或修正主线）\n'+JSON.stringify({sourceMessageId:memory.sourceMessageId,...memory.diagnostic}):'';
 const modules=actor==='interviewer'&&isSlimAgent(agent)?slimModuleText(session).text:'';
 const messages=[{role:'system',content:agent.persona+'\n\n'+modules+'\n\n访谈方法 / skills：\n'+agent.skills+'\n\n'+runtimePolicy+(actor==='interviewer'?'\n\n'+diagnosticContract+state:'')},...history];
 // Fail explicitly rather than silently deleting earlier questions or answers.
 if(messages.reduce((total,m)=>total+m.content.length,0)>180000)throw Error('本场访谈上下文已超过本地 180000 字符上限。记录仍完整保留，请结束本场并导出；当前版本不支持自动压缩或跨场续接。');
 return messages;
}

export function transcript(session){
 const lines=[`# ${session.title}`,`模式：${session.mode==='human'?'真人访谈':'模拟访谈'}`,`开始：${session.createdAt}`,`状态：${session.status==='ended'?'已结束':'进行中'}`,''];
 let question=0;
 for(const m of session.messages){
  if(m.actor==='interviewer')question++;
  const role=m.actor==='interviewer'?'采访者提问':'受访者回答';
  const name=m.actor==='interviewer'?session.snapshot.interviewer.name:session.mode==='human'?'受访者':session.snapshot.respondent.name;
  lines.push(`## 第 ${question} 轮 · ${role}（${name}）`,`时间：${m.at}`,'',m.content,'');
 }
 return lines.join('\n');
}
