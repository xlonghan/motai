// Runs before the module graph, without Vue or Tauri imports.
(function () {
  var root=document.documentElement,done=false,failed=false,continueStartup=null,timer,failureMessage='';
  var native=Boolean(window.__TAURI_INTERNALS__);
  try {
    var settings=JSON.parse(localStorage.getItem('markdown-desk-settings-v1')||'null');
    var theme=settings&&settings.values&&settings.values.theme||localStorage.getItem('markdown-desk-desktop-theme')||'dark';
    root.dataset.bootTheme=theme==='light'||theme==='system'&&!window.matchMedia('(prefers-color-scheme: dark)').matches?'light':'dark';
  } catch (_) { root.dataset.bootTheme='dark'; }
  if(native)root.dataset.nativeStartup='true';
  function element(id){var screen=document.querySelector('body > #app-startup-screen');return id==='app-startup-screen'?screen:screen&&screen.querySelector('#'+id);}
  function message(title,detail){var heading=element('boot-title'),text=element('boot-detail');if(heading)heading.textContent=title;if(text)text.textContent=detail;}
  function slow(){if(done||failed)return;root.dataset.bootState='slow';message('正在准备文档',continueStartup?'较大的文档和图表需要一些时间，你也可以先打开编辑器。':'启动比平时稍慢，请稍候或重试。');}
  function fail(error){
    if(done)return;failed=true;continueStartup=null;clearTimeout(timer);root.dataset.bootState='failed';
    failureMessage=String(error&&error.message||error||'请重试启动，或关闭窗口后重新打开。');message('墨台未能完成启动',failureMessage);
  }
  window.markdownDeskBoot={
    complete:function(){done=true;clearTimeout(timer);root.classList.add('app-ready');element('app-startup-screen')?.remove();continueStartup=null;},
    fail:fail,slow:slow,
    continueStartup:function(){if(!done&&!failed&&continueStartup)continueStartup();},
    setContinue:function(handler){continueStartup=handler;root.dataset.bootCanContinue='true';if(root.dataset.bootState==='slow')slow();},
  };
  document.addEventListener('DOMContentLoaded',function(){
    if(failed)message('墨台未能完成启动',failureMessage);
  });
  // Delegation works even while DOMContentLoaded is waiting for a failed/stalled
  // module, so the retry action does not depend on that module finishing.
  document.addEventListener('click',function(event){
    if(done)return;var screen=element('app-startup-screen');if(!screen||!screen.contains(event.target))return;
    var button=event.target.closest&&event.target.closest('button');
    if(button&&button.id==='boot-retry')window.location.reload();
    else if(button&&button.id==='boot-continue'&&continueStartup)continueStartup();
  });
  document.addEventListener('contextmenu',function(event){if(native&&!done)event.preventDefault();});
  document.addEventListener('keydown',function(event){
    if(!native||done)return;
    var key=String(event.key||'').toLowerCase();
    if(event.altKey&&['f4','tab',' '].includes(key))return;
    if((event.ctrlKey||event.metaKey)&&key==='c')return;
    if(event.ctrlKey||event.metaKey||event.altKey){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.addEventListener('error',function(event){
    if(!done&&(event.error||event.target&&event.target.tagName==='SCRIPT'))fail(event.error||'编辑器资源加载失败，请重试。');
  },true);
  timer=setTimeout(slow,5000);
}());
