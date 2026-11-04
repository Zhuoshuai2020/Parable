import {interviewerVersion} from '../../../lib/session-version.mjs';
import {defaultInterviewer,slimAgent,SLIM_VERSION} from '../../../lib/slim-interviewer.mjs';
import {runInterviewer} from '../../../lib/interviewer-runner.mjs';
import baselineInterviewer from '../../../config/baseline-interviewer.json';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {visitorIdentity} from '../../../lib/visitor.mjs';
import {publicRecord} from '../../../lib/record-access.mjs';
import defaults from '../../../config/agents.json';
import {completeInterviewReply,buildModelMessages,workingMemory,transcript,RUNTIME_VERSION,RUNTIME_POLICY} from '../../../lib/interview.mjs';
import {resolveInterviewerAgent,INTERVIEWER_PROFILE_VERSION,INTERVIEWER_REFERENCE_VERSION,INTERVIEWER_REVISION_NOTES} from '../../../lib/interviewer-profile.mjs';
import {requestModel,MODEL_REQUEST_TIMEOUT_MS} from '../../../lib/model-client.mjs';
import privateJobs from '../../../config/jobs-private.json';
import {mergeJobs,groundJobsMessages} from '../../../lib/jobs-runtime.mjs';

export const dynamic='force-dynamic';
const agentSchema=z.object({name:z.string().trim().min(1),persona:z.string().trim().min(1),skills:z.string(),version:z.string().optional(),knowledge:z.object({type:z.literal('jobs-local'),version:z.literal('0.7.0')}).optional()});
const configSchema=z.object({interviewer:agentSchema,respondents:z.array(agentSchema.extend({id:z.string().min(1)})).min(1)}).refine(c=>new Set(c.respondents.map(a=>a.id)).size===c.respondents.length,'人物标识重复');
type Agent=z.infer<typeof agentSchema>;
type Message={id:string;actor:'interviewer'|'respondent';content:string;at:string;rawContent?:string;diagnostic?:unknown;runtimeVersion?:string};
type Session={id:string;title:string;mode:'human'|'simulation';status:'active'|'ended';createdAt:string;endedAt?:string;snapshot:{interviewer:Agent;respondent:(Agent&{id:string})|null;model:string;version:string;interviewMode?:'single'|'two-step'};replay?:{sourceId:string;throughRound:number;variant:'A'|'B'|'C';prefixLength:number};messages:Message[]};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const jobsBundle=z.object({agent:agentSchema.extend({id:z.string(),version:z.string()}),files:z.record(z.string())}).nullable().parse(privateJobs);
const jobs=jobsBundle?{agent:jobsBundle.agent,files:new Map(Object.entries(jobsBundle.files))}:null;
const runtimePolicy=RUNTIME_POLICY.replace('保存于本机','保存于云端公开记录区')+'\n访谈提问与回答公开，任何访问者可以查看和导出。只在创建访谈的浏览器中允许继续回答或结束；不需要登录。不得声称对话只对本人可见。';
function error(message:string,statusCode=400):never{throw Object.assign(new Error(message),{statusCode});}
async function payload(request:Request){if(Number(request.headers.get('content-length'))>2_000_000)error('内容过大',413);const text=await request.text();if(text.length>2_000_000)error('内容过大',413);try{return JSON.parse(text||'{}');}catch{error('请求内容无效');}}

