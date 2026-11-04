import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visitorIdentity} from '../lib/visitor.mjs';
import {publicRecord} from '../lib/record-access.mjs';
test('免登录访客空间随机、稳定且彼此隔离',async()=>{
 const a=await visitorIdentity(new Request('https://site.test/api/status'));
 const b=await visitorIdentity(new Request('https://site.test/api/status'));
 assert.notEqual(a.owner,b.owner);assert.match(a.setCookie,/HttpOnly/);assert.match(a.setCookie,/Secure/);assert.match(a.setCookie,/SameSite=Lax/);
 const restored=await visitorIdentity(new Request('https://site.test/api/sessions',{headers:{cookie:a.setCookie.split(';')[0]}}));
 assert.equal(restored.owner,a.owner);assert.equal(restored.setCookie,null);
 assert.ok(!a.owner.includes(a.setCookie.split(';')[0].split('=')[1]));
 const invalid=await visitorIdentity(new Request('https://site.test/',{headers:{cookie:'__Host-parable-visitor=bad'}}));assert.ok(invalid.setCookie);
});
test('公开记录完整保留问答，但不暴露内部人设与诊断',()=>{
 const record=publicRecord({id:'test',title:'公开访谈',snapshot:{interviewer:{name:'采访者',persona:'private-persona'},respondent:{name:'模拟人物',skills:'private-skills'},version:'v'},messages:[{id:'q',actor:'interviewer',content:'公开提问',rawContent:'private-diagnostic',diagnostic:{secret:'private-diagnostic'}},{id:'a',actor:'respondent',content:'公开回答'}]});
 assert.equal(record.canEdit,false);assert.equal(record.messages.length,2);assert.equal(record.messages[0].content,'公开提问');assert.ok(!JSON.stringify(record).includes('private-'));
});
