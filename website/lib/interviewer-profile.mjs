import {isSlimAgent,SLIM_VERSION} from './slim-interviewer.mjs';
import profile from '../config/interviewer-profile.json' with {type:'json'};
export const INTERVIEWER_PROFILE_VERSION=profile.version;
export const INTERVIEWER_REFERENCE_VERSION=profile.referenceVersion;
export const INTERVIEWER_REVISION_NOTES=profile.revisionNotes;
const normalize=text=>text.replace(/\r\n/g,'\n').trim();
export function resolveInterviewerAgent(agent){
 if(isSlimAgent(agent))return {...agent,version:SLIM_VERSION,referenceVersion:'2.4.14',isCustom:Boolean(agent.skills.trim())};
 const text=normalize(agent.persona);
 const canonical=[{persona:profile.referencePersona,skills:profile.referenceSkills},...(profile.previousProfiles||[]),profile];
 if(canonical.some(p=>text===normalize(p.persona))){
  const skills=canonical.some(p=>normalize(agent.skills)===normalize(p.skills))?profile.skills:agent.skills;
  return {...agent,persona:profile.persona,skills,version:profile.version,referenceVersion:profile.referenceVersion,isCustom:normalize(skills)!==normalize(profile.skills)};
 }
 // Never overwrite user-authored persona changes or pretend they are the official revision.
 const version=agent.persona.match(/^#.*?v(\d+\.\d+\.\d+)/m)?.[1]||'自定义';
 return {...agent,version,referenceVersion:profile.referenceVersion,isCustom:true};
}
