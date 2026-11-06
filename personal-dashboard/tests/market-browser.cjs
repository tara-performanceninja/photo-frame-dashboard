const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:600}});
  const key=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.state/access.json'))).key;
  const base='http://127.0.0.1:8788';
  await context.addCookies([{name:'frame_session',value:key,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();
  await page.goto(base);
  await page.locator('[data-tab="market"]').click();
  const report=page.frameLocator('#market-report');
  await report.locator('h1').waitFor();
  assert.ok((await report.locator('h1').innerText()).length>0);
  assert.equal(await report.locator('style').count(),1);
  const box=await page.locator('#market-report').boundingBox();
  assert.ok(box.width>700&&box.height>400);
  assert.ok(await page.locator('[data-tab="today"]').isVisible());
  const old=await page.locator('#market-report').getAttribute('src');
  await page.locator('#market-refresh').click();
  assert.notEqual(await page.locator('#market-report').getAttribute('src'),old);
  await report.locator('h1').waitFor();
  await page.screenshot({path:'/tmp/frame-market.png'});
  await page.locator('[data-tab="today"]').click();
  assert.ok(await page.locator('#today-view').isVisible());
  for(const url of ['/market/analysis.json','/market/%2e%2e/server.py'])assert.equal((await context.request.get(base+url)).status(),404);
  const anon=await browser.newContext();
  assert.equal((await anon.request.get(base+'/market/latest.html')).status(),403);
  await anon.close();
  console.log('PASS market report rendering, frame geometry, reload, return navigation, HTML allowlist and authentication');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
