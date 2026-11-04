// Public records contain the conversation, not private Agent configuration or diagnostics.
export function publicRecord(session){
 return {
  id:session.id,title:session.title,mode:session.mode,status:session.status,createdAt:session.createdAt,endedAt:session.endedAt,canEdit:false,
  snapshot:{interviewer:{name:session.snapshot.interviewer.name},respondent:session.snapshot.respondent?{name:session.snapshot.respondent.name}:null,version:session.snapshot.version},
  messages:session.messages.map(({id,actor,content,at})=>({id,actor,content,at})),
 };
}
