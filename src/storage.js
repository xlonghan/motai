import { toRaw } from 'vue';
const DATABASE = 'markdown-desk';
const STORE = 'workspace';
let databasePromise;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return databasePromise;
}

export async function loadWorkspace() {
  if (isTauri()) return invoke('load_workspace');
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadDiagramCache() {
  if(isTauri())return null; // Native startup supplies it with the workspace.
  const database=await openDatabase();
  return new Promise((resolve,reject)=>{const request=database.transaction(STORE,'readonly').objectStore(STORE).get('diagram-cache');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function saveDiagramCache(cache) {
  if(isTauri())return invoke('save_diagram_cache',{cache});
  const database=await openDatabase();
  return new Promise((resolve,reject)=>{const transaction=database.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(cache,'diagram-cache');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||new Error('图表缓存写入中断'));});
}

export async function saveWorkspace(workspace) {
  if (isTauri()) return invoke('save_workspace', { workspace });
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(workspace, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('本地保存中断'));
  });
}
import { invoke, isTauri } from '@tauri-apps/api/core';


export function plainRecords(records) { return records.map((record)=>({...toRaw(record)})); }

export async function loadFolderConnection() {
  if (isTauri()) return null;
  const database=await openDatabase();
  return new Promise((resolve,reject)=>{const request=database.transaction(STORE,'readonly').objectStore(STORE).get('folder');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
export async function saveFolderConnection(connection) {
  if (isTauri()) return;
  const database=await openDatabase();
  return new Promise((resolve,reject)=>{const transaction=database.transaction(STORE,'readwrite');transaction.objectStore(STORE).put(connection,'folder');transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
}
