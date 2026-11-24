import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePdfOptions, withPdfOptions } from '../src/pdf-options.js';
import { folderFromFiles, folderSelection, relativeFolderDocument, folderCopyRecord, restoreImportedFolder } from '../src/folder-workspace.js';
import { createEmojiCatalog } from '../src/emoji-catalog.js';
import { normalizeInterfaceScale, adjacentInterfaceScale, normalizePaneFontZoom, sidebarDragWidth } from '../src/display-settings.js';

test('Desktop display scale preserves a saved choice, rejects corrupt settings and stops at bounds',()=>{
  assert.equal(normalizeInterfaceScale(null),1.25);
  assert.equal(normalizeInterfaceScale('1.5'),1.5);
  for (const value of [0,-1,Infinity,NaN,'bad',9]) assert.equal(normalizeInterfaceScale(value),1.25);
  assert.equal(adjacentInterfaceScale(1.25,1),1.5);
  assert.equal(adjacentInterfaceScale(1.25,-1),1.1);
  assert.equal(adjacentInterfaceScale(2,1),2);
  assert.equal(adjacentInterfaceScale(.8,-1),.8);
});

test('Independent pane preferences migrate old values safely; sidebar drag keeps logical width at every UI scale',()=>{
  assert.equal(normalizePaneFontZoom('3'),3);
  assert.equal(normalizePaneFontZoom(null),0);
  assert.equal(normalizePaneFontZoom('bad'),0);
  assert.equal(normalizePaneFontZoom(Infinity),0);
  assert.equal(normalizePaneFontZoom(30),10);
  assert.equal(normalizePaneFontZoom(-30),-4);
  assert.equal(sidebarDragWidth(250,60,1.5,1440),290);
  assert.equal(sidebarDragWidth(250,60,1,1440),310);
  assert.equal(sidebarDragWidth(250,500,1.5,1440),420);
  assert.equal(sidebarDragWidth(250,-500,1.5,1440),190);
});

const emoji=JSON.parse(readFileSync(new URL('../src/data/emoji.json',import.meta.url),'utf8'));
test('Unicode emoji data preserves categories, Chinese search and complete ZWJ sequences',()=>{
  assert.equal(emoji.groups.length,10);
  assert.equal(emoji.subgroups.length,100);
  assert.equal(emoji.items.length,3972);
  assert.equal(new Set(emoji.items.map(item=>item.e)).size,emoji.items.length);
  assert.ok(emoji.items.some(item=>item.e==='👨‍👩‍👧‍👦'));
  assert.ok(emoji.items.some(item=>item.k.includes('咖啡')));
  assert.ok(emoji.items.every(item=>emoji.groups.includes(item.g)));
  assert.ok(emoji.items.every(item=>emoji.subgroups.some(group=>group.id===item.s && group.g===item.g)));
  assert.equal(emoji.items.filter(item=>item.g==='Component').length,9);
  assert.equal(emoji.items.filter(item=>item.g==='Flags').length,270);
});

test('Skin tone filters apply only to people; category navigation and recent preserve exact Unicode',()=>{
  const catalog=createEmojiCatalog(emoji);
  const symbols=catalog.filter({group:'Symbols',tone:'🏿'});
  assert.equal(symbols.length,emoji.items.filter(item=>item.g==='Symbols').length);
  assert.ok(!catalog.candidates({group:'Symbols'}).some(catalog.supportsTone));
  assert.ok(catalog.candidates({group:'People & Body',subgroup:'hand-fingers-open'}).some(catalog.supportsTone));
  assert.ok(catalog.filter({group:'People & Body',subgroup:'hand-fingers-open',tone:'🏿'}).some(item=>item.e==='👋🏿'));
  assert.ok(!catalog.filter({group:'People & Body',tone:''}).some(item=>/[\u{1F3FB}-\u{1F3FF}]/u.test(item.e)));
  assert.equal(catalog.filter({group:'Component',tone:'🏿'}).length,9);
  assert.equal(catalog.filter({group:'Flags',tone:'🏿'}).length,270);
  assert.equal(catalog.filter({group:'Flags',subgroup:'country-flag'}).length,259);
  assert.ok(catalog.filter({query:'中国',group:'Symbols'}).some(item=>item.e==='🇨🇳'));
  assert.deepEqual(catalog.filter({group:'recent',tone:'',recent:['👋🏿','🇨🇳','👨‍👩‍👧‍👦']}).map(item=>item.e),['👋🏿','🇨🇳','👨‍👩‍👧‍👦']);
});
test('Folder selection builds nested Markdown trees and resolves sibling documents and images',async()=>{
  const files=[{name:'note.md',webkitRelativePath:'notes/sub/note.md'},{name:'second.md',webkitRelativePath:'notes/second.md'},{name:'chart.svg',webkitRelativePath:'notes/images/chart.svg'},{name:'skip.exe',webkitRelativePath:'notes/skip.exe'}];
  const root=folderFromFiles(files);
  assert.equal(root.name,'notes');
  assert.deepEqual(root.children.map(item=>item.name),['sub','second.md']);
  const note=root.children[0].children[0];
  assert.equal((await folderSelection(note)).file,files[0]);
  assert.equal((await relativeFolderDocument(note.id,'../second.md')).selection.file,files[1]);
  assert.equal((await relativeFolderDocument(note.id,'../images/chart.svg')).selection.file,files[2]);
  await assert.rejects(relativeFolderDocument(note.id,'../../secret.md'),/超出/);
});
test('PDF layout settings are constrained and applied after the document styles',()=>{
  assert.deepEqual(normalizePdfOptions({paper:'<script>',landscape:'true',margin:999}),{paper:'A4',landscape:false,margin:14});
  const html=withPdfOptions('<html><head><style>@page{size:A4}</style></head><body></body></html>',{paper:'Letter',landscape:true,margin:20});
  assert.ok(html.includes('size:Letter landscape;margin:20mm'));
  assert.ok(html.indexOf('size:Letter')>html.indexOf('size:A4'));
  assert.ok(html.includes('width:279.4mm'));
});

test('Imported folder copies restore file identities and bytes without new filesystem permission',async()=>{
  const file=new File(['# Restored 😀'],'note.md',{type:'text/markdown'});
  Object.defineProperty(file,'webkitRelativePath',{value:'notes/note.md'});
  const root=folderFromFiles([file]);
  const copy=structuredClone(folderCopyRecord(root));
  const restored=restoreImportedFolder(copy);
  assert.equal(restored.id,root.id);
  assert.equal(restored.children[0].id,root.children[0].id);
  const selection=await folderSelection(restored.children[0]);
  assert.equal(await selection.file.text(),'# Restored 😀');
});
