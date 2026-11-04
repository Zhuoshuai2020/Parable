const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config,connection,current=null,page='interview',mode='human',tab='interviewer',pending=false,auto=false,autoCount=0,autoLimit=10,working=false;
const date=s=>new Date(s).toLocaleString('zh-CN',{hour12:false});
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const entered=new Set();
let revealing=false;
function enterOnce(key){
 if(entered.has(key)||sessionStorage.getItem('parable-entered:'+key))return;
 entered.add(key);sessionStorage.setItem('parable-entered:'+key,'1');
 if(reducedMotion())return;
 const targets=[$('#view h1'),$('#view .intro'),$('#view .panel'),$('#view .support')].filter(Boolean);
 targets.forEach((element,index)=>element.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,delay:index*70,easing:'cubic-bezier(0.22, 1, 0.36, 1)',fill:'backwards'}));
}
function messageText(message){
 return `<div class="message-body">${message.content.split(/\n\s*\n/).filter(p=>p.trim()).map(p=>`<p class="message-paragraph">${esc(p)}</p>`).join('')}</div>`;
}
async function revealReply(id){
 const article=document.querySelector(`[data-message="${CSS.escape(id)}"]`),box=$('#messages');
 if(!article||!box)return;
 // Position the new reply once; do not chase each paragraph while the reader reads.
 box.scrollTop+=article.getBoundingClientRect().top-box.getBoundingClientRect().top;
 if(reducedMotion())return;
 const animations=[...article.querySelectorAll('.message-paragraph')].map((element,index)=>element.animate([{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:380,delay:index*320,easing:'cubic-bezier(0.22, 1, 0.36, 1)',fill:'backwards'}));
 await Promise.allSettled(animations.map(animation=>animation.finished));
}
function notice(message=''){ $('#notice').textContent=message;$('#notice').hidden=!message; }
async function api(url,method='GET',data){
 let response;
 try{response=await fetch('/api/'+url,{method,headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});}catch{throw Error('无法连接访谈服务。请检查网络或服务是否已启动，已保存的记录仍然保留。');}
 let result;try{result=await response.json();}catch{throw Error('访谈服务未返回完整响应，请稍后重试。');}
 if(!response.ok)throw Error(result.error||'请求失败');return result;
}
const heading=(eyebrow,title,desc)=>`<div class="hero"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="intro">${desc}</p></div></div>`;
function runtimeInfo(){
 const runtime=connection.runtime;
 if(!runtime)return '<div class="note-card">当前页面尚未取得人设版本，请刷新后核对。</div>';
 const agent=config.interviewer;
 return `<section class="runtime-info" aria-label="采访者人设版本"><div class="panel-heading"><h3>采访者人设</h3><span class="pill">v${esc(agent.version||runtime.interviewerVersion)}${agent.isCustom?' · 自定义':''}</span></div><p>基于 v${esc(runtime.referenceVersion)} 修订 · 模型等待预算 ${esc(runtime.timeoutSeconds)} 秒</p><details><summary>查看本版修订说明</summary><p>${esc(runtime.revisionNotes)}</p><p class="caption">运行引擎 ${esc(runtime.version)}</p></details><p class="caption">新访谈默认采用精简人设；A–H 方法模块按需注入。自定义配置保留。保存仅影响新访谈，已有访谈继续使用原快照。</p></section>`;
}
const guide=()=>`<div class="support"><div class="guide"><div class="section-label">访谈说明</div><h2>从经营经历，<br>理解传承意愿。</h2><p>围绕亲身经历、判断依据与传承期待，逐步澄清重要议题。</p><ol><li>回到重要的经历</li><li>理解选择背后的原因</li><li>探索想留给下一代的东西</li></ol></div><div class="note-card"><strong>关于这场对话</strong>您可以跳过问题，也可以随时停下。AI 的理解可以被纠正，您的表达由您决定。</div></div>`;
function renderInterview(){
 if(current)return renderSession();
 $('#view').innerHTML=heading('FAMILY CONSTITUTION / PRE-INTERVIEW','家族传承预访谈','记录创始人的经历与判断，为后续家族宪章讨论提供依据。')+`<div class="columns"><div><div class="panel"><div class="panel-heading"><h3><span class="step-number">01 /</span> 开始一场预访谈</h3><span class="pill">文字访谈</span></div><label>选择对话方式</label><div class="mode-options"><button class="mode ${mode==='human'?'selected':''}" data-mode="human" aria-pressed="${mode==='human'}"><span class="mode-code">01</span><span class="radio" aria-hidden="true"></span><strong>真人访谈</strong><small>受访者本人作答，AI 主持访谈</small></button><button class="mode ${mode==='simulation'?'selected':''}" data-mode="simulation" aria-pressed="${mode==='simulation'}"><span class="mode-code">02</span><span class="radio" aria-hidden="true"></span><strong>模拟访谈</strong><small>以独立模拟人物检验访谈过程</small></button></div><label for="title">访谈名称 <span class="muted">/ 可选</span></label><input id="title" maxlength="120" placeholder="例如：我的创业经历与传承期待"><div id="simulation-fields" class="simulation-fields ${mode==='simulation'?'open':''}"><div><label for="respondent">模拟受访者</label><select id="respondent">${config.respondents.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select><p class="caption">模拟人物的表达为 AI 生成，不代表真人观点。</p></div></div><div class="start-row"><span class="caption">对话自动保存 · 可随时暂停</span><button id="start" class="primary">开始访谈 <span aria-hidden="true">↗</span></button></div></div><div class="bottom-note"><span>—</span><span>采访者 · ${esc(config.interviewer.name)}</span></div></div>${guide()}</div>`;
 document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
  mode=b.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(option=>{option.classList.toggle('selected',option.dataset.mode===mode);option.setAttribute('aria-pressed',String(option.dataset.mode===mode));});
  $('#simulation-fields').classList.toggle('open',mode==='simulation');$('#simulation-fields').inert=mode!=='simulation';
 });
 $('#simulation-fields').inert=mode!=='simulation';
 enterOnce('interview-start');
 $('#start').onclick=()=>run(async()=>{current=await api('sessions','POST',{mode,title:$('#title').value,respondentId:$('#respondent')?.value});localStorage.setItem('parable-session',current.id);renderSession();await step();});
}
function renderSession(){
 const oldMessages=$('#messages');
 const previousScroll=oldMessages?.dataset.session===current.id?oldMessages.scrollTop:undefined;
 const s=current,ended=s.status==='ended',last=s.messages.at(-1);const waiting=!ended&&s.mode==='human'&&last?.actor==='interviewer';
 let question=0; const questionCount=s.messages.filter(m=>m.actor==='interviewer').length; const answerCount=s.messages.length-questionCount;
 $('#view').innerHTML=heading(s.mode==='simulation'?'SIMULATED INTERVIEW / 模拟访谈':'PRE-INTERVIEW / 真人访谈',esc(s.title),'完整记录采访者提问与受访者回答，保留时间与先后顺序。')+`<div class="columns"><div class="panel"><div class="panel-heading"><div><span class="pill">${ended?'已结束':auto?'模拟运行中':'进行中'}</span> <span class="caption">${questionCount} 次提问 / ${answerCount} 次回答 · 已保存</span></div><button id="back" class="quiet">新建访谈 ↗</button></div><div class="messages" id="messages" data-session="${s.id}" aria-busy="${pending}">${s.messages.length?s.messages.map(m=>{if(m.actor==='interviewer')question++;return `<article data-message="${esc(m.id)}" class="message ${m.actor==='respondent'?'respondent':''}"><div class="message-head"><span class="avatar">${m.actor==='interviewer'?'问':'答'}</span><strong class="message-role">第 ${question} 轮 · ${m.actor==='interviewer'?'采访者提问':'受访者回答'}</strong><span>${esc(m.actor==='interviewer'?s.snapshot.interviewer.name:s.mode==='human'?'您':s.snapshot.respondent.name)}</span><time>${esc(date(m.at))}</time></div>${messageText(m)}</article>`;}).join(''):`<div class="empty"><div class="glyph">✳</div><p>等待采访者提出第一个问题。</p></div>`}</div>${pending&&!revealing?'<div class="loading" role="status"><span>正在思考</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>':''}${waiting&&!pending?'<label for="answer">您的回答</label><textarea id="answer" placeholder="请输入您的回答…"></textarea>':''}<div class="actions">${!ended?(waiting?`<button id="send" class="primary" ${pending?'disabled':''}>发送回答 ↗</button>`:`<button id="step" class="primary" ${pending||auto?'disabled':''}>${last?'继续下一条':'开始访谈'} ↗</button>`):''}${!ended&&s.mode==='simulation'?`<button id="auto" class="secondary" ${pending&&!auto?'disabled':''}>${auto?'暂停模拟':'连续模拟'}</button>${!auto?`<label class="inline caption">最多新增 <input id="limit" type="number" min="1" max="40" value="${autoLimit}"> 条</label>`:''}`:''}<a class="quiet" href="/api/sessions/${s.id}/export?format=md">导出完整问答</a><a class="quiet" href="/api/sessions/${s.id}/export">导出 JSON</a>${!ended?`<button id="finish" class="quiet danger" ${pending||auto?'disabled':''}>结束访谈</button>`:''}</div><p class="caption">本场提问与回答均已保存，可随时回看。 </p><p class="caption">${ended?'本场访谈已归档。':'暂停时可关闭页面，下次继续。'}</p></div>${guide()}</div>`;
 $('#messages').scrollTop=previousScroll??(ended?0:$('#messages').scrollHeight);
 enterOnce('session');
 $('#back').onclick=()=>{if(pending)return notice('请等待本条生成完成');auto=false;current=null;localStorage.removeItem('parable-session');renderInterview();};
 if($('#step'))$('#step').onclick=()=>run(step);
 if($('#send'))$('#send').onclick=()=>run(async()=>{const content=$('#answer').value;if(!content.trim())throw Error('请先输入回答');current=await api(`sessions/${s.id}/answer`,'POST',{content});renderSession();await step();});
 if($('#finish'))$('#finish').onclick=()=>run(async()=>{current=await api(`sessions/${s.id}/finish`,'POST');renderSession();});
 if($('#auto'))$('#auto').onclick=()=>{if(auto){auto=false;$('#auto').textContent=pending?'暂停中…':'已暂停';$('#auto').disabled=pending;return;}autoLimit=Math.max(1,Math.min(40,Number($('#limit').value)||10));autoCount=0;auto=true;run(autoLoop);};
}
async function step(){pending=true;renderSession();try{current=await api(`sessions/${current.id}/step`,'POST');revealing=true;renderSession();await revealReply(current.messages.at(-1).id);}finally{pending=false;revealing=false;if(page==='interview')renderSession();}}
async function autoLoop(){try{while(auto&&autoCount<autoLimit&&current.status==='active'){await step();autoCount++;} }finally{auto=false;if(page==='interview')renderSession();}}
function renderSettings(){
 const isInterviewer=tab==='interviewer',agent=isInterviewer?config.interviewer:config.respondents.find(r=>r.id===tab)||config.respondents[0];
 $('#view').innerHTML=heading('AGENT CONFIGURATION','采访者与受访者配置','调整采访者的表达与方法，或为模拟受访者写下独立的人设。')+runtimeInfo()+`<div class="tabs"><button class="secondary ${isInterviewer?'active':''}" id="tab-interviewer">采访者</button><button class="secondary ${!isInterviewer?'active':''}" id="tab-respondent">模拟受访者</button></div><div class="panel">${!isInterviewer?`<div class="toolbar"><select id="agent-select">${config.respondents.map(r=>`<option value="${esc(r.id)}" ${r.id===agent.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select><button class="secondary" id="add-agent">新增人物</button></div>`:''}<label for="agent-name">Agent 名称</label><input id="agent-name" value="${esc(agent.name)}"><div class="editor-grid"><div><label for="persona">人设 / Persona</label><textarea id="persona" spellcheck="false">${esc(agent.persona)}</textarea></div><div><label for="skills">访谈方法 / Skills</label><textarea id="skills" spellcheck="false">${esc(agent.skills)}</textarea></div></div><div class="editor-foot"><button id="save-config" class="primary">保存配置 ↗</button><span class="caption">保存后用于新访谈；已开始的访谈保持原配置。</span></div></div><div class="api-help">模型连接：${connection.configured?esc(connection.model):'尚未配置'}。API 地址、模型名称和密钥通过服务端环境变量设置。<br>记忆机制：本场完整问答 + 采访者历次诊断状态；暂停后可恢复。不读取其他场次，不具备长期记忆。<br>Skills 作为文本方法注入模型，不执行脚本。模拟人物不代表真人观点。</div>`;
 enterOnce('settings');
 const stash=()=>{agent.name=$('#agent-name').value;agent.persona=$('#persona').value;agent.skills=$('#skills').value;};
 $('#tab-interviewer').onclick=()=>{stash();tab='interviewer';renderSettings();};$('#tab-respondent').onclick=()=>{stash();tab=config.respondents[0].id;renderSettings();};
 if($('#agent-select'))$('#agent-select').onchange=e=>{stash();tab=e.target.value;renderSettings();};
 if($('#add-agent'))$('#add-agent').onclick=()=>{stash();const a={id:crypto.randomUUID(),name:'新的模拟人物',persona:'',skills:''};config.respondents.push(a);tab=a.id;renderSettings();};
 $('#save-config').onclick=()=>run(async()=>{stash();config=await api('config','PUT',config);notice('配置已保存，新访谈将使用这份配置。');});
}
async function renderHistory(){
 $('#view').innerHTML=heading('INTERVIEW ARCHIVE','访谈记录','完整保存对话，也保留当时的采访者与受访者配置。')+'<div class="panel" id="history-list">正在读取记录…</div>';
 enterOnce('history');
 const list=await api('sessions');if(page!=='history')return;
 $('#history-list').innerHTML=list.length?list.map(s=>`<div class="history-item"><div class="history-icon">${s.mode==='human'?'◌':'⟡'}</div><div class="history-title"><h3>${esc(s.title)}</h3><small>${date(s.createdAt)} · ${s.mode==='human'?'真人':'模拟'} · ${s.questions??0} 次提问 / ${s.answers??0} 次回答</small></div><span class="pill">${s.status==='ended'?'已结束':'进行中'}</span><button data-open="${s.id}" class="secondary">${s.status==='ended'?'查看':'继续'} ↗</button></div>`).join(''):'<div class="empty"><div class="glyph">❧</div><p>还没有访谈记录。从第一场对话开始。</p><button id="first" class="primary">开启访谈 ↗</button></div>';
 document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>run(async()=>{current=await api('sessions/'+b.dataset.open);localStorage.setItem('parable-session',current.id);navigate('interview');}));if($('#first'))$('#first').onclick=()=>navigate('interview');
}
async function run(fn){if(working)return;working=true;notice();try{await fn();}catch(e){auto=false;notice(e.message);}finally{working=false;}}
function navigate(next){if(pending)return notice('请等待当前发言生成完成后切换页面');auto=false;page=next;notice();document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));$('#breadcrumb').textContent='工作室 / '+({interview:'访谈空间',settings:'Agent 设置',history:'访谈记录'}[page]);if(page==='interview')renderInterview();else if(page==='settings')renderSettings();else run(renderHistory);}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
await run(async()=>{[config,connection]=await Promise.all([api('config'),api('status')]);$('#connection').textContent=connection.configured?'● 模型已就绪':'○ 模型待配置';$('#connection').classList.toggle('ready',connection.configured);const id=localStorage.getItem('parable-session');if(id){try{current=await api('sessions/'+id);}catch{localStorage.removeItem('parable-session');}}renderInterview();});
