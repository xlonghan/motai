// Metadata is small enough for startup. Markdown and bundled images are loaded
// separately, only when a web preset is opened; desktop content comes from disk.
export const builtinDocumentRecords=[
  {id:'welcome',name:'开始使用.md'},
  {id:'demo',name:'demo.md'},
  {id:'common-diagrams',name:'Mermaid 常用图表示例.md'},
  {id:'diagrams',name:'Mermaid 示例集.md'},
  {id:'architecture',name:'2026-Architecture-Blueprint.md'},
];
export function builtinRecord(name){const key=String(name||'').replace(/^\.\//,'').toLowerCase();return builtinDocumentRecords.find(entry=>entry.id.toLowerCase()===key||entry.name.toLowerCase()===key);}
export function isPresetDocument(document){return Boolean(document?.preset||!document?.path&&builtinRecord(document?.builtinId));}
export function normalizedDocumentPath(path){return String(path||'').replace(/^\\\\\?\\/,'').replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();}
export function presetEntryKey(document,entries,directory){
  if(document?.preset&&directory){const path=normalizedDocumentPath(document.path);return entries.find(entry=>normalizedDocumentPath(directory+'/'+entry.relativePath)===path)?.relativePath||'';}
  return !directory?builtinRecord(document?.builtinId)?.name||'':'';
}
export function createPresetTree(entries,query='',expanded=new Set()){
  const root=[],folders=new Map(),q=query.trim().toLowerCase();
  for(const entry of entries){
    const relative=entry.relativePath||entry.name;if(q&&!relative.toLowerCase().includes(q))continue;
    const parts=relative.split('/');let children=root,prefix='';
    if(parts.some(part=>!part||part==='.'||part==='..'))continue;
    parts.forEach((name,index)=>{
      prefix+=(prefix?'/':'')+name;
      if(index===parts.length-1)children.push({...entry,id:relative,path:relative,name,kind:'file',relativePath:relative});
      else {let folder=folders.get(prefix);if(!folder){folder={id:'preset-dir:'+prefix,path:prefix,name,kind:'directory',expanded:expanded.has(prefix)||Boolean(q),children:[]};folders.set(prefix,folder);children.push(folder);}children=folder.children;}
    });
  }
  function sort(items){
    const priority=name=>{const index=builtinDocumentRecords.findIndex(entry=>entry.name===name);return index<0?999:index;};
    items.sort((a,b)=>{
      if(a.kind!==b.kind)return a.kind==='directory'?-1:1;
      if(a.kind==='file'&&!a.path.includes('/')&&!b.path.includes('/'))return priority(a.name)-priority(b.name)||a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    for(const item of items)if(item.children)sort(item.children);
    return items;
  }
  return sort(root);
}
