import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modernFontCss } from '../scripts/modern-fonts.mjs';

test('All shipped KaTeX faces retain WOFF2 and their font descriptors',()=>{
  const css=readFileSync(new URL('../node_modules/katex/dist/katex.min.css',import.meta.url),'utf8');
  const before=css.match(/@font-face\s*\{[^}]*\}/g),after=modernFontCss(css).match(/@font-face\s*\{[^}]*\}/g);
  assert.equal(after.length,before.length);
  for(let index=0;index<before.length;index++){
    for(const descriptor of ['font-family','font-style','font-weight'])assert.equal(after[index].match(new RegExp(descriptor+':[^;}]+'))?.[0],before[index].match(new RegExp(descriptor+':[^;}]+'))?.[0]);
    assert.ok(after[index].includes('.woff2'));
    assert.ok(!/\.woff(?!2)|\.ttf/.test(after[index]));
  }
});
test('Cherry icon compatibility sources are removed while the modern source and ordinary SVGs remain',()=>{
  const css=readFileSync(new URL('../node_modules/cherry-markdown/dist/cherry-markdown.css',import.meta.url),'utf8');
  const result=modernFontCss(css+'\n.logo{background:url(logo.svg)}');
  const face=result.match(/@font-face\s*\{[^}]*\}/)?.[0];
  assert.ok(face.includes('ch-icon.woff2'));
  assert.ok(!/\.eot|\.woff(?!2)|\.ttf|ch-icon\.svg/.test(face));
  assert.ok(result.includes('background:url(logo.svg)'));
  const unsupported='@font-face{font-family:Legacy;src:url(legacy.ttf) format("truetype")}';
  assert.equal(modernFontCss(unsupported),unsupported);
});
