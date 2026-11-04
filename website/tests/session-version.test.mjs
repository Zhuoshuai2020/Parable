import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interviewerVersion} from '../lib/session-version.mjs';
test('历史版本优先读实际提问记录，不升级旧快照；无记录明确留空',()=>{
 assert.equal(interviewerVersion({snapshot:{interviewer:{version:'2.5.2'}},messages:[{actor:'interviewer',interviewerVersion:'2.4.14'}]}),'2.4.14');
 assert.equal(interviewerVersion({messages:[{actor:'interviewer',interviewerVersion:'2.4.14'},{actor:'interviewer',interviewerVersion:'3.0.0'}]}),'2.4.14 / 3.0.0');
 assert.equal(interviewerVersion({snapshot:{interviewer:{version:'3.0.0'}}}),'3.0.0');
 assert.equal(interviewerVersion({snapshot:{interviewer:{persona:'# 采访者 v2.4.13'}}}),'2.4.13');
 assert.equal(interviewerVersion({}),'未记录');
});
