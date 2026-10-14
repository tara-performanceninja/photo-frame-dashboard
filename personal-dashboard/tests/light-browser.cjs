const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const base='http://127.0.0.1:8788';
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
 try {
  const context=await browser.newContext({viewport:{width:1138,height:800}});
  await context.addCookies([{name:'frame_session',value:JSON.parse(fs.readFileSync(path.join(root,'.state/access.json'))).key,url:base,httpOnly:true,sameSite:'Strict'}]);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/?content=1');
  await page.waitForFunction(()=>typeof window.showFrameDarkAmbient==='function');
  await page.waitForTimeout(1500);
  await page.evaluate(()=>window.showFrameDarkAmbient());
  assert.equal(await page.locator('#ambient').isVisible(),true);
  assert.equal(await page.locator('#ambient').evaluate(e=>e.classList.contains('night')),true);
  // A pending navigation response must not undo a darkness-triggered saver.
  await context.request.post(base+'/api/navigation',{data:{tab:'today'}});
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#ambient').isVisible(),true);
  await page.screenshot({path:process.env.FRAME_PROOF_DIR+'/dark-browser.png'});
  await page.evaluate(()=>window.resumeFrameToday());
  assert.equal(await page.locator('#ambient').isVisible(),false);
  assert.equal(await page.locator('#today-view').isVisible(),true);
  await page.evaluate(()=>window.showFrameDarkAmbient());
  await page.locator('#ambient').click();
  assert.equal(await page.locator('#ambient').isVisible(),false);
  await page.evaluate(()=>window.showFrameAmbient());
  assert.equal(await page.locator('#ambient').isVisible(),true);
  await page.locator('#ambient').click();
  assert.deepEqual(errors,[]);
  console.log('Dark display, navigation race, light return, touch and idle saver checks passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
