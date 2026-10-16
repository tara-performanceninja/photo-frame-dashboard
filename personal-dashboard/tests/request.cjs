const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../request.js'),'utf8');
(async()=>{
 let mode='headers',cleared=0;
 const sandbox={window:{},AbortController,setTimeout:(fn,ms)=>{assert.equal(ms,10000);return setTimeout(fn,20);},clearTimeout:t=>{cleared++;clearTimeout(t);},fetch:async(url,opts)=>{
  assert.equal(opts.cache,'no-store');
  const stall=()=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('Aborted'))));
  if(mode==='headers')return stall();
  return {ok:mode!=='http',json:()=>mode==='body'?stall():Promise.resolve({live:true})};
 }};
 vm.runInNewContext(source,sandbox);
 for(const stuck of ['headers','body']){
  mode=stuck;await assert.rejects(sandbox.window.frameReadJson('/api/today',{cache:'no-store'}),/Aborted/);
  mode='ok';assert.equal((await sandbox.window.frameReadJson('/api/today',{cache:'no-store'})).live,true);
 }
 mode='http';await assert.rejects(sandbox.window.frameReadJson('/api/today',{cache:'no-store'}),/Connection unavailable/);
 assert.equal(cleared,5);
 console.log('PASS: stalled headers, stalled body, recovery after both, HTTP failure, timer cleanup');
})().catch(e=>{console.error(e);process.exit(1);});
