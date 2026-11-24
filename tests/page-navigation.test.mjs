import test from 'node:test';
import assert from 'node:assert/strict';
import { fragmentNames, indexPreview, createPageNavigator } from '../src/page-navigation.js';

function fixture(){
  function events(object={}){const listeners=new Map();return Object.assign(object,{listeners,addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);}});}
  const root=events({children:[],scrollTop:0,getBoundingClientRect:()=>({top:0}),scrollTo({top,behavior}){this.scrollTop=top;this.behavior=behavior;},querySelectorAll(){return this.children.filter(n=>n.id||n.name);}});
  function node(id,count,top,name=''){
    const n={id,name,textContent:'',parentElement:root,getAttribute(key){return key==='data-lines'?String(count):key==='name'?name:null;},getBoundingClientRect:()=>({top:top-root.scrollTop})};root.children.push(n);return n;
  }
  node('top',2,0);node('%E4%B8%AD%E6%96%87',3,200);node('end',2,500,'legacy-end');
  root.children.forEach((node,index)=>{node.tagName=index===1?'H2':'H1';node.textContent=['Top','中文','End'][index];});
  const text=['# Top','','','## 中文','text','','# End'];
  const calls={source:0,preview:0,focus:0,transactions:[],previewTargets:[]};
  const editor={animation:{timer:90},disableScrollListener:false,onScroll(){calls.source++;},scrollToLineNum(){calls.source++;}};
  const previewer={animation:{timer:91},disableScrollListener:false,getDom:()=>root,scrollHandler(){calls.preview++;},$scrollAnimation(target){calls.previewTargets.push(target);}};
  root.addEventListener('scroll',previewer.scrollHandler);
  class View{
    static scrollIntoView(pos,options){return{pos,...options};}
    constructor(){this.scrollDOM=events({scrollTop:0});this.state={doc:{lines:text.length,toString:()=>text.join('\n'),line:n=>({from:text.slice(0,n-1).reduce((s,t)=>s+t.length+1,0),text:text[n-1]})}};}
    dispatch(transaction){calls.transactions.push(transaction);if(transaction.effects)this.scrollDOM.scrollTop=transaction.effects.pos*2;}
    focus(){calls.focus++;}
  }
  const view=new View(),frames=new Map(),timers=new Map(),cancelled=[];let next=1;
  const hooks={frame:fn=>{const id=next++;frames.set(id,fn);return id;},cancel:id=>{cancelled.push(id);frames.delete(id);},later:fn=>{const id=next++;timers.set(id,fn);return id;},clear:id=>timers.delete(id)};
  const navigator=createPageNavigator({editor,getCodeMirror:()=>view,getPreviewer:()=>previewer},hooks);
  function settle(){for(let n=0;n<8&&frames.size;n++){const[id,fn]=frames.entries().next().value;frames.delete(id);fn();}}
  return{root,editor,previewer,view,calls,frames,timers,cancelled,navigator,settle};
}
test('Fragments support literal, percent-encoded and legacy anchor names without selector interpolation',()=>{
  const f=fixture(),map=indexPreview(f.root);
  assert.equal(map.find('#中文'),f.root.children[1]);
  assert.equal(map.find('#%25E4%25B8%25AD%25E6%2596%2587'),f.root.children[1]);
  assert.equal(map.find('#legacy-end'),f.root.children[2]);
  assert.deepEqual(fragmentNames('#bad%ZZ'),['bad%ZZ']);
  assert.equal(map.find('#missing'),null);
  f.navigator.destroy();
});

