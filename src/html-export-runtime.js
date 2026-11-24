// Self-contained: this same function is bound by the preview parent and embedded
// into saved files. Do not reference module variables or imports from its body.
export function installHtmlExportRuntime(doc,{onTocWidthChange}={}) {
  const win=doc.defaultView;
  let links=[],headings=[],current=null,raf=0;
  let drag=null,dragFrame=0;
  // Keep these bounds aligned with htmlTocWidthLimits. This function is embedded
  // in standalone files, so it cannot import the settings module.
  const maxWidth=()=>Math.min(600,Math.max(180,win.innerWidth-320));
  const clampWidth=value=>Math.round(Math.max(180,Math.min(maxWidth(),value)));
  const side=()=>doc.body.getAttribute('data-toc-position');
  const canResize=()=>['left','right'].includes(side())&&win.innerWidth>720&&doc.querySelector('.mt-toc-root')?.open;
  function syncResizers(){
    for(const handle of doc.querySelectorAll('.mt-toc-resizer')){
      const enabled=canResize();handle.tabIndex=enabled?0:-1;
      handle.setAttribute('aria-disabled',String(!enabled));handle.setAttribute('aria-valuemax',String(maxWidth()));
      if(enabled)handle.setAttribute('aria-valuenow',String(Math.round(handle.closest('.mt-outline').getBoundingClientRect().width)));
    }
  }
  function setWidth(value){
    const width=clampWidth(value);doc.body.style.setProperty('--mt-toc-width',width+'px');syncResizers();schedule();return width;
  }
  function moveDrag(){
    dragFrame=0;if(!drag)return;
    setWidth(drag.width+(drag.lastX-drag.startX)*drag.direction);
  }
  function endDrag(event,commit=true){
    if(!drag||event&&event.pointerId!==drag.pointerId)return;
    if(event&&commit)drag.lastX=event.clientX;
    win.cancelAnimationFrame(dragFrame);dragFrame=0;
    const finished=drag;
    const width=commit?setWidth(drag.width+(drag.lastX-drag.startX)*drag.direction):finished.width;
    drag=null;doc.body.classList.remove('mt-resizing');
    if(!commit){if(finished.original)doc.body.style.setProperty('--mt-toc-width',finished.original);else doc.body.style.removeProperty('--mt-toc-width');syncResizers();schedule();}
    if(finished.handle.hasPointerCapture?.(finished.pointerId))finished.handle.releasePointerCapture(finished.pointerId);
    if(commit)onTocWidthChange?.(width);
  }
  function pointerDown(event){
    const handle=event.target.closest('.mt-toc-resizer');
    if(!handle||event.button!==0||!canResize()||drag)return;
    event.preventDefault();
    drag={handle,pointerId:event.pointerId,startX:event.clientX,lastX:event.clientX,width:handle.closest('.mt-outline').getBoundingClientRect().width,direction:side()==='left'?1:-1,original:doc.body.style.getPropertyValue('--mt-toc-width')};
    handle.focus({preventScroll:true});doc.body.classList.add('mt-resizing');
    try{handle.setPointerCapture(event.pointerId);}catch{endDrag(null,false);}
  }
  function pointerMove(event){
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag.lastX=event.clientX;
    if(!dragFrame)dragFrame=win.requestAnimationFrame(moveDrag);
  }
  const pointerCancel=event=>endDrag(event,false);
  const lostCapture=event=>{if(drag&&event.pointerId===drag.pointerId)endDrag(null);};
  const blur=()=>endDrag(null);
  function resizeKeys(event){
    if(drag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();endDrag(null,false);return;}
    const handle=event.target.closest('.mt-toc-resizer');if(!handle||!canResize()||event.ctrlKey||event.metaKey||event.altKey)return;
    const direction=side()==='left'?1:-1,step=event.shiftKey?50:10,currentWidth=handle.closest('.mt-outline').getBoundingClientRect().width;
    const next=event.key==='Home'?180:event.key==='End'?maxWidth():event.key==='ArrowLeft'?currentWidth-step*direction:event.key==='ArrowRight'?currentWidth+step*direction:null;
    if(next===null)return;event.preventDefault();event.stopPropagation();const width=setWidth(next);onTocWidthChange?.(width);
  }
  function resetWidth(event){if(event.target.closest('.mt-toc-resizer')&&canResize()){event.preventDefault();const width=setWidth(260);onTocWidthChange?.(width);}}
  const decoded=value=>{const values=new Set([value]);let text=value;for(let n=0;n<3;n++){try{const next=decodeURIComponent(text);if(next===text)break;values.add(next);text=next;}catch{break;}}return [...values];};
  let ids=new Map();
  function targetFor(hash){for(const name of decoded(hash.replace(/^#/,''))){const target=ids.get(name);if(target)return target;}return null;}
  function highlight(link){
    if(current===link)return;
    current?.removeAttribute('aria-current');current=link;current?.setAttribute('aria-current','location');
    const body=doc.querySelector('.mt-toc-body'),details=doc.querySelector('.mt-toc-root');
    if(!body||!link||!details?.open||!link.getClientRects().length)return;
    const box=body.getBoundingClientRect(),item=link.getBoundingClientRect();
    if(item.top<box.top)body.scrollTop-=box.top-item.top+8;else if(item.bottom>box.bottom)body.scrollTop+=item.bottom-box.bottom+8;
  }
  function spy(){
    raf=0;let low=0,high=headings.length-1,best=headings[0];
    while(low<=high){const mid=(low+high)>>1;if(headings[mid].target.getBoundingClientRect().top<=32){best=headings[mid];low=mid+1;}else high=mid-1;}
    // The final chapter cannot always reach the top because scrolling is clamped
    // at the document bottom. Keep the last visible section active there.
    if(win.scrollY>0&&win.scrollY+win.innerHeight>=doc.documentElement.scrollHeight-2)best=headings.at(-1);
    if(best)highlight(best.link);
  }
  function schedule(){if(!raf)raf=win.requestAnimationFrame(spy);}
  function layout(){syncResizers();schedule();}
  function refresh(){
    ids=new Map();for(const node of doc.querySelectorAll('[id]'))for(const id of decoded(node.id))if(!ids.has(id))ids.set(id,node);
    links=[...doc.querySelectorAll('a[data-mt-heading]')];
    headings=links.map(link=>({link,target:ids.get(link.getAttribute('data-mt-heading'))})).filter(item=>item.target&&item.target.getClientRects().length);
    current?.removeAttribute('aria-current');current=null;syncResizers();schedule();
  }
  function selectTab(radio){
    radio.checked=true;
    // Persist the preview's selection when its DOM is serialized for download.
    for(const option of radio.parentElement.querySelectorAll(':scope > input.cherry-tabs--radio'))option.defaultChecked=option===radio;
  }
  function revealAncestors(target){
    let tabChanged=false;
    for(let node=target.parentElement;node;node=node.parentElement){
      if(node.tagName==='DETAILS')node.open=true;
      const radioId=node.getAttribute('data-mt-tab-radio');
      if(!radioId)continue;
      const radio=doc.getElementById(radioId);
      if(radio&&radio.parentElement===node.parentElement?.parentElement&&!radio.checked){selectTab(radio);tabChanged=true;}
    }
    if(tabChanged)refresh();
    return tabChanged;
  }
  function change(event){
    const radio=event.target;
    if(radio.matches?.('.cherry-tabs > input.cherry-tabs--radio[type="radio"]')&&radio.checked){selectTab(radio);refresh();}
  }
  function revealHashTab(){
    const hash=win.location?.hash;
    if(!hash)return;
    const target=targetFor(hash);
    if(target?.closest('[data-mt-tab-radio]')&&revealAncestors(target))target.scrollIntoView({block:'start',behavior:'instant'});
  }
  function click(event){
    const action=event.target.closest('[data-mt-toc-action]');
    if(action){
      event.preventDefault();const open=action.getAttribute('data-mt-toc-action')==='expand';
      for(const branch of doc.querySelectorAll('.mt-toc-branch'))branch.open=open;
      const root=doc.querySelector('.mt-toc-root');if(root)root.open=true;schedule();return;
    }
    const link=event.target.closest('a');const href=link?.getAttribute('href');
    if(!href?.startsWith('#')||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const target=targetFor(href);if(!target)return;
    event.preventDefault();revealAncestors(target);
    target.scrollIntoView({block:'start',behavior:'instant'});
    try{if(new URL(href,win.location.href).hash!==win.location.hash)win.history.pushState(null,'',href);}catch{}
    if(link.hasAttribute('data-mt-heading'))highlight(link);schedule();
  }
  const toggle=event=>{
    // Inline TOC details also live in <article>. Expanding its branches changes
    // navigation visibility, not the document's heading/id index.
    if(event.target.closest('.mt-outline')){if(event.target.classList.contains('mt-toc-root'))syncResizers();schedule();}
    else if(event.target.closest('article'))refresh();
  };
  const resized=()=>{endDrag(null);syncResizers();schedule();};
  const events={click,change,pointerdown:pointerDown,pointermove:pointerMove,pointerup:endDrag,pointercancel:pointerCancel,lostpointercapture:lostCapture,keydown:resizeKeys,dblclick:resetWidth};
  for(const [name,handler] of Object.entries(events))doc.addEventListener(name,handler);
  doc.addEventListener('toggle',toggle,true);win.addEventListener('scroll',schedule,{passive:true});win.addEventListener('resize',resized);win.addEventListener('blur',blur);
  win.addEventListener('hashchange',revealHashTab);refresh();revealHashTab();
  return {refresh,layout,destroy(){endDrag(null,false);win.cancelAnimationFrame(raf);win.cancelAnimationFrame(dragFrame);for(const [name,handler] of Object.entries(events))doc.removeEventListener(name,handler);doc.removeEventListener('toggle',toggle,true);win.removeEventListener('scroll',schedule);win.removeEventListener('resize',resized);win.removeEventListener('blur',blur);win.removeEventListener('hashchange',revealHashTab);}};
}
