export const htmlThemes=[['preview','跟随编辑器预览'],['github','GitHub 风格'],['docs','技术文档'],['material','Material 风格'],['dark','深色技术文档'],['classic','经典样式']];
export const htmlTocPositions=[['left','左侧'],['right','右侧'],['top','正文开头'],['none','不显示']];
export const htmlTocStates=[['expanded','全部展开'],['compact','仅展开一级'],['collapsed','整体收起']];
export const HTML_TOC_COMMENT=' mt-html-toc-slot ';
export const HTML_TOC_SLOT='<!--'+HTML_TOC_COMMENT+'-->';
export const htmlTocWidthLimits={min:180,max:600,default:260};
export function normalizeHtmlTocWidth(value) {
  const width=value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):htmlTocWidthLimits.default;
  return Math.round(Math.max(htmlTocWidthLimits.min,Math.min(htmlTocWidthLimits.max,width)));
}
export function normalizeHtmlExportOptions(values={}) {
  return {
    theme:htmlThemes.some(([key])=>key===values.htmlTheme)?values.htmlTheme:'github',
    position:htmlTocPositions.some(([key])=>key===values.htmlTocPosition)?values.htmlTocPosition:'left',
    state:htmlTocStates.some(([key])=>key===values.htmlTocState)?values.htmlTocState:'expanded',
    depth:[1,2,3,4,5,6].includes(Number(values.htmlTocDepth))?Number(values.htmlTocDepth):3,
    tocWidth:normalizeHtmlTocWidth(values.htmlTocWidth),
    codeWrap:values.htmlCodeWrap===true,
  };
}
