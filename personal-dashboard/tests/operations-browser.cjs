const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const out='/home/adminrichwebb/.openclaw/workspace/outputs/photo-frame-2026-10-13/three-tabs';
const base='http://127.0.0.1:8788';
(async()=>{
const key=JSON.parse(fs.readFileSync(path.join(root,'.state/access.json'))).key;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
try {
 const context=await browser.newContext();const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('favicon'))errors.push(msg.text());});
 assert.equal((await context.request.get(base+'/api/operations')).status(),403);
 await context.addCookies([{name:'frame_session',value:key,url:base,httpOnly:true,sameSite:'Strict'}]);
 for(const target of ['/operations.py','/.state/cache.json','/server.py'])assert.equal((await context.request.get(base+target)).status(),404);
 assert.equal((await context.request.post(base+'/api/operations')).status(),405);
 assert.equal((await context.request.post(base+'/api/navigation',{data:{tab:'tara'}})).status(),403);
 assert.equal((await context.request.post(base+'/api/navigation',{headers:{Origin:'https://other.example'},data:{tab:'tara'}})).status(),403);
 assert.equal((await context.request.post(base+'/api/navigation',{headers:{Origin:base},data:{tab:'unknown'}})).status(),400);
 const live=await (await context.request.get(base+'/api/operations')).json();
 assert.equal(live.linear.status,'ok');assert.equal(live.usage.status,'ok');assert.equal(live.tara.status,'ok');
 assert.ok(live.usage.windows.length);assert.ok(live.tara.health.temperature>0);
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#usage-status').textContent.includes('updated'));
 const layouts=[];
 for(const [width,height] of [[1024,600],[1280,800],[390,844]]){
  await page.setViewportSize({width,height});
  for(const tab of ['usage','linear','tara']){
   await page.locator('[data-tab="'+tab+'"]').click();
   assert.equal(await page.locator('#'+tab+'-view').isVisible(),true);
   await page.evaluate(()=>document.fonts.ready);
   const failures=await page.evaluate(()=>{
    const bad=[];if(document.documentElement.scrollWidth>innerWidth+1)bad.push('horizontal overflow');
    if(innerWidth>=700&&document.documentElement.scrollHeight>innerHeight+1)bad.push('vertical overflow');
    const rail=document.querySelector('.rail');if(rail.scrollHeight>rail.clientHeight+1)bad.push('rail overflow');
    for(const el of document.querySelectorAll('.view:not([hidden]) .health-stat,.view:not([hidden]) .usage-card')){
      if(el.scrollWidth>el.clientWidth+1)bad.push('card overflow');
    }return bad;
   });assert.deepEqual(failures,[],`${tab} ${width}x${height}`);layouts.push({tab,width,height});
   await page.screenshot({path:path.join(out,`${tab}-${width}x${height}.png`)});
  }
 }
 await page.setViewportSize({width:1024,height:600});await page.locator('[data-tab="linear"]').click();
 await page.locator('#linear-state').selectOption('started');
 const started=live.linear.items.filter(r=>r.state.type==='started').length;
 assert.equal(Number(await page.locator('#linear-count').textContent()),started);
 await page.locator('[data-tab="tara"]').click();await page.locator('[data-task-filter="needsAttention"]').click();
 assert.equal(await page.locator('#tara-list .issue-row').count(),live.tara.needsAttention.length);
 // Exercise safe rendering of untrusted source titles and stale/error health.
 const synthetic=structuredClone(live);synthetic.linear.items[0].title='<img src=x onerror=alert(1)>';
 synthetic.tara.status='error';synthetic.usage.status='error';
 await page.route('**/api/operations',r=>r.fulfill({json:synthetic}));
 await page.locator('.ops-refresh[aria-label="Refresh Tara health"]').click();
 await page.waitForFunction(()=>document.querySelector('#health-banner').textContent.includes('stale'));
 assert.equal(await page.locator('#linear-list img').count(),0);
 await page.unroute('**/api/operations');
 // Simulate the installed Java shell: only Today/TEAMTRI are recognised.
 const content=await context.newPage();await content.setViewportSize({width:1138,height:800});
 await content.goto(base+'/?content=1');
 const rail=await context.newPage();await rail.setViewportSize({width:142,height:800});
 await rail.exposeFunction('nativeOpen',async tab=>{
   if(tab!=='teamtri'&&tab!=='today')throw new Error('unsupported native tab');
   if(tab==='today')await content.evaluate(()=>window.resumeFrameToday());
 });
 await rail.addInitScript(()=>{window.Frame={openTab:tab=>{window.nativeTab=tab;window.nativeOpen(tab);window.selectFrameTab(tab);},showControls:()=>{},showAmbient:()=>{}};});
 await rail.goto(base+'/?rail=1');
 for(const tab of ['usage','linear','tara','teamtri','usage','today']){
   await rail.locator('[data-tab="'+tab+'"]').click();
   if(tab==='teamtri'){
     await content.waitForTimeout(1500);
     await content.evaluate(()=>{window.realNow=Date.now;Date.now=()=>window.realNow()+61000;});
     await content.waitForTimeout(1500);
     assert.equal((await (await context.request.get(base+'/api/navigation')).json()).tab,'teamtri');
     await content.evaluate(()=>{Date.now=window.realNow;});
   }
   if(tab!=='teamtri')await content.waitForFunction(tab=>!document.querySelector('#'+tab+'-view').hidden,tab);
   await rail.waitForFunction(tab=>document.querySelector('[data-tab="'+tab+'"]').classList.contains('active'),tab);
   assert.equal(await rail.evaluate(()=>window.nativeTab),tab==='teamtri'?'teamtri':'today');
 }
 await rail.setViewportSize({width:142,height:600});
 assert.ok(await rail.evaluate(()=>document.querySelector('.rail').scrollHeight<=innerHeight+1));
 await rail.screenshot({path:path.join(out,'native-rail-142x600.png')});
 // Restore the navigation state without touching the actual frame.
 await context.request.post(base+'/api/navigation',{headers:{Origin:base},data:{tab:'today'}});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'browser-proof.json'),JSON.stringify({passed:true,layouts,checks:['live feeds','filters','safe text','private endpoints','same-origin navigation','native shell simulation','stale health labelling'],physicalFrameTested:false,macUsed:false},null,2));
 console.log('PASS: nine layouts, live feeds, filters, privacy, safe text and native shell simulation');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
