// Read historical metadata without resolving or upgrading an old Agent snapshot.
export function interviewerVersion(session){
 const versions=[...new Set((session.messages||[]).filter(m=>m.actor==='interviewer').map(m=>m.interviewerVersion).filter(v=>typeof v==='string'&&v.trim()))];
 if(versions.length)return versions.join(' / ');
 const agent=session.snapshot?.interviewer;
 return agent?.version||agent?.persona?.match(/^#.*?v(\d+\.\d+(?:\.\d+)?)/m)?.[1]||'未记录';
}
