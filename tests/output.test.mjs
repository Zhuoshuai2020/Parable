import {test} from 'node:test';
import assert from 'node:assert/strict';
import {separateOutput,buildModelMessages,workingMemory,transcript,DIAGNOSTIC_EXAMPLE} from '../interview.mjs';
test('诊断保留在记录，不混入给受访者的正文',()=>{
 const raw='<!--PARABLE-DIAG {"active_thread":"传承"} -->\n您希望留下什么？';
 const result=separateOutput(raw);
 assert.equal(result.content,'您希望留下什么？');
 assert.equal(result.diagnostic.active_thread,'传承');assert.equal(result.rawContent,raw);
 assert.equal(separateOutput('普通回答').content,'普通回答');
 assert.equal(separateOutput('<!--PARABLE-DIAG invalid -->正文').content,'正文');
 assert.throws(()=>separateOutput('<!--PARABLE-DIAG {未完成'));
 assert.throws(()=>separateOutput('<!--PARABLE-DIAG {} -->'));
});

const session=()=>({title:'测试访谈',mode:'simulation',status:'active',createdAt:'2026-11-04T00:00:00Z',snapshot:{interviewer:{name:'采访者',persona:'采访人设',skills:'追问'},respondent:{name:'虚构人物',persona:'受访者私有人设',skills:'回答'}},messages:[{id:'q1',actor:'interviewer',at:'2026-11-04T00:00:01Z',...separateOutput('<!--PARABLE-DIAG '+JSON.stringify({...DIAGNOSTIC_EXAMPLE,active_thread:'诚信',unresolved_tensions:['待核']})+' -->您的经历是什么？')},{id:'a1',actor:'respondent',at:'2026-11-04T00:00:02Z',content:'这是我的回答。'}]});
test('本场工作记忆恢复且不泄露给模拟受访者',()=>{
 const s=JSON.parse(JSON.stringify(session()));
 const interviewer=buildModelMessages(s,'interviewer');
 assert.equal(interviewer.length,3);assert.match(interviewer[1].content,/PARABLE-DIAG/);
 assert.equal(interviewer[1].role,'assistant');assert.equal(interviewer[2].content,'这是我的回答。');
 assert.ok(!JSON.stringify(interviewer).includes('受访者私有人设'));
 const respondent=buildModelMessages(s,'respondent');assert.ok(!JSON.stringify(respondent).includes('PARABLE-DIAG'));assert.equal(respondent[1].content,'您的经历是什么？');
 const memory=workingMemory(s);assert.equal(memory.sourceMessageId,'q1');assert.equal(memory.diagnostic.active_thread,'诚信');assert.equal(memory.scope,'session');
 const fresh={...s,messages:[]};assert.equal(workingMemory(fresh).diagnostic,null);assert.ok(!JSON.stringify(buildModelMessages(fresh,'interviewer')).includes('您的经历是什么？'));
});
test('长访谈不静默截断；完整问答按轮次导出',()=>{
 const s=session();const text=transcript(s);assert.match(text,/第 1 轮 · 采访者提问/);assert.match(text,/您的经历是什么？/);assert.match(text,/第 1 轮 · 受访者回答/);assert.match(text,/这是我的回答。/);assert.ok(!text.includes('PARABLE-DIAG'));
 s.messages.push({actor:'respondent',content:'字'.repeat(180001)});assert.throws(()=>buildModelMessages(s,'interviewer'),/上下文/);assert.equal(s.messages.length,3);
});
