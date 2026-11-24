import test from 'node:test';
import assert from 'node:assert/strict';
import { restorePortablePreferences, preferenceSnapshot, preferenceWriter } from '../src/portable-preferences.js';
import { SETTINGS_KEY, readSettings } from '../src/settings.js';
function storage(entries={}){const map=new Map(Object.entries(entries));return {get length(){return map.size;},key:index=>[...map.keys()][index]??null,getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};}

test('Portable JSON replaces stale browser mirrors before settings and Emoji are read',()=>{
  const mirror=storage({[SETTINGS_KEY]:'old','markdown-desk-desktop-theme':'dark','markdown-desk-recent-emoji':'["old"]','unrelated':'keep'});
  restorePortablePreferences(mirror,{settings:{version:1,values:{theme:'light',editorFontSize:22}},preferences:{version:1,values:{'markdown-desk-recent-emoji':'["🍎"]'}},adoptLegacyBrowserState:false});
  assert.equal(readSettings(mirror,true).values.theme,'light');
  assert.equal(readSettings(mirror,true).values.editorFontSize,22);
  assert.equal(mirror.getItem('markdown-desk-recent-emoji'),'["🍎"]');
  assert.equal(mirror.getItem('markdown-desk-desktop-theme'),null);
  assert.equal(mirror.getItem('unrelated'),'keep');
});
test('Legacy browser settings are adopted once; deleted portable files cannot resurrect old values',()=>{
  const mirror=storage({'markdown-desk-desktop-theme':'light','markdown-desk-recent-emoji':'["🍎"]'});
  restorePortablePreferences(mirror,{adoptLegacyBrowserState:true});
  assert.equal(readSettings(mirror,true).values.theme,'light');
  restorePortablePreferences(mirror,{adoptLegacyBrowserState:false});
  assert.equal(readSettings(mirror,true).values.theme,'dark');
  assert.equal(mirror.getItem('markdown-desk-recent-emoji'),null);
});
test('Preference snapshots omit unrelated storage and propagate disk failures for retry',async()=>{
  const mirror=storage({[SETTINGS_KEY]:'{"version":1,"values":{"logLevel":"debug"}}','markdown-desk-recent-emoji':'["🍎"]',unrelated:'private'});
  const writes=[];let fail=true;
  const flush=preferenceWriter(mirror,async snapshot=>{if(fail)throw new Error('disk full');writes.push(snapshot);});
  await assert.rejects(flush(),/disk full/);fail=false;
  mirror.setItem('markdown-desk-recent-emoji','["🍎","😀"]');await flush();
  assert.deepEqual(writes,[preferenceSnapshot(mirror)]);
  assert.deepEqual(Object.keys(writes[0].preferences),['markdown-desk-recent-emoji']);
});