async function handleForVisitor(request:Request,owner:string):Promise<Response>{
 try{
  const url=new URL(request.url),route=url.pathname;
  const origin=request.headers.get('origin');if(origin&&origin!==url.origin)error('请求来源不允许',403);
  const db=env.DB;if(!db)error('访谈存储尚未就绪',503);
  const baseUrl=env.PARABLE_API_BASE||'',model=env.PARABLE_MODEL||'',apiKey=env.PARABLE_API_KEY||'';
  const configured=Boolean(baseUrl&&model&&apiKey);
  const getConfig=async():Promise<z.infer<typeof configSchema>>=>{const row=await db.prepare('SELECT body FROM agent_settings WHERE owner=?').bind(owner).first<{body:string}>();const c=configSchema.parse(row?JSON.parse(row.body):defaults);return mergeJobs({...c,interviewer:defaultInterviewer(c.interviewer,resolveInterviewerAgent)},jobs);};
  const get=async(id:string)=>{const row=await db.prepare('SELECT body FROM interview_sessions WHERE id=? AND owner=?').bind(id,owner).first<{body:string}>();if(!row)error('访谈不存在',404);return JSON.parse(row.body) as Session;};
  const read=async(id:string)=>{const row=await db.prepare('SELECT body,owner FROM interview_sessions WHERE id=?').bind(id).first<{body:string;owner:string}>();if(!row)error('访谈不存在',404);const s=JSON.parse(row.body) as Session;return row.owner===owner?{...s,canEdit:true,memory:workingMemory(s)}:publicRecord(s);};
  if(route==='/api/status')return json({configured,model,local:false,visitor:true,runtime:{version:RUNTIME_VERSION,referenceVersion:'2.4.14',interviewerVersion:SLIM_VERSION,revisionNotes:'精简版 2.5.2：按愿景材料分三种情况推进；关注与社会共识的差异；接受、修改和拒绝均可作为宪章参考；采用家族传承情景开场。',timeoutSeconds:MODEL_REQUEST_TIMEOUT_MS/1000}});
  if(route==='/api/config'){
   if(request.method==='GET')return json(await getConfig());
   if(request.method!=='PUT')error('方法不支持',405);
   const c=configSchema.parse(await payload(request));const config={...c,interviewer:resolveInterviewerAgent(c.interviewer)};
   await db.prepare('INSERT INTO agent_settings(owner,body) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET body=excluded.body').bind(owner,JSON.stringify(config)).run();return json(config);
  }
  if(route==='/api/sessions'){
   if(request.method==='GET'){const rows=await db.prepare('SELECT body,owner FROM interview_sessions ORDER BY rowid DESC').all<{body:string;owner:string}>();return json(rows.results.map(row=>{const s=JSON.parse(row.body) as Session;return {id:s.id,title:s.title,mode:s.mode,status:s.status,createdAt:s.createdAt,interviewerVersion:interviewerVersion(s),count:s.messages.length,canEdit:row.owner===owner,questions:s.messages.filter(m=>m.actor==='interviewer').length,answers:s.messages.filter(m=>m.actor==='respondent').length};}));}
   if(request.method!=='POST')error('方法不支持',405);
   const input=z.object({mode:z.enum(['human','simulation']),title:z.string().max(120).optional(),respondentId:z.string().optional(),replay:z.object({sourceId:z.string().uuid(),throughRound:z.number().int().min(1).max(100),variant:z.enum(['A','B','C'])}).optional()}).parse(await payload(request));
   const config=await getConfig(),respondent=config.respondents.find(a=>a.id===input.respondentId);
   if(input.mode==='simulation'&&!respondent)error('请选择模拟受访者');
   const s:Session={id:crypto.randomUUID(),title:input.title||'一次关于传承的对话',mode:input.mode,status:'active',createdAt:new Date().toISOString(),snapshot:{interviewer:config.interviewer,respondent:input.mode==='simulation'?respondent!:null,model,version:crypto.randomUUID()},messages:[]};
   if(input.replay){
    if(input.mode!=='human')error('定点续写使用固定回答，不运行模拟受访者');
    const row=await db.prepare('SELECT body FROM interview_sessions WHERE id=?').bind(input.replay.sourceId).first<{body:string}>();
    if(!row)error('来源访谈不存在',404);
    const source=JSON.parse(row.body) as Session;
    if(source.replay)error('不能将定点续写记录作为来源');
    if(source.snapshot.model!==model)error('来源访谈与当前网站模型不同，不能作为同模型对照');
    const prefix=source.messages.slice(0,input.replay.throughRound*2);
    if(prefix.length!==input.replay.throughRound*2||prefix.some((m,i)=>m.actor!==(i%2?'respondent':'interviewer')))error('截断点必须位于完整问答之后');
    // All conditions get the identical public transcript, without old diagnostic anchoring.
    s.messages=prefix.map(({id,actor,content,at})=>({id,actor,content,at}));
    s.snapshot.interviewer=input.replay.variant==='A'?baselineInterviewer:{...slimAgent};
    s.snapshot.interviewMode=input.replay.variant==='C'?'two-step':'single';
    s.replay={...input.replay,prefixLength:prefix.length};
   }
   await db.prepare('INSERT INTO interview_sessions(id,owner,body) VALUES(?,?,?)').bind(s.id,owner,JSON.stringify(s)).run();return json(s,201);
  }
  const match=route.match(/^\/api\/sessions\/([a-f0-9-]+)(?:\/(step|answer|finish|export))?$/);if(!match)error('接口不存在',404);
  const [,id,action]=match;
  if(request.method==='GET'&&!action)return json(await read(id));
  if(request.method==='GET'&&action==='export'){const s=await read(id),text=url.searchParams.get('format')==='md';return new Response(text?transcript(s):JSON.stringify(s,null,2),{headers:{'Content-Type':text?'text/markdown; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="parable-${id}.${text?'md':'json'}"`,'Cache-Control':'no-store'}});}
  if(request.method!=='POST')error('方法不支持',405);
  const token=crypto.randomUUID();
  const claimed=await db.prepare('UPDATE interview_sessions SET lock_token=?,lock_until=? WHERE id=? AND owner=? AND lock_until<?').bind(token,Date.now()+MODEL_REQUEST_TIMEOUT_MS+30000,id,owner,Date.now()).run();
  if(!claimed.meta.changes){const record=await read(id);if(!record.canEdit)error('记录公开可读，只有创建这场访谈的浏览器可以继续或结束。',403);error('此访谈正在生成，请稍后',409);}
  try{
   const s=await get(id);if(s.status==='ended')error('这场访谈已经结束');
   if(action==='finish'){s.status='ended';s.endedAt=new Date().toISOString();}
   else if(action==='answer'){if(s.replay)error('定点续写不接受新回答');const {content}=z.object({content:z.string().trim().min(1).max(100000)}).parse(await payload(request));if(s.mode!=='human'||s.messages.at(-1)?.actor!=='interviewer')error('当前不能提交回答');s.messages.push({id:crypto.randomUUID(),actor:'respondent',content,at:new Date().toISOString()});}
   else if(action==='step'){
    if(s.replay&&s.messages.length!==s.replay.prefixLength)error('本条定点续写已完成');
    if(!configured)error('模型尚未配置，请在站点服务端环境变量中设置 API。',503);
    const actor:Message['actor']=s.messages.at(-1)?.actor==='interviewer'?'respondent':'interviewer';
    if(actor==='respondent'&&s.mode==='human')error('请先输入您的回答');
    const configuredLimit=Number(env.PARABLE_DAILY_LIMIT||200);
    const limit=Number.isFinite(configuredLimit)?Math.max(1,Math.floor(configuredLimit)):200;
    const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
    const allowance=await db.prepare('INSERT INTO daily_usage(day,count) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').bind(day,limit).first();
    if(!allowance)error('今日共享试用次数已达到上限，请明日再试。已保存的记录仍可查看和导出。',429);
    const deadline=Date.now()+MODEL_REQUEST_TIMEOUT_MS;
    const generate=(messages:{role:string;content:string}[],options:{timeoutMs?:number;phase?:string}={})=>requestModel({baseUrl,apiKey,model:s.snapshot.model||model,messages},{...options,timeoutMs:Math.max(1,deadline-Date.now()),role:actor});
    const initialMessages=buildModelMessages(s,actor,runtimePolicy);
    const grounded=actor==='respondent'?await groundJobsMessages({session:s,messages:initialMessages,jobs,generate}):{messages:initialMessages,sources:[]};
    const output=await runInterviewer({session:s,actor,messages:grounded.messages,generate});
    if(grounded.sources.length&&jobs)Object.assign(output,{retrieval:{version:jobs.agent.version,sources:grounded.sources}});
    if(s.replay){s.status='ended';s.endedAt=new Date().toISOString();}
    s.messages.push({id:crypto.randomUUID(),actor,...output,at:new Date().toISOString(),runtimeVersion:RUNTIME_VERSION,...(actor==='interviewer'?{interviewerVersion:resolveInterviewerAgent(s.snapshot.interviewer).version}:{})});
   }else error('操作不存在',404);
   const saved=await db.prepare('UPDATE interview_sessions SET body=? WHERE id=? AND owner=? AND lock_token=?').bind(JSON.stringify(s),id,owner,token).run();if(!saved.meta.changes)error('本次生成已失效，请刷新查看最新记录。',409);
   return json({...s,memory:workingMemory(s)});
  }finally{await db.prepare('UPDATE interview_sessions SET lock_token=NULL,lock_until=0 WHERE id=? AND owner=? AND lock_token=?').bind(id,owner,token).run();}
 }catch(cause){
  if(cause instanceof z.ZodError)return json({error:'填写的内容无效，请检查名称、人设与访谈方式。'},400);
  const e=cause as Error&{statusCode?:number;code?:string};
  return json({error:e.statusCode?e.message:'访谈服务暂时无法完成请求，请稍后重试。',...(e.code?{code:e.code}:{})},e.statusCode||500);
 }
}
async function handle(request:Request):Promise<Response>{
 const identity=await visitorIdentity(request);
 const response=await handleForVisitor(request,identity.owner);
 if(identity.setCookie)response.headers.append('Set-Cookie',identity.setCookie);
 return response;
}
export const GET=handle;export const POST=handle;export const PUT=handle;
