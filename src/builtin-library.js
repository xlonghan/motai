export function svgDataUrl(svg){return 'data:image/svg+xml,'+encodeURIComponent(svg).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());}

// Inline known local demo assets in the editable copy, so saving that copy does
// not depend on the original installation directory. Code examples stay literal.
export function inlineBuiltinAssets(markdown,assets){
  let fence='';let length=0;
  return markdown.split('\n').map(line=>{
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if(marker){if(!fence){fence=marker[1][0];length=marker[1].length;}else if(marker[1][0]===fence&&marker[1].length>=length&&!marker[2].trim())fence='';return line;}
    if(fence)return line;
    // Splitting inline code prevents rewriting a literal image-syntax example.
    return line.split(/(`+[^`]*`+)/g).map((part,index)=>index%2?part:part
      .replace(/(!\[[^\]\n]*\]\(<?)([^\s)>]+)(>?)(?=[\s)])/g,(all,start,source,end)=>assets[source]?start+assets[source]+end:all)
      .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi,(all,start,source,end)=>assets[source]?start+assets[source]+end:all)).join('');
  }).join('\n');
}

export function createBuiltinLibrary(records,assets={}){
  const cache=new Map();
  return {
    records:records.map(({id,name})=>({id,name})),
    get(name){
      const key=String(name||'').replace(/^\.\//,'').toLowerCase();
      const record=records.find(record=>record.id.toLowerCase()===key||record.name.toLowerCase()===key);
      if(!record)return null;
      if(!cache.has(record.id))cache.set(record.id,{...record,markdown:inlineBuiltinAssets(record.markdown,assets)});
      return cache.get(record.id);
    },
  };
}
