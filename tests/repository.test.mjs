import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

test('Public documentation links resolve and generated/private directories are excluded',()=>{
  for(const file of ['README.md','THIRD_PARTY_NOTICES.md','PERFORMANCE.md']){
    const url=new URL('../'+file,import.meta.url),source=readFileSync(url,'utf8');
    for(const [,link] of source.matchAll(/\]\(([^)]+)\)/g))if(!/^(?:https?:|#)/.test(link))assert.ok(existsSync(fileURLToPath(new URL(link.split('#')[0],url))),`${file}: ${link}`);
    assert.ok(!/C:\\Users\\|D:\\work\\|\.artifacts\//.test(source),file);
  }
  const ignored=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  for(const directory of ['node_modules/','dist/','.cache/','output/','src-tauri/target/'])assert.ok(ignored.includes(directory));
});
