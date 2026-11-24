export const defaultPdfOptions = { paper: 'A4', landscape: false, margin: 14 };
export function normalizePdfOptions(value = {}) {
  return { paper: value.paper === 'Letter' ? 'Letter' : 'A4', landscape: value.landscape === true, margin: [10,14,20,25].includes(Number(value.margin)) ? Number(value.margin) : 14 };
}
export function withPdfOptions(html, value) {
  const options = normalizePdfOptions(value);
  const width = options.paper === 'Letter' ? (options.landscape ? 279.4 : 215.9) : (options.landscape ? 297 : 210);
  const css = `@page{size:${options.paper} ${options.landscape?'landscape':'portrait'};margin:${options.margin}mm}@media screen{article.cherry-markdown{width:${width}mm;max-width:none;margin:0 auto;padding:${options.margin}mm;font-size:var(--export-pdf-font-size,10.5pt)}article.cherry-markdown h1{font-size:calc(var(--export-pdf-font-size,10.5pt)*2.285714)}article.cherry-markdown h2{font-size:calc(var(--export-pdf-font-size,10.5pt)*1.619048)}.mermaid-viewport{overflow:visible}.mermaid-viewport>svg{max-width:100%!important;height:auto!important}}`;
  return html.replace('</head>', `<style>${css}</style></head>`);
}
