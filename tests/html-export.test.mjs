import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { diagramAction, diagramSvg, prepareDiagrams, prepareExportDiagrams } from '../src/diagram-view.js';
import { htmlHeadingTree, htmlOutline, createHtmlExportDocument } from '../src/html-export.js';
import { htmlThemes, normalizeHtmlExportOptions, normalizeHtmlTocWidth, HTML_TOC_SLOT } from '../src/html-export-options.js';
import { installHtmlExportRuntime } from '../src/html-export-runtime.js';
import { readSettings, SETTINGS_KEY, normalizeSettings, encodeSettings, decodeSettings } from '../src/settings.js';

const headings=[{id:'title',text:'文档',level:1},{id:'a',text:'接口 <定义>',level:2},{id:'a-1',text:'请求',level:3},{id:'a-1-1',text:'字段',level:5},{id:'b',text:'部署',level:2}];
const snapshot={title:'接口 <导出>',headings,bodyHtml:`<h1 id="title">文档</h1>${HTML_TOC_SLOT}<h2 id="a">接口</h2><svg viewBox="0 0 100 100"></svg>`,styles:'@font-face{font-family:Example;src:url(data:font/woff2;base64,AAAA)}'};

test('Diagram controls use SVG icons and still zoom and export the diagram SVG', () => {
  const {window}=new JSDOM('<article><figure data-type="mermaid"><svg id="chart" viewBox="0 0 240 120"></svg></figure></article>');
  try {
    const root=window.document.querySelector('article');
    const figure=root.querySelector('figure');
    const chart=figure.querySelector('#chart');
    prepareDiagrams(root);
    assert.equal(figure.querySelectorAll('.mermaid-tools svg.lucide-icon[aria-hidden="true"]').length,5);
    const button=figure.querySelector('[data-diagram-action="in"]');
    diagramAction({target:button.querySelector('svg').firstElementChild,preventDefault(){},stopPropagation(){}});
    assert.equal(diagramSvg(figure),chart);
    assert.equal(chart.dataset.diagramZoom,'1.25');
    prepareExportDiagrams(root);
    assert.equal(figure.querySelectorAll('svg').length,1);
    assert.equal(chart.getAttribute('width'),'240');
  } finally {
    window.close();
  }
});

