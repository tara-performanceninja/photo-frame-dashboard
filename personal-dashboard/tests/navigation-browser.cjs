const {chromium}=require('/home/adminrichwebb/.openclaw/workspace/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base='http://127.0.0.1:8788';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:142,height:600}});
  const key=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.state/access.json'))).key;
  await context.addCookies([{name:'frame_session',value:key,url:base,httpOnly:true,sameSite:'Strict'}]);
  let state={tab:'today',revision:1},heldPost,heldGet,holdGet=false;
  await context.route('**/api/navigation',async route=>{
   if(route.request().method()==='POST'){
    const requested=route.request().postDataJSON().tab;
    await new Promise(resolve=>{heldPost=resolve;});
    state={tab:requested,revision:state.revision+1};
    await route.fulfill({json:state});
   }else{
    const snapshot={...state};
    if(holdGet){holdGet=false;await new Promise(resolve=>{heldGet=resolve;});}
    await route.fulfill({json:snapshot});
   }
  });
  const page=await context.newPage();
  await page.addInitScript(()=>{window.Frame={openTab(tab){if(window.deferNative)window.releaseNative=()=>window.selectFrameTab(tab);else setTimeout(()=>window.selectFrameTab(tab),0);},showControls(){}};});
  await page.goto(base+'/?rail=1');
  await page.waitForTimeout(200);
  const selected=()=>page.locator('.tab.active').getAttribute('data-tab');
  for(const tab of ['usage','linear','tara','market','teamtri','today']){
   holdGet=true;
   await page.waitForTimeout(1200);
   assert.ok(heldGet,'navigation read held before click');
   await page.locator('[data-tab="'+tab+'"]').click();
   await page.waitForTimeout(100);
   assert.equal(await selected(),tab,'native pane callback must not select Today');
   heldGet();heldGet=null;
   await page.waitForTimeout(100);
   assert.equal(await selected(),tab,'old poll must not overwrite latest click');
   assert.ok(heldPost);heldPost();heldPost=null;
   await page.waitForTimeout(1200);
   assert.equal(await selected(),tab,'confirmed selection remains stable');
  }
  // Android's callback can also arrive after the server has confirmed the click.
  await page.evaluate(()=>{window.deferNative=true;});
  await page.locator('[data-tab="usage"]').click();
  assert.ok(heldPost);heldPost();heldPost=null;
  await page.waitForTimeout(1200);
  await page.evaluate(()=>window.releaseNative());
  assert.equal(await selected(),'usage','late native callback must not select Today');
  // Native-only actions (light/touch/clock) still select Today with no pending click.
  await page.evaluate(()=>window.selectFrameTab('today'));
  assert.equal(await selected(),'today');
  console.log('PASS: six tab choices retain selection through native callbacks, stale polls and server confirmation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
