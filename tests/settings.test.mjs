import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, settingsFields, settingsGroups, defaultSettings, normalizeSettings, readSettings, encodeSettings, decodeSettings } from '../src/settings.js';
import { createHtmlDocument, exportLayoutStyles } from '../src/export-document.js';
import { withPdfOptions } from '../src/pdf-options.js';
const storage = entries => { const map=new Map(Object.entries(entries)); return {getItem:key=>map.get(key)??null}; };

test('Settings migrate legacy pane fonts, theme, PDF and emoji preferences without coupling their scales',()=>{
  const result=readSettings(storage({'markdown-desk-interface-scale':'1.5','markdown-desk-font-zoom':'2','markdown-desk-editor-font-zoom':'4','markdown-desk-desktop-theme':'light','markdown-desk-word-wrap':'false','markdown-desk-pdf-options':'{"paper":"Letter","landscape":true,"margin":20}','markdown-desk-emoji-tone':'🏿'}),true);
  assert.equal(result.hasStored,false);
  assert.equal(result.values.interfaceScale,1.5);
  assert.equal(result.values.editorFontSize,18);
  assert.equal(result.values.previewFontSize,17);
  assert.equal(result.values.theme,'light');
  assert.equal(result.values.wordWrap,false);
  assert.deepEqual([result.values.pdfPaper,result.values.pdfLandscape,result.values.pdfMargin],['Letter',true,20]);
  assert.equal(result.values.emojiTone,'🏿');
});
test('Unified preferences override stale legacy keys and survive an export/import round trip',()=>{
  const values=normalizeSettings({editorFontSize:21,previewFontSize:16,mermaidTypes:['class','er'],interfaceScale:2});
  const result=readSettings(storage({[SETTINGS_KEY]:encodeSettings(values),'markdown-desk-font-zoom':'-4'}));
  assert.equal(result.hasStored,true);
  assert.equal(result.values.editorFontSize,21);
  assert.equal(result.values.previewFontSize,16);
  assert.deepEqual(normalizeSettings(decodeSettings(encodeSettings(values))),values);
});
test('Bad or hostile preference files cannot add CSS, prototype keys or unbounded values',()=>{
  const values=normalizeSettings(JSON.parse('{"theme":"bad","editorFont":"serif;}</style><script>","editorFontSize":9999,"autosaveMs":-1,"mermaidTypes":["er","bad","er"],"__proto__":{"polluted":true}}'));
  assert.equal(values.editorFont,'consolas');assert.equal(values.editorFontSize,36);assert.equal(values.autosaveMs,500);
  assert.deepEqual(values.mermaidTypes,['er']);assert.equal({}.polluted,undefined);
  assert.equal(Object.hasOwn(values,'__proto__'),false);
  assert.equal(readSettings(storage({[SETTINGS_KEY]:'bad'})).invalid,true);
  assert.throws(()=>decodeSettings('bad'),/JSON/);
  assert.throws(()=>decodeSettings('{"version":2,"values":{}}'),/版本/);
  assert.throws(()=>decodeSettings('{"version":1,"values":{"unknown":1}}'),/没有/);
});
test('Each settings group owns separate defaults and settings exports contain no document data',()=>{
  assert.equal(new Set(settingsFields.map(field=>field.key)).size,settingsFields.length);
  assert.equal(settingsGroups.length,9);
  const first=defaultSettings(true);first.mermaidTypes.pop();
  assert.equal(defaultSettings(true).mermaidTypes.length,9);
  assert.equal(defaultSettings().interfaceScale,1);
  assert.equal(defaultSettings(true).interfaceScale,1.25);
  const encoded=JSON.parse(encodeSettings({...first,documents:[{markdown:'private'}],recentFiles:['secret']}));
  assert.equal(Object.hasOwn(encoded.values,'documents'),false);
  assert.equal(Object.hasOwn(encoded.values,'recentFiles'),false);
});
test('Export typography is independent from UI and pane fonts, including paper preview',()=>{
  const settings=normalizeSettings({interfaceScale:2,editorFontSize:30,previewFontSize:29,exportFontSize:18,pdfFontSize:12,exportWidth:960,exportLineHeight:2});
  const css=exportLayoutStyles(settings);
  assert.ok(css.includes('--export-pdf-font-size:12pt'));
  assert.ok(css.includes('font-size:18px'));
  assert.ok(css.includes('max-width:960px'));
  assert.ok(!css.includes('30px')&&!css.includes('29px'));
  const html=withPdfOptions(createHtmlDocument('title','<p>正文</p>','',settings),{paper:'A4',landscape:false,margin:14});
  assert.ok(html.includes('font-size:var(--export-pdf-font-size,10.5pt)'));
  assert.ok(html.indexOf('--export-pdf-font-size:12pt')>html.indexOf(':root{color-scheme'));
});
