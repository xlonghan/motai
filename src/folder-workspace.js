import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { platform } from './platform.js';
import {loadFolderConnection,saveFolderConnection} from './storage.js';
const handles = new Map();
const fallback = new Map();
const extensions = /\.(md|markdown|txt|mdown|mkd)$/i;
const ignored = new Set(['.git', '.svn', 'node_modules', 'target', '.cache']);
function sort(entries) { return entries.sort((a,b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'zh-CN', {numeric:true}) : a.kind === 'directory' ? -1 : 1)); }

export async function chooseFolder() {
  if (platform.native) {
    const path = await open({directory:true,multiple:false,title:'打开 Markdown 文件夹'});
    return path ? restoreFolder(path) : null;
  }
  if (!window.showDirectoryPicker) return undefined;
  const handle = await window.showDirectoryPicker({mode:'read'});
  
  let id=crypto.randomUUID();
  const previous=await loadFolderConnection().catch(()=>null);
  if(previous?.handle?.isSameEntry && await previous.handle.isSameEntry(handle).catch(()=>false)) id=previous.id;
  handles.set(id,handle);
  saveFolderConnection({id,name:handle.name,path:handle.name,handle}).catch(()=>{});
  return {id,name:handle.name,path:handle.name,kind:'directory',children:[],expanded:true,loaded:false,native:false};
}

export async function restoreFolder(path) {
  const folder = await invoke('open_folder', {path});
  return {...folder,id:folder.path,kind:'directory',children:[],expanded:true,loaded:false,native:true};
}

export async function folderChildren(entry) {
  if (entry.native) {
    const entries = await invoke('list_folder', {path:entry.path});
    return entries.map(item => ({...item,id:item.path,children:[],loaded:false,expanded:false,native:true}));
  }
  if (entry.loaded) return entry.children;
  const handle = handles.get(entry.id);
  if (!handle) return entry.children || [];
  const entries = [];
  for await (const [name, child] of handle.entries()) {
    if (ignored.has(name) || child.kind === 'file' && !extensions.test(name)) continue;
    const id = `${entry.id}/${name}`; handles.set(id,child);
    entries.push({id,name,path:`${entry.path}/${name}`,kind:child.kind,children:[],loaded:false,expanded:false,native:false});
    if (entries.length >= 2500) break;
  }
  return sort(entries);
}

export async function folderSelection(entry) {
  if (entry.native) return platform.openDocumentPath(entry.path);
  const handle = handles.get(entry.id);
  if (handle) return {file:await handle.getFile(),reference:handle};
  const file = fallback.get(entry.id);
  if (!file) throw new Error('文件夹连接已结束，请重新打开文件夹');
  return {file,reference:null};
}

export function folderFromFiles(files, rootId = crypto.randomUUID()) {
  
  const first = files[0]?.webkitRelativePath?.split('/')[0] || '已选择的文件夹';
  const root = {id:rootId,name:first,path:first,kind:'directory',children:[],loaded:true,expanded:true,native:false};
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    if (parts[0] === first) parts.shift();
    if(parts.some(part=>ignored.has(part)) || !/\.(md|markdown|txt|mdown|mkd|png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(file.name)) continue;
    fallback.set(`${root.id}/${parts.join('/')}`,file);
    if (!extensions.test(file.name)) continue;
    let parent = root;
    for (const [index,name] of parts.entries()) {
      const isFile = index === parts.length - 1;
      let node = parent.children.find(child => child.name === name);
      if (!node) {
        node = {id:`${parent.id}/${name}`,name,path:`${parent.path}/${name}`,kind:isFile?'file':'directory',children:[],loaded:true,expanded:false,native:false};
        parent.children.push(node);
      }
      if (isFile) fallback.set(node.id,file);
      parent = node;
    }
  }
  const order = node => { sort(node.children); node.children.filter(child=>child.kind==='directory').forEach(order); };
  order(root);
  return root;
}

async function relativeEntry(documentKey, source) {
  const rootId=documentKey.split('/')[0];
  const raw=decodeURIComponent(source.split('#')[0].split('?')[0]).replace(/\\/g,'/');
  if (/^[a-z]+:/i.test(raw)) throw new Error('这个链接不在已打开的文件夹内');
  const parts=raw.startsWith('/')?[]:documentKey.split('/').slice(1,-1);
  for (const part of raw.split('/')) {
    if (!part||part==='.') continue;
    if (part==='..') { if(!parts.length) throw new Error('链接超出已打开的文件夹'); parts.pop(); }
    else parts.push(part);
  }
  const id=`${rootId}/${parts.join('/')}`;
  const root=handles.get(rootId);
  if (!handles.has(id)&&root) {
    let directory=root;
    for (const name of parts.slice(0,-1)) directory=await directory.getDirectoryHandle(name);
    handles.set(id,await directory.getFileHandle(parts.at(-1)));
  }
  if (!handles.has(id)&&!fallback.has(id)) throw new Error('没有找到文件，请重新打开包含它的文件夹');
  return {id,path:parts.join('/'),name:parts.at(-1),kind:'file',native:false};
}
export async function relativeFolderDocument(documentKey, source) {
  const entry=await relativeEntry(documentKey,source);
  return {entry,selection:await folderSelection(entry)};
}
export async function browserFolderImage(documentKey, source) {
  const entry=await relativeEntry(documentKey,source);
  const {file}=await folderSelection(entry);
  if (!/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(file.name)||file.size>20*1024*1024) throw new Error('图片格式不支持或超过20MB');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('本地图片读取失败'));reader.readAsDataURL(file);});
}
platform.setFolderImageResolver(browserFolderImage);

export async function restoreBrowserFolder() {
  const saved=await loadFolderConnection().catch(()=>null);
  if(saved?.files) return restoreImportedFolder(saved);
  if(!saved?.handle?.queryPermission || await saved.handle.queryPermission({mode:'read'})!=='granted') return null;
  handles.set(saved.id,saved.handle);
  return {id:saved.id,name:saved.name,path:saved.path,kind:'directory',children:[],expanded:true,loaded:false,native:false};
}

export function folderCopyRecord(root) {
  const files=[...fallback.entries()].filter(([id])=>id.startsWith(root.id+'/')).map(([id,file])=>({path:file.webkitRelativePath||`${root.name}/${id.slice(root.id.length+1)}`,name:file.name,type:file.type||'',modified:file.lastModified||0,file}));
  const size=files.reduce((total,entry)=>total+(entry.file.size||0),0);
  return {id:root.id,name:root.name,path:root.path,files:files.length<=2500&&size<=20*1024*1024?files:null};
}
export async function rememberImportedFolder(root) { await saveFolderConnection(folderCopyRecord(root)); }
export function restoreImportedFolder(record) {
  const files=record.files.map(entry=>{
    const file=new File([entry.file],entry.name,{type:entry.type,lastModified:entry.modified});
    Object.defineProperty(file,'webkitRelativePath',{value:entry.path});
    return file;
  });
  return folderFromFiles(files,record.id);
}
