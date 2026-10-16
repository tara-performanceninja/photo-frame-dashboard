// Bound the full JSON read, including response bodies, after interrupted connections.
(function(){
'use strict';
window.frameReadJson=async function(url,options){
 var controller=new AbortController();
 var timer=setTimeout(function(){controller.abort();},10000);
 try{
  var response=await fetch(url,Object.assign({},options||{},{signal:controller.signal}));
  if(!response.ok)throw new Error('Connection unavailable');
  return await response.json();
 }finally{clearTimeout(timer);}
};
})();
