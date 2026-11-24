import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresetTree,isPresetDocument,presetEntryKey,builtinDocumentRecords} from '../src/preset-catalog.js';

test('Preset metadata forms a filterable folder tree without document bodies',()=>{
  const entries=[...builtinDocumentRecords.map(entry=>({name:entry.name,relativePath:entry.name})),{name:'报告.md',relativePath:'团队/周报/报告.md'}];
  const tree=createPresetTree(entries);
  assert.equal(tree[0].kind,'directory');assert.equal(tree[0].expanded,false);assert.equal(tree[0].children[0].children[0].relativePath,'团队/周报/报告.md');
  assert.equal(tree[1].name,'开始使用.md');assert.ok(tree.every(entry=>!Object.hasOwn(entry,'markdown')));
  const filtered=createPresetTree(entries,'团队');assert.equal(filtered.length,1);assert.equal(filtered[0].expanded,true);assert.equal(filtered[0].children[0].expanded,true);
  assert.equal(createPresetTree(entries,'missing').length,0);
});
test('Preset startup classification distinguishes external files and resolves canonical Windows paths',()=>{
  assert.equal(isPresetDocument({preset:true}),true);
  assert.equal(isPresetDocument({builtinId:'demo'}),true);
  assert.equal(isPresetDocument({builtinId:'demo',path:'D:/my-copy/demo.md'}),false);
  assert.equal(isPresetDocument({name:'demo.md'}),false);
  assert.equal(presetEntryKey({preset:true,path:'\\\\?\\D:\\portable\\builtin\\demo.md'},[{relativePath:'demo.md'}],'D:/portable/builtin'),'demo.md');
  assert.equal(presetEntryKey({builtinId:'demo'},[],undefined),'demo.md');
});
