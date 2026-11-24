import test from 'node:test';
import assert from 'node:assert/strict';
import { createLazyMermaid } from '../src/lazy-mermaid.js';
import { waitForCurrentRender } from '../src/export-readiness.js';
import { inlineImages, waitForImages } from '../src/export-document.js';

test('Mermaid stays unloaded on ordinary documents and concurrent requests share the latest configuration',async()=>{
  let loads=0,release;const configurations=[],renders=[],flags=[];
  const api={initialize:value=>configurations.push(value),render:async(...args)=>{renders.push(args);return {svg:'<svg/>'};}};
  const lazy=createLazyMermaid({load:()=>{loads++;return new Promise(resolve=>{release=()=>resolve({default:api});});},beforeRender:text=>flags.push(text)});
  lazy.initialize({theme:'default'});assert.equal(loads,0);
  const first=lazy.render('one','flowchart LR'),second=lazy.render('two','pie');
  await Promise.resolve();lazy.initialize({theme:'dark'});release();await Promise.all([first,second]);
  assert.equal(loads,1);assert.deepEqual(configurations,[{theme:'dark'}]);assert.equal(renders.length,2);assert.deepEqual(flags,['flowchart LR','pie']);
  lazy.initialize({theme:'neutral'});await lazy.render('three','classDiagram');assert.equal(loads,1);assert.equal(configurations.at(-1).theme,'neutral');
});
test('A failed Mermaid module load remains retryable',async()=>{
  let loads=0;const lazy=createLazyMermaid({load:async()=>{if(++loads===1)throw new Error('load failed');return {initialize(){},render:async()=>({svg:'ok'})};}});
  await assert.rejects(lazy.render('id','flowchart'),/load failed/);
  assert.deepEqual(await lazy.render('id','flowchart'),{svg:'ok'});assert.equal(loads,2);
});
test('Export reuses a completed preview and joins a pending render without restarting it',async()=>{
  let refreshes=0,waits=0,ready=true,pending=false;
  const hooks={isCurrent:()=>true,isReady:()=>ready,isRendering:()=>pending,requestRender:()=>{refreshes++;},wait:async()=>{waits++;ready=true;pending=false;}};
  await waitForCurrentRender(hooks);assert.equal(refreshes,0);assert.equal(waits,0);
  ready=false;pending=true;await waitForCurrentRender(hooks);assert.equal(refreshes,0);assert.equal(waits,1);
});
test('Only an idle stale preview requests a refresh; edits/configuration changes and timeouts fail closed',async()=>{
  let ready=false,refreshes=0,current=true,clock=0;
  const hooks={isCurrent:()=>current,isReady:()=>ready,isRendering:()=>false,requestRender:()=>{refreshes++;ready=true;},wait:async ms=>{clock+=ms;},now:()=>clock,timeout:75};
  await waitForCurrentRender(hooks);assert.equal(refreshes,1);
  ready=false;await assert.rejects(waitForCurrentRender({...hooks,isRendering:()=>true,wait:async()=>{current=false;}}),/文档或图表配置已变化/);
  current=true;await assert.rejects(waitForCurrentRender({...hooks,requestRender:()=>{refreshes++;}}),/渲染尚未完成/);assert.equal(refreshes,2);
});
test('Image export embeds each distinct URL once with bounded parallel requests and keeps data URLs unchanged',async()=>{
  const originalFetch=globalThis.fetch,originalReader=globalThis.FileReader;
  const calls=[];let active=0,maximum=0;
  globalThis.fetch=async source=>{calls.push(source);maximum=Math.max(maximum,++active);await new Promise(resolve=>setTimeout(resolve,2));active--;return {ok:true,blob:async()=>({source})};};
  globalThis.FileReader=class {readAsDataURL(blob){this.result='data:image/svg+xml,'+blob.source;queueMicrotask(()=>this.onload());}};
  const images=Array.from({length:24},(_,i)=>({src:'https://example.test/'+i%8}));images.push({src:'data:image/png;base64,original'});
  try {
    await inlineImages({querySelectorAll:()=>images});assert.equal(calls.length,8);assert.equal(maximum,4);assert.ok(images.every(image=>image.src.startsWith('data:')));assert.equal(images.at(-1).src,'data:image/png;base64,original');
    const first=images[0].src;images[0].src='https://example.test/0';await inlineImages({querySelectorAll:()=>[images[0]]});assert.equal(calls.length,9);assert.equal(images[0].src,first);
    globalThis.fetch=async()=>({ok:false});await assert.rejects(inlineImages({querySelectorAll:()=>[{src:'https://example.test/broken'}]}),/无法读取图片/);
  } finally {globalThis.fetch=originalFetch;globalThis.FileReader=originalReader;}
});
function imageFixture(){const listeners=new Map();return {complete:false,naturalWidth:0,addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:(name,callback)=>{if(listeners.get(name)===callback)listeners.delete(name);},listeners,emit(name){listeners.get(name)?.();}};}
test('Image readiness releases listeners on success, broken images and timeout',async()=>{
  const image=imageFixture(),ready=waitForImages({querySelectorAll:()=>[image]},100);
  image.complete=true;image.naturalWidth=120;image.emit('load');await ready;assert.equal(image.listeners.size,0);
  await waitForImages({querySelectorAll:()=>[image]});assert.equal(image.listeners.size,0);
  const broken=imageFixture(),failed=waitForImages({querySelectorAll:()=>[broken]},100);broken.complete=true;broken.emit('error');await assert.rejects(failed,/未能加载/);assert.equal(broken.listeners.size,0);
  const slow=imageFixture();await assert.rejects(waitForImages({querySelectorAll:()=>[slow]},1),/图片加载超时/);assert.equal(slow.listeners.size,0);
});
