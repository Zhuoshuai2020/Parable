import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JOBS_DEFAULT_SKILLS} from './jobs-style.mjs';

const defaultRoot=fileURLToPath(new URL('../../data/jobs',import.meta.url));
export async function loadJobs(root=process.env.PARABLE_JOBS_DIR||defaultRoot){
  const version='0.7.0',directory=path.join(root,version);
  let system;
  try{system=await readFile(path.join(directory,'system.md'),'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}
  const manifest=JSON.parse(await readFile(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==version)throw Error('Jobs 资料版本不匹配');
  const [persona]=JSON.parse(await readFile(path.join(directory,'personas.json'),'utf8'));
  const files=new Map();
  for(const folder of ['knowledge','raw','local-books']){
    for(const entry of await readdir(path.join(directory,folder),{withFileTypes:true})){
      if(entry.isFile()&&entry.name.endsWith('.md'))files.set(folder+'/'+entry.name,await readFile(path.join(directory,folder,entry.name),'utf8'));
    }
  }
  if(!files.has('knowledge/topic-index.md')||!Array.from(files.keys()).some(f=>f.startsWith('raw/')))throw Error('Jobs 原文资料不完整');
  return {agent:{id:'jobs-demo1',name:'乔布斯 · Jobs（历史人物模拟）',version,knowledge:{type:'jobs-local',version},persona:system+'\n\n当前人物：'+JSON.stringify({name:persona.name,role:persona.role,sim_anchor:persona.sim_anchor,bio:persona.bio,style:persona.style}),skills:JOBS_DEFAULT_SKILLS},files};
}

export {mergeJobs,groundJobsMessages} from './jobs-runtime.mjs';
