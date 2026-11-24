import { documentStyles, escapeHtml, exportLayoutStyles, prepareExportHeadings } from './export-document.js';
import { htmlExportStyles } from './html-export-styles.js';
import { normalizeHtmlExportOptions, HTML_TOC_SLOT, HTML_TOC_COMMENT } from './html-export-options.js';
import { installHtmlExportRuntime } from './html-export-runtime.js';
import { normalizeWikiFragments } from './markdown-compat.js';
import { iconMarkup } from './icons.js';
import { fontFamilies, normalizeSettings } from './settings.js';

// The exported HTML can be shared on its own, so it carries the icon notices.
const iconNotice = `<!--
Lucide icons (https://lucide.dev/)
ISC License
Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

Feather-derived icons, MIT License
Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
-->`;

// Keep the captured document inert in the preview. The saved file gets only the
// small, nonce-authorized reader runtime; source Markdown cannot add scripts.
export function prepareHtmlExportBody(root) {
  root.querySelectorAll('.export-toc,.cherry-toc,script,iframe,object,embed,base,link,meta').forEach(node=>node.remove());
  for(const node of root.querySelectorAll('*'))for(const attribute of [...node.attributes]) {
    if(/^on/i.test(attribute.name)||/^(href|xlink:href|action|formaction)$/i.test(attribute.name)&&/^(javascript|vbscript|data):/i.test(attribute.value.replace(/[\u0000-\u0020]/g,'')))node.removeAttribute(attribute.name);
  }
  const headings=prepareExportHeadings(root);
  normalizeWikiFragments(root);
  const slot=root.ownerDocument.createComment(HTML_TOC_COMMENT);
  if(headings[0]?.tagName==='H1')headings[0].after(slot);else root.prepend(slot);
  for(const table of root.querySelectorAll('table')) {
    if(table.closest('svg,.mt-table-scroll,.cherry-table-container'))continue;
    const wrapper=root.ownerDocument.createElement('div');wrapper.className='mt-table-scroll';table.before(wrapper);wrapper.append(table);
  }
  // Preserve the diagram's original light canvas when the reader chooses a dark
  // document. Recoloring the SVG without rerunning Mermaid can hide its edges.
  for(const svg of root.querySelectorAll('.mermaid-viewport>svg')) {
    if(!svg.style.backgroundColor||['transparent','rgba(0, 0, 0, 0)'].includes(svg.style.backgroundColor))svg.style.backgroundColor='#fff';
  }
  return headings.map(node=>({id:node.id,text:node.textContent,level:Number(node.tagName[1])}));
}

