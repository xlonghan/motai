import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';

test('Builtin demo passes the real Cherry/KaTeX engine, read-only export and every Mermaid parser',async()=>{
  const worker=new Worker(new URL('./helpers/verify-builtin-engine.mjs',import.meta.url),{stdout:true,stderr:true});
  let output='',errors='';worker.stdout.on('data',chunk=>{output+=chunk;});worker.stderr.on('data',chunk=>{errors+=chunk;});worker.on('error',error=>{errors+=error.stack;});
  const timer=setTimeout(()=>worker.terminate(),60000);
  const status=await new Promise(resolve=>worker.once('exit',resolve));clearTimeout(timer);
  assert.equal(status,0,output+errors);
  const report=JSON.parse(output.trim().split('\n').at(-1));assert.ok(report.mermaidTemplates>20);assert.equal(report.liveDiagrams,9);
});
