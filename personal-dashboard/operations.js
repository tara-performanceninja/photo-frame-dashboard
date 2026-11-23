(function(){
'use strict';
var $=function(id){return document.getElementById(id);},data=null,busy=false,taskFilter='tasks';
var railOnly=new URLSearchParams(location.search).has('rail');
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function stamp(source,label){var age=Date.now()-new Date(source.updatedAt).getTime();return label+' · '+(source.status==='ok'?'updated':'connection unavailable')+(source.updatedAt?' '+new Date(source.updatedAt).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}):'')+(age>900000?' · may be out of date':'');}
function number(value){return Number(value||0).toLocaleString('en-GB',{notation:'compact',maximumFractionDigits:1});}
function bytes(value){return (value/1073741824).toFixed(1)+' GB';}
function date(value){return value?new Date(value).toLocaleString('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Not supplied';}
function safeLink(url){try{var u=new URL(url);return u.protocol==='https:'&&u.hostname==='linear.app'?esc(u.href):'';}catch(e){return '';}}
function allowancePace(window, source, now){
 var reset=new Date(window.resetsAt).getTime(), duration=window.minutes*60000;
 var sampled=new Date(source.updatedAt).getTime(), timeLeft=reset-now;
 if(source.status!=='ok'||!source.updatedAt||!Number.isFinite(sampled)||now-sampled>900000 ||
    !window.resetsAt||!Number.isFinite(duration)||duration<=0||!Number.isFinite(timeLeft) ||
    timeLeft<=0||timeLeft>duration||sampled<reset-duration)return null;
 var target=timeLeft/duration*100;
 var difference=Math.round(window.remainingPercent-target);
 return {target:target,label:difference===0?'On pace':Math.abs(difference)+' pp '+(difference>0?'above pace':'below pace')};
}
function updatePaceMarkers(){
 document.querySelectorAll('.pace-marker[data-target]').forEach(function(marker){
  marker.style.left=marker.dataset.target+'%';
 });
}
function todayUsage(source, now){
 var windows=source.windows||[],w=windows.find(function(row){return row.name.toLowerCase()==='codex'&&row.minutes===10080;})||windows.find(function(row){return row.name.toLowerCase()==='codex';})||windows[0];
 var stale=now-new Date(source.updatedAt).getTime()>900000,unavailable=source.status!=='ok'||!w;
 var pace=w?allowancePace(w,source,now):null;
 $('today-codex-track').hidden=!w;
 $('today-codex-marker').hidden=!pace;
 $('today-codex-marker').dataset.target=pace?pace.target:'';
 if(w){
  $('today-codex-bar').value=w.remainingPercent;
  $('today-codex-bar').setAttribute('aria-label','Codex '+Math.round(w.remainingPercent)+' percent remaining');
 }
 $('today-codex-label').textContent=w?'Codex · '+Math.round(w.remainingPercent)+'% left':'Codex · unavailable';
 var period=w&&(w.minutes===10080?'Weekly':w.minutes===300?'5-hour':w.minutes?w.minutes/60+'-hour':'Allowance');
 $('today-codex-note').textContent=unavailable||stale?(w?'Last reading · connection unavailable':'Connection unavailable'):period+(pace?' · '+pace.label:' · pacing unavailable');
 $('today-codex').classList.toggle('usage-stale',unavailable||stale);
 $('today-codex').title=stamp(source,'Codex')+(pace?' · Linear pace: '+Math.round(pace.target)+'% left':'');
}
function renderAllowance(w,source,now,label){
  var pace=allowancePace(w,source,now),remaining=Math.round(w.remainingPercent);
  var marker=pace?'<span class="pace-marker" aria-hidden="true" data-target="'+pace.target+'"></span>':'';
  var paceText=pace?pace.label+' · Linear pace: '+Math.round(pace.target)+'% left':'Pacing unavailable';
  var resetText=w.resetsAt?'Resets '+esc(date(w.resetsAt))+' London time':'Reset time unavailable';
  return '<div class="allowance"><div class="allowance-head"><span>'+esc(label)+'</span><strong class="'+(remaining<=10?'warning-text':'')+'">'+remaining+'% left</strong></div>'+
   '<div class="allowance-track"><progress max="100" value="'+w.remainingPercent+'" aria-label="'+esc(label)+' remaining: '+remaining+' percent"></progress>'+marker+'</div>'+
   '<p class="source-status"><span class="pace-detail">'+paceText+'</span><br>'+esc(w.name)+' · '+resetText+'</p></div>';
}
function usage(source,cursor){
 var now=Date.now();
 todayUsage(source,now);
 var windows=source.windows||[],tokens=source.dailyTokens||[],max=Math.max.apply(null,[1].concat(tokens.map(function(r){return r.tokens;})));
 var card='<article class="usage-card"><p class="eyebrow">CHATGPT PLAN · CODEX</p><h2>Codex'+(source.plan?' <span class="small-pill">'+esc(source.plan)+'</span>':'')+'</h2>';
 card+=windows.length?windows.map(function(w){
  var mins=w.minutes,label=mins===10080?'Weekly allowance':mins===300?'5-hour allowance':mins?number(mins/60)+'-hour allowance':'Allowance';
  return renderAllowance(w,source,now,label);
 }).join(''):'<p class="empty">Allowance unavailable. We’ll retry automatically.</p>';
 if(source.resetCredits!=null)card+='<p class="source-status">'+esc(source.resetCredits)+' full resets available. Display only.</p>';
 card+='<p class="source-status">Account used by Tara. This does not measure your ChatGPT conversations.</p></article>';
 card+='<article class="usage-card"><p class="eyebrow">CODEX TOKEN ACTIVITY</p><h2>'+(source.usageAvailable?number(source.weekTokens):'Unavailable')+'</h2><p class="metric-caption">'+(source.usageAvailable?'Tokens in the last 7 UTC dates, including today':'Token activity could not be read')+'</p><div class="token-chart">'+tokens.map(function(r){return '<div class="token-day" title="'+esc(r.startDate)+' · '+number(r.tokens)+' tokens"><span>'+number(r.tokens)+'</span><div class="token-bar" data-height="'+Math.max(2,r.tokens/max*100)+'%"></div><small>'+esc(r.startDate.slice(5))+'</small></div>';}).join('')+'</div><p class="source-status">Provider-reported activity, not billed spend or remaining capacity. Today is incomplete. Missing dates have no reported bucket.</p></article>';
 var cursorWindow=(cursor.windows||[])[0];
 card+='<article class="usage-card"><h2>Cursor'+(cursor.plan?' <span class="small-pill">'+esc(cursor.plan)+'</span>':'')+'</h2>'+
  (cursorWindow?renderAllowance(cursorWindow,cursor,now,'Included allowance'):'<p class="empty">Allowance unavailable. We’ll retry automatically.</p>')+
  '<p class="source-status">'+stamp(cursor,'Cursor')+'</p>'+
  '<p class="source-status"><a href="https://cursor.com/dashboard?tab=usage" target="_blank" rel="noopener noreferrer">View usage on Cursor</a></p></article>';
 card+='<article class="usage-card unavailable"><p class="eyebrow">CHATGPT CONVERSATIONS + API</p><h2>Not connected</h2><p class="metric-caption">Separate ChatGPT chat limits and API billing are not available through this Codex reader.</p><p class="source-status">No estimated allowance or spend shown.</p></article>';
 $('usage-cards').innerHTML=card;updatePaceMarkers();document.querySelectorAll('.token-bar').forEach(function(b){b.style.setProperty('--bar-height',b.dataset.height);});$('usage-status').textContent=stamp(source,'Codex');
}
function linear(source){
 var selected=$('linear-project').value,projects=[...new Set((source.items||[]).map(function(r){return r.project&&r.project.name||'No project';}))].sort();
 $('linear-project').innerHTML='<option value="">All projects</option>'+projects.map(function(p){return '<option value="'+esc(p)+'">'+esc(p)+'</option>';}).join('');
 if(projects.indexOf(selected)>=0)$('linear-project').value=selected;
 renderIssues();
}
function renderIssues(){
 if(!data)return;var source=data.linear||{},project=$('linear-project').value,status=$('linear-state').value,today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 var cycleOnly=$('linear-cycle').checked,mineOnly=$('linear-assignee').checked;
 var items=(source.items||[]).filter(function(r){return (!cycleOnly||r.cycle&&r.cycle.isActive)&&(!mineOnly||r.assignee&&r.assignee.id===source.richId)&&(!project||(r.project&&r.project.name||'No project')===project)&&(!status||r.state.type===status);});
 $('linear-status').textContent=stamp(source,(cycleOnly?'Current cycle':'All cycles')+' · '+(mineOnly?'Assigned to you':'Anyone, including unassigned'));
 $('linear-count').textContent=items.length;
 $('linear-list').innerHTML=items.length?items.map(function(r){var overdue=r.dueDate&&r.dueDate<today,link=safeLink(r.url);return '<article class="issue-row"><div class="issue-heading"><span class="issue-id">'+esc(r.identifier)+'</span><span class="small-pill">'+esc(r.state.name)+'</span>'+(overdue?'<span class="small-pill alert-pill">Overdue</span>':'')+'</div><h2>'+(link?'<a href="'+link+'" target="_blank" rel="noopener noreferrer">'+esc(r.title)+'</a>':esc(r.title))+'</h2><p>'+esc(r.team.name)+(r.project?' · '+esc(r.project.name):'')+(r.priority?' · '+['','Urgent','High','Normal','Low'][r.priority]:'')+' · '+esc(r.assignee&&(r.assignee.displayName||r.assignee.name)||'Unassigned')+(r.cycle?' · '+esc(r.cycle.name||'Cycle '+r.cycle.number):' · No cycle')+(r.dueDate?' · Due '+esc(r.dueDate):'')+'</p></article>';}).join(''):'<p class="empty">'+(source.status==='error'?'Linear connection unavailable. We’ll retry automatically.':'No open issues match this view.')+'</p>';
}
function stat(title,value,note,warning){return '<article class="health-stat'+(warning?' warn':'')+'"><p class="eyebrow">'+esc(title)+'</p><strong>'+esc(value)+'</strong><span>'+esc(note)+'</span></article>';}
function tara(source){
 var h=source.health||{},alerts=source.alerts||[],old=Date.now()-new Date(source.updatedAt).getTime()>90000;
 var unavailable=source.status!=='ok'||old||!source.health;
 $('health-banner').classList.toggle('warn',unavailable||alerts.length>0);
 $('health-banner').textContent=unavailable?'Health feed unavailable or stale. Showing the last reading.':alerts.length?'Needs attention · '+alerts.join(' · '):'System readings normal · OpenClaw service active';
 if(source.health){var memoryUsed=(1-h.memoryAvailable/h.memoryTotal)*100,diskUsed=(1-h.diskFree/h.diskTotal)*100;
 $('health-stats').innerHTML=stat('Temperature',h.temperature==null?'Unavailable':h.temperature.toFixed(1)+'°C','Alert at 75°C',h.temperature>=75)+stat('Memory',Math.round(memoryUsed)+'% used',bytes(h.memoryAvailable)+' available of '+bytes(h.memoryTotal),memoryUsed>90)+stat('Storage',Math.round(diskUsed)+'% used',bytes(h.diskFree)+' free',diskUsed>85)+stat('Swap',bytes(h.swapUsed),bytes(h.swapTotal)+' total')+stat('System load',h.load[0].toFixed(2),'1-min load · '+h.cpuCount+' CPU cores',h.load[0]>h.cpuCount)+stat('Uptime',Math.floor(h.uptimeSeconds/86400)+'d '+Math.floor(h.uptimeSeconds%86400/3600)+'h','Since the Pi last booted')+stat('OpenClaw',h.services.OpenClaw,'Service status, not a full health audit',h.services.OpenClaw!=='active')+stat('Throttling',h.throttleMask==null?'Unknown':h.throttleMask&15?'Active':'None',h.throttleMask&&h.throttleMask&0xf0000?'Historical flags recorded':'Voltage + thermal flags',h.throttleMask==null||!!(h.throttleMask&15));}
 renderTasks();$('tara-status').textContent=stamp(source,'Tara');
}
function renderTasks(){
 var rows=(data&&data.tara&&data.tara[taskFilter])||[];
 $('tara-list').innerHTML=rows.length?rows.map(function(r){return '<article class="issue-row"><div class="issue-heading"><span class="issue-id">'+esc(r.workstream||'Tara')+'</span><span class="small-pill">'+esc(r.status)+'</span></div><h2>'+esc(r.title)+'</h2>'+(taskFilter!=='completed'&&r.next_action?'<p>'+esc(r.next_action)+'</p>':'')+'</article>';}).join(''):'<p class="empty">No tracked items in this view.</p>';
}
async function refresh(){
 if(railOnly||busy)return;busy=true;
 try{data=await window.frameReadJson('/api/operations',{cache:'no-store'});usage(data.usage||{status:'error'},data.cursor||{status:'error'});linear(data.linear||{status:'error'});tara(data.tara||{status:'error'});}
 catch(e){document.querySelectorAll('.pace-marker').forEach(function(marker){marker.hidden=true;});document.querySelectorAll('.pace-detail').forEach(function(detail){detail.textContent='Pacing unavailable';});$('today-codex').title='Connection lost · last reading';$('today-codex-note').textContent='Connection lost · last reading';$('today-codex').classList.add('usage-stale');['usage-status','linear-status','tara-status'].forEach(function(id){$(id).textContent='Connection lost · showing the last available view';});$('health-banner').classList.add('warn');$('health-banner').textContent='Health connection lost · last reading may be out of date';}
 finally{busy=false;}
}
document.querySelectorAll('.ops-refresh').forEach(function(button){button.addEventListener('click',refresh);});
['linear-project','linear-state','linear-cycle','linear-assignee'].forEach(function(id){$(id).addEventListener('change',renderIssues);});
document.querySelectorAll('[data-task-filter]').forEach(function(button){button.addEventListener('click',function(){taskFilter=button.dataset.taskFilter;document.querySelectorAll('[data-task-filter]').forEach(function(b){b.classList.toggle('selected',b===button);});renderTasks();});});
$('today-codex').addEventListener('click',function(){window.openLifeTab('usage');});
refresh();setInterval(refresh,30000);
})();
