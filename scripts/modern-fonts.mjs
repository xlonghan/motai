// Target browsers (including WebView2) use WOFF2. Remove legacy font sources
// before Vite resolves assets, so unused EOT/SVG/WOFF/TTF copies aren't embedded.
export function modernFontCss(css) {
  return css.replace(/@font-face\s*\{[^}]*\}/gi,face=>{
    const source=face.match(/url\([^)]*\)\s*format\(["']woff2["']\)/i)?.[0];
    if(!source)return face;
    return face.replace(/\bsrc\s*:[^;}]*;?/gi,'').replace(/\}$/,'src:'+source+';}');
  });
}
export function modernFontAssets() {
  return {
    name:'modern-font-assets',enforce:'pre',
    transform(code,id) {
      const path=id.replaceAll('\\','/').split('?')[0];
      if(/node_modules\/(?:katex\/dist\/katex\.min|cherry-markdown\/dist\/cherry-markdown)\.css$/.test(path))return {code:modernFontCss(code),map:null};
    },
  };
}
