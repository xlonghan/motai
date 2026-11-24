import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWikiLink,resolveWikiDocument,definitionParts,verseLines,footnoteDefinitionPattern,replaceInlineText,normalizeWikiFragments} from '../src/markdown-compat.js';

test('Wiki note aliases preserve Unicode, punctuation and fragments while rejecting executable targets',()=>{
  assert.deepEqual(parseWikiLink('目录/A &amp; B#目标章节|🌐 蓝图'),{path:'目录/A & B.md',fragment:'目标章节',href:'%E7%9B%AE%E5%BD%95/A%20%26%20B.md#%E7%9B%AE%E6%A0%87%E7%AB%A0%E8%8A%82',label:'🌐 蓝图'});
  assert.equal(parseWikiLink('#本页标题').href,'#%E6%9C%AC%E9%A1%B5%E6%A0%87%E9%A2%98');assert.equal(parseWikiLink('note.markdown').path,'note.markdown');
  for(const target of ['javascript:alert(1)','https://example.test','//example.test','note\nname','<img src=x>'])assert.equal(parseWikiLink(target),null);
  assert.equal(parseWikiLink('note|A &quot;quoted&quot;').label,'A "quoted"');
});
test('Wiki resolution honors the current folder and refuses ambiguous or unrelated same-name notes',()=>{
  const current={name:'demo.md',path:'\\\\?\\D:\\notes\\demo.md'},local={id:'local',name:'Note.md',path:'D:\\notes\\Note.md'},other={id:'other',name:'Note.md',path:'D:\\other\\Note.md'};
  assert.equal(resolveWikiDocument([local,other],current,'Note.md').document,local);
  assert.equal(resolveWikiDocument([other],current,'Note.md').document,undefined);
  assert.equal(resolveWikiDocument([local,other],current,'../other/Note.md').document,other);
  assert.equal(resolveWikiDocument([local,other],{},'Note.md').ambiguous,true);
  assert.equal(resolveWikiDocument([local],{},'Note.md').document,local);
});
test('Definition lists accept several definitions and indented continuation without consuming headings',()=>{
  assert.deepEqual(definitionParts('`参数`',': 第一条\n  继续说明\n: **第二条**'),{term:'`参数`',definitions:['第一条 继续说明','**第二条**']});
  assert.equal(definitionParts('## 标题',': 正文'),null);assert.equal(definitionParts('- 列表项',': 正文'),null);
});
test('Verse keeps indentation and empty lines while leaving standard and short-delimiter tables alone',()=>{
  assert.deepEqual(verseLines('|    证书\n|\n|    序号'),['   证书','','   序号']);
  assert.equal(verseLines('| A | B |\n| :--- | ---: |\n| 1 | 2 |'),null);
  assert.equal(verseLines('| A | B |\n| - | - |\n| 1 | 2 |'),null);
  assert.equal(verseLines('| 单列 |\n| --- |\n| 内容 |'),null);
});
test('Consecutive footnote definitions retain multiline bodies and preserve source line count',()=>{
  const source='引文[^one] [^two]\n\n[^one]: 第一条\n  续行\n[^two]: 第二条\n';
  const matches=[...source.matchAll(footnoteDefinitionPattern())];assert.deepEqual(matches.map(m=>m[2]),['one','two']);assert.equal(matches[0][3],'第一条\n  续行');
  const removed=source.replace(footnoteDefinitionPattern(),whole=>(whole.match(/\n/g)||[]).join(''));
  assert.equal(removed.split('\n').length,source.split('\n').length);
});

test('Inline extensions transform text without rewriting quoted HTML attributes',()=>{
  const source='<a href="a==b==.md" title="x>y">==标题==</a>';
  assert.equal(replaceInlineText(source,/==(.+?)==/g,'<mark>$1</mark>'),'<a href="a==b==.md" title="x>y"><mark>标题</mark></a>');
});

test('Exported same-note Wiki links use real IDs even when the heading slug differs from its title',()=>{
  const heading={id:'chapter-slug',textContent:'带空格的 章节',getAttribute:()=>null},link={href:'old',getAttribute:()=>heading.textContent,setAttribute(key,value){this[key]=value;}};
  const root={querySelectorAll(selector){return selector.startsWith('a[data-wikilink')?[link]:[heading];}};
  normalizeWikiFragments(root);assert.equal(link.href,'#chapter-slug');
});
