import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completeInterviewReply,DIAGNOSTIC_EXAMPLE,isValidDiagnostic,workingMemory,buildModelMessages} from '../src/interviewer/interview.mjs';
import {MODEL_REQUEST_TIMEOUT_MS} from '../src/model-client.mjs';
const diagnostic={...DIAGNOSTIC_EXAMPLE,active_thread:'信任',new_evidence:['受访者提到拖欠货款'],next_action:'追问当时的判断'};
const valid='<!--PARABLE-DIAG '+JSON.stringify(diagnostic)+' -->原正文';
test('采访者缺少自诊断时最多修复一次，保留原正文与真实原始响应',async()=>{
 const calls=[];const result=await completeInterviewReply({actor:'interviewer',messages:[],generate:async(messages,options)=>{calls.push({messages,options});return calls.length===1?'原正文':valid.replace('原正文','被模型改写的正文');}});
 assert.equal(calls.length,2);assert.equal(result.content,'原正文');assert.equal(result.rawContent,'原正文');assert.equal(result.diagnosticStatus,'repaired');assert.deepEqual(result.diagnostic,diagnostic);assert.equal(calls[0].options.timeoutMs,MODEL_REQUEST_TIMEOUT_MS);assert.ok(calls[1].options.timeoutMs<=calls[0].options.timeoutMs);assert.equal(calls[1].options.phase,'diagnostic_repair');
});
test('无效自诊断不会作为成功发言保存；受访者无需自诊断',async()=>{
 let count=0;await assert.rejects(completeInterviewReply({actor:'interviewer',messages:[],generate:async()=>{count++;return '没有诊断';}}),e=>e.code==='DIAGNOSTIC_INVALID');assert.equal(count,2);
 const respondent=await completeInterviewReply({actor:'respondent',messages:[],generate:async()=>{count++;return '我的回答';}});assert.equal(respondent.diagnostic,null);assert.equal(count,3);
 assert.equal(isValidDiagnostic({...diagnostic,rule_hypothesis:{...diagnostic.rule_hypothesis,maturity:'L4'}}),false);
});
test('诊断状态在调用之前注入，重启恢复最后40版，模拟受访者无法读取',()=>{
 const session={snapshot:{interviewer:{persona:'采访者',skills:''},respondent:{persona:'受访者',skills:''}},messages:Array.from({length:42},(_,i)=>({id:'q'+i,actor:'interviewer',content:'正文'+i,diagnostic,rawContent:'正文'+i}))};
 const restored=JSON.parse(JSON.stringify(session));const memory=workingMemory(restored);assert.equal(memory.history.length,40);assert.equal(memory.sourceMessageId,'q41');
 const messages=buildModelMessages(restored,'interviewer');assert.match(messages[0].content,/上一轮访谈主线状态/);assert.ok(messages[0].content.includes('q41'));assert.ok(messages[0].content.includes('追问当时的判断'));
 assert.ok(!buildModelMessages(restored,'respondent')[0].content.includes('追问当时的判断'));
});
test('首轮等待超过旧90秒上限后仍可修复，且修复只使用剩余总预算',async t=>{
 let now=1000,calls=0,repairBudget;
 t.mock.method(Date,'now',()=>now);
 const output=await completeInterviewReply({actor:'interviewer',messages:[],generate:async(_messages,options)=>{
  calls++;if(calls===1){now+=95000;return '原正文';}
  repairBudget=options.timeoutMs;return valid;
 }});
 assert.equal(calls,2);assert.equal(repairBudget,85000);assert.equal(output.diagnosticStatus,'repaired');
});