export function htmlHeadingTree(headings,depth=3) {
  const entries=(headings[0]?.level===1?headings.slice(1):headings).filter(item=>item.level<=depth);
  const root=[],stack=[];
  for(const item of entries){
    const node={...item,children:[]};while(stack.length&&stack.at(-1).level>=node.level)stack.pop();
    (stack.length?stack.at(-1).children:root).push(node);stack.push(node);
  }
  return root;
}
export function htmlOutline(headings,values) {
  const options=normalizeHtmlExportOptions(values),tree=htmlHeadingTree(headings,options.depth);
  if(options.position==='none'||!tree.length)return '';
  const chevron=iconMarkup('chevron-right');
  const link=item=>`<a href="#${encodeURIComponent(item.id)}" data-mt-heading="${escapeHtml(item.id)}">${escapeHtml(item.text)}</a>`;
  const rows=items=>`<ol class="mt-toc-list">${items.map(item=>`<li>${item.children.length?`<details class="mt-toc-branch"${options.state==='expanded'?' open':''}><summary>${chevron}${link(item)}</summary>${rows(item.children)}</details>`:link(item)}</li>`).join('')}</ol>`;
  const actions=tree.some(item=>item.children.length)?`<div class="mt-toc-actions"><button type="button" data-mt-toc-action="expand">${iconMarkup('chevrons-up-down')}展开全部</button><button type="button" data-mt-toc-action="collapse">${iconMarkup('chevrons-down-up')}收起子级</button></div>`:'';
  return `<aside class="mt-outline" aria-label="目录"><details class="mt-toc-root"${options.state==='collapsed'?'':' open'}><summary title="展开或收起目录">${chevron}<span>目录</span></summary><div class="mt-toc-body">${actions}<nav aria-label="文档目录">${rows(tree)}</nav></div></details><div class="mt-toc-resizer" role="separator" tabindex="0" aria-label="调整目录宽度" aria-orientation="vertical" aria-valuemin="180" aria-valuemax="600" aria-valuenow="${options.tocWidth}" title="拖动调整目录宽度；双击恢复默认；方向键微调"></div></aside>`;
}
function dynamicStyles(values,snapshot){
  const options=normalizeHtmlExportOptions(values);
  const preview=options.theme==='preview'?normalizeSettings(snapshot.appearance):null;
  const measuredWidth=snapshot.appearance?.contentWidth;
  const previewWidth=preview?.previewWidth||(Number.isFinite(measuredWidth)&&measuredWidth>0?measuredWidth:0);
  const codeWrap=preview?preview.previewCodeWrap:options.codeWrap;
  const layout=preview?`body.mt-html-export{
  --mt-preview-font:"Markdown Desk Flags",${fontFamilies[preview.previewFont]};
  --mt-preview-size:${preview.previewFontSize}px;--mt-preview-line-height:${preview.previewLineHeight};
  --mt-preview-padding:${preview.previewPadding}px;
  --mt-preview-width:${previewWidth?(previewWidth+2*preview.previewPadding)+'px':'none'}
}`:exportLayoutStyles(values);
  return `${layout}\nbody.mt-html-export{--mt-toc-width:${options.tocWidth}px;--mt-code-wrap:${codeWrap?'pre-wrap':'pre'};--mt-code-break:${codeWrap?'anywhere':'normal'}}`;
}
function nonce(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));}
function csp(value){return `default-src 'none'; img-src data: blob: file: https: http:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${value}'; base-uri 'none'; form-action 'none'; object-src 'none'`;}
function script(value){return `<script data-mt-runtime nonce="${value}">(${installHtmlExportRuntime.toString()})(document);<\/script>`;}
export function createHtmlExportDocument(snapshot,values={},runtime=true) {
  const options=normalizeHtmlExportOptions(values),outline=htmlOutline(snapshot.headings,values),token=nonce();
  const slot=`<div class="mt-inline-toc-slot">${options.position==='top'?outline:''}</div>`;
  const body=snapshot.bodyHtml.includes(HTML_TOC_SLOT)?snapshot.bodyHtml.replace(HTML_TOC_SLOT,slot):slot+snapshot.bodyHtml;
  const article=`<main class="mt-main"><article class="cherry-markdown">${body}</article></main>`;
  const layout=options.position==='left'?outline+article:article+(options.position==='right'?outline:'');
  return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp(token))}"><meta name="generator" content="墨台 HTML 导出"><title>${escapeHtml(snapshot.title)}</title>${iconNotice}<style>${((snapshot.styles||'')+'\n'+documentStyles+'\n'+htmlExportStyles).replace(/<\/style/gi,'<\\/style')}</style><style id="mt-export-options">${dynamicStyles(values,snapshot)}</style></head><body class="mt-html-export" data-template="${options.theme}" data-preview-tone="${snapshot.appearance?.dark===true?'dark':'light'}" data-toc-position="${options.position}" data-toc-depth="${options.depth}" data-toc-state="${options.state}"><div class="mt-layout">${layout}</div>${runtime?script(token):''}</body></html>`;
}
export function applyHtmlExportOptions(doc,snapshot,values) {
  const options=normalizeHtmlExportOptions(values),body=doc.body;
  const rebuild=body.dataset.tocDepth!==String(options.depth)||body.dataset.tocState!==options.state;
  doc.getElementById('mt-export-options').textContent=dynamicStyles(values,snapshot);
  body.style.removeProperty('--mt-toc-width');
  body.dataset.template=options.theme;body.dataset.tocPosition=options.position;body.dataset.tocDepth=String(options.depth);body.dataset.tocState=options.state;
  let outline=doc.querySelector('.mt-outline'),outlineChanged=false;
  if(rebuild||!outline){
    const markup=htmlOutline(snapshot.headings,values);outlineChanged=Boolean(outline)||Boolean(markup);outline?.remove();outline=null;
    if(markup){const holder=doc.createElement('div');holder.innerHTML=markup;outline=holder.firstElementChild;}
  }
  if(options.position==='none'){outlineChanged||=Boolean(outline);outline?.remove();return {outlineChanged};}
  if(!outline)return {outlineChanged};
  // Avoid moving an already placed sidebar: removing/reinserting its ancestor
  // would drop keyboard focus from the separator after the first arrow press.
  if(options.position==='top'){
    const slot=doc.querySelector('.mt-inline-toc-slot');if(outline.parentElement!==slot)slot.append(outline);
  } else {
    const layout=doc.querySelector('.mt-layout');
    if(options.position==='left'){if(layout.firstElementChild!==outline)layout.prepend(outline);}
    else if(layout.lastElementChild!==outline)layout.append(outline);
  }
  return {outlineChanged};
}
export function serializeHtmlExportDocument(doc) {
  const clone=doc.documentElement.cloneNode(true),token=nonce();
  clone.querySelector('body').classList.remove('mt-resizing');
  clone.querySelector('meta[http-equiv="Content-Security-Policy"]').setAttribute('content',csp(token));
  clone.querySelectorAll('[data-mt-runtime]').forEach(node=>node.remove());
  clone.querySelectorAll('a[data-mt-heading][aria-current]').forEach(node=>node.removeAttribute('aria-current'));
  clone.querySelector('body').insertAdjacentHTML('beforeend',script(token));
  return '<!doctype html>\n'+clone.outerHTML;
}
