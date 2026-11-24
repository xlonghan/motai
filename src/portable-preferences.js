// In the desktop app JSON files are authoritative. localStorage is only the
// synchronous view consumed by Vue and the lightweight startup screen.
import { SETTINGS_KEY } from './settings.js';
import { createSaveQueue } from './save-queue.js';

function preferenceKeys(storage) {
  return Array.from({length:storage.length},(_,index)=>storage.key(index))
    .filter(key=>key?.startsWith('markdown-desk-')&&key!==SETTINGS_KEY);
}
export function restorePortablePreferences(storage, startup) {
  if(!startup)return;
  const adopt=startup.adoptLegacyBrowserState===true;
  if(startup.settings)storage.setItem(SETTINGS_KEY,JSON.stringify(startup.settings));
  else if(!adopt)storage.removeItem(SETTINGS_KEY);
  if(startup.preferences||!adopt){
    for(const key of preferenceKeys(storage))storage.removeItem(key);
    for(const [key,value] of Object.entries(startup.preferences?.values||{})) {
      if(key.startsWith('markdown-desk-')&&key!==SETTINGS_KEY&&typeof value==='string')storage.setItem(key,value);
    }
  }
}
export function preferenceSnapshot(storage) {
  const settings=JSON.parse(storage.getItem(SETTINGS_KEY)||'{"version":1,"values":{}}');
  const preferences=Object.fromEntries(preferenceKeys(storage).map(key=>[key,storage.getItem(key)]));
  return {settings,preferences};
}
export function preferenceWriter(storage, save) {
  return createSaveQueue(save,()=>preferenceSnapshot(storage));
}
