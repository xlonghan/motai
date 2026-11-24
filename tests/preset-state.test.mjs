import test from 'node:test';
import assert from 'node:assert/strict';
import {documentDigest,presetRefresh,legacyPresetId} from '../src/preset-state.js';
import {readFileSync} from 'node:fs';

test('Preset reload ignores line-ending conversion and retains edits when disk content is unchanged',async()=>{
  const base='# 原始模板\r\n\r\n正文 😀\r\n';
  const baseline=await documentDigest(base);
  assert.equal(baseline,await documentDigest(base.replaceAll('\r\n','\n')));
  assert.deepEqual(await presetRefresh(base+'未保存的修改',base,baseline),{replace:false,backup:false,diskHash:baseline});
});
test('Only exact untouched legacy presets are reclassified for lazy startup',async()=>{
  const markdown=readFileSync(new URL('../builtin/Mermaid 示例集.md',import.meta.url),'utf8');
  assert.equal(await legacyPresetId({name:'Mermaid 示例集.md',markdown}),'diagrams');
  const welcome=readFileSync(new URL('../builtin/开始使用.md',import.meta.url),'utf8').replace(/\n## 预置 Markdown\n[\s\S]*?(?=\n## Mermaid 流程图)/,'');
  assert.equal(await legacyPresetId({name:'开始使用.md',markdown:welcome}),'welcome');
  assert.equal(await legacyPresetId({name:'Mermaid 示例集.md',markdown:markdown+'my changes'}),null);
  assert.equal(await legacyPresetId({name:'Mermaid 示例集.md',markdown,path:'D:/my-own-file.md'}),null);
  assert.equal(await legacyPresetId({name:'Mermaid 示例集.md',markdown,imported:true}),null);
  const ordinary={name:'普通草稿.md',get markdown(){assert.fail('Unrelated drafts must not be scanned');}};
  assert.equal(await legacyPresetId(ordinary),null);
});
test('External updates replace a clean preset and preserve a modified draft before reloading',async()=>{
  const base='# old',incoming='# externally updated';
  const baseline=await documentDigest(base),diskHash=await documentDigest(incoming);
  assert.deepEqual(await presetRefresh(base,incoming,baseline),{replace:true,backup:false,diskHash});
  assert.deepEqual(await presetRefresh(base+'\nunsaved',incoming,baseline),{replace:true,backup:true,diskHash});
  assert.deepEqual(await presetRefresh('legacy draft without a baseline',incoming),{replace:true,backup:true,diskHash});
  assert.deepEqual(await presetRefresh(incoming,incoming,baseline),{replace:false,backup:false,diskHash});
});
