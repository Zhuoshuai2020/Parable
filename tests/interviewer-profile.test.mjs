import {test} from 'node:test';
import assert from 'node:assert/strict';
import profile from '../config/interviewer-profile.json' with {type:'json'};
import {resolveInterviewerAgent} from '../src/interviewer/interviewer-profile.mjs';
import {buildModelMessages} from '../src/interviewer/interview.mjs';
test('v2.4.14沿用原章节顺序，保留诊断字段契约',()=>{
 const headings=s=>s.split('\n').filter(line=>line.startsWith('## '));assert.deepEqual(headings(profile.persona),headings(profile.referencePersona));
 const diag=s=>s.match(/<!--PARABLE-DIAG (\{.*?\}) -->/)[1];
 assert.deepEqual(Object.keys(JSON.parse(diag(profile.persona))),Object.keys(JSON.parse(diag(profile.referencePersona))));
 assert.match(profile.persona.split('\n')[0],/v2\.4\.14/);assert.match(profile.referencePersona.split('\n')[0],/v2\.4\.12/);
});
test('已知原版配置升级，自定义人设和方法不会被覆盖',()=>{
 const original={name:'采访者',persona:profile.referencePersona,skills:profile.referenceSkills};
 const updated=resolveInterviewerAgent(original);assert.equal(updated.version,'2.4.14');assert.equal(updated.persona,profile.persona);assert.equal(updated.skills,profile.skills);assert.equal(original.persona,profile.referencePersona);
 const custom={...original,persona:original.persona+'\n自定义要求',skills:'自定义方法'};const preserved=resolveInterviewerAgent(custom);assert.equal(preserved.persona,custom.persona);assert.equal(preserved.skills,custom.skills);assert.equal(preserved.isCustom,true);
 const partial=resolveInterviewerAgent({...original,skills:'用户方法'});assert.equal(partial.skills,'用户方法');
});

test('上一正式版的进行中快照升级，历史不改写且自定义方法保留',()=>{
 const previous=profile.previousProfiles.find(p=>p.version==='2.4.13');assert.ok(previous);
 const agent={name:'采访者',persona:previous.persona,skills:previous.skills};
 const session={snapshot:{interviewer:agent},messages:[{id:'old',actor:'interviewer',content:'原有长问题'}]};
 const before=JSON.stringify(session);const messages=buildModelMessages(session,'interviewer');
 assert.ok(messages[0].content.startsWith(profile.persona));assert.ok(messages[0].content.includes(profile.skills));assert.equal(JSON.stringify(session),before);
 assert.equal(resolveInterviewerAgent({...agent,skills:'用户修改的方法'}).skills,'用户修改的方法');
 assert.equal(resolveInterviewerAgent({...agent,persona:agent.persona+'\n用户修改'}).persona,agent.persona+'\n用户修改');
});
test('表达要求只来自可编辑人设，不再另外追加表达覆盖层',()=>{
 const messages=buildModelMessages({snapshot:{interviewer:{name:'采访者',persona:profile.referencePersona,skills:profile.referenceSkills}},messages:[]},'interviewer');
 assert.ok(messages[0].content.startsWith(profile.persona));assert.ok(!messages[0].content.includes('本要求优先于旧人设'));assert.ok(messages[0].content.includes('PARABLE-DIAG'));
});