test('HTML outline preserves hierarchy, skips the title and limits heading depth',()=>{
  const tree=htmlHeadingTree(headings,6);
  assert.deepEqual(tree.map(item=>item.id),['a','b']);
  assert.equal(tree[0].children[0].children[0].id,'a-1-1');
  assert.equal(htmlHeadingTree(headings,2)[0].children.length,0);
  assert.deepEqual(htmlHeadingTree(headings,1),[]);
  assert.equal(htmlHeadingTree(headings.slice(1),6)[0].id,'a');
  const markup=htmlOutline([...headings,{id:'特殊 "&字',text:'<script> "标题" &',level:2}],{htmlTocDepth:6});
  assert.ok(markup.includes('接口 &lt;定义&gt;'));
  assert.ok(markup.includes('href="#'+encodeURIComponent('特殊 "&字')+'"'));
  assert.ok(!markup.includes('<script>'));
});
test('Follow-preview HTML snapshots the reading appearance and keeps separate export presets available',()=>{
  const appearance={dark:true,previewFont:'system',previewFontSize:19,previewLineHeight:1.9,previewWidth:720,previewPadding:24,previewCodeWrap:true};
  const data={...snapshot,appearance};
  const preview=createHtmlExportDocument(data,{htmlTheme:'preview',exportFontSize:27,htmlCodeWrap:false});
  assert.match(preview,/data-template="preview" data-preview-tone="dark"/);
  assert.match(preview,/--mt-preview-size:19px;--mt-preview-line-height:1\.9/);
  assert.match(preview,/--mt-preview-padding:24px/);
  assert.match(preview,/--mt-preview-width:768px/);
  assert.match(preview,/--mt-code-wrap:pre-wrap/);
  assert.doesNotMatch(preview,/--export-body-size:27px/);
  const automatic=createHtmlExportDocument({...data,appearance:{...appearance,previewWidth:0,contentWidth:611}},{htmlTheme:'preview'});
  assert.match(automatic,/--mt-preview-width:659px/);
  const github=createHtmlExportDocument(data,{htmlTheme:'github',exportFontSize:27,htmlCodeWrap:false});
  assert.match(github,/data-template="github"/);
  assert.match(github,/--export-body-size:27px/);
  assert.match(github,/--mt-code-wrap:pre;/);
});
test('HTML export styles and TOC states are closed options with bounded values',()=>{
  assert.deepEqual(normalizeHtmlExportOptions({htmlTheme:'</style>',htmlTocPosition:'bad',htmlTocState:'bad',htmlTocDepth:999,htmlTocWidth:-10,htmlCodeWrap:'true'}),{theme:'github',position:'left',state:'expanded',depth:3,tocWidth:180,codeWrap:false});
  const compact=htmlOutline(headings,{htmlTocState:'compact',htmlTocDepth:6});
  assert.ok(compact.includes('class="mt-toc-root" open'));
  assert.ok(!compact.includes('class="mt-toc-branch" open'));
  const collapsed=htmlOutline(headings,{htmlTocState:'collapsed'});
  assert.ok(!collapsed.includes('class="mt-toc-root" open'));
  assert.equal(htmlOutline(headings,{htmlTocPosition:'none'}),'');
});
test('Every HTML template and TOC placement uses the same embedded document and authorized offline runtime',()=>{
  for(const [theme] of htmlThemes)for(const position of ['left','right','top','none']){
    const html=createHtmlExportDocument(snapshot,{htmlTheme:theme,htmlTocPosition:position});
    assert.ok(html.includes(`data-template="${theme}"`));
    assert.ok(html.includes(`data-toc-position="${position}"`));
    assert.ok(html.includes('<title>接口 &lt;导出&gt;</title>'));
    assert.ok(html.includes('data:font/woff2;base64,AAAA'));
    assert.ok(html.includes('<svg viewBox="0 0 100 100"></svg>'));
    assert.ok(!html.includes(HTML_TOC_SLOT));
    const match=html.match(/<script data-mt-runtime nonce="([^"]+)">([\s\S]+)<\/script>/);
    assert.ok(match);assert.ok(html.includes(`nonce-${match[1]}`));
    assert.doesNotThrow(()=>new vm.Script(match[2]));
    assert.equal((html.match(/<script /g)||[]).length,1);
    assert.ok(!/<script[^>]*src=|<link[^>]*stylesheet/i.test(html));
    if(position==='none')assert.ok(!html.includes('<aside '));
    else if(position==='left')assert.ok(html.indexOf('<aside ')<html.indexOf('<main '));
    else if(position==='right')assert.ok(html.indexOf('<aside ')>html.indexOf('</main>'));
    else assert.ok(html.indexOf('<aside ')>html.indexOf('<article '));
  }
  assert.ok(!createHtmlExportDocument(snapshot,{},false).includes('<script '));
});
test('Offline reader runtime has no module closure and releases its listeners',()=>{
  const handlers=new Map(),windowHandlers=new Map(),canceled=[];
  const win={requestAnimationFrame:()=>7,cancelAnimationFrame:id=>{canceled.push(id);},addEventListener:(key,fn)=>windowHandlers.set(key,fn),removeEventListener:(key,fn)=>{assert.equal(windowHandlers.get(key),fn);windowHandlers.delete(key);}};
  const doc={defaultView:win,querySelectorAll:()=>[],addEventListener:(key,fn)=>handlers.set(key,fn),removeEventListener:(key,fn)=>{assert.equal(handlers.get(key),fn);handlers.delete(key);}};
  const runtime=vm.runInNewContext(`(${installHtmlExportRuntime.toString()})(document)`,{document:doc});
  assert.ok(handlers.has('pointerdown')&&handlers.has('click'));
  assert.ok(windowHandlers.has('scroll')&&windowHandlers.has('resize'));
  runtime.refresh();runtime.destroy();
  assert.equal(handlers.size,0);assert.equal(windowHandlers.size,0);assert.ok(canceled.includes(7));
});

test('Dragged TOC widths remain continuous through settings persistence and reject invalid values',()=>{
  for(const width of [181,273,351,599]) {
    const values=normalizeSettings({htmlTocWidth:width});
    assert.equal(normalizeHtmlExportOptions(values).tocWidth,width);
    assert.equal(decodeSettings(encodeSettings(values)).htmlTocWidth,width);
  }
  assert.equal(normalizeHtmlTocWidth(0),180);assert.equal(normalizeHtmlTocWidth(9999),600);
  assert.equal(normalizeHtmlTocWidth('bad'),260);assert.equal(normalizeHtmlTocWidth(null),260);
});

