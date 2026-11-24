import { BoundedCache } from './bounded-cache.js';
import { svgDataUrl } from './builtin-library.js';
import { startupTimings } from './startup-metrics.js';
import { downloadBlob } from './export-document.js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { preferenceWriter } from './portable-preferences.js';

const native = isTauri();
let preferencesWrite;
function persistPreferences(){
  if(!native)return Promise.resolve();
  preferencesWrite??=preferenceWriter(localStorage,snapshot=>invoke('save_preferences',snapshot));
  return preferencesWrite();
}
let storageInfo=null;
let desktopOpening=0;
async function desktopFileJob(work){desktopOpening++;try{return await work();}finally{desktopOpening--;}}
let folderImageResolver;
const imageCache = new BoundedCache(32, 24 * 1024 * 1024);
const imagePending = new Map();
const imageFailures = new Map();
const imageSources = new WeakMap();
let imageBindings = new WeakMap();
// Cherry also inserts this URL directly into the src attribute of raw HTML images.
const pendingImage = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24"><text x="3" y="17" font-size="12" fill="#888">Loading image...</text></svg>');

function localImage(source, documentPath) {
  const key = `${documentPath}\n${source}`;
  if (imageCache.has(key)) return Promise.resolve(imageCache.get(key));
  if (imageFailures.has(key)) return Promise.reject(new Error(imageFailures.get(key)));
  if (!imagePending.has(key)) {
    const pending = (native ? invoke('read_image', { documentPath, source }) : folderImageResolver(documentPath, source))
      .then((url) => { imageCache.set(key, url); imageFailures.delete(key); return url; })
      .catch((error) => { imageFailures.set(key, String(error)); throw error; })
      .finally(() => imagePending.delete(key));
    imagePending.set(key, pending);
  }
  return imagePending.get(key);
}

function aborted() { return new DOMException('已取消', 'AbortError'); }

async function nativeSelection(path) {
  const document = await invoke('read_document', { path });
  return documentSelection(document);
}
function documentSelection(document){return {file:new File([document.markdown],document.name,{type:'text/markdown'}),reference:{path:document.path,modified:document.modified,managed:document.managed,preset:document.preset}};}

