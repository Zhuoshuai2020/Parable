import {defaultInterviewer,SLIM_VERSION} from './slim-interviewer.mjs';
import {runInterviewer} from './interviewer-runner.mjs';
import http from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {completeInterviewReply,buildModelMessages,workingMemory,transcript,RUNTIME_VERSION} from './interview.mjs';
import {resolveInterviewerAgent,INTERVIEWER_PROFILE_VERSION,INTERVIEWER_REFERENCE_VERSION,INTERVIEWER_REVISION_NOTES} from './interviewer-profile.mjs';
import {requestModel,MODEL_REQUEST_TIMEOUT_MS} from './model-client.mjs';
import {loadJobs,mergeJobs,groundJobsMessages} from './jobs-respondent.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.PARABLE_DATA_DIR||path.join(root,'data');
await mkdir(dataDir,{recursive:true});
const db = new DatabaseSync(path.join(dataDir,'parable.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, body TEXT); CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
if (!db.prepare('SELECT id FROM settings WHERE id=1').get()) db.prepare('INSERT INTO settings VALUES (1,?)').run(await readFile(path.join(root,'config','agents.json'),'utf8'));
const jobs=await loadJobs();
const getConfig=()=>{const config=JSON.parse(db.prepare('SELECT body FROM settings WHERE id=1').get().body);return mergeJobs({...config,interviewer:defaultInterviewer(config.interviewer,resolveInterviewerAgent)},jobs);};
const save=s=>db.prepare('INSERT OR REPLACE INTO sessions VALUES (?,?)').run(s.id,JSON.stringify(s));
const get=id=>{const row=db.prepare('SELECT body FROM sessions WHERE id=?').get(id);if(!row)throw Error('访谈不存在');return JSON.parse(row.body)};
const busy=new Set();
const configured=()=>Boolean(process.env.PARABLE_API_BASE && process.env.PARABLE_MODEL && process.env.PARABLE_API_KEY);
function validateAgent(a){if(!a || typeof a.name!=='string'||!a.name.trim()||typeof a.persona!=='string'||!a.persona.trim()||typeof a.skills!=='string')throw Error('请填写 Agent 名称、人设和 skills');}
async function model(messages,modelName,options){
  if(!configured())throw Error('尚未配置模型。请设置 PARABLE_API_BASE、PARABLE_MODEL 和 PARABLE_API_KEY 环境变量，然后重启服务。');
  return requestModel({baseUrl:process.env.PARABLE_API_BASE,apiKey:process.env.PARABLE_API_KEY,model:modelName||process.env.PARABLE_MODEL,messages},options);
}
async function generate(s){
  const last=s.messages.at(-1);const actor=!last||last.actor==='respondent'?'interviewer':'respondent';
  if(actor==='respondent'&&s.mode==='human')throw Error('请先输入您的回答');
  const deadline=Date.now()+MODEL_REQUEST_TIMEOUT_MS;
  const generate=(input,options)=>model(input,s.snapshot.model,{...options,timeoutMs:Math.max(1,deadline-Date.now()),role:actor});
  const initialMessages=buildModelMessages(s,actor);
  const {messages,sources}=actor==='respondent'?await groundJobsMessages({session:s,messages:initialMessages,jobs,generate}):{messages:initialMessages,sources:[]};
  const output=await runInterviewer({session:s,actor,messages,generate});
  s.messages.push({id:randomUUID(),actor,...output,...(sources.length?{retrieval:{version:s.snapshot.respondent.knowledge.version,sources}}:{}),at:new Date().toISOString(),runtimeVersion:RUNTIME_VERSION,...(actor==='interviewer'?{interviewerVersion:resolveInterviewerAgent(s.snapshot.interviewer).version}:{})});save(s);return {...s,memory:workingMemory(s)};
}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>2_000_000)throw Error('内容过大');}return data?JSON.parse(data):{};}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const route=url.pathname;
  if(route.startsWith('/api/')&&req.headers.origin&&!['http://127.0.0.1:'+server.address().port,'http://localhost:'+server.address().port].includes(req.headers.origin))return json(res,403,{error:'请求来源不允许'});
  if(route==='/api/status')return json(res,200,{configured:configured(),model:process.env.PARABLE_MODEL||'',local:true,runtime:{version:RUNTIME_VERSION,referenceVersion:INTERVIEWER_REFERENCE_VERSION,interviewerVersion:SLIM_VERSION,revisionNotes:INTERVIEWER_REVISION_NOTES,timeoutSeconds:MODEL_REQUEST_TIMEOUT_MS/1000}});
  if(route==='/api/config'){
   if(req.method==='GET')return json(res,200,getConfig());
   if(req.method!=='PUT')return json(res,405,{error:'方法不支持'});
   const c=await body(req);validateAgent(c.interviewer);if(!Array.isArray(c.respondents)||!c.respondents.length)throw Error('至少保留一位模拟受访者');
   const ids=new Set();for(const a of c.respondents){validateAgent(a);if(typeof a.id!=='string'||!a.id||ids.has(a.id))throw Error('模拟受访者标识无效');ids.add(a.id);}
   c.interviewer=resolveInterviewerAgent(c.interviewer);db.prepare('UPDATE settings SET body=? WHERE id=1').run(JSON.stringify(c));return json(res,200,c);
  }
  if(route==='/api/sessions'){
   if(req.method==='GET')return json(res,200,db.prepare('SELECT body FROM sessions ORDER BY rowid DESC').all().map(r=>{const s=JSON.parse(r.body);return {id:s.id,title:s.title,mode:s.mode,status:s.status,createdAt:s.createdAt,count:s.messages.length,questions:s.messages.filter(m=>m.actor==='interviewer').length,answers:s.messages.filter(m=>m.actor==='respondent').length};}));
   if(req.method!=='POST')return json(res,405,{error:'方法不支持'});
   const b=await body(req);if(!['human','simulation'].includes(b.mode))throw Error('请选择访谈模式');const c=getConfig();const respondent=c.respondents.find(a=>a.id===b.respondentId);
   if(b.mode==='simulation'&&!respondent)throw Error('请选择模拟受访者');
   const s={id:randomUUID(),title:String(b.title||'一次关于传承的对话').slice(0,120),mode:b.mode,status:'active',createdAt:new Date().toISOString(),snapshot:{interviewer:c.interviewer,respondent:b.mode==='simulation'?respondent:null,model:process.env.PARABLE_MODEL||'',version:randomUUID()},messages:[]};save(s);return json(res,201,s);
  }
  const match=route.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(step|answer|finish|export))?$/);
  if(match){
   const [,id,action]=match;
   if(req.method==='GET'&&!action){const s=get(id);return json(res,200,{...s,memory:workingMemory(s)});}
   if(req.method==='GET'&&action==='export'){const s=get(id),text=url.searchParams.get('format')==='md';res.writeHead(200,{'Content-Type':text?'text/markdown; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="parable-${id}.${text?'md':'json'}"`});return res.end(text?transcript(s):JSON.stringify({...s,memory:workingMemory(s)},null,2));}
   if(req.method!=='POST')return json(res,405,{error:'方法不支持'});
   if(busy.has(id))return json(res,409,{error:'此访谈正在生成，请稍后'});busy.add(id);
   try{const s=get(id);if(s.status==='ended')throw Error('这场访谈已经结束');
    if(action==='answer'){const b=await body(req);if(s.mode!=='human'||s.messages.at(-1)?.actor!=='interviewer')throw Error('当前不能提交回答');if(typeof b.content!=='string'||!b.content.trim())throw Error('请填写回答');s.messages.push({id:randomUUID(),actor:'respondent',content:b.content.trim(),at:new Date().toISOString()});save(s);return json(res,200,s);}
    if(action==='finish'){s.status='ended';s.endedAt=new Date().toISOString();save(s);return json(res,200,s);}
    if(action==='step')return json(res,200,await generate(s));throw Error('操作不存在');
   }finally{busy.delete(id);}
  }
  if(route.startsWith('/api/'))return json(res,404,{error:'接口不存在'});
  const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};const file=files[route];if(!file){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'"});res.end(await readFile(path.join(root,'public',file)));
 }catch(e){json(res,e.statusCode||400,{error:e.name==='TimeoutError'?'模型响应超时，已保存的对话仍然保留，请重试。':e.message,...(e.code?{code:e.code}:{})});}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log(`Parable: http://127.0.0.1:${server.address().port}`));
