const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out=process.env.FRAME_PROOF_DIR||'/home/adminrichwebb/.openclaw/workspace/outputs/photo-frame-2026-10-13/customisation';
const base='http://127.0.0.1:8788';
(async()=>{
const key=JSON.parse(fs.readFileSync(path.join(root,'.state/access.json'))).key;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
try{
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await context.request.get(base+'/api/today')).status(),403);
 assert.equal((await context.request.get(base+'/.state/access.json')).status(),403);
 const auth=JSON.parse(fs.readFileSync(path.join(root,'.state/access.json')));
 assert.equal((await context.request.get('http://192.168.50.111:8788/api/today',{headers:{Host:auth.tailHost,'Tailscale-User-Login':auth.tailOwner}})).status(),403);
 assert.equal((await context.request.get(base+'/api/today',{headers:{Host:auth.tailHost,'Tailscale-User-Login':'not-the-owner'}})).status(),403);
 await context.addCookies([{name:'frame_session',value:key,url:base,httpOnly:true,sameSite:'Strict'}]);
 assert.equal((await context.request.get(base+'/.state/access.json')).status(),404);
 assert.equal((await context.request.get(base+'/server.py')).status(),404);
 assert.equal((await context.request.post(base+'/api/today')).status(),405);
 await page.setViewportSize({width:1024,height:600});
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#overall-status').textContent!=='Connecting your sources');await page.evaluate(()=>document.fonts.ready);
 const data=await (await context.request.get(base+'/api/today')).json();assert.equal(data.calendar.status,'ok');assert.equal(data.weather.status,'ok');assert.equal(data.reminders.status,'snapshot');
 const results=[];
 async function layout(label,width,height){
   await page.setViewportSize({width,height});await page.evaluate(()=>document.fonts.ready);
   const issues=await page.evaluate(()=>{
     const bad=[];
     if(document.documentElement.scrollWidth>innerWidth+1)bad.push('horizontal page overflow');
     if(innerWidth>=700&&document.documentElement.scrollHeight>innerHeight+1)bad.push('vertical page overflow');
     for(const el of document.querySelectorAll('.next-card,.weather-card,.list-card,.page-header,.page-footer')){
       if(el.getClientRects().length&&el.scrollHeight>el.clientHeight+2)bad.push(el.className+' overflow');
     }
     const cards=[...document.querySelectorAll('.next-card,.weather-card,.list-card')].map(el=>({name:el.className,r:el.getBoundingClientRect()}));
     for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){const a=cards[i].r,b=cards[j].r;if(a.right>b.left&&b.right>a.left&&a.bottom>b.top&&b.bottom>a.top)bad.push('card overlap');}
     // Visible non-scrolling text must stay within its intended card and be separated from the next region.
     for(const selector of ['.next-body h2','.next-detail','.next-foot','.weather-main','.weather-card h2','.forecast','.weather-card .source-status']){
       const el=document.querySelector(selector);if(!el||!el.getClientRects().length)continue;
       const r=el.getBoundingClientRect(),p=el.closest('.next-card,.weather-card').getBoundingClientRect();
       if(r.left<p.left+8||r.right>p.right-8||r.top<p.top+8||r.bottom>p.bottom-8)bad.push(selector+' outside card margin');
     }
     const ordered=['.next-card .card-top','.next-body','.next-foot'];
     for(let i=0;i<ordered.length-1;i++){const a=document.querySelector(ordered[i]).getBoundingClientRect(),b=document.querySelector(ordered[i+1]).getBoundingClientRect();if(a.bottom>b.top+1)bad.push('Next up regions overlap');}
     return bad;
   });
   assert.deepEqual(issues,[],`${label} ${width}x${height}`);
   await page.screenshot({path:path.join(out,`${label}-${width}x${height}.png`),fullPage:true});results.push(`${label} ${width}x${height}`);
 }
 for(const [w,h] of [[1024,600],[1280,800],[1440,900],[390,844]])await layout('today',w,h);
 await page.setViewportSize({width:1024,height:600});
 await page.getByRole('button',{name:'TEAMTRI',exact:true}).click();await page.getByRole('heading',{name:'TEAMTRI Dashboard',exact:true}).waitFor();assert.equal(await page.locator('#today-view').isVisible(),false);assert.equal(await page.getByRole('link',{name:/Open TEAMTRI Dashboard/}).getAttribute('href'),'https://teamtri.team/people-dashboard');await page.screenshot({path:path.join(out,'teamtri-1024x600.png')});
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await page.getByRole('button',{name:'Open ambient clock'}).click();assert.equal(await page.locator('#ambient').isVisible(),true);await page.screenshot({path:path.join(out,'ambient-1024x600.png')});await page.locator('#ambient').click();assert.equal(await page.locator('#ambient').isVisible(),false);
 // Verify actual automatic idle transition without waiting two minutes.
 await page.evaluate(()=>{const real=Date.now;Date.now=()=>real()+121000;});await page.locator('#ambient').waitFor({state:'visible',timeout:5000});await page.reload();
 await page.waitForFunction(()=>document.querySelector('#overall-status').textContent!=='Connecting your sources');
 // Exercise hostile and long titles plus empty and unavailable states without changing real sources.
 const synthetic=structuredClone(data);synthetic.calendar.items=[{id:'long',title:'Review the next quarter’s priorities, travel plans and delivery commitments',calendar:'Personal',start:new Date(Date.now()+1800000).toISOString(),end:new Date(Date.now()+3600000).toISOString(),allDay:false,location:'London'}];synthetic.reminders.items=[];
 await page.route('**/api/today',route=>route.fulfill({json:synthetic}));await page.getByRole('button',{name:'Refresh dashboard'}).click();await page.getByRole('heading',{name:synthetic.calendar.items[0].title,exact:true}).waitFor();await layout('long-title',1024,600);await page.getByRole('button',{name:'View Next up details'}).click();assert.equal(await page.locator('#detail-title').textContent(),synthetic.calendar.items[0].title);await page.getByRole('button',{name:'Close event details'}).click();
 synthetic.calendar.items=[{...synthetic.calendar.items[0],title:'<img src=x onerror=alert(1)>'}];await page.getByRole('button',{name:'Refresh dashboard'}).click();await page.getByRole('heading',{name:'<img src=x onerror=alert(1)>',exact:true}).waitFor();assert.equal(await page.locator('.next-body img').count(),0);
 synthetic.calendar.items=[];await page.getByRole('button',{name:'Refresh dashboard'}).click();await page.getByRole('heading',{name:'Nothing else scheduled',exact:true}).waitFor();
 synthetic.calendar.status='error';await page.getByRole('button',{name:'Refresh dashboard'}).click();await page.getByRole('heading',{name:'Calendar unavailable',exact:true}).waitFor();
 await page.unroute('**/api/today');await page.goto(base+'/?rail=1');assert.equal(await page.locator('main').isVisible(),false);await page.goto(base+'/?content=1');assert.equal(await page.locator('.rail').isVisible(),false);
 await page.addInitScript(()=>{window.Frame={openTab:tab=>window.lastFrameTab=tab,showControls:()=>window.frameControlsOpened=true,showAmbient:()=>window.frameAmbientOpened=true};});
 await page.setViewportSize({width:142,height:800});await page.goto(base+'/?rail=1');
 await page.getByRole('button',{name:'Controls',exact:true}).click();assert.equal(await page.evaluate(()=>window.frameControlsOpened),true);
 await page.getByRole('button',{name:'TEAMTRI',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastFrameTab),'teamtri');
 await page.getByRole('button',{name:'Today',exact:true}).click();assert.equal(await page.evaluate(()=>window.lastFrameTab),'today');
 await page.getByRole('button',{name:'Open ambient clock'}).click();assert.equal(await page.evaluate(()=>window.frameAmbientOpened),true);
 await page.screenshot({path:path.join(out,'life-native-rail.png')});
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-proof.json'),JSON.stringify({passed:true,viewports:results,checks:['private data gate','no source or state-file access','read-only API','real calendar and weather','snapshot labelling','tabs','TEAMTRI link','ambient tap','automatic idle','long-title geometry','XSS escaping','empty/error states','native rail/content layouts','no JavaScript errors']},null,2));console.log('PASS: '+results.length+' layout checks, privacy/read-only, real sources, tabs, ambient, idle, long-title, XSS and error states');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
