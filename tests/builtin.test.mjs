import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBuiltinLibrary,inlineBuiltinAssets,svgDataUrl} from '../src/builtin-library.js';
import {updateMermaidChapter,commonMermaidDocument} from '../scripts/update-demo-mermaid.mjs';
import {commonMermaidCatalog,mermaidCatalog} from '../src/mermaid-catalog.js';
import {diagramCount} from '../src/documents.js';

test('Builtin library opens stable editable copies with portable local images',()=>{
  const asset=svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>本地 (图片)</text></svg>');
  const library=createBuiltinLibrary([{id:'demo',name:'demo.md',markdown:'![本地图片](assets/demo.svg)'}],{'assets/demo.svg':asset});
  assert.equal(library.get('DEMO.MD'),library.get('demo'));assert.equal(library.get('missing'),null);assert.ok(library.get('demo').markdown.includes('data:image/svg+xml,'));
  assert.ok(!asset.includes('('));assert.ok(!asset.includes(')'));
});
test('Builtin image rewriting leaves fenced and inline code examples untouched',()=>{
  const input='![图](assets/a.svg)\n<img src="assets/a.svg" width="45%">\n`![示例](assets/a.svg)`\n````markdown\n![示例](assets/a.svg)\n```text\n字面代码\n```\n````';
  const output=inlineBuiltinAssets(input,{'assets/a.svg':'data:image/svg+xml,LOCAL'});
  assert.equal((output.match(/data:image/g)||[]).length,2);assert.ok(output.includes('`![示例](assets/a.svg)`'));assert.ok(output.includes('````markdown\n![示例](assets/a.svg)'));
});
test('Builtin demo covers current Mermaid templates and has no remote image dependency or invalid sample formula',()=>{
  const source=readFileSync(new URL('../builtin/demo.md',import.meta.url),'utf8');
  assert.equal(updateMermaidChapter(source),source);assert.equal(diagramCount(source),commonMermaidCatalog.length);
  assert.equal(readFileSync(new URL('../builtin/Mermaid 常用图表示例.md',import.meta.url),'utf8'),commonMermaidDocument());
  for(const item of mermaidCatalog)assert.ok(source.includes(item.name),item.id);
  for(const marker of ['[TOC]','Definition Lists','Wikilinks & Verse','::: tabs','::: timeline','::: cols','[^note-extra]','H~2~O','H^^2^^O'])assert.ok(source.includes(marker),marker);
  assert.ok(!/!\[[^\]]*\]\(https?:|<img[^>]+src=["']https?:/i.test(source));assert.ok(!source.includes('$简写语法: X^3^$'));
});
