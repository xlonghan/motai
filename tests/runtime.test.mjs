import test from 'node:test';
import assert from 'node:assert/strict';
import {switchEditorMode} from '../src/editor-state.js';
import { BoundedCache } from '../src/bounded-cache.js';
import { createSaveQueue } from '../src/save-queue.js';
import { analyzeMarkdown } from '../src/documents.js';

test('View switches never re-enable the hidden Cherry toolbar or replace the editor document',()=>{
  const source={text:'unchanged'},calls=[];
  const editor={doc:source,switchModel(mode,showToolbar=true){calls.push([mode,showToolbar]);}};
  for(const mode of ['previewOnly','edit&preview','editOnly','edit&preview','editOnly'])switchEditorMode(editor,mode);
  assert.ok(calls.every(([,toolbar])=>toolbar===false));assert.equal(editor.doc,source);
});

test('Concurrent draft saves keep the newest state without overlapping writes', async () => {
  let value = 1;
  let release;
  let inFlight = 0;
  let maximum = 0;
  const writes = [];
  const blocked = new Promise((resolve) => { release = resolve; });
  const save = createSaveQueue(async (snapshot) => {
    maximum = Math.max(maximum, ++inFlight);
    writes.push(snapshot);
    if (snapshot === 1) await blocked;
    inFlight--;
  }, () => value);
  const first = save();
  value = 2;
  save();
  value = 3;
  const last = save();
  release();
  await Promise.all([first, last]);
  assert.deepEqual(writes, [1, 3]);
  assert.equal(maximum, 1);
});

test('A failed draft write can be retried with the latest snapshot', async () => {
  let value = 'first';
  const writes = [];
  const save = createSaveQueue(async (snapshot) => {
    if (snapshot === 'first') throw new Error('disk unavailable');
    writes.push(snapshot);
  }, () => value);
  await assert.rejects(save(), /disk unavailable/);
  value = 'latest';
  await save();
  assert.deepEqual(writes, ['latest']);
});

test('Cache limits evict least recently used content and account for replacement bytes', () => {
  const cache = new BoundedCache(3, 20);
  cache.set('a', '1234');
  cache.set('b', '1234');
  cache.get('a');
  cache.set('c', '1234');
  assert.equal(cache.has('b'), false);
  assert.equal(cache.has('a'), true);
  cache.set('a', '1');
  assert.equal(cache.bytes, 10);
  cache.set('large', 'x'.repeat(30));
  assert.equal(cache.size, 1);
  assert.equal(cache.get('large').length, 30);
  cache.clear();
  assert.equal(cache.bytes, 0);
});

test('Shared document metadata preserves Unicode counts, CRLF lines and fenced headings', () => {
  const source = '# 标题😀\r\n\r\n````markdown\r\n# 代码示例\r\n```mermaid\r\nflowchart LR\r\n A-->B\r\n```\r\n````\r\n## 正文\r\n~~~mermaid\r\nflowchart LR\r\n A-->B\r\n~~~\r\n';
  const result = analyzeMarkdown(source);
  assert.equal(result.characters, Array.from(source).length);
  assert.equal(result.lines, source.split('\n').length);
  assert.equal(result.diagrams, 1);
  assert.deepEqual(result.headings.map((item) => item.title), ['标题😀', '正文']);
});


test('Draft and recent-file records can be structured-cloned out of Vue reactivity', async () => {
  const {ref} = await import('vue');
  const {plainRecords} = await import('../src/storage.js');
  const docs=ref([{id:'one',markdown:'正文😀',name:'note.md'}]);
  const recent=ref([{id:'one',name:'note.md',path:'notes/note.md'}]);
  const result=structuredClone({documents:plainRecords(docs.value),recentFiles:plainRecords(recent.value)});
  assert.equal(result.documents[0].markdown,'正文😀');
  assert.equal(result.recentFiles[0].path,'notes/note.md');
});


test('Saving and document switching read live editor text instead of a delayed render cache', async () => {
  const {editorMarkdown}=await import('../src/editor-state.js');
  const editor={getMarkdown:()=> 'stale rendered source',getCodeMirror:()=>({state:{doc:{toString:()=> 'latest source 😀'}}})};
  assert.equal(editorMarkdown(editor),'latest source 😀');
});
