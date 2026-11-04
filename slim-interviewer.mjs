import profile from './config/slim-interviewer.json' with {type:'json'};

export const SLIM_VERSION=profile.version;
export const slimAgent={name:'Parable 采访者',persona:profile.persona,skills:'',version:SLIM_VERSION,referenceVersion:'2.4.14',isCustom:false};
export const isSlimAgent=agent=>agent?.persona?.replace(/\r\n/g,'\n').trim()===profile.persona.trim();
export function defaultInterviewer(agent,resolve){
 const previous=(profile.previousPersonas||[]).includes(agent?.persona?.replace(/\r\n/g,'\n').trim());
 if(previous&&!agent.skills?.trim())return {...slimAgent,name:agent.name};
 const resolved=resolve(agent);
 return !resolved.isCustom?{...slimAgent,name:agent.name}:resolved;
}

// Conservative, deterministic routing keeps B/C on exactly the same modules.
// These are textual signals, not verified conclusions about the respondent.
export function selectSlimModules(session){
 const answers=session.messages.filter(m=>m.actor==='respondent');
 const last=answers.at(-1)?.content||'';
 if(/不想谈|不愿谈|不谈这个|累了|先停|结束吧/.test(last))return ['F'];
 if(!last)return [];
 const selected=[];
 if(/坚持|底线|不能|不肯|希望|在意|记住|老师傅|当年|早年|年轻|那会|后来/.test(last))selected.push('A');
 const formation=answers.length>=3&&answers.some(m=>/当年|早年|年轻|那会|有一年|那次|那回/.test(m.content));
 if(formation&&/后代|孩子|接班|接手|不管了|不在|传承|留给/.test(last))selected.push('B');
 if(/没弄清|不懂|专业意见|异议|风险评估/.test(last))selected.push('E');
 const willing=/您怎么看|你怎么看|有什么建议|帮我想|一起探讨|愿意讨论|想听.*看法/.test(last);
 // Make governance knowledge available for proactive rule exploration.
 // Formation is only a retrieval signal; the prompt must assess sufficiency.
 if(formation)selected.push('D','G','H');
 if(!selected.includes('H')&&/股份|股东|家族共识|家人在企业|继承权|解释.*原则|修订.*原则/.test(last))selected.push('H');
 // C needs evidence of a real alternative, not an invented counter-position.
 if(formation&&willing&&/另一种|不同看法|反对.*因为/.test(last))selected.push('C');
 return selected;
}
export function slimModuleText(session){
 const selected=selectSlimModules(session);
 return {selected,text:selected.map(k=>profile.modules[k]).join('\n\n')+(selected.some(k=>k==='G'||k==='H')?'\n\n'+profile.governanceCommon:'')};
}
