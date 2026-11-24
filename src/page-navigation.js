// Explicit chapter jumps use one CodeMirror scroll effect, not Cherry's animated
// wheel-sync path. Normal wheel synchronization remains owned by Cherry.
import { getOutline } from './documents.js';
export function fragmentNames(value) {
  const names=new Set();
  let text=String(value||'').trim().replace(/^#/,'');
  for(let depth=0;depth<3;depth++){
    names.add(text);
    try{const next=decodeURIComponent(text);if(next===text)break;text=next;}catch{break;}
  }
  return [...names];
}

export function indexPreview(root) {
  const blocks=[],byElement=new Map(),anchors=new Map();
  let line=1;
  for(const element of root.children){
    const count=Math.max(0,Number.parseInt(element.getAttribute('data-lines'),10)||0);
    const block={element,line,count};
    byElement.set(element,block);if(count)blocks.push(block);line+=count;
  }
  for(const element of root.querySelectorAll('[id],a[name]')){
    for(const value of [element.id,element.getAttribute('name')].filter(Boolean))for(const name of fragmentNames('#'+value))if(!anchors.has(name))anchors.set(name,element);
  }
  const headings=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(heading=>!heading.closest?.('svg'));
  for(const heading of headings){
    const title=heading.textContent.trim();if(title&&!anchors.has(title))anchors.set(title,heading);
  }
  function blockForElement(element){
    let current=element;
    while(current&&current.parentElement!==root)current=current.parentElement;
    return byElement.get(current)||null;
  }
  function blockForLine(number){
    let low=0,high=blocks.length-1,best=null;
    while(low<=high){const mid=(low+high)>>1;if(blocks[mid].line<=number){best=blocks[mid];low=mid+1;}else high=mid-1;}
    return best||blocks[0]||null;
  }
  return {blocks,headings,blockForElement,blockForLine,find(value){for(const name of fragmentNames(value)){const target=anchors.get(name);if(target)return target;}return null;}};
}

export function createPageNavigator(cherry,options={}) {
  const view=cherry.getCodeMirror(),editor=cherry.editor,previewer=cherry.getPreviewer(),root=previewer.getDom();
  const frame=options.frame||requestAnimationFrame,cancel=options.cancel||cancelAnimationFrame;
  const later=options.later||setTimeout,clear=options.clear||clearTimeout;
  let index=null,locked=false,raf=0,timeout=0,generation=0,destroyed=false;
  let sourceDoc=null,sourceHeadings=[];
  const guards=[];
  // Cherry 0.11's callbacks are instance properties. Guard only its synchronization
  // callbacks, never CodeMirror's own scroll listeners or viewport measurement.
  function guard(owner,key,eventTarget,mapTarget){
    if(!owner||typeof owner[key]!=='function')return;
    if(guards.some(entry=>entry.owner===owner&&entry.key===key&&owner[key]===entry.wrapper))return;
    const original=owner[key];
    const wrapper=function(...args){
      if(locked)return;
      if(mapTarget)args[0]=mapTarget(args[0]);
      return original.apply(this,args);
    };
    if(eventTarget)eventTarget.removeEventListener('scroll',original,false);
    owner[key]=wrapper;
    if(eventTarget)eventTarget.addEventListener('scroll',wrapper,{passive:true});
    guards.push({owner,key,original,wrapper,eventTarget});
  }
  function clampPreviewTarget(target){
    // Cherry's end-of-document target is scrollHeight, beyond the last scrollable pixel.
    return Math.max(0,Math.min(target,root.scrollHeight-root.clientHeight));
  }
  function ensureGuards(){
    guard(editor,'onScroll');
    guard(editor,'scrollToLineNum');
    guard(previewer,'scrollHandler',root);
    guard(previewer,'$scrollAnimation',null,clampPreviewTarget);
  }
  function stopAnimation(owner){
    if(owner?.animation?.timer){cancel(owner.animation.timer);owner.animation.timer=0;}
  }
  function release(){
    generation++;cancel(raf);clear(timeout);raf=0;timeout=0;locked=false;
    if(editor)editor.disableScrollListener=false;
    previewer.disableScrollListener=false;
  }
  function begin(){
    release();ensureGuards();locked=true;
    stopAnimation(editor);stopAnimation(previewer);
    const token=generation;let previous='',quiet=0,frames=0;
    const settle=()=>{
      if(token!==generation||destroyed)return;
      frames++;const position=`${view.scrollDOM.scrollTop}:${root.scrollTop}`;
      quiet=position===previous?quiet+1:0;previous=position;
      if(frames>=3&&quiet>=2)release();else raf=frame(settle);
    };
    raf=frame(settle);timeout=later(()=>{if(token===generation)release();},600);
  }
  function captureScroll(){
    const sourceTop=view.scrollDOM.clientHeight?view.scrollDOM.scrollTop:null;
    const previewTop=root.clientHeight?root.scrollTop:null;
    const top=root.getBoundingClientRect().top;
    const visible=element=>{
      const rect=element.getBoundingClientRect();
      return rect.height>0&&rect.bottom>top;
    };
    const block=previewTop===null?null:[...root.children].find(visible);
    const inside=block&&[...block.querySelectorAll('[data-sign]')].find(visible);
    const anchors=[inside,block].filter(Boolean).map(element=>({element,offset:element.getBoundingClientRect().top-top}));
    return {doc:view.state.doc,sourceTop,previewTop,anchors};
  }
  function applyScroll({sourceTop,previewTop,anchors}){
    if(root.clientHeight&&previewTop!==null){
      const anchor=anchors.find(({element})=>root.contains(element));
      root.scrollTop=anchor?root.scrollTop+anchor.element.getBoundingClientRect().top-root.getBoundingClientRect().top-anchor.offset:previewTop;
    }
    if(view.scrollDOM.clientHeight&&sourceTop!==null)view.scrollDOM.scrollTop=sourceTop;
  }
  function restoreScroll(position){
    if(position?.doc!==view.state.doc)return;
    begin();
    applyScroll(position);
  }
  function preserveScroll(update){
    const position=captureScroll();
    if(position.sourceTop===null&&position.previewTop===null)return update();
    begin();
    try{return update();}
    finally{applyScroll(position);}
  }
  function sourceLine(block){
    let number=Math.min(view.state.doc.lines,Math.max(1,block?.line||1));
    const end=Math.min(view.state.doc.lines,number+Math.max(0,(block?.count||1)-1));
    while(number<end&&!view.state.doc.line(number).text.trim())number++;
    return number;
  }
  function jump(number,target,settings={}){
    if(destroyed)return false;
    begin();
    number=Math.min(view.state.doc.lines,Math.max(1,number));
    const line=view.state.doc.line(number);
    const transaction={selection:{anchor:line.from}};
    if(settings.editorVisible!==false)transaction.effects=view.constructor.scrollIntoView(line.from,{y:'start',yMargin:12});
    view.dispatch(transaction);
    if(settings.previewVisible!==false){
      for(let parent=target?.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
      const top=target?root.scrollTop+target.getBoundingClientRect().top-root.getBoundingClientRect().top-12:0;
      root.scrollTo({top:Math.max(0,top),behavior:'instant'});
    }
    if(settings.focusEditor&&settings.editorVisible!==false)view.focus();
    options.onJump?.(number);
    return true;
  }
  function getIndex(){return index??=indexPreview(root);}
  // Large generated and raw-HTML blocks can distort Cherry's cumulative
  // data-lines. Pair real headings with immutable source headings when possible.
  function headingMap(){
    const doc=view.state.doc;if(doc!==sourceDoc){sourceDoc=doc;sourceHeadings=getOutline(doc.toString());}
    const rendered=getIndex().headings;
    const paired=rendered.length===sourceHeadings.length&&sourceHeadings.every((heading,i)=>rendered[i].tagName==='H'+heading.level);
    return {rendered,source:sourceHeadings,paired};
  }
  function headingSourceLine(target){
    let heading=target;while(heading&&heading!==root&&!/^H[1-6]$/.test(heading.tagName||''))heading=heading.parentElement;
    if(!heading||heading===root)return null;
    const map=headingMap(),at=map.rendered.indexOf(heading);return map.paired&&at>=0?map.source[at].line:null;
  }
  function sourceHeadingTarget(number){
    const map=headingMap(),at=map.source.findIndex(heading=>heading.line===number);return map.paired&&at>=0?map.rendered[at]:null;
  }
  ensureGuards();
  function interrupt(owner){
    if(locked)release();
    stopAnimation(owner);
    if(owner)owner.disableScrollListener=false;
  }
  const inputs=[[root,()=>interrupt(previewer)],[view.scrollDOM,()=>interrupt(editor)]];
  for(const [element,handler] of inputs){
    element.addEventListener('wheel',handler,{passive:true,capture:true});
    element.addEventListener('pointerdown',handler,true);
    element.addEventListener('keydown',handler,true);
  }
  return {
    captureScroll,
    restoreScroll,
    preserveScroll,
    fragment(value,settings){
      const map=getIndex(),target=map.find(value);
      if(!target){const names=fragmentNames(value);return names.includes('')||names.includes('top')?jump(1,null,settings):false;}
      return jump(headingSourceLine(target)||sourceLine(map.blockForElement(target)),target,settings);
    },
    line(number,settings){const block=getIndex().blockForLine(number);return jump(number,sourceHeadingTarget(number)||block?.element||null,settings);},
    invalidate(){index=null;release();},
    destroy(){
      destroyed=true;release();
      for(const [element,handler] of inputs){
        element.removeEventListener('wheel',handler,true);
        element.removeEventListener('pointerdown',handler,true);
        element.removeEventListener('keydown',handler,true);
      }
      for(const entry of guards.reverse())if(entry.owner[entry.key]===entry.wrapper){
        if(entry.eventTarget)entry.eventTarget.removeEventListener('scroll',entry.wrapper,false);
        entry.owner[entry.key]=entry.original;
        if(entry.eventTarget)entry.eventTarget.addEventListener('scroll',entry.original,false);
      }
    },
  };
}
