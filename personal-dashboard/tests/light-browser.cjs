const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const base='http://127.0.0.1:8788';
 const root=path.resolve(__dirname,'..');
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
 try {
  const context=await browser.newContext({viewport:{width:882,height:600}});
  await context.addCookies([{name:'frame_session',value:JSON.parse(fs.readFileSync(path.join(root,'.state/access.json'))).key,url:base,httpOnly:true,sameSite:'Strict'}]);
  const rail=await context.newPage();await rail.setViewportSize({width:142,height:600});await rail.addInitScript(()=>{window.Frame={showControls(){}};});await rail.goto(base+'/?rail=1');
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install();
  await page.goto(base+'/?content=1');
  await page.waitForFunction(()=>typeof window.showFrameDarkAmbient==='function');
  await page.waitForTimeout(1500);
  // Bright/native content must remain visible beyond the old two-minute timer.
  await page.clock.fastForward(125000);
  assert.equal(await page.locator('#ambient').isVisible(),false);
  await page.evaluate(()=>window.showFrameDarkAmbient());
  assert.equal(await page.locator('#ambient').isVisible(),true);
  assert.equal(await page.locator('#ambient').evaluate(e=>e.classList.contains('night')),true);
  // A pending navigation response must not undo a darkness-triggered saver.
  await context.request.post(base+'/api/navigation',{data:{tab:'today'}});
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('#ambient').isVisible(),true);
  await rail.waitForFunction(()=>document.body.classList.contains('low-light'));
  const colour=await page.locator('#ambient-time').evaluate(e=>getComputedStyle(e).color);
  assert.equal(colour,'rgb(72, 117, 156)');
  assert.equal(await rail.locator('.rail').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 8, 15)');
  assert.equal(await rail.locator('.tab.active').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(10, 32, 53)');
  await page.screenshot({path:process.env.FRAME_PROOF_DIR+'/dark-browser.png'});
  await rail.screenshot({path:process.env.FRAME_PROOF_DIR+'/dark-menu.png'});
  // Reloading just the menu must preserve the content pane's low-light state.
  await rail.reload();await rail.waitForFunction(()=>document.body.classList.contains('low-light'));
  await page.evaluate(()=>window.resumeFrameToday());
  assert.equal(await page.locator('#ambient').isVisible(),false);
  assert.equal(await page.locator('#today-view').isVisible(),true);
  await rail.waitForFunction(()=>!document.body.classList.contains('low-light'));
  assert.equal(await rail.locator('.rail').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 61, 121)');
  await page.evaluate(()=>window.showFrameDarkAmbient());
  await page.locator('#ambient').click();
  assert.equal(await page.locator('#ambient').isVisible(),false);
  await rail.waitForFunction(()=>!document.body.classList.contains('low-light'));
  await page.evaluate(()=>window.showFrameAmbient());
  assert.equal(await page.locator('#ambient').isVisible(),true);
  await page.locator('#ambient').click();
  assert.deepEqual(errors,[]);
  // A content reload resets stale saved low-light state, as on app startup.
  await page.evaluate(()=>window.showFrameDarkAmbient());
  await rail.waitForFunction(()=>document.body.classList.contains('low-light'));
  await page.reload();await rail.waitForFunction(()=>!document.body.classList.contains('low-light'));
  // Sensor-free browser previews retain their old idle clock.
  const previewContext=await browser.newContext({viewport:{width:1024,height:600}});
  await previewContext.addCookies(await context.cookies());
  const preview=await previewContext.newPage();
  await preview.clock.install();
  await preview.goto(base+'/');
  await preview.waitForFunction(()=>typeof window.showFrameDarkAmbient==='function');
  await preview.clock.fastForward(125000);
  await preview.clock.runFor(1000);
  assert.equal(await preview.locator('#ambient').isVisible(),true);
  console.log('Native idle suppression, browser idle fallback, dark display, navigation race, light return, touch and manual clock checks passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
