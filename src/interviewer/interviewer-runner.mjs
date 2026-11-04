import {completeInterviewReply,isValidDiagnostic,diagnosticContract} from './interview.mjs';
import {MODEL_REQUEST_TIMEOUT_MS} from '../model-client.mjs';
import {isSlimAgent,selectSlimModules} from './slim-interviewer.mjs';

function parsePlan(raw){
 const match=raw.match(/^\s*<!--\s*PARABLE-DIAG\s*([\s\S]*?)-->\s*$/);
 let value;try{value=JSON.parse(match?.[1]||'null');}catch{}
 return isValidDiagnostic(value)?value:null;
}
export async function runInterviewer({session,actor,messages,generate}){
 const slim=actor==='interviewer'&&isSlimAgent(session.snapshot.interviewer);
 const selectedModules=slim?selectSlimModules(session):[];
 const mode=session.snapshot.interviewMode||'single';
 if(!slim||mode!=='two-step'){
  const result=await completeInterviewReply({actor,messages,generate});
  return actor==='interviewer'?{...result,selectedModules,interviewMode:'single'}:result;
 }
 const deadline=Date.now()+MODEL_REQUEST_TIMEOUT_MS;
 const call=(input,phase)=>{
  const timeoutMs=deadline-Date.now();
  if(timeoutMs<=0)throw Object.assign(Error('两步访谈生成超时，本轮未保存，请重试。'),{statusCode:504,code:'MODEL_TIMEOUT'});
  return generate(input,{timeoutMs,phase});
 };
 const planMessages=messages.map((m,i)=>i===0?{...m,content:m.content+'\n\n本次为两步生成的第一步：只输出一行 PARABLE-DIAG HTML 注释，不输出受访者正文。这一要求替代前面的两部分输出要求。诊断只含简要事实、缺口、候选问题方向及选择，不写逐步推理。'}:m);
 let planRaw=await call(planMessages,'interview_plan'),plan=parsePlan(planRaw),planStatus='validated';
 if(!plan){
  planRaw=await call([...planMessages,{role:'assistant',content:planRaw},{role:'user',content:'只修复结构，返回一行完整的诊断注释，不含正文。'+diagnosticContract+' 本次不要输出随后正文。'}],'interview_plan_repair');
  plan=parsePlan(planRaw);planStatus='repaired';
 }
 if(!plan)throw Object.assign(Error('访谈选线状态无效，本轮未保存，请重试。'),{statusCode:502,code:'DIAGNOSTIC_INVALID'});
 const speechMessages=messages.map((m,i)=>i===0?{...m,content:m.content+'\n\n本次为两步生成的第二步：根据给定本轮计划，只输出受访者可见的正文，一个主要问题。不要输出诊断注释或内部选线过程。这一要求替代前面的诊断加正文格式。'}:m);
 speechMessages.push({role:'user',content:'本轮已选定的简要工作计划（工作假设，不是受访者事实）：\n'+JSON.stringify(plan)+'\n请按本轮选择生成正文。'});
 const content=(await call(speechMessages,'interview_speech')).trim();
 if(!content||content.includes('PARABLE-DIAG'))throw Object.assign(Error('两步生成正文格式无效，本轮未保存，请重试。'),{statusCode:502,code:'INTERVIEW_SPEECH_INVALID'});
 return {content,diagnostic:plan,rawContent:'<!--PARABLE-DIAG '+JSON.stringify(plan)+' -->\n'+content,diagnosticStatus:planStatus,planRawContent:planRaw,selectedModules,interviewMode:'two-step'};
}