function resizeFixture(position='left',notify=true) {
  const events=new Map(),frames=new Map(),styles=new Map(),classes=new Set(),attributes=new Map(),changes=[];let captured=false,nextFrame=0,indexReads=0;
  const root={open:true},outline={getBoundingClientRect:()=>({width:Math.min(600,Number.parseFloat(styles.get('--mt-toc-width'))||260)})};
  const handle={closest:selector=>selector==='.mt-outline'?outline:handle,focus(){},setPointerCapture(){captured=true;},hasPointerCapture:()=>captured,releasePointerCapture(){captured=false;},setAttribute:(key,value)=>attributes.set(key,value)};
  const win={innerWidth:1000,innerHeight:800,scrollY:0,requestAnimationFrame:callback=>{frames.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},removeEventListener(){}};
  const body={getAttribute:()=>position,style:{setProperty:(key,value)=>styles.set(key,value),getPropertyValue:key=>styles.get(key)||'',removeProperty:key=>styles.delete(key)},classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)}};
  const doc={defaultView:win,body,documentElement:{scrollHeight:2000},querySelector:selector=>selector==='.mt-toc-root'?root:null,querySelectorAll:selector=>{if(selector==='[id]')indexReads++;return selector==='.mt-toc-resizer'?[handle]:[];},addEventListener:(key,callback)=>events.set(key,callback),removeEventListener:key=>events.delete(key)};
  const runtime=vm.runInNewContext(`(${installHtmlExportRuntime.toString()})(document,options)`,{document:doc,options:notify?{onTocWidthChange:width=>changes.push(width)}:{}});
  function fire(name,extra={}){events.get(name)({target:handle,button:0,pointerId:1,clientX:260,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){},...extra});}
  function flush(){const tasks=[...frames.values()];frames.clear();for(const callback of tasks)callback();}
  return {fire,flush,styles,classes,attributes,changes,runtime,captured:()=>captured,width:()=>outline.getBoundingClientRect().width,indexReads:()=>indexReads};
}
test('TOC layout and branch toggles reuse the document index, while body details can invalidate heading visibility',()=>{
  const f=resizeFixture(),initial=f.indexReads();
  const branch={closest:selector=>['.mt-outline','article'].includes(selector)?{}:null,classList:{contains:()=>false}};
  f.runtime.layout();for(let i=0;i<30;i++)f.fire('toggle',{target:branch});f.flush();assert.equal(f.indexReads(),initial);
  const details={closest:selector=>selector==='article'?{}:null};f.fire('toggle',{target:details});assert.equal(f.indexReads(),initial+1);f.runtime.destroy();
});
test('TOC pointer dragging follows either edge, flushes the last movement and commits only on release',()=>{
  for(const [side,lastX] of [['left',351],['right',169]]){
    const f=resizeFixture(side);f.fire('pointerdown');f.fire('pointermove',{clientX:lastX});f.flush();
    assert.equal(f.width(),351);assert.equal(f.changes.length,0);assert.ok(f.captured());
    f.fire('pointerup',{clientX:lastX+1});assert.equal(f.width(),side==='left'?352:350);
    assert.deepEqual(f.changes,[f.width()]);assert.equal(f.captured(),false);assert.equal(f.classes.size,0);
    f.runtime.destroy();
  }
});
test('TOC cancel restores the previous width; standalone keyboard and double-click controls need no parent callback',()=>{
  const f=resizeFixture();f.fire('pointerdown');f.fire('pointermove',{clientX:400});f.flush();
  assert.equal(f.width(),400);f.fire('keydown',{key:'Escape'});
  assert.equal(f.width(),260);assert.equal(f.changes.length,0);assert.equal(f.captured(),false);f.runtime.destroy();
  const standalone=resizeFixture('right',false);
  standalone.fire('keydown',{key:'ArrowLeft'});assert.equal(standalone.width(),270);
  standalone.fire('keydown',{key:'End'});assert.equal(standalone.width(),600);
  standalone.fire('keydown',{key:'Home'});assert.equal(standalone.width(),180);
  standalone.fire('dblclick');assert.equal(standalone.width(),260);standalone.runtime.destroy();
});
test('Old shared TOC preferences migrate to separate HTML defaults and explicit new HTML choices win',()=>{
  const storage=values=>({getItem:key=>key===SETTINGS_KEY?JSON.stringify({version:1,values}):null});
  const old=readSettings(storage({exportToc:false,tocDepth:4})).values;
  assert.equal(old.htmlTocPosition,'none');assert.equal(old.htmlTocDepth,4);assert.equal(old.exportToc,false);
  const current=readSettings(storage({exportToc:false,tocDepth:4,htmlTocPosition:'right',htmlTocDepth:2})).values;
  assert.equal(current.htmlTocPosition,'right');assert.equal(current.htmlTocDepth,2);assert.equal(current.tocDepth,4);
});
