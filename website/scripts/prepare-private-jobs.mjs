import {writeFile,access,copyFile} from 'node:fs/promises';
import {loadJobs} from '../../jobs-respondent.mjs';

const target=new URL('../config/jobs-private.json',import.meta.url);
if(process.argv.includes('--from-local')){
 const jobs=await loadJobs();
 if(!jobs)throw Error('缺少 Jobs 私有资料。先按主项目说明导入 data/jobs/0.7.0/，或配置 PARABLE_JOBS_DIR。');
 await writeFile(target,JSON.stringify({agent:jobs.agent,files:Object.fromEntries(jobs.files)})+'\n',{mode:0o600});
 console.log('已生成忽略的 Jobs 服务端资料包；不要提交或放入 public/。');
}else{
 try{await access(target);console.log('保留现有 Jobs 配置。');}
 catch(error){
  if(error.code!=='ENOENT')throw error;
  await copyFile(new URL('../config/jobs-private.example.json',import.meta.url),target);
  console.log('已创建无私有资料的开发配置；真人访谈与普通模拟可用，Jobs 模拟未启用。');
 }
}
