// Hidden native windows may throttle animation frames. Readiness uses actual
// initialization state, not rAF, a fixed minimum delay or a paint event.
export async function waitForStartupReady({isReady,canContinue=()=>false,onSlow=()=>{},isCancelled=()=>false,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,40)),slowAfter=5000,timeout=30000}) {
  const started=now();let slow=false;
  while(true){
    if(isCancelled())return false;
    if(isReady()||canContinue())return true;
    const elapsed=now()-started;
    if(!slow&&elapsed>=slowAfter){slow=true;onSlow();}
    if(elapsed>=timeout)throw new Error('文档准备超时，请重试启动。');
    await wait(40);
  }
}