async function saveExportPath(filename, extension) {
  const defaultPath=await invoke('default_save_path',{filename,extension});
  const path = await save({ defaultPath, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
  if (!path) throw aborted();
  return path;
}

// The editor depends on this small adapter, not on a local HTTP server or a
// desktop filesystem implementation. A Tauri adapter can use native commands.
export const platform = {
  native,
  setStorageInfo(info){storageInfo=info;},
  persistPreferences,
  async openStorageFolder(folder){if(native)await invoke('open_storage_folder',{folder});},
  markdownAssociationStatus(){return invoke('markdown_association_status');},
  registerMarkdownAssociation(){return invoke('register_markdown_association');},
  unregisterMarkdownAssociation(){return invoke('unregister_markdown_association');},
  clearMarkdownOpenWithHistory(executableNames){return invoke('clear_markdown_open_with_history',{executableNames});},
  clearLegacyMarkdownOpenWithApps(executableNames){return invoke('clear_legacy_markdown_open_with_apps',{executableNames});},
  openMarkdownDefaultApps(){return invoke('open_markdown_default_apps');},
  async listPresets(){return native?invoke('list_presets'):[];},
  async openPreset(relativePath){return documentSelection(await invoke('read_preset',{relativePath}));},
  async createManagedDocument(name,content){return documentSelection(await invoke('create_managed_document',{name,content}));},
  async renameManagedDocument(reference,name){const result=await invoke('rename_managed_document',{path:reference.path,name,expectedModified:reference.modified});return {name:result.name,reference:{path:result.path,modified:result.modified,managed:result.managed}};},
  async logEvent(event,outcome='ok',elapsedMs=null){if(native)await invoke('app_event',{event,outcome,elapsedMs}).catch(()=>{});},
  isOpeningDocuments:()=>desktopOpening>0,
  hasPendingImages(documentPath){return Boolean(documentPath)&&[...imagePending.keys()].some(key=>key.startsWith(`${documentPath}\n`));},
  async startupEditorReady(){if(native)await invoke('startup_editor_ready',{attempt:Number(window.markdownDeskStartupAttempt||0)});},
  async failStartup(error,theme){if(native)await invoke('fail_startup',{theme,attempt:Number(window.markdownDeskStartupAttempt||0),message:String(error.message||error)});},
  async finishStartup(theme){
    if(!native)return;
    const attempt=Number(window.markdownDeskStartupAttempt||0);
    await invoke('finish_startup',{theme,attempt,timings:startupTimings()});
    await new Promise(resolve=>{const timer=setTimeout(resolve,100);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve();}));});
    await invoke('dismiss_splash',{attempt});
  },
  async systemDisplayScale() { return native ? getCurrentWindow().scaleFactor() : 1; },
  setFolderImageResolver(resolve) { folderImageResolver = resolve; },
  clearFolderImageFailures(rootId) { for (const key of imageFailures.keys()) if(key.replace(/\\/g,'/').startsWith(rootId.replace(/\\/g,'/')+'/')) imageFailures.delete(key); },
  async writeClipboard(text) {
    if (native) return (await import('@tauri-apps/plugin-clipboard-manager')).writeText(text);
    return navigator.clipboard.writeText(text);
  },
  async readClipboard() {
    if (native) return (await import('@tauri-apps/plugin-clipboard-manager')).readText();
    return navigator.clipboard.readText();
  },
  async updateWindow(title, theme) {
    document.title = title;
    document.documentElement.dataset.bootTheme=theme;
    if (native) {
      const window = getCurrentWindow();
      await Promise.all([window.setTitle(title), window.setTheme(theme)]);
    }
  },
  async openFiles() {
    if (native) {
      const paths = await open({ defaultPath:storageInfo?.documents,multiple: true, filters: [{ name: 'Markdown 文档', extensions: ['md', 'markdown', 'txt', 'mdown', 'mkd'] }] });
      if (!paths) throw aborted();
      return Promise.all((Array.isArray(paths) ? paths : [paths]).map(nativeSelection));
    }
    if (!window.showOpenFilePicker) return null;
    const handles = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Markdown 文档', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }] });
    return Promise.all(handles.map(async (reference) => ({ file: await reference.getFile(), reference })));
  },

  async saveMarkdown({ name, markdown, reference, saveAs }) {
    if (native) {
      const path = !saveAs && reference?.path ? reference.path : await saveExportPath(name, 'md');
      await invoke('write_text', { path, content: markdown, expectedModified: !saveAs && path === reference?.path ? reference.modified : null });
      const document = await invoke('read_document', { path });
      return { name: document.name, reference: { path: document.path, modified: document.modified,managed:document.managed,preset:document.preset }, message: 'Markdown 已保存到本地文件' };
    }
    let handle = saveAs ? null : reference;
    if (!handle && window.showSaveFilePicker) handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'Markdown 文档', accept: { 'text/markdown': ['.md'] } }] });
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(markdown);
      await writable.close();
      return { reference: handle, name: handle.name, message: 'Markdown 已保存到本地文件' };
    }
    downloadBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), name);
    return { name, message: 'Markdown 文件已下载' };
  },

  async openDocumentPath(path) { return nativeSelection(path); },
  async exportSvg(svg, filename) {
    if (native) {
      const path = await saveExportPath(filename, 'svg');
      await invoke('write_text', {path,content:svg,expectedModified:null});
    } else downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),filename);
  },
  async exportPdf(html, filename, options) {
    if (native) {
      const path = await saveExportPath(filename, 'pdf');
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const headings = [...parsed.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((heading) => ({ id: heading.id, text: heading.textContent, level: Number(heading.tagName[1]) }));
      await invoke('export_pdf', { html, path, headings, options });
      return;
    }
    const response = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || '请使用「启动.cmd」启动墨台，再导出 PDF');
    }
    downloadBlob(await response.blob(), filename);
  },

  async exportHtml(html, filename) {
    if (native) {
      const path = await saveExportPath(filename, 'html');
      await invoke('write_text', { path, content: html, expectedModified: null });
    } else downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), filename);
  },
  async exportSettings(content, filename) {
    if (native) {
      const path=await saveExportPath(filename,'json');
      await invoke('write_text',{path,content,expectedModified:null});
    } else downloadBlob(new Blob([content],{type:'application/json;charset=utf-8'}),filename);
  },
  clearRenderCaches() { imageCache.clear(); imageFailures.clear(); imageBindings=new WeakMap(); },

  imageUrl(source, documentPath) {
    if (!documentPath || (!native && !folderImageResolver) || /^(?:https?:|data:|blob:|#)/i.test(source)) return source;
    // Cherry's image hook is synchronous and can reuse rendered blocks.
    // Keep the source on the placeholder; hydrate each actual preview node.
    return `${pendingImage}#markdown-desk-source=${encodeURIComponent(source)}`;
  },

  hydrateImages(root, documentPath) {
    if (!documentPath || (!native && !folderImageResolver)) return;
    for (const image of root.querySelectorAll('img')) {
      let source = imageSources.get(image);
      if (!source) {
        const marker = image.getAttribute('src')?.split('#markdown-desk-source=')[1];
        if (!marker) continue;
        try { source = decodeURIComponent(marker); } catch { continue; }
        imageSources.set(image, source);
      }
      const key = `${documentPath}\n${source}`;
      if (imageBindings.get(image) === key && image.complete && image.naturalWidth && image.getAttribute('src')?.startsWith('data:')) continue;
      imageBindings.set(image, key);
      if (imageCache.has(key)) {
        const url = imageCache.get(key);
        if (image.getAttribute('src') !== url) image.src = url;
      }
      else localImage(source, documentPath).then((url) => {
        if (image.isConnected && root.contains(image) && imageBindings.get(image) === key) image.src = url;
      }).catch(() => {
        if (imageBindings.get(image) === key) image.src = source;
      });
    }
  },

  async waitForImages(documentPath) {
    if (!native && !folderImageResolver) return;
    while ([...imagePending.keys()].some((key) => key.startsWith(`${documentPath}\n`))) {
      await Promise.all([...imagePending.entries()].filter(([key]) => key.startsWith(`${documentPath}\n`)).map(([, pending]) => pending));
    }
    const failed = [...imageFailures.entries()].find(([key]) => key.startsWith(`${documentPath}\n`));
    if (failed) throw new Error(failed[1]);
  },

  async openRelative(documentPath, source) {
    const path = await invoke('relative_document_path', { documentPath, source });
    return nativeSelection(path);
  },

  async openExternal(url) { if (native) await invoke('open_external', { url }); },

  async bindDesktop({ onFiles, onBeforeClose, onError }) {
    if (!native) return () => {};
    const deliver = async (paths) => {
      for (const path of paths) {
        try { await onFiles([await nativeSelection(path)]); } catch (error) { onError(String(error)); }
      }
    };
    const drain = () => desktopFileJob(async()=>deliver(await invoke('take_launch_paths')));
    const bindings=await Promise.allSettled([
      listen('open-documents', ()=>drain().catch(error=>onError(String(error)))),
      getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') desktopFileJob(()=>deliver(event.payload.paths)).catch(error=>onError(String(error)));
      }),
      getCurrentWindow().onCloseRequested(async (event) => {
      await event.preventDefault();
      try { await onBeforeClose(); await getCurrentWindow().destroy(); } catch (error) { onError(String(error)); }
      }),
    ]);
    const cleanup=()=>{for(const binding of bindings)if(binding.status==='fulfilled')binding.value();};
    const failed=bindings.find(binding=>binding.status==='rejected');
    if(failed){cleanup();throw failed.reason;}
    try {await drain();} catch(error){cleanup();throw error;}
    return cleanup;
  },
};
