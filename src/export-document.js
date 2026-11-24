import { containsFlags, flagFontFamily } from './emoji-font.js';
import { normalizeSettings, fontFamilies } from './settings.js';
import { markdownCompatibilityStyles } from './markdown-compat.js';

export const documentStyles = `
${markdownCompatibilityStyles}
:root{color-scheme:light;font-family:"Markdown Desk Flags",Inter,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#25312f;background:#fff}
*{box-sizing:border-box}body{margin:0}article{width:100%;margin:0;padding:48px clamp(20px,3vw,64px);line-height:1.85;font-size:15px;overflow-wrap:anywhere}
h1,h2,h3,h4,h5,h6{line-height:1.4;color:#172c27;break-after:avoid-page}h1{font-size:30px;letter-spacing:-.7px;margin:0 0 28px}h2{font-size:22px;margin:38px 0 18px;padding-bottom:9px;border-bottom:1px solid #e6ece9}h3{font-size:18px;margin-top:26px}
a{color:#197a69}p{margin:14px 0}blockquote{margin:22px 0;padding:12px 20px;border-left:3px solid #24927c;background:#f1f7f4;color:#50655e}blockquote p{margin:0}
article.cherry-markdown table{width:100%;border-collapse:collapse;margin:22px 0;font-size:14px;display:table}article.cherry-markdown table th,article.cherry-markdown table td{padding:10px 14px;border:1px solid #dce5e0;text-align:left}article.cherry-markdown table th{background:#f4f7f5;font-weight:600}thead{display:table-header-group}tr{break-inside:avoid-page}
pre{background:#f5f7f8;border:1px solid #e5e9ed;border-radius:7px;padding:18px;white-space:pre-wrap;overflow-wrap:anywhere;break-inside:avoid-page}code{font-family:"Markdown Desk Flags","Cascadia Code","JetBrains Mono",Consolas,monospace;font-size:.9em}p code,li code{background:#edf2ef;padding:2px 5px;border-radius:4px}
.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#6b7d77}.token.punctuation{color:#6c7471}.token.keyword,.token.tag,.token.boolean{color:#89549b}.token.string,.token.attr-value{color:#517b47}.token.function,.token.class-name{color:#287d9a}.token.number,.token.constant{color:#aa6a35}.token.operator{color:#55746a}.code-line{display:block}.cherry-list__item--check{list-style:none}
img{max-width:100%;height:auto}svg{max-width:100%;height:auto}svg text,svg tspan{font-family:"Markdown Desk Flags",Inter,"Segoe UI","Microsoft YaHei",sans-serif}.cherry-flowchart,.cherry-mermaid,figure{max-width:100%;margin:22px 0;break-inside:avoid-page;text-align:center}
.mermaid-viewport{width:100%;max-width:100%;overflow-x:auto;text-align:left}.mermaid-viewport>svg{max-width:none}.mermaid-viewport .nodeLabel p,.mermaid-viewport .edgeLabel p{margin:0!important;line-height:1.5!important}.mermaid-tools{display:none!important}
.mermaid-viewport>svg,article.cherry-markdown figure[data-type=mermaid]>svg{display:block;margin:0 var(--mermaid-svg-right,auto) 0 var(--mermaid-svg-left,auto)}
.mt-html-export .cherry-markdown figure[data-type=mermaid]{--mermaid-svg-left:0;--mermaid-svg-right:0;text-align:left}
article.cherry-markdown figure[data-type=mermaid].cherry-mermaid-align-center{--mermaid-svg-left:auto;--mermaid-svg-right:auto;text-align:center}
article.cherry-markdown figure[data-type=mermaid]:is(.cherry-mermaid-align-left,.cherry-mermaid-align-float-left){--mermaid-svg-left:0;--mermaid-svg-right:auto;text-align:left}
article.cherry-markdown figure[data-type=mermaid]:is(.cherry-mermaid-align-right,.cherry-mermaid-align-float-right){--mermaid-svg-left:auto;--mermaid-svg-right:0;text-align:right}
article.cherry-markdown figure[data-type=mermaid].cherry-mermaid-align-float-left{float:left;width:fit-content;margin-right:18px}
article.cherry-markdown figure[data-type=mermaid].cherry-mermaid-align-float-right{float:right;width:fit-content;margin-left:18px}
.cherry-code-block-tool-bar,.cherry-code-block-toolbar,.cherry-copy-code-block,.cherry-code-copy,.cherry-mermaid-toolbar,.cherry-flowchart-toolbar,.cherry-previewer-table-content-handler,.cherry-previewer-code-block-toolbar{display:none!important}
hr{border:0;border-top:1px solid #e0e7e2;margin:32px 0}li{margin:5px 0}input[type=checkbox]{accent-color:#197a69}.footnotes{font-size:13px;color:#6d7d76}mark{background:#fff0ac}
.export-toc{border:1px solid #dce7df;background:#f8faf8;padding:20px 24px;margin:24px 0 32px;border-radius:7px;break-inside:avoid-page}.export-toc-title{font-size:15px;font-weight:600;letter-spacing:2px;color:#315d48;margin-bottom:10px}.export-toc ol{padding:0;margin:0;list-style:none}.export-toc li{margin:5px 0;line-height:1.6;font-size:13px}.export-toc a{color:#34775c;text-decoration:none}.export-toc a:hover{text-decoration:underline}
article.cherry-markdown table{font-size:12px;line-height:1.65}body:not(.mt-html-export[data-template=preview]) article.cherry-markdown table :is(th,td){border:1px solid #dce5e0!important;padding:6px 12px!important}body:not(.mt-html-export[data-template=preview]) article.cherry-markdown table th{background:#f4f7f5!important}
@media(max-width:650px){article{padding:28px 20px}h1{font-size:26px}}
@page{size:A4;margin:16mm 14mm}@media print{article.cherry-markdown{max-width:none;padding:0;font-size:10.5pt;color:#16241f}article.cherry-markdown h1{font-size:24pt}article.cherry-markdown h2{font-size:17pt}article.cherry-markdown a{color:inherit;text-decoration:none}pre,blockquote,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}svg,figure{break-inside:avoid-page;max-height:240mm;max-width:100%}.mermaid-viewport{overflow:visible;max-height:none}.mermaid-viewport>svg{max-width:100%!important;height:auto!important}body{background:white}}
`;

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function exportLayoutStyles(values) {
  if(!values)return '';
  const s=normalizeSettings(values);
  return `:root{--export-pdf-font-size:${s.pdfFontSize}pt;--export-body-size:${s.exportFontSize}px}
article.cherry-markdown{font-family:"Markdown Desk Flags",${fontFamilies[s.exportFont]};font-size:${s.exportFontSize}px;line-height:${s.exportLineHeight};max-width:${s.exportWidth?s.exportWidth+'px':'none'};margin:0 auto}
article.cherry-markdown h1{font-size:${s.exportFontSize*2}px}article.cherry-markdown h2{font-size:${s.exportFontSize*22/15}px}article.cherry-markdown h3{font-size:${s.exportFontSize*1.2}px}article.cherry-markdown table{font-size:.8em}
@media print{article.cherry-markdown{max-width:none;font-size:var(--export-pdf-font-size)}article.cherry-markdown h1{font-size:calc(var(--export-pdf-font-size)*2.285714)}article.cherry-markdown h2{font-size:calc(var(--export-pdf-font-size)*1.619048)}}`;
}
export function createHtmlDocument(title, html, extraStyles = '', settings) {
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="generator" content="墨台 / Cherry Markdown"><title>${escapeHtml(title)}</title><style>${extraStyles.replace(/<\/style/gi, '<\\/style')}\n${documentStyles}\n${exportLayoutStyles(settings)}</style></head><body><article class="cherry-markdown">${html}</article></body></html>`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const resourceCache = new Map();

async function embeddedResource(url) {
  if (!resourceCache.has(url)) {
    const promise = (async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('导出资源读取失败，请重试');
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('导出资源读取失败'));
        reader.readAsDataURL(blob);
      });
    })();
    resourceCache.set(url, promise);
    promise.catch(() => resourceCache.delete(url));
  }
  return resourceCache.get(url);
}

const htmlComponentSelector=/\.cherry-(?:panel-cols|panel--col|timeline)/;

function htmlComponentRule(rule){
  if(rule.selectorText){
    const selector=rule.selectorText;
    if(selector.includes('.editor-host'))return selector.includes('.mt-html-export')?rule.cssText:'';
    return htmlComponentSelector.test(selector)?rule.cssText:'';
  }
  if(rule.type===7&&rule.name==='cherry-timeline-pulse')return rule.cssText;
  if(rule.type!==4||/\bprint\b/.test(rule.conditionText))return '';
  const children=[...rule.cssRules].map(htmlComponentRule).filter(Boolean);
  return children.length?`@media ${rule.conditionText}{${children.join('\n')}}`:'';
}

export async function collectDocumentStyles(root = document.body,{html=false}={}) {
  const hasFlags = containsFlags(root.textContent);
  const hasMath = Boolean(root.querySelector('.katex'));
  const hasTaskIcons = Boolean(root.querySelector('.ch-icon'));
  const hasHtmlComponents=html&&Boolean(root.querySelector('.cherry-panel-cols,.cherry-timeline,table,:not(pre)>code'));
  const usedFamilies = new Set();
  if (hasMath) for (const element of root.querySelectorAll('.katex,.katex *')) {
    for (const family of getComputedStyle(element).fontFamily.split(',')) usedFamilies.add(family.trim().replace(/["']/g,''));
  }
  const styles = await Promise.all([...document.styleSheets].map(async (sheet) => {
    // Only retain formula, syntax-token and task-icon rules. The editor's
    // print/layout styles must not affect the exported document's pagination.
    const css = [...sheet.cssRules].map((rule) => {
      const text = rule.cssText;
      if (rule.type === 5) {
        const family=rule.style.fontFamily.replace(/["']/g,'');
        const used=family===flagFontFamily?hasFlags:/KaTeX/.test(family)?hasMath&&usedFamilies.has(family):hasTaskIcons&&/ch-icon/.test(family);
        if(!used)return '';
        const source=rule.style.getPropertyValue('src').match(/url\([^)]*\)\s*format\(["']woff2["']\)/);
        return source?text.replace(/src:[^;]+;/,`src:${source[0]};`):text;
      }
      if(rule.selectorText){
        if(hasMath&&/\.katex/.test(rule.selectorText)||hasTaskIcons&&/\.ch-icon|task-list/.test(rule.selectorText))return text;
      }else if(hasMath&&rule.type!==4&&/\.katex/.test(text))return text;
      return hasHtmlComponents?htmlComponentRule(rule):'';
    }).filter(Boolean).join('\n');
    const baseUrl = sheet.href || location.href;
    const references = [...css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g)];
    const replacements = await Promise.all(references.map(async ([match, , value]) => {
      if (value.startsWith('data:') || value.startsWith('#')) return [match, match];
      const url = new URL(value, baseUrl);
      if (url.origin !== location.origin) throw new Error('字体资源来自外部地址，无法导出为离线文档');
      return [match, `url("${await embeddedResource(url.href)}")`];
    }));
    let result = css;
    for (const [match, replacement] of replacements) result = result.replaceAll(match, replacement);
    return result;
  }));
  return styles.join('\n');
}

export async function waitForImages(root, timeout = 12000) {
  const images = [...root.querySelectorAll('img')];
  const pending=images.filter(image=>!image.complete),listeners=[];let timer;
  if(pending.length)try {
    await Promise.race([
      Promise.all(pending.map(image=>new Promise(resolve=>{
        const done=()=>resolve();listeners.push([image,done]);
        image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});
        if(image.complete)resolve();
      }))),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('图片加载超时，请检查图片后重试')),timeout);}),
    ]);
  } finally {
    clearTimeout(timer);for(const [image,done] of listeners){image.removeEventListener('load',done);image.removeEventListener('error',done);}
  }
  const broken = images.filter((image) => !image.naturalWidth);
  if (broken.length) throw new Error(`有 ${broken.length} 张图片未能加载，请检查图片路径`);
}

export async function inlineImages(root) {
  // Cache only inside this export: duplicate URLs share one read, while a later
  // export can still pick up an externally changed image. Bound in-flight work.
  const groups=new Map();
  for (const image of root.querySelectorAll('img')) {
    if (image.src.startsWith('data:')) continue;
    if(!groups.has(image.src))groups.set(image.src,[]);groups.get(image.src).push(image);
  }
  const entries=[...groups];let next=0;
  await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
    while(next<entries.length){
      const [source,images]=entries[next++];
      const response=await fetch(source,{signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error('无法读取图片，请检查文件路径或跨域设置');
      const blob=await response.blob();
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('读取图片失败'));reader.readAsDataURL(blob);});
      for(const image of images)image.src=data;
    }
  }));
}

export function prepareExportHeadings(root) {
  const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(node=>!node.closest('svg'));
  const usedIds = new Set();
  for (const [index, heading] of headings.entries()) {
    const base = heading.id || `section-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    heading.id = id;
    heading.setAttribute('aria-label', heading.textContent);
  }
  return headings;
}
export function addExportToc(root, depth = 6) {
  if (root.querySelector('.cherry-toc')) return;
  const headings = prepareExportHeadings(root);
  if (!headings.length) return;
  const firstIsTitle = headings[0].tagName === 'H1';
  const entries = (firstIsTitle ? headings.slice(1) : headings).filter(heading=>Number(heading.tagName[1])<=depth);
  if (!entries.length) return;
  const baseLevel = Math.min(...entries.map((heading) => Number(heading.tagName[1])));
  const toc = document.createElement('nav');
  toc.className = 'export-toc';
  toc.setAttribute('aria-label', '目录');
  toc.innerHTML = `<div class="export-toc-title">目录</div><ol>${entries.map((heading) => `<li style="padding-left:${(Number(heading.tagName[1]) - baseLevel) * 16}px"><a href="#${encodeURIComponent(heading.id)}">${escapeHtml(heading.textContent)}</a></li>`).join('')}</ol>`;
  if (firstIsTitle) headings[0].after(toc);
  else root.prepend(toc);
}