test('Heading titles are fallback fragment names without replacing explicit anchors',()=>{
  const f=fixture();f.root.children[1].textContent='有空格的 章节';
  const map=indexPreview(f.root);assert.equal(map.find('#'+encodeURIComponent('有空格的 章节')),f.root.children[1]);
  f.root.children[1].textContent='end';assert.equal(indexPreview(f.root).find('#end'),f.root.children[2]);f.navigator.destroy();
});
test('A chapter jump cancels animations, maps source lines and temporarily guards only synchronization',()=>{
  const f=fixture();
  assert.equal(f.navigator.fragment('#中文'),true);
  const transaction=f.calls.transactions[0];
  assert.equal(transaction.selection.anchor,f.view.state.doc.line(4).from);
  assert.equal(transaction.effects.y,'start');assert.equal(transaction.effects.yMargin,12);
  assert.equal(Object.hasOwn(transaction,'changes'),false);
  assert.equal(f.root.behavior,'instant');assert.equal(f.root.scrollTop,188);
  assert.ok(f.cancelled.includes(90)&&f.cancelled.includes(91));
  f.editor.onScroll();f.editor.scrollToLineNum();f.previewer.scrollHandler();
  assert.equal(f.calls.source,0);assert.equal(f.calls.preview,0);
  f.settle();f.editor.onScroll();f.previewer.scrollHandler();
  assert.equal(f.calls.source,1);assert.equal(f.calls.preview,1);assert.equal(f.calls.focus,0);
  f.navigator.destroy();assert.equal(f.root.listeners.get('scroll').size,1);
});
test('Rapid successive navigation cannot release the newest jump with an old timeout',()=>{
  const f=fixture();f.navigator.fragment('#中文');const oldTimeout=f.timers.values().next().value;
  f.navigator.fragment('#end');oldTimeout();f.editor.onScroll();assert.equal(f.calls.source,0);
  assert.equal(f.calls.transactions.at(-1).selection.anchor,f.view.state.doc.line(7).from);
  f.settle();f.editor.onScroll();assert.equal(f.calls.source,1);f.navigator.destroy();
});
test('Preview sync uses reachable targets and a scrollbar drag interrupts its animation',()=>{
  const f=fixture();
  f.root.clientHeight=500;
  f.root.scrollHeight=2000;
  f.previewer.$scrollAnimation(2000);
  f.previewer.$scrollAnimation(1100);
  f.previewer.$scrollAnimation(-8);
  assert.deepEqual(f.calls.previewTargets,[1500,1100,0]);
  f.previewer.disableScrollListener=true;
  for(const handler of f.root.listeners.get('pointerdown'))handler();
  assert.equal(f.previewer.animation.timer,0);
  assert.equal(f.previewer.disableScrollListener,false);
  assert.ok(f.cancelled.includes(91));
  assert.equal(f.editor.animation.timer,90);
  f.previewer.scrollHandler();
  assert.equal(f.calls.preview,1);
  f.navigator.destroy();
  assert.equal(f.root.listeners.get('pointerdown').size,0);
  f.previewer.$scrollAnimation(2000);
  assert.equal(f.calls.previewTargets.at(-1),2000);
});
test('Preview layout changes keep both panes at their reading position without moving the selection',()=>{
  const f=fixture();
  const heading=f.root.children[1];
  let insertedHeight=0;
  f.root.clientHeight=120;
  f.view.scrollDOM.clientHeight=120;
  f.root.contains=element=>f.root.children.includes(element);
  f.root.children.forEach((element,index)=>{
    const top=[0,200,500][index];
    element.querySelectorAll=()=>[];
    element.getBoundingClientRect=()=>{
      const y=top+(index?insertedHeight:0)-f.root.scrollTop;
      return {top:y,bottom:y+70,height:70};
    };
  });
  f.root.scrollTop=190;
  f.view.scrollDOM.scrollTop=100;
  f.navigator.preserveScroll(()=>{
    insertedHeight=250;
    f.view.scrollDOM.scrollTop=0;
    f.previewer.scrollHandler();
  });
  assert.equal(heading.getBoundingClientRect().top,10);
  assert.equal(f.root.scrollTop,440);
  assert.equal(f.view.scrollDOM.scrollTop,100);
  assert.equal(f.calls.preview,0);
  assert.equal(f.calls.transactions.length,0);
  f.settle();f.previewer.scrollHandler();
  assert.equal(f.calls.preview,1);
  const saved=f.navigator.captureScroll();
  f.root.clientHeight=0;
  insertedHeight+=60;
  f.root.clientHeight=120;
  f.navigator.restoreScroll(saved);
  assert.equal(heading.getBoundingClientRect().top,10);
  f.view.state.doc={...f.view.state.doc};
  f.root.scrollTop=0;
  f.navigator.restoreScroll(saved);
  assert.equal(f.root.scrollTop,0);
  f.navigator.destroy();
});
test('Preview-only navigation does not scroll or focus a hidden editor; outline navigation can focus it',()=>{
  const f=fixture();f.navigator.fragment('#end',{editorVisible:false});
  assert.equal(Object.hasOwn(f.calls.transactions[0],'effects'),false);assert.equal(f.view.scrollDOM.scrollTop,0);
  f.settle();f.navigator.line(4,{focusEditor:true});assert.equal(f.calls.focus,1);
  f.navigator.destroy();
});
test('Missing targets preserve browser fallback and disposal restores the native handlers',()=>{
  const f=fixture();assert.equal(f.navigator.fragment('#unknown'),false);assert.equal(f.calls.transactions.length,0);
  f.navigator.fragment('#end');f.navigator.invalidate();f.editor.onScroll();assert.equal(f.calls.source,1);
  f.navigator.destroy();f.editor.onScroll();f.previewer.scrollHandler();
  assert.equal(f.calls.source,2);assert.equal(f.calls.preview,1);assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
});

test('Preview block line-count drift does not move outline or fragment jumps to the wrong chapter',()=>{
  const f=fixture();f.root.children[0].getAttribute=key=>key==='data-lines'?'100':null;
  f.navigator.line(4);assert.equal(f.root.scrollTop,188);
  f.navigator.fragment('#中文');assert.equal(f.calls.transactions.at(-1).selection.anchor,f.view.state.doc.line(4).from);
  f.navigator.destroy();
});
