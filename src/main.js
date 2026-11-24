import { invoke, isTauri } from '@tauri-apps/api/core';
import { markStartup } from './startup-metrics.js';
import { restorePortablePreferences } from './portable-preferences.js';

// The splash is independent. Load the editor and startup documents concurrently.
async function start(){
  markStartup('entry');
  const native=isTauri(),theme=document.documentElement.dataset.bootTheme||'dark';
  if(native){
    const report=event=>invoke('app_event',{event,outcome:'failed',elapsedMs:null}).catch(()=>{});
    window.addEventListener('error',()=>{void report('client_error');});
    window.addEventListener('unhandledrejection',()=>{void report('unhandled_rejection');});
  }
  let starting=Promise.resolve(0);
  try {
    starting=(native?invoke('show_startup',{theme}):Promise.resolve(0)).then(attempt=>{window.markdownDeskStartupAttempt=attempt;return attempt;});
    const data=(native?invoke('load_startup_data'):Promise.resolve(null)).then(value=>{
      markStartup('startup-data-resolved');
      return value;
    });
    markStartup('editor-import-start');
    const editor=import('./mount-app.js').then(module=>{
      markStartup('editor-import-resolved');
      return module;
    });
    if(native){
      document.documentElement.dataset.nativeStartup='true';
    }
    // Attach all rejection handlers together, including a corrupt workspace.
    const [attempt,startupData,{mountApp}]=await Promise.all([starting,data,editor]);
    window.markdownDeskStartupAttempt=attempt;
    markStartup('editor-imported');
    if(native)restorePortablePreferences(localStorage,startupData);
    mountApp(startupData);
  } catch(error) {
    // A fast data/import failure must still report the correct startup attempt.
    await starting.catch(()=>{});
    window.markdownDeskBoot?.fail(error);console.error(error);
    if(native)await invoke('fail_startup',{theme,attempt:Number(window.markdownDeskStartupAttempt||0),message:String(error.message||error)}).catch(console.error);
  }
}
start();
