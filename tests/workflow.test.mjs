import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {DIAGNOSTIC_EXAMPLE} from '../src/interviewer/interview.mjs';

test('访谈完整流程、配置隔离、失败重试和持久化',{timeout:30000},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'parable-test-'));
 const calls=[];let fail=false,truncated=false,child;
 const mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;calls.push(JSON.parse(raw));res.writeHead(fail?503:200,{'Content-Type':'application/json'});const diag=!calls.at(-1).messages[0].content.includes('RESPONDENT-SECRET')?'<!--PARABLE-DIAG '+JSON.stringify({...DIAGNOSTIC_EXAMPLE,active_thread:'传承'})+' -->':'';res.end(JSON.stringify({choices:[{finish_reason:truncated?'length':'stop',message:{content:diag+'测试生成的第 '+calls.length+' 条发言'}}]}));});
 mock.listen(0,'127.0.0.1');await once(mock,'listening');
 async function start(extra={}){child=spawn(process.execPath,['--no-warnings','server.mjs'],{env:{...process.env,PORT:'0',PARABLE_DATA_DIR:directory,PARABLE_API_BASE:`http://127.0.0.1:${mock.address().port}/v1`,PARABLE_MODEL:'test-model',PARABLE_API_KEY:'test-private-key',...extra},stdio:['ignore','pipe','pipe']});const [chunk]=await once(child.stdout,'data');return String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/)[0];}
 async function stop(){const p=once(child,'exit');child.kill();await p;child=null;}
 try{
  let base=await start();
  const request=async(route,method='GET',data)=>{const r=await fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:await r.json()};};
  const initial=(await request('config')).body;
  const config={interviewer:{name:'采访者',persona:'INTERVIEWER-SECRET',skills:'追问经历'},respondents:[{id:'test',name:'模拟人物',persona:'RESPONDENT-SECRET',skills:'保持经历一致'}]};
  assert.equal((await request('config','PUT',config)).status,200);
  const sim=(await request('sessions','POST',{mode:'simulation',respondentId:'test',title:'模拟测试'})).body;
  let result=await request(`sessions/${sim.id}/step`,'POST');assert.equal(result.body.messages[0].actor,'interviewer');
  assert.match(calls[0].messages[0].content,/INTERVIEWER-SECRET/);assert.ok(!JSON.stringify(calls[0]).includes('RESPONDENT-SECRET'));
  result=await request(`sessions/${sim.id}/step`,'POST');assert.equal(result.body.messages[1].actor,'respondent');assert.match(calls[1].messages[0].content,/RESPONDENT-SECRET/);assert.ok(!JSON.stringify(calls[1]).includes('INTERVIEWER-SECRET'));
  assert.equal(calls[1].messages[1].role,'user');
  assert.ok(!JSON.stringify(calls[1]).includes('PARABLE-DIAG'));
  config.interviewer.persona='NEW-PERSONA';await request('config','PUT',config);
  result=await request(`sessions/${sim.id}/step`,'POST');assert.equal(result.body.snapshot.interviewer.persona,'INTERVIEWER-SECRET');
  assert.match(calls[2].messages[1].content,/PARABLE-DIAG/);assert.equal(result.body.memory.diagnostic.active_thread,'传承');
  truncated=true;assert.equal((await request(`sessions/${sim.id}/step`,'POST')).status,502);assert.equal((await request('sessions/'+sim.id)).body.messages.length,3);truncated=false;
  fail=true;result=await request(`sessions/${sim.id}/step`,'POST');assert.equal(result.status,502);assert.equal((await request('sessions/'+sim.id)).body.messages.length,3);
  fail=false;assert.equal((await request(`sessions/${sim.id}/step`,'POST')).body.messages.length,4);
  const human=(await request('sessions','POST',{mode:'human'})).body;
  await request(`sessions/${human.id}/step`,'POST');
  assert.equal((await request(`sessions/${human.id}/step`,'POST')).status,400);
  await request(`sessions/${human.id}/answer`,'POST',{content:'我的创业经历'});
  assert.equal((await request(`sessions/${human.id}/answer`,'POST',{content:'重复'})).status,400);
  fail=true;await request(`sessions/${human.id}/step`,'POST');assert.equal((await request('sessions/'+human.id)).body.messages[1].content,'我的创业经历');fail=false;
  await request(`sessions/${human.id}/step`,'POST');
  const exported=(await request(`sessions/${human.id}/export`)).body;assert.equal(exported.messages.length,3);assert.ok(!JSON.stringify(exported).includes('test-private-key'));
  const transcript=await (await fetch(base+`/api/sessions/${human.id}/export?format=md`)).text();assert.match(transcript,/采访者提问/);assert.match(transcript,/受访者回答/);assert.match(transcript,/我的创业经历/);assert.ok(!transcript.includes('PARABLE-DIAG'));
  await request(`sessions/${human.id}/finish`,'POST');assert.equal((await request(`sessions/${human.id}/step`,'POST')).status,400);
  const crossOrigin=await fetch(base+'/api/config',{method:'PUT',headers:{Origin:'https://external.example','Content-Type':'application/json'},body:JSON.stringify(config)});assert.equal(crossOrigin.status,403);
  await stop();base=await start();assert.equal((await request('sessions/'+human.id)).body.messages.length,3);assert.equal((await request('config')).body.interviewer.persona,'NEW-PERSONA');
  assert.equal((await request('sessions/'+sim.id)).body.memory.diagnostic.active_thread,'传承');
  const listing=(await request('sessions')).body.find(s=>s.id===human.id);assert.equal(listing.questions,2);assert.equal(listing.answers,1);
  assert.equal((await request('sessions')).body.length,2);
  await stop();base=await start({PARABLE_API_KEY:''});
  assert.equal((await request('status')).body.configured,false);assert.equal((await request(`sessions/${sim.id}/step`,'POST')).status,400);
  await request('config','PUT',initial);
 }finally{if(child)await stop();mock.closeAllConnections();await new Promise(resolve=>mock.close(resolve));await rm(directory,{recursive:true,force:true});}
});
