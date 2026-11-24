import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {commonMermaidCatalog,mermaidCatalog,mermaidSnippet} from '../src/mermaid-catalog.js';

export const MERMAID_START='<!-- mermaid-demo:start -->';
export const MERMAID_END='<!-- mermaid-demo:end -->';
export function commonMermaidDocument(){return '# Mermaid 常用图表示例\n\n流程图、时序图、类图、状态图、饼图、思维导图、ER 图、看板和架构图。图表支持缩放与放大查看。\n\n'+commonMermaidCatalog.map(item=>`## ${item.name}\n\n${mermaidSnippet(item.id)}`).join('\n');}
export function mermaidDemoChapter(){
  const common=new Set(commonMermaidCatalog.map(item=>item.id));
  return [
    '本页直接预览常用九类图表。其他内置类型附在后面的源码索引中，可复制到新文档或替换当前图表后预览。',
    ...commonMermaidCatalog.map(item=>`### ${item.name}\n\n${mermaidSnippet(item.id)}`),
    '### 全部内置类型索引',
    ['| 类型 | Mermaid 起始语法 | 本页展示 |','| --- | --- | --- |',...mermaidCatalog.map(item=>`| ${item.name} | \`${item.syntax}\` | ${common.has(item.id)?'上方直接预览':'下方源码示例'} |`)].join('\n'),
    '<details>\n<summary>展开其他内置类型的完整源码</summary>\n',
    ...mermaidCatalog.filter(item=>!common.has(item.id)).map(item=>`**${item.name}**\n\n\`\`\`\`markdown\n${mermaidSnippet(item.id)}\`\`\`\`\n`),
    '</details>',
  ].join('\n\n');
}
export function updateMermaidChapter(source){
  const start=source.indexOf(MERMAID_START),end=source.indexOf(MERMAID_END);
  if(start<0||end<start)throw new Error('demo.md 缺少 Mermaid 章节标记');
  const newline=source.includes('\r\n')?'\r\n':'\n';
  const chapter=(MERMAID_START+'\n\n'+mermaidDemoChapter()+'\n\n').replace(/\n/g,newline);
  return source.slice(0,start)+chapter+source.slice(end);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const file=new URL('../builtin/demo.md',import.meta.url),source=await readFile(file,'utf8'),updated=updateMermaidChapter(source);
  const commonFile=new URL('../builtin/Mermaid 常用图表示例.md',import.meta.url),common=commonMermaidDocument();
  if(process.argv.includes('--check')){if(updated!==source||await readFile(commonFile,'utf8')!==common){console.error('内置 Mermaid 示例需要更新：node scripts/update-demo-mermaid.mjs');process.exitCode=1;}}
  else {await writeFile(file,updated);await writeFile(commonFile,common);}
}
