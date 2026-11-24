const tabStates=Array.from({length:10},(_,index)=>`
.mt-html-export .cherry-tabs > .cherry-tabs--radio__${index}:checked ~ .cherry-tabs--labels > .cherry-tabs--label__${index}{color:var(--mt-tab-accent,var(--mt-accent));border-bottom-color:currentColor}
.mt-html-export .cherry-tabs > .cherry-tabs--radio__${index}:focus-visible ~ .cherry-tabs--labels > .cherry-tabs--label__${index}{outline:2px solid var(--mt-tab-accent,var(--mt-accent));outline-offset:-2px}
.mt-html-export .cherry-tabs > .cherry-tabs--radio__${index}:checked ~ .cherry-tabs--panels > .cherry-tabs--panel__${index}{display:block}
`).join('');

export const htmlExportStyles=`
body.mt-html-export{--mt-bg:#fff;--mt-text:#1f2328;--mt-heading:#1f2328;--mt-muted:#59636e;--mt-accent:#0969da;--mt-border:#d1d9e0;--mt-soft:#f6f8fa;--mt-hover:#eaeef2;--mt-radius:6px;background:var(--mt-bg);color:var(--mt-text);margin:0;scroll-behavior:auto}
body.mt-html-export[data-template=docs]{--mt-bg:#fff;--mt-text:#3c3c43;--mt-heading:#28282e;--mt-muted:#67676c;--mt-accent:#3451b2;--mt-border:#e2e2e3;--mt-soft:#f6f6f7;--mt-hover:#e9e9eb;--mt-radius:4px}
body.mt-html-export[data-template=material]{--mt-text:#30343b;--mt-heading:#263142;--mt-muted:#657084;--mt-accent:#4051b5;--mt-border:#dfe3eb;--mt-soft:#f5f7fb;--mt-hover:#e8ecf8;--mt-radius:3px}
body.mt-html-export[data-template=classic]{--mt-text:#25312f;--mt-heading:#172c27;--mt-muted:#64756e;--mt-accent:#197a69;--mt-border:#dce5e0;--mt-soft:#f4f7f5;--mt-hover:#e6efea;--mt-radius:7px}
body.mt-html-export[data-template=dark]{color-scheme:dark;--mt-bg:#0d1117;--mt-text:#d1d9e0;--mt-heading:#f0f6fc;--mt-muted:#9198a1;--mt-accent:#79c0ff;--mt-border:#3d444d;--mt-soft:#151b23;--mt-hover:#212830;--mt-radius:6px}
body.mt-html-export[data-template=preview]{--mt-text:#373c40;--mt-heading:#4c809b;--mt-muted:#5c6e78;--mt-accent:#387da2;--mt-border:#d7dfe5;--mt-soft:#f5f6f8;--mt-hover:#edf4fa;--mt-radius:2px;--mt-tab-accent:#0d6dfe}
body.mt-html-export[data-template=preview][data-preview-tone=dark]{color-scheme:dark;--mt-bg:#28313a;--mt-text:#d8dde1;--mt-heading:#82bad8;--mt-muted:#bdcbd5;--mt-accent:#91c7e5;--mt-border:#46515b;--mt-soft:#171b1f;--mt-hover:#384650;--mt-tab-accent:#91c7e5}
.mt-html-export .mt-layout{display:grid;grid-template-columns:minmax(0,1fr);min-height:100vh;align-items:start}
.mt-html-export[data-toc-position=left]:has(.mt-outline) .mt-layout{grid-template-columns:min(var(--mt-toc-width,260px),max(180px,calc(100vw - 320px))) minmax(0,1fr)}
.mt-html-export[data-toc-position=right]:has(.mt-outline) .mt-layout{grid-template-columns:minmax(0,1fr) min(var(--mt-toc-width,260px),max(180px,calc(100vw - 320px)))}
.mt-html-export[data-toc-position=left]:has(.mt-toc-root:not([open])) .mt-layout{grid-template-columns:44px minmax(0,1fr)}
.mt-html-export[data-toc-position=right]:has(.mt-toc-root:not([open])) .mt-layout{grid-template-columns:minmax(0,1fr) 44px}
.mt-html-export .mt-main{min-width:0}
.mt-html-export article.cherry-markdown{box-sizing:border-box;padding:40px clamp(20px,3vw,52px);color:var(--mt-text)}
.mt-html-export article.cherry-markdown h1,.mt-html-export article.cherry-markdown h2,.mt-html-export article.cherry-markdown h3,.mt-html-export article.cherry-markdown h4,.mt-html-export article.cherry-markdown h5,.mt-html-export article.cherry-markdown h6{color:var(--mt-heading);scroll-margin-top:20px;letter-spacing:normal}
.mt-html-export article.cherry-markdown h1{padding-bottom:15px;border-bottom:1px solid var(--mt-border);margin-bottom:24px}
.mt-html-export article.cherry-markdown h2{margin-top:32px;border-color:var(--mt-border)}
.mt-html-export[data-template=docs] article.cherry-markdown h1{border:0;padding-bottom:0;letter-spacing:-.4px}.mt-html-export[data-template=docs] article.cherry-markdown h2{border-bottom:0;border-top:1px solid var(--mt-border);padding-top:24px;margin-top:40px}
.mt-html-export[data-template=material] article.cherry-markdown h1{font-weight:400;color:var(--mt-muted);border:0}.mt-html-export[data-template=material] article.cherry-markdown h2{font-weight:500;border:0}.mt-html-export[data-template=material] article.cherry-markdown blockquote{border-left-width:4px}
.mt-html-export[data-template=classic] article.cherry-markdown h1{border:0;padding-bottom:0}.mt-html-export[data-template=classic] article.cherry-markdown blockquote{border-radius:var(--mt-radius)}
.mt-html-export article.cherry-markdown a{color:var(--mt-accent);text-decoration:none}.mt-html-export article.cherry-markdown a:hover{text-decoration:underline}
.mt-html-export article.cherry-markdown pre{background:var(--mt-soft);border:1px solid var(--mt-border);border-radius:var(--mt-radius);white-space:var(--mt-code-wrap,pre);overflow-wrap:var(--mt-code-break,normal);overflow-x:auto;line-height:1.6}
.mt-html-export article.cherry-markdown pre code,.mt-html-export article.cherry-markdown pre .code-line{white-space:inherit;overflow-wrap:inherit}
.mt-html-export article.cherry-markdown p code,.mt-html-export article.cherry-markdown li code{background:var(--mt-soft);color:inherit}
.mt-html-export article.cherry-markdown blockquote{background:var(--mt-soft);color:var(--mt-muted);border-color:var(--mt-accent);border-radius:0}
.mt-html-export article.cherry-markdown hr{border-color:var(--mt-border)}
.mt-html-export :is(.mt-table-scroll,.cherry-table-container){max-width:100%;overflow-x:auto;margin:20px 0}
.mt-html-export[data-template=preview] :is(.mt-table-scroll,.cherry-table-container){margin:0}
.mt-html-export article.cherry-markdown table{margin:0!important}
.mt-html-export:not([data-template=preview]) article.cherry-markdown table th{background:var(--mt-soft)!important;color:var(--mt-heading)}
.mt-html-export:not([data-template=preview]) article.cherry-markdown table :is(th,td){border-color:var(--mt-border)!important}
.mt-html-export[data-template=dark] .token.comment{color:#9198a1}.mt-html-export[data-template=dark] .token.keyword,.mt-html-export[data-template=dark] .token.tag{color:#ff7b72}.mt-html-export[data-template=dark] .token.string{color:#a5d6ff}.mt-html-export[data-template=dark] .token.number,.mt-html-export[data-template=dark] .token.boolean{color:#79c0ff}.mt-html-export[data-template=dark] .token.function,.mt-html-export[data-template=dark] .token.class-name{color:#d2a8ff}.mt-html-export[data-template=dark] .token.punctuation,.mt-html-export[data-template=dark] .token.operator{color:#c9d1d9}
.mt-html-export[data-template=preview] article.cherry-markdown{max-width:var(--mt-preview-width);margin:0 auto;padding:var(--mt-preview-padding);font-family:var(--mt-preview-font);font-size:var(--mt-preview-size);line-height:var(--mt-preview-line-height)}
.mt-html-export[data-template=preview] article.cherry-markdown h1{font-size:calc(var(--mt-preview-size)*1.93);font-weight:600;line-height:1.35;border:0;padding:0;margin:0 0 23px}
.mt-html-export[data-template=preview] article.cherry-markdown h2{font-size:calc(var(--mt-preview-size)*1.47);font-weight:600;line-height:1.4;margin:28px 0 14px;padding-bottom:7px}
.mt-html-export[data-template=preview] article.cherry-markdown h3{font-size:calc(var(--mt-preview-size)*1.2)}
.mt-html-export[data-template=preview] article.cherry-markdown p{margin:12px 0;line-height:1.7}
.mt-html-export[data-template=preview] article.cherry-markdown blockquote{margin:16px 0;padding:9px 15px;background:#f2f5f7;border-color:#90a9b8;font-size:calc(var(--mt-preview-size) - 1px)}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown blockquote{background:#2a333a;border-color:var(--mt-border)}
.mt-html-export[data-template=preview] article.cherry-markdown blockquote p{margin:0}
.mt-html-export[data-template=preview] article.cherry-markdown pre{padding:15px}
.mt-html-export[data-template=preview] article.cherry-markdown pre code{font-size:calc(var(--mt-preview-size) - 2px)}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown .token.comment{color:#a4b38d}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown :is(.token.keyword,.token.tag){color:#8ebfe0}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown .token.string{color:#e3aa93}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown :is(.token.function,.token.class-name){color:#d8a4d9}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown :is(.token.number,.token.boolean,.token.constant){color:#c7b776}
.mt-html-export[data-template=preview][data-preview-tone=dark] article.cherry-markdown :is(.token.punctuation,.token.operator){color:#bdcbd5}
.mt-html-export article.cherry-markdown{
  --md-hr-border:var(--mt-border);--base-font-color:var(--mt-text);--base-previewer-bg:var(--mt-bg);
  --timeline-header-color:var(--mt-text);--timeline-title-color:#263441;--timeline-time-color:#4a5e70;
  --timeline-desc-color:var(--timeline-time-color);--timeline-line-color:#8095a6;
  --timeline-node-color:#63798c;--timeline-todo-color:#adb5bd;--timeline-timestamp-bg:#e5eef6;
  --timeline-hover-bg:#edf4fa;--timeline-done-color:#246143;--timeline-doing-color:#285e91;
  --timeline-milestone-color:#7b560c;--timeline-milestone-title-color:var(--timeline-milestone-color);
  --timeline-error-color:#983541;--timeline-error-title-color:var(--timeline-error-color);
}
.mt-html-export:is([data-template=dark],[data-template=preview][data-preview-tone=dark]) article.cherry-markdown{
  --timeline-title-color:#e4ecf3;--timeline-time-color:#bdcbd5;--timeline-node-color:#a7b6c4;
  --timeline-timestamp-bg:#3a4856;--timeline-hover-bg:#35414e;--timeline-done-color:#a3d9b4;
  --timeline-doing-color:#a5d7f9;--timeline-milestone-color:#f1d181;--timeline-error-color:#f3a8ad;
}
.mt-html-export[data-template=preview] article.cherry-markdown{--timeline-todo-bg:#fff}
.mt-html-export article.cherry-markdown .cherry-timeline--time{background:var(--timeline-timestamp-bg)}
.mt-html-export article.cherry-markdown .cherry-timeline--item:hover{background:var(--timeline-hover-bg)}
.mt-html-export article.cherry-markdown .cherry-timeline--desc p{line-height:1.6;margin:2px 0}
.mt-html-export .cherry-tabs{position:relative;margin:16px 0;min-width:0}
.mt-html-export .cherry-tabs > .cherry-tabs--radio{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.mt-html-export .cherry-tabs > .cherry-tabs--labels{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--mt-border)}
.mt-html-export .cherry-tabs--labels > .cherry-tabs--label{padding:8px 16px;margin-bottom:-1px;cursor:pointer;border-bottom:2px solid transparent;line-height:1.5;font-weight:500}
.mt-html-export .cherry-tabs--labels > .cherry-tabs--label:hover{background:var(--mt-hover)}
.mt-html-export .cherry-tabs > .cherry-tabs--panels{padding:12px 0}
.mt-html-export .cherry-tabs--panels > .cherry-tabs--panel{display:none;min-width:0;overflow-wrap:break-word}
.mt-html-export article.cherry-markdown :is(.cherry-tabs--panel,.cherry-panel--col) > :first-child{margin-top:0}
.mt-html-export article.cherry-markdown :is(.cherry-tabs--panel,.cherry-panel--col) > :last-child{margin-bottom:0}
${tabStates}
.mt-html-export .mt-outline{position:sticky;top:0;box-sizing:border-box;height:100vh;min-width:0;background:var(--mt-soft);border-right:1px solid var(--mt-border);color:var(--mt-text);font:13px/1.55 "Segoe UI","Microsoft YaHei",sans-serif}
.mt-html-export[data-toc-position=right] .mt-outline{grid-column:2;border-right:0;border-left:1px solid var(--mt-border)}
.mt-html-export[data-toc-position=right] .mt-main{grid-column:1;grid-row:1}
.mt-html-export .mt-toc-root{height:100%;min-width:0}
.mt-html-export .mt-toc-resizer{display:none;position:absolute;top:0;bottom:0;width:10px;z-index:5;cursor:col-resize;touch-action:none;outline:none}
.mt-html-export[data-toc-position=left] .mt-outline:has(>.mt-toc-root[open])>.mt-toc-resizer{display:block;right:-5px}
.mt-html-export[data-toc-position=right] .mt-outline:has(>.mt-toc-root[open])>.mt-toc-resizer{display:block;left:-5px}
.mt-html-export .mt-toc-resizer:after{content:'';position:absolute;top:0;bottom:0;left:4px;width:2px;background:var(--mt-accent);opacity:0}
.mt-html-export .mt-toc-resizer:hover:after,.mt-html-export .mt-toc-resizer:focus-visible:after,.mt-html-export.mt-resizing .mt-toc-resizer:after{opacity:.85}
.mt-html-export.mt-resizing,.mt-html-export.mt-resizing *{cursor:col-resize!important;user-select:none!important}
.mt-html-export .mt-toc-root>summary{display:flex;align-items:center;gap:6px;box-sizing:border-box;cursor:pointer;min-height:47px;padding:13px 15px;font-weight:600;border-bottom:1px solid var(--mt-border);user-select:none;list-style:none}
.mt-html-export .mt-toc-root:not([open])>summary{writing-mode:vertical-rl;height:110px;min-height:0;width:44px;padding:16px 11px;border:0}
.mt-html-export .mt-toc-body{height:calc(100vh - 48px);overflow:auto;overscroll-behavior:contain;padding:10px 9px 24px;box-sizing:border-box}
.mt-html-export .mt-toc-actions{display:flex;gap:6px;flex-wrap:wrap;padding:0 4px 10px}
.mt-html-export .mt-toc-actions button{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--mt-border);border-radius:3px;background:var(--mt-bg);color:var(--mt-muted);padding:3px 6px;font:inherit;font-size:11px;cursor:pointer}
.mt-html-export .mt-toc-list,.mt-html-export .mt-toc-list ol{list-style:none;margin:0;padding:0}
.mt-html-export .mt-toc-list ol{padding-left:13px;border-left:1px solid var(--mt-border);margin-left:8px}
.mt-html-export .mt-toc-list li{margin:1px 0;line-height:1.5}
.mt-html-export .mt-toc-list a{display:block;border-left:2px solid transparent;padding:5px 7px;color:var(--mt-muted);text-decoration:none;overflow-wrap:anywhere;border-radius:2px}
.mt-html-export .mt-toc-list a:hover{background:var(--mt-hover);color:var(--mt-accent)}
.mt-html-export .mt-toc-list a[aria-current=location]{color:var(--mt-accent);border-left-color:var(--mt-accent);background:var(--mt-hover);font-weight:600}
.mt-html-export .mt-toc-branch>summary{display:flex;align-items:flex-start;cursor:pointer;list-style:none}
.mt-html-export .mt-outline summary::-webkit-details-marker{display:none}
.mt-html-export .mt-outline :is(summary,button)>svg{display:block;width:14px;height:14px;flex:none;color:var(--mt-muted);pointer-events:none}
.mt-html-export .mt-toc-branch>summary>svg{margin-top:7px}
.mt-html-export .mt-outline details[open]>summary>svg{transform:rotate(90deg)}
.mt-html-export .mt-toc-branch>summary>a{flex:1;min-width:0}
.mt-html-export .mt-inline-toc-slot:empty{display:none}
.mt-html-export[data-toc-position=top] .mt-outline{position:static;height:auto;border:1px solid var(--mt-border);border-radius:var(--mt-radius);margin:22px 0 30px}
.mt-html-export[data-toc-position=top] .mt-toc-root>summary{writing-mode:horizontal-tb;width:auto;height:auto;min-height:45px;padding:12px 16px}
.mt-html-export[data-toc-position=top] .mt-toc-body{height:auto;max-height:460px}
@media(max-width:720px){.mt-html-export .mt-layout{display:flex!important;flex-direction:column}.mt-html-export .mt-main{width:100%}.mt-html-export .mt-outline{position:static;height:auto;border:0;border-bottom:1px solid var(--mt-border)}.mt-html-export .mt-layout>.mt-outline{order:-1;width:100%;border-left:0;border-right:0}.mt-html-export .mt-toc-root>summary{writing-mode:horizontal-tb!important;width:auto!important;height:auto!important;min-height:44px!important;padding:12px 16px!important}.mt-html-export .mt-toc-body{height:auto;max-height:45vh}.mt-html-export article.cherry-markdown{padding:26px 18px}}
@media print{.mt-html-export .mt-layout{display:block!important}.mt-html-export .mt-outline{display:none!important}.mt-html-export article.cherry-markdown{max-width:none!important;padding:0;background:#fff;color:#16241f}.mt-html-export{background:#fff}}
@media(max-width:720px){.mt-html-export .mt-outline>.mt-toc-resizer{display:none!important}}
`;
