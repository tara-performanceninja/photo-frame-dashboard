const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base='http://127.0.0.1:8788';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext();
  const key=JSON.parse(fs.readFileSync('/home/adminrichwebb/.openclaw/workspace/projects/photo-frame-dashboard/personal-dashboard/.state/access.json')).key;
  await context.addCookies([{name:'frame_session',value:key,url:base,httpOnly:true,sameSite:'Strict'}]);
  await context.addInitScript(()=>{
   const real=window.fetch.bind(window);window.frameTestStall=true;
   window.fetch=(url,opts)=>window.frameTestStall&&['/api/today','/api/operations','/api/navigation'].includes(url)?new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))):real(url,opts);
  });
  const page=await context.newPage();await page.goto(base+'/?content=1');
  await page.waitForFunction(()=>!document.querySelector('#refresh').classList.contains('loading')&&document.querySelector('#overall-status').textContent.includes('Connection lost'),{},{timeout:15000});
  assert.match(await page.locator('#today-codex-note').textContent(),/Connection lost/);
  await page.evaluate(()=>{window.frameTestStall=false;document.querySelector('#refresh').click();document.querySelector('.ops-refresh').click();});
  await page.waitForFunction(()=>document.querySelector('#overall-status').textContent.includes('weather live')&&document.querySelector('#usage-status').textContent.includes('updated'));
  // Native tab polling must also resume after the same network interruption.
  const response=await context.request.post(base+'/api/navigation',{headers:{Origin:base},data:{tab:'linear'}});assert.equal(response.status(),200);
  await page.waitForFunction(()=>!document.querySelector('#linear-view').hidden);
  console.log('PASS: stuck Today + operations + native navigation time out, then all recover without a reload');
  const restored=await context.request.post(base+'/api/navigation',{headers:{Origin:base},data:{tab:'today'}});assert.equal(restored.status(),200);
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
