// Reuse a completed preview or join the render already in flight. A forced
// refresh is reserved for a stale, idle preview (including an edit-only view).
export async function waitForCurrentRender({isCurrent,isReady,isRendering,requestRender,timeout=16000,now=Date.now,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const started=now();let requested=false;
  while(true){
    if(!isCurrent())throw new Error('文档或图表配置已变化，请完成编辑后重新导出');
    if(isReady())return;
    if(!requested&&!isRendering()){requested=true;requestRender();continue;}
    if(now()-started>=timeout)throw new Error('渲染尚未完成，请检查 Mermaid 语法后重试');
    await wait(25);
  }
}
