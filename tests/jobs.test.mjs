import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeJobs,groundJobsMessages} from '../src/jobs/jobs-runtime.mjs';
import {buildModelMessages} from '../src/interviewer/interview.mjs';
import {JOBS_LEGACY_SKILLS,JOBS_DEFAULT_SKILLS} from '../src/jobs/jobs-style.mjs';

const jobs={agent:{id:'jobs-demo1',name:'Jobs',version:'0.7.0',knowledge:{type:'jobs-local',version:'0.7.0'},persona:'PRIVATE JOBS',skills:'read'},files:new Map([
 ['knowledge/topic-index.md','主题索引'],['knowledge/topic-family.md','[原文](../raw/family.md)，行 2–3'],['raw/family.md','标题\nPRIVATE SOURCE\n家庭材料\n上下文']
])};
test('Jobs 自动加入已有配置，保留用户编辑；原文仅进入受访者请求',async()=>{
 const config={interviewer:{name:'I',persona:'I',skills:''},respondents:[{id:'founder'}]};
 const merged=mergeJobs(config,jobs);assert.equal(config.respondents.length,1);assert.equal(merged.respondents.length,2);assert.equal(mergeJobs(merged,jobs),merged);
 const session={snapshot:{interviewer:config.interviewer,respondent:jobs.agent},messages:[{actor:'interviewer',content:'家庭意味着什么？'}]};
 const result=await groundJobsMessages({session,messages:buildModelMessages(session,'respondent'),jobs,generate:async()=>JSON.stringify(['knowledge/topic-family.md'])});
 assert.match(result.messages[0].content,/PRIVATE SOURCE/);assert.deepEqual(result.sources,['knowledge/topic-family.md','raw/family.md']);
 assert.ok(!JSON.stringify(buildModelMessages(session,'interviewer')).includes('PRIVATE'));
});
test('Jobs 检索拒绝不存在的路径和版本，普通受访者不触发检索',async()=>{
 const session={snapshot:{respondent:jobs.agent},messages:[]};
 await assert.rejects(groundJobsMessages({session,messages:[],jobs,generate:async()=> '["../../secrets"]'}),/选择无效/);
 await assert.rejects(groundJobsMessages({session,messages:[],jobs:null,generate:async()=>''}),/版本不可用/);
 const messages=[{role:'system',content:'normal'}];assert.equal((await groundJobsMessages({session:{snapshot:{respondent:{}}},messages,jobs,generate:()=>assert.fail()})).messages,messages);
});
test('Jobs 默认表达升级用于新配置，自定义 skills 与既有快照保留',()=>{
 const saved={...jobs.agent,skills:JOBS_LEGACY_SKILLS};const config={respondents:[saved]};
 const updated=mergeJobs(config,jobs);assert.equal(updated.respondents[0].skills,JOBS_DEFAULT_SKILLS);assert.equal(saved.skills,JOBS_LEGACY_SKILLS);
 const custom={respondents:[{...saved,skills:'我的自定义表达'}]};assert.equal(mergeJobs(custom,jobs),custom);
});
test('非语言话题仍读取真实访谈表达参照，与事实引用区分',async()=>{
 const files=new Map(jobs.files);files.set('raw/015-fortune-2008-steve-jobs-speaks-out.md','On the birth of the iPhone\nREAL INTERVIEW CADENCE\nOn what drives Apple employees\nREAL ENERGY\nOn other things\nUNRELATED');
 const session={snapshot:{respondent:jobs.agent},messages:[]};
 const result=await groundJobsMessages({session,messages:[{role:'system',content:'persona'}],jobs:{...jobs,files},generate:async()=> '["knowledge/topic-family.md"]'});
 assert.match(result.messages[0].content,/REAL INTERVIEW CADENCE/);assert.match(result.messages[0].content,/非本轮问题的事实依据/);assert.ok(!result.messages[0].content.includes('UNRELATED'));
});
