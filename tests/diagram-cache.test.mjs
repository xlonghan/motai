import test from 'node:test';
import assert from 'node:assert/strict';
import MermaidPlugin from 'cherry-markdown/dist/addons/cherry-code-block-mermaid-plugin.esm.js';
import { DiagramCache } from '../src/diagram-cache.js';
import { createLazyMermaid } from '../src/lazy-mermaid.js';
const svg='<svg xmlns="http://www.w3.org/2000/svg" id="cached-diagram"><style>.node{fill:#eee}</style><rect class="node"/></svg>';

test('A restored SVG is served by the actual Cherry plugin without loading Mermaid',async()=>{
  let loads=0,sanitized=0;
  const cache=new DiagramCache('config');cache.set('flowchart LR\n A-->B',svg);const record=cache.snapshot();
  const restored=new DiagramCache('config');assert.equal(await restored.restore(record,texts=>{sanitized++;return texts;}),true);
  const lazy=createLazyMermaid({load:()=>{loads++;throw new Error('should stay unloaded');}}),renderer=new MermaidPlugin({mermaid:lazy,mermaidAPI:lazy});
  renderer.contentRenderCache=restored;renderer.$getContentCacheKey=source=>source;
  assert.equal(renderer.render('flowchart LR\n A-->B','new-cherry-hash',{}),svg);assert.equal(loads,0);assert.equal(sanitized,1);assert.equal(restored.dirty,false);
});
test('Cache signatures, rejected entries, LRU bounds and clearing preserve invalidation',async()=>{
  const cache=new DiagramCache('first',2,4096);
  assert.equal(await cache.restore({schema:1,signature:'old',entries:[['one',svg]]},()=>{throw new Error('must not parse obsolete data');}),false);
  await cache.restore({schema:1,signature:'first',entries:[['one',svg],['invalid','<script>bad</script>']]},text=>text);
  assert.equal(cache.size,1);cache.set('two',svg);cache.get('one');cache.set('three',svg);assert.equal(cache.has('two'),false);
  cache.set('error','<svg aria-roledescription="error"></svg>');assert.equal(cache.has('error'),false);
  const saved=cache.snapshot();cache.set('later',svg);cache.markSaved(saved.revision);assert.equal(cache.dirty,true);
  cache.configure('second');assert.equal(cache.size,0);assert.equal(cache.snapshot().signature,'second');
  cache.set('current',svg);cache.clear();assert.deepEqual(cache.snapshot().entries,[]);
});
test('An in-flight restore cannot overwrite a changed configuration',async()=>{
  let release;const cache=new DiagramCache('before');
  const restore=cache.restore({schema:1,signature:'before',entries:[['old',svg]]},()=>new Promise(resolve=>{release=()=>resolve([svg]);}));
  cache.configure('after');cache.set('new',svg);release();assert.equal(await restore,false);assert.equal(cache.has('old'),false);assert.equal(cache.has('new'),true);
});
test('Changing configuration during a Mermaid render rejects the obsolete SVG',async()=>{
  let release,started;const running=new Promise(resolve=>{started=resolve;});
  const lazy=createLazyMermaid({load:async()=>({initialize(){},render:()=>{started();return new Promise(resolve=>{release=()=>resolve({svg});});}})});
  lazy.initialize({theme:'default'});const render=lazy.render('id','flowchart LR');await running;lazy.initialize({theme:'dark'});release();
  await assert.rejects(render,/配置已变化/);
});
