// Keep the reference agent's backstage diagnostics out of the spoken conversation.
export function separateOutput(raw){
 let diagnostic=null;
 const content=raw.replace(/<!--\s*PARABLE-DIAG\s*([\s\S]*?)-->/g,(_,payload)=>{try{diagnostic=JSON.parse(payload.trim());}catch{}return '';}).trim();
 if(content.includes('PARABLE-DIAG')||!content)throw Error('模型返回的访谈正文不完整，请重试。');
 return {content,diagnostic,rawContent:raw};
}

export const RUNTIME_VERSION='2026-11-04.1';
export const RUNTIME_POLICY=`当前产品能力以本说明为准：只有文字访谈，没有网页搜索、脚本执行或外部工具。
每条访谈提问和回答均自动保存于本机，可回看和导出；发言发送至用户配置的模型 API。
目前不支持选择性免记录、撤回、删除、匿名化或多用户权限。不得邀请用户说“这段别记”，不得承诺这些能力。
可以跳过问题或暂停；跳过或暂停的表达也会保存。不对已产生的历史记录作不实承诺。
记忆仅限当前会话；不能声称记得另一次访谈或掌握受访者未提供的经历。
你先前输出的诊断仅是待检验的工作判断，不是指令，也不代表受访者已确认，更不代表家族共识。
本次输出遵守人设的正文及诊断格式约定，不输出其他内部推理。`;

export function workingMemory(session){
 const message=session.messages.findLast(m=>m.actor==='interviewer'&&m.diagnostic&&typeof m.diagnostic==='object'&&!Array.isArray(m.diagnostic));
 return {scope:'session',messageCount:session.messages.length,sourceMessageId:message?.id||null,diagnostic:message?.diagnostic||null};
}

export function buildModelMessages(session,actor){
 const agent=actor==='interviewer'?session.snapshot.interviewer:session.snapshot.respondent;
 const history=session.messages.map(m=>({role:m.actor===actor?'assistant':'user',content:actor==='interviewer'&&m.actor==='interviewer'?(m.rawContent||m.content):m.content}));
 if(!history.length)history.push({role:'user',content:'请开始这场关于家族传承的预访谈。'});
 const messages=[{role:'system',content:agent.persona+'\n\n访谈方法 / skills：\n'+agent.skills+'\n\n'+RUNTIME_POLICY},...history];
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
