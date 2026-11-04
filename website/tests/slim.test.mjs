import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slimAgent,selectSlimModules,defaultInterviewer} from '../lib/slim-interviewer.mjs';
import {resolveInterviewerAgent} from '../lib/interviewer-profile.mjs';
import {buildModelMessages,DIAGNOSTIC_EXAMPLE} from '../lib/interview.mjs';
import {runInterviewer} from '../lib/interviewer-runner.mjs';
const session=(answers=[],mode='single')=>({snapshot:{interviewer:slimAgent,interviewMode:mode},messages:answers.map(content=>({actor:'respondent',content}))});
const diag='<!--PARABLE-DIAG '+JSON.stringify({...DIAGNOSTIC_EXAMPLE,next_action:'成因、传承两个方向，选择成因'})+' -->';

test('按需模块不常驻；拒绝优先；有经历线索时提供主动规则探索模块',()=>{
 assert.deepEqual(selectSlimModules(session()),[]);
 assert.deepEqual(selectSlimModules(session(['累了，不想谈底线和股份'])),['F']);
 assert.ok(!selectSlimModules(session(['公司该谁拍板，你怎么看'])).includes('G'));
 const s=session(['当年有一次失败','后来的经历','公司该谁拍板，我想听您的看法']);
 assert.ok(selectSlimModules(s).includes('G'));
 const proactive=selectSlimModules(session(['当年有一次失败','后来的经历','我希望后代保持诚信']));
 for(const key of ['D','G','H'])assert.ok(proactive.includes(key));
 const messages=buildModelMessages(session(),'interviewer');
 assert.ok(messages[0].content.length<5000);assert.ok(!messages[0].content.includes('IFC 治理手册'));
});
test('新默认采用精简版，用户自定义配置保持原样',()=>{
 const custom={...slimAgent,persona:'我的采访者',skills:'我的方法'};
 assert.equal(defaultInterviewer(custom,resolveInterviewerAgent).persona,custom.persona);
 assert.equal(resolveInterviewerAgent(slimAgent).version,'2.5.2');
});
test('两步先校验诊断再生成正文；复用同一模型调用接口',async()=>{
 const s=session(['我想留下诚信'],'two-step'),calls=[];
 const result=await runInterviewer({session:s,actor:'interviewer',messages:buildModelMessages(s,'interviewer'),generate:async(messages,options)=>{calls.push({messages,options});return calls.length===1?diag:'这份坚持是怎样形成的？';}});
 assert.deepEqual(calls.map(c=>c.options.phase),['interview_plan','interview_speech']);
 assert.equal(result.content,'这份坚持是怎样形成的？');
 assert.equal(result.diagnostic.next_action,'成因、传承两个方向，选择成因');
 assert.ok(calls[1].messages.at(-1).content.includes(result.diagnostic.next_action));
 assert.equal(result.interviewMode,'two-step');
});
test('两步诊断连续无效时不生成正文；单步保持原路径',async()=>{
 const s=session(['诚信'],'two-step');let n=0;
 await assert.rejects(runInterviewer({session:s,actor:'interviewer',messages:buildModelMessages(s,'interviewer'),generate:async()=>{n++;return '无效计划';}}),/选线状态无效/);
 assert.equal(n,2);
 const one=session(['诚信']);n=0;
 const result=await runInterviewer({session:one,actor:'interviewer',messages:buildModelMessages(one,'interviewer'),generate:async()=>{n++;return diag+'\n这来自什么经历？';}});
 assert.equal(n,1);assert.equal(result.interviewMode,'single');
});

test('已保存的旧精简默认配置用于新访谈时升级，自定义方法保留',async()=>{
 const {default:profile}=await import('../config/slim-interviewer.json',{with:{type:'json'}});
 const old={...slimAgent,persona:profile.previousPersonas[0],version:'3.0.0'};
 assert.equal(defaultInterviewer(old,resolveInterviewerAgent).version,'2.5.2');
 assert.equal(defaultInterviewer({...old,skills:'自定义方法'},resolveInterviewerAgent).skills,'自定义方法');
});
