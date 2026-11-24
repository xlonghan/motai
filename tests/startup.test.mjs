import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {waitForStartupReady} from '../src/startup.js';

test('Startup presents immediately when ready, waits for real completion, and supports slow/cancel paths',async()=>{
  let ticks=0,ready=true,slow=0,continueNow=false;
  const hooks={isReady:()=>ready,now:()=>ticks,wait:async ms=>{ticks+=ms;},slowAfter:80,timeout:200,onSlow:()=>slow++};
  assert.equal(await waitForStartupReady(hooks),true);assert.equal(ticks,0);
  ready=false;
  assert.equal(await waitForStartupReady({...hooks,wait:async ms=>{ticks+=ms;if(ticks===120)ready=true;}}),true);assert.equal(slow,1);
  ready=false;ticks=0;
  assert.equal(await waitForStartupReady({...hooks,canContinue:()=>continueNow,onSlow:()=>{continueNow=true;}}),true);
  assert.equal(await waitForStartupReady({...hooks,isCancelled:()=>true}),false);
  ticks=0;await assert.rejects(waitForStartupReady(hooks),/文档准备超时/);
});

const bootCode=readFileSync(new URL('../public/boot.js',import.meta.url),'utf8');
function bootFixture({native=true,theme='dark',nodesAvailable=true}={}){
  const nodes=new Map(['boot-title','boot-detail','app-startup-screen'].map(id=>[id,{textContent:'',remove(){this.removed=true;}}]));
  const events=new Map(),classes=new Set(),timers=new Map();let nextTimer=0,reloads=0;
  const root={dataset:{},classList:{add:value=>classes.add(value)}};
  const screen=nodes.get('app-startup-screen');screen.querySelector=selector=>nodes.get(selector.slice(1));screen.contains=target=>target.inside!==false;
  const document={documentElement:root,querySelector:()=>nodesAvailable?screen:null,addEventListener:(name,fn)=>events.set(name,fn)};
  const window={matchMedia:()=>({matches:true}),location:{reload:()=>reloads++},addEventListener:(name,fn)=>events.set('window:'+name,fn)};if(native)window.__TAURI_INTERNALS__={};
  vm.runInNewContext(bootCode,{document,window,localStorage:{getItem:key=>key==='markdown-desk-settings-v1'?JSON.stringify({version:1,values:{theme}}):null},setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)});
  return {window,nodes,root,classes,events,timers,setNodesAvailable:value=>{nodesAvailable=value;},reloads:()=>reloads};
}
test('Native boot hides until completion, respects the saved theme and ignores later document errors',()=>{
  const f=bootFixture({theme:'light'});assert.equal(f.root.dataset.nativeStartup,'true');assert.equal(f.root.dataset.bootTheme,'light');
  f.window.markdownDeskBoot.complete();assert.ok(f.classes.has('app-ready'));assert.equal(f.nodes.get('app-startup-screen').removed,true);assert.equal(f.timers.size,0);
  f.window.markdownDeskBoot.fail('late diagram error');assert.notEqual(f.root.dataset.bootState,'failed');
  const web=bootFixture({native:false});assert.equal(web.root.dataset.nativeStartup,undefined);
});
test('Slow/error boot remains actionable before DOMContentLoaded and early failures are retained',()=>{
  const f=bootFixture({nodesAvailable:false});let continued=0;
  f.window.markdownDeskBoot.setContinue(()=>continued++);for(const fn of f.timers.values())fn();
  assert.equal(f.root.dataset.bootState,'slow');f.setNodesAvailable(true);f.events.get('click')({target:{closest:()=>({id:'boot-continue'})}});assert.equal(continued,1);
  f.setNodesAvailable(false);
  f.window.markdownDeskBoot.fail(new Error('module unavailable'));f.setNodesAvailable(true);f.events.get('DOMContentLoaded')();
  assert.match(f.nodes.get('boot-detail').textContent,/module unavailable/);
  f.events.get('click')({target:{closest:()=>({id:'boot-retry'})}});assert.equal(f.reloads(),1);assert.equal(f.timers.size,0);
});
test('Boot controls cannot react to same-named buttons inside a Markdown document or after completion',()=>{
  const f=bootFixture();f.events.get('click')({target:{inside:false,closest:()=>({id:'boot-retry'})}});assert.equal(f.reloads(),0);
  f.window.markdownDeskBoot.complete();f.events.get('click')({target:{closest:()=>({id:'boot-retry'})}});assert.equal(f.reloads(),0);
});
test('The loading page shields editor/browser shortcuts while keeping copy and window controls usable',()=>{
  const f=bootFixture();let blocked=0;
  const key=(value,extra={})=>f.events.get('keydown')({key:value,ctrlKey:false,metaKey:false,altKey:false,preventDefault:()=>blocked++,stopImmediatePropagation(){},...extra});
  key('s',{ctrlKey:true});assert.equal(blocked,1);
  key('c',{ctrlKey:true});key('F4',{altKey:true});key('Tab',{altKey:true});assert.equal(blocked,1);
  f.window.markdownDeskBoot.complete();key('s',{ctrlKey:true});assert.equal(blocked,1);
});
test('The native startup surface is hidden and opaque before the large module graph starts',()=>{
  const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  const main=config.app.windows.find(window=>window.label==='main');assert.equal(main.visible,false);assert.equal(main.backgroundColor,'#202020');
  const splash=config.app.windows.find(window=>window.label==='splash');
  assert.deepEqual([splash.width,splash.height],[900,600]);assert.equal(splash.decorations,false);assert.equal(splash.transparent,true);assert.equal(splash.visible,false);assert.equal(splash.backgroundColor,'#00000000');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.ok(html.indexOf('src="/boot.js"')<html.indexOf('src="/src/main.js"'));assert.ok(html.indexOf('href="/boot.css"')<html.indexOf('src="/boot.js"'));
  assert.match(readFileSync(new URL('../public/boot.css',import.meta.url),'utf8'),/html\{background:#202020/);
  // An inline boot <style> makes Tauri add a style hash; the browser then ignores
  // unsafe-inline for Mermaid's dynamically generated SVG stylesheet.
  for(const page of ['index.html','pdf.html','splash.html'])assert.ok(!/<style\b/i.test(readFileSync(new URL('../'+page,import.meta.url),'utf8')));
});
test('The rounded splash remains a small standalone entry and does not gain filesystem/dialog permissions',()=>{
  const html=readFileSync(new URL('../splash.html',import.meta.url),'utf8'),script=readFileSync(new URL('../src/splash.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/splash.css',import.meta.url),'utf8');
  assert.ok(!/from ['"](?:vue|\.\/App\.vue)/.test(script));assert.ok(!/<style\b/i.test(html));assert.match(css,/background:transparent!important/);assert.match(css,/border-radius:24px/);
  assert.ok(Buffer.byteLength(html+script+css)<600*1024);
  const capability=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/splash.json',import.meta.url),'utf8'));
  assert.deepEqual(capability.windows,['splash']);assert.ok(capability.permissions.every(value=>value.startsWith('core:event:')));
});
test('Editor loading and startup preparation begin together, without a splash paint dependency',()=>{
  const entry=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.ok(entry.indexOf("invoke('show_startup'")<entry.indexOf("import('./mount-app.js')"));
  assert.ok(entry.indexOf("import('./mount-app.js')")<entry.indexOf('await Promise.all'));
  assert.match(entry,/Promise\.all\(\[starting,data,editor\]\)/);
  const native=readFileSync(new URL('../src-tauri/src/startup.rs',import.meta.url),'utf8');
  const begin=native.slice(native.indexOf('pub async fn show_startup'),native.indexOf('pub fn startup_editor_ready'));
  assert.ok(!/sleep|splash_painted\(|deadline/.test(begin));
  assert.ok(!/^import .*from ['"](?:vue|\.\/App\.vue)/m.test(entry));
  const total=['boot.css','boot.js','favicon.svg'].reduce((size,name)=>size+readFileSync(new URL('../public/'+name,import.meta.url)).length,0);
  assert.ok(total<600*1024);
});
