import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { version } from '../package.json';
import { createElement as createLucideIcon, X } from 'lucide';

const root=document.documentElement,native=isTauri();
const title=document.getElementById('splash-title'),detail=document.getElementById('splash-detail');
const retry=document.getElementById('splash-retry'),continueButton=document.getElementById('splash-continue');
let status={attempt:0,canContinue:false,error:null,complete:false},slow=false,slowTimer;
try {
  const settings=JSON.parse(localStorage.getItem('markdown-desk-settings-v1')||'null');
  const theme=settings?.values?.theme||localStorage.getItem('markdown-desk-desktop-theme')||'dark';
  root.dataset.theme=theme==='light'||theme==='system'&&!matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark';
} catch {root.dataset.theme='dark';}
document.getElementById('splash-version').textContent='v'+version;
function update(value){
  if(value.attempt<status.attempt)return;
  if(value.attempt>status.attempt)armSlow();
  status=value;if(value.error||value.complete)clearTimeout(slowTimer);root.dataset.stage=value.error?'error':'loading';
  title.textContent=value.error?'启动未完成':slow?'正在准备工作区':'正在启动';
  detail.textContent=value.error|| (slow?(value.canContinue?'文档和图表仍在准备，可以先进入编辑器。':'准备时间比平时稍长，请稍候或重试。'):'正在准备编辑器和本地工作区…');
  retry.hidden=!value.error&&!slow;continueButton.hidden=!value.canContinue||Boolean(value.error)||!slow;
}
function armSlow(){clearTimeout(slowTimer);slow=false;if(native)slowTimer=setTimeout(()=>{slow=true;update(status);},5000);}
const call=(command)=>native?invoke(command).catch(error=>update({...status,error:String(error)})):Promise.resolve();
const close=document.getElementById('splash-close');
close.append(createLucideIcon(X,{class:'lucide-icon','data-icon':'close','aria-hidden':'true',focusable:'false',width:16,height:16}));
close.addEventListener('click',()=>call('cancel_startup'));
retry.addEventListener('click',()=>{title.textContent='正在重试';call('retry_startup');});
continueButton.addEventListener('click',()=>call('continue_startup'));
document.querySelector('.splash-card').addEventListener('pointerdown',event=>{
  if(native&&event.button===0&&!event.target.closest('button,.status-detail')){event.preventDefault();invoke('drag_splash').catch(console.debug);}
});
document.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();call('cancel_startup');return;}
  const key=event.key.toLowerCase();
  if(event.altKey&&['f4','tab',' '].includes(key)||event.ctrlKey&&key==='c')return;
  if(event.ctrlKey||event.metaKey||key==='f5'){event.preventDefault();event.stopImmediatePropagation();}
});
armSlow();
async function start(){
  if(!native)return;
  // Read the portable JSON before presenting the splash. This does not gate the
  // main editor import, which is already running in the other webview.
  try{const theme=await invoke('startup_theme');if(theme)root.dataset.theme=theme==='light'||theme==='system'&&!matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark';}catch{}
  await listen('startup-status',event=>update(event.payload));
  update(await invoke('splash_ready',{theme:root.dataset.theme}));
  await new Promise(resolve=>{const timer=setTimeout(resolve,120);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});
  await invoke('splash_painted');
}
start().catch(error=>update({...status,error:String(error)}));
