<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Cherry from 'cherry-markdown/dist/cherry-markdown.core.esm.js';
import MermaidPlugin from 'cherry-markdown/dist/addons/cherry-code-block-mermaid-plugin.esm.js';
import { createLazyMermaid } from './lazy-mermaid.js';
import { waitForCurrentRender } from './export-readiness.js';
import { waitForStartupReady } from './startup.js';
import { markStartup } from './startup-metrics.js';
import { DiagramCache } from './diagram-cache.js';
import { dependencies as libraryVersions,version as appVersion } from '../package.json';
import { createMarkdownCompatibility, cleanHtmlImageSpacing, normalizeWikiFragments, prepareReadOnlyMarkdown, parseWikiLink, resolveWikiDocument } from './markdown-compat.js';
import {builtinDocumentRecords,builtinRecord,isPresetDocument,createPresetTree,presetEntryKey} from './preset-catalog.js';
import {compareDiskVersion,documentDigest,presetRefresh,legacyPresetId} from './preset-state.js';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'cherry-markdown/dist/cherry-markdown.css';
import Icon from './Icon.vue';
import MermaidMenu from './MermaidMenu.vue';
import ContextMenu from './ContextMenu.vue';
import FolderTree from './FolderTree.vue';
import { chooseFolder, restoreFolder, folderChildren, folderSelection, folderFromFiles, relativeFolderDocument, restoreBrowserFolder, rememberImportedFolder } from './folder-workspace.js';
import { normalizePdfOptions, withPdfOptions } from './pdf-options.js';
const EmojiPicker = defineAsyncComponent(() => import('./EmojiPicker.vue'));
import { createSaveQueue } from './save-queue.js';
import { editorMarkdown, switchEditorMode } from './editor-state.js';
import { createPageNavigator } from './page-navigation.js';
import { waitForFlagFont } from './emoji-font.js';
import { interfaceScales, normalizeInterfaceScale, adjacentInterfaceScale, sidebarDragWidth } from './display-settings.js';
import { commonMermaidCatalog, mermaidSnippet } from './mermaid-catalog.js';
import { applyDiagramAction, diagramAction, diagramSize, diagramSvg, mermaidFigures, prepareDiagrams, prepareExportDiagrams, standaloneDiagram } from './diagram-view.js';
import { installCherryIcons } from './cherry-icons.js';
import { analyzeMarkdown, createDocument, safeFileName, snippets } from './documents.js';
import { loadWorkspace, saveWorkspace, plainRecords, loadDiagramCache, saveDiagramCache } from './storage.js';
import { addExportToc, collectDocumentStyles, createHtmlDocument, inlineImages, waitForImages } from './export-document.js';
import { prepareHtmlExportBody } from './html-export.js';
import { platform } from './platform.js';
import { SETTINGS_KEY, settingsGroups, defaultSettings, normalizeSettings, readSettings, encodeSettings, fontFamilies } from './settings.js';
const SettingsPage = defineAsyncComponent(() => import('./SettingsPage.vue'));
const HtmlExportPreview = defineAsyncComponent(() => import('./HtmlExportPreview.vue'));
const props=defineProps({takeStartupData:Function});
const initialSettings = readSettings(localStorage,platform.native);
const settings = reactive(initialSettings.values);
const settingsTabOpen = ref(false);
const settingsActive = ref(false);
const settingsSaving = ref(false);
const settingsSaveError = ref('');
const nativeStorageInfo = ref(null);
const markdownAssociationStatus = ref(null);
const associationBusy = ref(false);
const associationError = ref('');
const associationStatusError = ref('');
const associationNotice = ref('');
const fileAssociation = computed(()=>{
  const status=markdownAssociationStatus.value;
  if(!platform.native||!(status?.supported??/\bWindows\b/i.test(navigator.userAgent)))return null;
  return {supported:true,...status,loaded:Boolean(status),busy:associationBusy.value,
    error:associationError.value||associationStatusError.value,notice:associationNotice.value};
});
let settingsSequence=0;
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(systemTheme.matches);
let settingsTimer;
let mermaidSettingsTimer;
let diagramSettingsDirty=false;
let diagramFitDirty=false;
let diagramRefresh=null;
let settingsReadingPosition=null;
function settingRef(key) { return computed({get:()=>settings[key],set:value=>updateSetting(key,value)}); }
function isPreviewDark() { return settings.previewTheme==='dark'||settings.previewTheme==='system'&&(settings.theme==='dark'||settings.theme==='system'&&systemDark.value); }
function mermaidTheme() { return settings.mermaidTheme==='auto'?(isPreviewDark()?'dark':'default'):settings.mermaidTheme; }


const mermaidWithFlags = createLazyMermaid({beforeRender:waitForFlagFont});
function mermaidOptions() { return {
  fontFamily: '"Markdown Desk Flags", Segoe UI, Microsoft YaHei, sans-serif',
  startOnLoad: false,
  securityLevel: 'antiscript',
  htmlLabels: true,
  // Apply the same wrapping rules while Mermaid measures its hidden labels and
  // after the SVG is inserted. Fractional browser zoom can otherwise bypass
  // Mermaid's exact-width check and leave a capped label set to nowrap.
  themeCSS: `.label { font-family: "Markdown Desk Flags", "Segoe UI", "Microsoft YaHei", sans-serif; }
    .label foreignObject { font-size: 100%; overflow: visible; }
    .label foreignObject > div { white-space: break-spaces !important; overflow-wrap: anywhere !important; word-break: normal !important; }
    .nodeLabel p, .edgeLabel p { margin: 0 !important; line-height: 1.5 !important; }
    .edgeLabel, .edgeLabel p, .edgeLabel span, .edgeLabel foreignObject div { background: transparent !important; background-color: transparent !important; }
    .edgeLabel rect, .labelBkg { fill: transparent !important; stroke: none !important; }`,
  theme: mermaidTheme(),
  themeVariables: { fontSize: `${settings.mermaidFontSize}px` },
  flowchart: { htmlLabels: true, useMaxWidth: false, wrappingWidth: settings.mermaidWrapWidth },
}; }
const mermaidRenderer = new MermaidPlugin({mermaid:mermaidWithFlags,mermaidAPI:mermaidWithFlags,...mermaidOptions()});
mermaidRenderer.contentRenderCacheMax = 24;
function diagramCacheSignature(){return JSON.stringify({format:1,mermaid:libraryVersions.mermaid,cherry:libraryVersions['cherry-markdown'],scale:devicePixelRatio,options:mermaidOptions()});}
const diagramCache = new DiagramCache(diagramCacheSignature());
mermaidRenderer.contentRenderCache = diagramCache;
mermaidRenderer.$getContentCacheKey=source=>source;
let diagramCacheTimer;
const flushDiagramCache=createSaveQueue(async snapshot=>{await saveDiagramCache(snapshot);diagramCache.markSaved(snapshot.revision);},()=>diagramCache.snapshot());
function scheduleDiagramCacheSave(){if(!diagramCache.dirty)return;clearTimeout(diagramCacheTimer);diagramCacheTimer=setTimeout(()=>flushDiagramCache().catch(console.warn),250);}
function persistDiagramCache(){clearTimeout(diagramCacheTimer);return diagramCache.dirty?flushDiagramCache():Promise.resolve();}
function saveOptionalDiagramCache(){persistDiagramCache().catch(console.warn);}

const documents = ref([]);
const activeId = ref('');
const openDocumentIds = ref([]);
const host = ref(null);
const input = ref(null);
const folderInput = ref(null);
const folderRoot = ref(null);
const savedFolderPath = ref('');
const folderVisible = ref(true);
const recentFiles = ref([]);
const interfaceScale = settingRef('interfaceScale');
const systemDisplayScale = ref(1);
const paneFontZoom = computed(()=>({editor:settings.editorFontSize-14,preview:settings.previewFontSize-15}));
const activePane = ref('editor');
const wordWrap = settingRef('wordWrap');
const workspaceStyles = computed(()=>({
  '--interface-scale':interfaceScale.value,
  '--editor-font-size':settings.editorFontSize+'px','--preview-font-size':settings.previewFontSize+'px',
  '--editor-font':'"Markdown Desk Flags",'+fontFamilies[settings.editorFont],
  '--preview-font':'"Markdown Desk Flags",'+fontFamilies[settings.previewFont],
  '--editor-line-height':settings.editorLineHeight,'--preview-line-height':settings.previewLineHeight,
  '--preview-padding':settings.previewPadding+'px','--preview-width':settings.previewWidth?settings.previewWidth+'px':'none',
  '--tab-width':settings.tabWidth,
}));
const activeHeadingLine = ref(0);
const showEmoji = ref(false);
const filter = ref('');
const mode = settingRef('viewMode');
const sidebar = settingRef('sidebarVisible');
const sidebarTab = settingRef('sidebarTab');
const sidebarWidth = settingRef('sidebarWidth');
const theme = computed({get:()=>settings.theme==='system'?(systemDark.value?'dark':'light'):settings.theme,set:value=>updateSetting('theme',value)});
const showHelp = ref(false);
const menu = ref('');
const presetEntries=ref(builtinDocumentRecords.map(entry=>({...entry,relativePath:entry.name})));
const presetOpening=ref(false);
const presetRootExpanded=ref(true),presetExpanded=reactive(new Set());
let builtinLibraryPromise;
function webBuiltinLibrary(){return builtinLibraryPromise??=import('./builtin-documents.js').then(module=>module.builtinLibrary);}
let presetListing;
const contextMenu = ref(null);
const loading = ref(true);
const fatalError = ref('');
const saving = ref(false);
const storageError = ref(false);
const rendering = ref(true);
const renderedDiagrams = ref(0);
const diagramError = ref(false);
const busy = ref(false);
const toast = ref('');
const renameId = ref('');
const renameValue = ref('');
const deletingId = ref('');
const printHtml = ref('');
const printBaseHtml = ref('');
const htmlSnapshot = ref(null);
const htmlSaving = ref(false);
const htmlPreview = ref(null);
const pdfOptions = computed({get:()=>({paper:settings.pdfPaper,landscape:settings.pdfLandscape,margin:settings.pdfMargin}),set:value=>patchSettings({pdfPaper:value.paper,pdfLandscape:value.landscape,pdfMargin:value.margin})});
const printReady = ref(false);
const printFrame = ref(null);
const lastSaved = ref(0);
const exportToc = settingRef('exportToc');
const htmlHasToc = computed({get:()=>settings.htmlTocPosition!=='none',set:value=>updateSetting('htmlTocPosition',value?'left':'none')});
const pdfDownloading = ref(false);
const diagramViewer = ref(null);
const viewerZoom = ref(1);
let cherry;
let pageNavigator;
let persistTimer;
let persistMaxTimer;
let toastTimer;
let loadedDocument = '';
let lastRenderedMarkdown = null;
let renderConfigVersion=0,lastRenderedConfigVersion=-1,lastRenderedDocument='';
let lastRenderedSourceDoc=null,startupCancelled=false,startupContinue=false;
let persistSequence = 0;
let resetScrollOnRender = true;
let desktopCleanup = () => {};
let cherryIconCleanup = () => {};
const fileHandles = new Map();
const diskChanges = reactive(new Map());
const diskOperations = reactive(new Set());
const diskChangeDialog = ref(null);
const diskReloadMessage = ref('');
const observedDiskStamps = new Map();
const pendingDiskReads = new Map();
let diskCheckTimer;
let checkingOpenDiskFiles = false;
let forceDiskCheckPending = false;
const fontWheelTime = {editor:0,preview:0};

const active = computed(() => documents.value.find((document) => document.id === activeId.value));
const activeDiskChange = computed(() => diskChanges.get(activeId.value));
const showDiskChange = computed(() => hasUnacknowledgedDiskChange(active.value));
const showDiskChangeDialog = computed(() => showDiskChange.value && !loading.value && !settingsActive.value &&
  !renameId.value && !deletingId.value && !showHelp.value && !diagramViewer.value && !htmlSnapshot.value && !printHtml.value);
const diskReloadNeedsBackup = computed(() => Boolean(activeDiskChange.value &&
  (activeDiskChange.value.kind !== 'clean' || active.value?.markdown !== activeDiskChange.value.cleanDraft)));
const openDocuments = computed(() => openDocumentIds.value.map((id) => documents.value.find((document) => document.id === id)).filter(Boolean));
const activeDirectory = computed(() => active.value?.path?.replace(/[/\\][^/\\]+$/, '') || '本地文档');
const currentPresetKey=computed(()=>presetEntryKey(active.value,presetEntries.value,nativeStorageInfo.value?.builtin));
const presetTree=computed(()=>createPresetTree(presetEntries.value,filter.value,presetExpanded));
const workspaceDocuments=computed(()=>documents.value.filter(document=>platform.native?!document.preset||!presetEntryKey(document,presetEntries.value,nativeStorageInfo.value?.builtin):!isPresetDocument(document)));
const filteredDocuments = computed(() => workspaceDocuments.value.filter((document) => document.name.toLowerCase().includes(filter.value.toLowerCase())));
const documentAnalysis = computed(() => analyzeMarkdown(active.value?.markdown || ''));
const headings = computed(() => documentAnalysis.value.headings);
const characterCount = computed(() => documentAnalysis.value.characters.toLocaleString());
const lineCount = computed(() => active.value ? documentAnalysis.value.lines : 0);
const chartCount = computed(() => documentAnalysis.value.diagrams);
const deletedDocument = computed(() => documents.value.find((document) => document.id === deletingId.value));
const renderLabel = computed(() => diagramError.value ? '有图表未渲染，请检查源码' : rendering.value ? '正在渲染…' : chartCount.value ? `${renderedDiagrams.value} 个图表已渲染` : '预览已更新');

watch([() => settingsActive.value?'设置':active.value?.name, theme], ([name, currentTheme]) => {
  platform.updateWindow(name ? `${name} - 墨台` : '墨台', currentTheme).catch(console.error);
}, { immediate: true });

watch(showDiskChangeDialog, visible => {
  const dialog = diskChangeDialog.value;
  if (!dialog) return;
  if (visible && !dialog.open) {
    diskReloadMessage.value = '';
    menu.value = '';
    contextMenu.value = null;
    dialog.showModal();
  } else if (!visible && dialog.open) dialog.close();
}, { flush: 'post' });

function notify(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, settings.noticeMs);
}

function patchSettings(patch) {
  const normalized=normalizeSettings({...settings,...patch},platform.native);
  for (const [key,value] of Object.entries(normalized)) {
    if (Array.isArray(value)?JSON.stringify(value)!==JSON.stringify(settings[key]):!Object.is(value,settings[key])) settings[key]=value;
  }
}
function updateSetting(key,value) { patchSettings({[key]:value}); }
async function flushSettings() {
  clearTimeout(settingsTimer);
  const sequence=++settingsSequence;settingsSaving.value=true;
  try {
    localStorage.setItem(SETTINGS_KEY,encodeSettings(settings,platform.native));
    await platform.persistPreferences();
    if(sequence===settingsSequence)settingsSaveError.value='';
    return true;
  } catch(error){if(sequence===settingsSequence)settingsSaveError.value=error.message||String(error)||'无法保存本机设置';return false;}
  finally{if(sequence===settingsSequence)settingsSaving.value=false;}
}
async function persistEmojiPreferences(){if(!await flushSettings())notify('表情偏好保存失败：'+settingsSaveError.value);}
async function openStorageFolder(folder){try{await platform.openStorageFolder(folder);}catch(error){notify(error.message||String(error));}}
async function runAssociationAction(request,executableNames){
  if(!platform.native||associationBusy.value)return;
  const checking=request===platform.markdownAssociationStatus;
  const registering=request===platform.registerMarkdownAssociation;
  const unregistering=request===platform.unregisterMarkdownAssociation;
  const openingDefaults=request===platform.openMarkdownDefaultApps;
  const clearingHistory=request===platform.clearMarkdownOpenWithHistory;
  const clearingLegacy=request===platform.clearLegacyMarkdownOpenWithApps;
  const clearing=clearingHistory||clearingLegacy;
  if(clearing&&!executableNames?.length)return;
  associationBusy.value=true;
  if(!checking){associationError.value='';associationNotice.value='';}
  try{
    if(openingDefaults&&markdownAssociationStatus.value?.isDefault!==true&&!markdownAssociationStatus.value?.registered){
      const registration=await platform.registerMarkdownAssociation();
      if(!registration?.registered)throw new Error('Windows 尚未确认完整登记，请刷新状态后重试。');
      markdownAssociationStatus.value=registration;
      associationStatusError.value='';
    }
    const status=clearing?await request(executableNames):await request();
    if(status){markdownAssociationStatus.value=status;associationStatusError.value='';}
    if(registering){
      if(!status?.registered)throw new Error('Windows 尚未确认完整登记，请刷新状态后重试。');
      associationNotice.value='已添加到 .md 的打开方式。';
    }else if(unregistering){
      if(!status||status.registered||status.hasOwnedRegistration&&!status.defaultHandlerRetained)throw new Error('Windows 尚未确认登记已清理，请刷新状态后重试移除。');
      associationNotice.value='已撤销此副本的打开方式登记。';
    }else if(clearing){
      const remaining=clearingHistory?status?.openWithHistory:status?.legacyOpenWithApps?.map(item=>item.name);
      if(!remaining||executableNames.some(name=>remaining.includes(name)))throw new Error('仍有选中的打开方式条目，请刷新状态后重试。');
      associationNotice.value=clearingHistory?'已清理所列 .md 打开记录。':'已清理所列旧墨台的 Windows 登记。';
    }
  }catch(error){
    const message=error?.message||String(error);
    if(checking)associationStatusError.value=message;
    else associationError.value=message;
    if(registering||unregistering||openingDefaults||clearing){
      const status=await platform.markdownAssociationStatus().catch(()=>null);
      if(status){markdownAssociationStatus.value=status;associationStatusError.value='';}
    }
  }
  finally{associationBusy.value=false;}
}
function refreshFileAssociation(){
  if(settingsActive.value)void runAssociationAction(platform.markdownAssociationStatus);
}
async function refreshPresets(showNotice=false){
  if(!platform.native){if(showNotice)notify('网页使用源码 builtin 目录中的预置文档，修改后请重新构建');return;}
  presetListing??=platform.listPresets().then(entries=>{presetEntries.value=entries;}).finally(()=>{presetListing=null;});
  try{await presetListing;if(showNotice)notify('预置文档目录已刷新，点击文档即可读取最新内容');}catch(error){notify('读取预置目录失败：'+(error.message||String(error)));}
}
function togglePresetFolder(entry){if(presetExpanded.has(entry.path))presetExpanded.delete(entry.path);else presetExpanded.add(entry.path);}
watch(menu,value=>{if(value==='help')void refreshPresets();});
function openSettings() { settingsTabOpen.value=true;settingsActive.value=true;menu.value='';contextMenu.value=null;showEmoji.value=false;diagramViewer.value=null;if(!pdfDownloading.value)closePdfPreview();closeHtmlPreview();nextTick(()=>document.querySelector('.settings-search input')?.focus()); }
function closeSettings() { settingsTabOpen.value=false;settingsActive.value=false;flushSettings();nextTick(requestEditorMeasure); }
function closeCurrentTab(){if(settingsActive.value)closeSettings();else closeDocumentTab(activeId.value);}
function resetSettingsGroup(id) {
  const defaults=defaultSettings(platform.native), group=settingsGroups.find(group=>group.id===id);
  if(group)patchSettings(Object.fromEntries(group.fields.map(field=>[field.key,defaults[field.key]])));
}
function resetAllSettings() { patchSettings(defaultSettings(platform.native)); }
async function exportSettings() {
  try { await platform.exportSettings(encodeSettings(settings,platform.native),'墨台设置.json');notify('设置已导出'); }
  catch(error){if(error.name!=='AbortError')notify(error.message||String(error));}
}
async function importSettings(values) { patchSettings(values);const saved=await flushSettings();notify(saved?'设置已导入并保存':'设置已生效，保存失败：'+settingsSaveError.value); }
async function clearRenderCaches() { diagramCache.clear();platform.clearRenderCaches();clearTimeout(diagramCacheTimer);try{await flushDiagramCache();notify('渲染缓存已清理，文档和草稿已保留');}catch(error){notify('临时缓存已清理，本地缓存写入失败：'+String(error));} }
const themeChanged=event=>{systemDark.value=event.matches;};
watch(settings,()=>{settingsSaving.value=true;clearTimeout(settingsTimer);settingsTimer=setTimeout(flushSettings,200);},{deep:true});
watch(()=>settings.viewMode,(value)=>{if(cherry){switchEditorMode(cherry,value);nextTick(()=>requestAnimationFrame(requestEditorMeasure));schedulePersist();}},{flush:'sync'});
watch(()=>[settings.editorFont,settings.editorFontSize,settings.editorLineHeight,settings.wordWrap,settings.tabWidth,settings.highlightLine],()=>nextTick(requestEditorMeasure));
watch(()=>[settings.pdfPaper,settings.pdfLandscape,settings.pdfMargin],()=>updatePdfLayout());
watch(()=>settings.previewCodeWrap,value=>{cherry?.setCodeWrap(value?'wrap':'nowrap');});
watch(isPreviewDark,dark=>{pageNavigator?.preserveScroll(()=>cherry.setCodeBlockTheme(dark?'vs-dark':'default'));});
watch(()=>settings.recentFilesLimit,limit=>{recentFiles.value=recentFiles.value.slice(0,limit);schedulePersist();});
function applyMermaidSettings() {
  clearTimeout(mermaidSettingsTimer);mermaidSettingsTimer=null;
  Object.assign(mermaidRenderer.options,mermaidOptions());
  mermaidWithFlags.initialize(mermaidRenderer.options);
  diagramCache.configure(diagramCacheSignature());diagramSettingsDirty=false;diagramFitDirty=false;
  scheduleDiagramCacheSave();
  if(cherry&&active.value&&(documentAnalysis.value.diagrams||cherry.getPreviewer().getDom().querySelector('figure[data-type="mermaid"]'))){
    renderConfigVersion++;
    refreshDiagrams();
  }
}
function applyDiagramFit() {
  diagramFitDirty=false;
  if(cherry)for(const figure of mermaidFigures(cherry.getPreviewer().getDom()))applyDiagramAction(figure,settings.mermaidFit==='fit'?'fit':'reset',openDiagramViewer);
}
watch(()=>settings.mermaidFit,()=>{diagramFitDirty=true;if(!settingsActive.value)nextTick(applyDiagramFit);});
watch([mermaidTheme,()=>settings.mermaidFontSize,()=>settings.mermaidWrapWidth],()=>{
  diagramSettingsDirty=true;clearTimeout(mermaidSettingsTimer);
  mermaidSettingsTimer=setTimeout(()=>{mermaidSettingsTimer=null;if(!settingsActive.value)applyMermaidSettings();},250);
});
watch(settingsActive,value=>{
  if(value){
    settingsReadingPosition={id:activeId.value,scroll:pageNavigator?.captureScroll()};
    refreshFileAssociation();
    return;
  }
  const position=settingsReadingPosition;
  settingsReadingPosition=null;
  nextTick(()=>requestAnimationFrame(()=>{
    if(settingsActive.value)return;
    requestEditorMeasure();
    if(position?.id===activeId.value)pageNavigator?.restoreScroll(position.scroll);
    if(diagramSettingsDirty)applyMermaidSettings();
    else if(diagramFitDirty)pageNavigator?.preserveScroll(applyDiagramFit);
  }));
},{flush:'sync'});

function snapshot() {
  if (active.value && cherry && loadedDocument === activeId.value) active.value.markdown = editorMarkdown(cherry);
  return {
    documents: plainRecords(documents.value),
    activeId: activeId.value,
    openDocumentIds: [...openDocumentIds.value],
    mode: mode.value,
    sidebar: sidebar.value,
    sidebarWidth: sidebarWidth.value,
    recentFiles: plainRecords(recentFiles.value),
    folderVisible: folderVisible.value,
    folderPath: folderRoot.value?.native ? folderRoot.value.path : savedFolderPath.value,
  };
}

const flushWorkspace = createSaveQueue(saveWorkspace, snapshot);

async function persist() {
  clearTimeout(persistTimer);
  clearTimeout(persistMaxTimer);
  persistMaxTimer = null;
  const sequence = ++persistSequence;
  saving.value = true;
  try {
    await flushWorkspace();
    if (sequence !== persistSequence) return;
    storageError.value = false;
    lastSaved.value = Date.now();
  } catch (error) {
    storageError.value = true;
    notify('本地草稿保存失败，请立即使用「保存 .md」备份文件');
    console.error(error);
  } finally {
    if (sequence === persistSequence) saving.value = false;
  }
}

function schedulePersist() {
  saving.value = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, settings.autosaveMs);
  persistMaxTimer ||= setTimeout(persist, Math.max(5000,settings.autosaveMs*3));
}

function contentChanged(markdown) {
  if (!active.value || loadedDocument !== activeId.value) return;
  if (cherry && editorMarkdown(cherry) !== markdown) return;
  if (cherry) queueMicrotask(() => platform.hydrateImages(cherry.getPreviewer().getDom(), (active.value?.path || active.value?.folderKey)));
  if (active.value.markdown !== markdown) {
    active.value.markdown = markdown;
    active.value.updatedAt = Date.now();
    schedulePersist();
  }
  rendering.value = true;
}

function renderingFinished(markdown,refresh) {
  if (!cherry || editorMarkdown(cherry) !== markdown || active.value?.markdown !== markdown) return;
  if(refresh!==diagramRefresh)return;
  const source=cherry.getCodeMirror().state.doc;
  const preview=cherry.getPreviewer().getDom();
  const replacement=refresh?.source===source&&refresh.id===activeId.value?mermaidFigures(refresh.staging):null;
  const figures=mermaidFigures(preview);
  discardDiagramRefresh();
  // An edit can finish while diagrams are picking up the new theme.
  // Apply it to the current document before marking the preview ready.
  if(refresh&&!replacement&&figures.length){
    refreshDiagrams({previewIsCurrent:true});
    return;
  }
  if(replacement&&(replacement.length!==figures.length||figures.some((figure,index)=>figure.dataset.sign!==replacement[index].dataset.sign))){
    pageNavigator.preserveScroll(refreshPreview);
    return;
  }
  markStartup('preview-rendered');
  lastRenderedMarkdown = markdown;
  lastRenderedDocument=activeId.value;lastRenderedConfigVersion=renderConfigVersion;
  lastRenderedSourceDoc=source;
  rendering.value = false;
  pageNavigator?.invalidate();
  cleanHtmlImageSpacing(preview);
  normalizeWikiFragments(preview);
  platform.hydrateImages(preview, (active.value?.path || active.value?.folderKey));
  const prepare=()=>prepareDiagrams(preview,figures,settings.mermaidFit==='fit',mermaidTheme()==='dark'?'#202428':'#fff');
  if(replacement)pageNavigator.preserveScroll(()=>{
    figures.forEach((figure,index)=>figure.replaceChildren(...replacement[index].childNodes));
    prepare();
  });
  else prepare();
  if(settingsActive.value&&figures.length&&settings.mermaidFit==='fit')diagramFitDirty=true;
  const previousDiagramError=diagramError.value;
  renderedDiagrams.value = figures.filter((figure) => diagramSvg(figure) && !figure.querySelector('svg[aria-roledescription="error"],.error-icon')).length;
  diagramError.value = renderedDiagrams.value !== documentAnalysis.value.diagrams || Boolean(preview.querySelector('svg[aria-roledescription="error"],.error-icon,.cherry-mermaid-error'));
  if(diagramError.value&&!previousDiagramError)void platform.logEvent('render','failed');
  scheduleDiagramCacheSave();
  if (resetScrollOnRender) {
    resetScrollOnRender = false;
    requestAnimationFrame(() => {
      preview.scrollTop = 0;
      cherry.getCodeMirror().scrollDOM.scrollTop = 0;
    });
  }
}

async function activateDocument(id, checkDisk = true) {
  if (busy.value || !documents.value.some((document) => document.id === id)) return;
  if (!openDocumentIds.value.includes(id)) {
    openDocumentIds.value.push(id);
    if (checkDisk && cherry && !diskOperations.has(id)) void checkDocumentDisk(documents.value.find(document => document.id === id)).catch(() => {});
  }
  settingsActive.value=false;
  nextTick(requestEditorMeasure);
  if (activeId.value === id) return;
  rememberRecent(documents.value.find((document) => document.id === id));
  if (active.value && cherry) active.value.markdown = editorMarkdown(cherry);
  activeId.value = id;
  loadedDocument = id;
  showEditorDocument(active.value.markdown);
  schedulePersist();
}

function showEditorDocument(markdown) {
  discardDiagramRefresh();
  lastRenderedMarkdown = null;
  lastRenderedDocument='';lastRenderedConfigVersion=-1;lastRenderedSourceDoc=null;
  rendering.value = true;
  diagramError.value = false;
  renderedDiagrams.value = 0;
  resetScrollOnRender = true;
  cherry?.setValue(markdown);
  cherry?.clearUndoRedo();
}

async function closeDocumentTab(id) {
  if (busy.value || pdfDownloading.value) return;
  const index = openDocumentIds.value.indexOf(id);
  if (index < 0) return;
  if (activeId.value === id && cherry && active.value) active.value.markdown = editorMarkdown(cherry);
  openDocumentIds.value = openDocumentIds.value.filter((item) => item !== id);
  if (activeId.value === id) {
    const nextId = openDocumentIds.value[Math.min(index, openDocumentIds.value.length - 1)];
    if (nextId) await activateDocument(nextId);
    else {
      discardDiagramRefresh();
      activeId.value = '';
      loadedDocument = '';
      cherry?.setValue('');
      cherry?.clearUndoRedo();
      rendering.value = false;
      diagramError.value = false;
      renderedDiagrams.value = 0;
    }
  }
  schedulePersist();
}

function toggleSidebar() {
  sidebar.value = !sidebar.value;
  menu.value = '';
  schedulePersist();
}

function resizeSidebar(event) {
  if (event.button !== 0) return;
  const separator = event.currentTarget;
  separator.setPointerCapture(event.pointerId);
  const start = event.clientX;
  const width = sidebarWidth.value;
  const move = (next) => { sidebarWidth.value = sidebarDragWidth(width,next.clientX-start,interfaceScale.value,window.innerWidth); };
  const finish = () => {
    separator.removeEventListener('pointermove', move);
    separator.removeEventListener('pointerup', finish);
    separator.removeEventListener('lostpointercapture', finish);
    schedulePersist();
  };
  separator.addEventListener('pointermove', move);
  separator.addEventListener('pointerup', finish);
  separator.addEventListener('lostpointercapture', finish);
}

function editorCommand(command, argument) {
  menu.value = '';
  if (!cherry || !active.value || busy.value || settingsActive.value) return;
  if (mode.value === 'previewOnly') setMode('edit&preview');
  cherry.getCodeMirror().focus();
  cherry.toolbar.toolbarHandlers[command]?.(argument);
}

function refreshPreview() {
  menu.value = '';
  if (!active.value || !cherry) return;
  discardDiagramRefresh();
  rendering.value = true;
  lastRenderedMarkdown=null;
  cherry.refreshPreviewer(true);
}

function discardDiagramRefresh(){
  diagramRefresh?.staging.remove();
  diagramRefresh=null;
}

function refreshDiagrams({previewIsCurrent=false}={}){
  const source=cherry.getCodeMirror().state.doc;
  if(!previewIsCurrent&&(lastRenderedSourceDoc!==source||lastRenderedDocument!==activeId.value)){
    pageNavigator.preserveScroll(refreshPreview);
    return;
  }
  discardDiagramRefresh();
  const staging=document.createElement('div');
  staging.hidden=true;
  diagramRefresh={id:activeId.value,source,staging};
  rendering.value=true;
  lastRenderedMarkdown=null;
  // The async renderer finds Mermaid placeholders under Cherry's wrapper.
  // Keep them separate from the visible preview until the diagrams are ready.
  try{
    cherry.clearEngineCache();
    const fragment=document.createElement('template');
    fragment.innerHTML=cherry.engine.makeHtml(editorMarkdown(cherry));
    staging.append(...mermaidFigures(fragment.content));
    cherry.wrapperDom.append(staging);
  }catch(error){
    discardDiagramRefresh();
    throw error;
  }
}

async function newDocument() {
  if (busy.value) return;
  try {
    const markdown=settings.newDocumentTemplate.replaceAll('{{title}}','未命名文档');
    let document;
    if(platform.native){const selection=await platform.createManagedDocument('未命名文档.md',markdown);document=await importFile(selection.file,selection.reference);}
    else {document=createDocument('未命名文档.md',markdown);documents.value.unshift(document);await activateDocument(document.id);}
    await nextTick();beginRename(document);
  }catch(error){notify('新建失败：'+(error.message||String(error)));}
}

function beginRename(document) {
  renameId.value = document.id;
  renameValue.value = document.name.replace(/\.md$/i, '');
  menu.value = '';
  nextTick(() => globalThis.document.querySelector('.rename-dialog input')?.select());
}

async function applyRename() {
  const document = documents.value.find((document) => document.id === renameId.value);
  if (document) {
    try {
      const reference=fileHandles.get(document.id);
      if(platform.native&&reference?.managed){
        const oldPath=document.path;
        const result=await platform.renameManagedDocument(reference,safeFileName(renameValue.value));
        fileHandles.set(document.id,result.reference);
        Object.assign(document,{name:result.name,...result.reference});
        observedDiskStamps.delete(document.id);
        diskChanges.delete(document.id);
        delete document.dismissedDiskHash;
        for(const recent of recentFiles.value)if(recent.path===oldPath)Object.assign(recent,{name:result.name,...result.reference});
      }else document.name = safeFileName(renameValue.value);
      document.updatedAt = Date.now();schedulePersist();
    }catch(error){notify('重命名失败：'+(error.message||String(error)));return;}
  }
  renameId.value = '';
}

async function removeDocument() {
  const id = deletingId.value;
  deletingId.value = '';
  if (documents.value.length === 1) {
    documents.value.push(createDocument('未命名文档.md', '# 未命名文档\n\n'));
  }
  if (activeId.value === id) await activateDocument(documents.value.find((document) => document.id !== id).id);
  documents.value = documents.value.filter((document) => document.id !== id);
  openDocumentIds.value = openDocumentIds.value.filter((item) => item !== id);
  fileHandles.delete(id);
  diskChanges.delete(id);
  observedDiskStamps.delete(id);
  recentFiles.value = recentFiles.value.filter(entry=>entry.id!==id || entry.path);
  await persist();
}

function liveDocumentMarkdown(document) {
  return activeId.value === document.id && cherry ? editorMarkdown(cherry) : document.markdown;
}

function nativeEditableDocument(document) {
  return platform.native && document?.path && !document.preset;
}

function hasUnacknowledgedDiskChange(document) {
  const change = diskChanges.get(document?.id);
  return Boolean(change && change.hash !== document.dismissedDiskHash);
}

function trackDiskBaseline(document, reference, hash) {
  Object.assign(document, reference, { diskHash: hash });
  fileHandles.set(document.id, reference);
  observedDiskStamps.set(document.id, reference.diskStamp);
  diskChanges.delete(document.id);
  delete document.dismissedDiskHash;
}

async function checkDocumentDisk(document, incoming = null, draftToCompare = null) {
  if (!nativeEditableDocument(document)) return;
  const { id } = document;
  const original = fileHandles.get(id);
  const read = Symbol();
  pendingDiskReads.set(id, read);
  try {
    if (!incoming) {
      const selection = await platform.openDocumentPath(document.path);
      incoming = { markdown: await selection.file.text(), reference: selection.reference };
    }
    const hash = incoming.hash ?? await documentDigest(incoming.markdown);
    const baseline = document.diskHash;
    const draft = draftToCompare ?? liveDocumentMarkdown(document);
    const draftHash = hash === baseline ? baseline : await documentDigest(draft);
    if (pendingDiskReads.get(id) !== read || fileHandles.get(id) !== original ||
        document.path.toLowerCase() !== incoming.reference.path.toLowerCase()) return;
    const kind = compareDiskVersion({ baseline, draft: draftHash, incoming: hash });
    if (kind === 'current') {
      diskChanges.delete(id);
      if (document.diskHash !== hash || document.diskStamp !== incoming.reference.diskStamp || document.dismissedDiskHash) {
        trackDiskBaseline(document, incoming.reference, hash);
        schedulePersist();
      }
    } else {
      diskChanges.set(id, { hash, kind, cleanDraft: kind === 'clean' ? draft : null });
    }
    observedDiskStamps.set(id, incoming.reference.diskStamp);
    return { ...incoming, hash, kind };
  } finally {
    if (pendingDiskReads.get(id) === read) pendingDiskReads.delete(id);
  }
}

async function checkOpenDiskFiles(force = false) {
  if (startupCancelled) return;
  if (checkingOpenDiskFiles) {
    forceDiskCheckPending ||= force;
    return;
  }
  const open = openDocuments.value.filter(document => nativeEditableDocument(document) && !diskOperations.has(document.id));
  if (!open.length) return;
  checkingOpenDiskFiles = true;
  try {
    const stamps = force ? [] : await platform.documentDiskStamps(open.map(document => document.path));
    await Promise.allSettled(open.map((document, index) => {
      if (diskOperations.has(document.id) || pendingDiskReads.has(document.id)) return;
      if (force) return checkDocumentDisk(document);
      const stamp = stamps[index];
      if (!stamp) observedDiskStamps.delete(document.id);
      else if (stamp !== observedDiskStamps.get(document.id)) return checkDocumentDisk(document);
    }));
  } catch (error) {
    console.warn(error);
  } finally {
    checkingOpenDiskFiles = false;
    if (forceDiskCheckPending) {
      forceDiskCheckPending = false;
      void checkOpenDiskFiles(true);
    }
  }
}

function checkDiskOnFocus() { void checkOpenDiskFiles(true); }

async function openWorkspaceDocument(document) {
  await activateDocument(document.id, false);
  if (!diskOperations.has(document.id)) await checkDocumentDisk(document).catch(() => {});
}

function dismissDiskChange() {
  if (!activeDiskChange.value || diskOperations.has(activeId.value)) return;
  active.value.dismissedDiskHash = activeDiskChange.value.hash;
  schedulePersist();
}

function showDismissedDiskChange() {
  menu.value = '';
  delete active.value.dismissedDiskHash;
  schedulePersist();
}

async function requestDiskReload(document) {
  if (busy.value || !diskChanges.has(document.id) || diskOperations.has(document.id)) return;
  await activateDocument(document.id, false);
  if (activeId.value !== document.id || !diskChanges.has(document.id)) return;
  if (diskReloadNeedsBackup.value) {
    showDismissedDiskChange();
    return;
  }
  await reloadDiskDocument(false);
}

async function reloadDiskDocument(allowBackup) {
  const document = active.value;
  if (!document || diskOperations.has(document.id)) return;
  diskReloadMessage.value = '';
  diskOperations.add(document.id);
  try {
    const incoming = await checkDocumentDisk(document);
    if (!incoming || incoming.kind === 'current') return;
    const draft = liveDocumentMarkdown(document);
    const reference = fileHandles.get(document.id);
    if (incoming.kind !== 'clean' || draft !== diskChanges.get(document.id)?.cleanDraft) {
      if (!allowBackup) {
        if (activeId.value === document.id) showDismissedDiskChange();
        return;
      }
      const backup = createDocument(document.name.replace(/\.md$/i, '') + '（磁盘更新前草稿）.md', draft);
      documents.value.unshift(backup);
      try {
        await flushWorkspace();
      } catch (error) {
        documents.value = documents.value.filter(item => item.id !== backup.id);
        throw error;
      }
      if (liveDocumentMarkdown(document) !== draft) {
        diskReloadMessage.value = '草稿已备份。编辑内容在备份期间又有变化，请重新确认载入。';
        return;
      }
    }
    if (fileHandles.get(document.id) !== reference) return;
    trackDiskBaseline(document, incoming.reference, incoming.hash);
    document.markdown = incoming.markdown;
    if (activeId.value === document.id) showEditorDocument(incoming.markdown);
    schedulePersist();
  } catch (error) {
    const message = '重新载入失败：' + (error.message || String(error));
    if (activeId.value === document.id && diskChangeDialog.value?.open) diskReloadMessage.value = message;
    else notify(message);
  } finally {
    diskOperations.delete(document.id);
  }
}

async function importFile(file, handle = null, context = {}) {
  if (context.folderKey) {
    const existing = documents.value.find(document=>document.folderKey===context.folderKey);
    if(existing){await openWorkspaceDocument(existing);return existing;}
  }
  if (file.size > 15 * 1024 * 1024) throw new Error('单个文档请控制在 15 MB 以内');
  const markdown = await file.text();
  const diskHash = handle?.path ? await documentDigest(markdown) : null;
  if (handle?.path) {
    const existing = documents.value.find((document) => document.path?.toLowerCase() === handle.path.toLowerCase());
    if (existing) {
      if(handle.preset){
        const current=activeId.value===existing.id&&cherry?editorMarkdown(cherry):existing.markdown;
        const update=await presetRefresh(current,markdown,existing.diskHash);
        if(update.backup){
          const backup=createDocument(existing.name.replace(/\.md$/i,'')+'（磁盘更新前草稿）.md',current);
          documents.value.unshift(backup);notify('预置文档已更新，未保存的修改已保留为“磁盘更新前草稿”');
        }
        Object.assign(existing,{...handle,diskHash:update.diskHash});fileHandles.set(existing.id,handle);
        if(update.replace){
          existing.markdown=markdown;
          if(activeId.value===existing.id&&cherry){
            lastRenderedMarkdown=null;lastRenderedDocument='';lastRenderedConfigVersion=-1;lastRenderedSourceDoc=null;
            rendering.value=true;resetScrollOnRender=true;cherry.setValue(markdown);cherry.clearUndoRedo();
          }
        }
        schedulePersist();
      } else if (!diskOperations.has(existing.id)) {
        await checkDocumentDisk(existing, { markdown, reference: handle, hash: diskHash });
      }
      await activateDocument(existing.id, false); return existing;
    }
  }
  const document = Object.assign(createDocument(file.name, markdown),context);
  document.name = file.name;
  document.imported = true;
  if (handle?.path) trackDiskBaseline(document, handle, diskHash);
  documents.value.unshift(document);
  if (handle) fileHandles.set(document.id, handle);
  await activateDocument(document.id, false);
  rememberRecent(document);
  return document;
}

async function openFiles() {
  menu.value = '';
  try {
    const selections = await platform.openFiles();
    if (selections) {
      for (const selection of selections) await importFile(selection.file, selection.reference);
    } else {
      input.value.click();
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (error.name === 'SecurityError' || error.name === 'NotAllowedError') input.value.click();
    else notify(error.message || '打开文件失败');
  }
}

async function imported(event) {
  try {
    for (const file of event.target.files) await importFile(file);
  } catch (error) { notify(error.message); }
  event.target.value = '';
}

async function saveMarkdown(asNew = false) {
  if(settingsActive.value){await flushSettings();notify(settingsSaveError.value||'设置已保存');return;}
  if (!active.value || busy.value) return;
  const document = active.value;
  if (diskOperations.has(document.id)) return;
  const markdown = editorMarkdown(cherry);
  diskOperations.add(document.id);
  try {
    if (!asNew && nativeEditableDocument(document)) {
      const incoming = await checkDocumentDisk(document, null, markdown);
      if (!incoming) throw new Error('无法确认磁盘版本，请重试');
      if (incoming.kind !== 'current') {
        delete document.dismissedDiskHash;
        schedulePersist();
        throw new Error('磁盘内容与编辑内容存在冲突，请确认重新载入或另存为');
      }
    }
    const result = await platform.saveMarkdown({ name: document.name, markdown, reference: fileHandles.get(document.id), saveAs: asNew });
    if (result.reference?.path) {
      const hash = await documentDigest(markdown);
      trackDiskBaseline(document, result.reference, hash);
      if (result.diskMarkdown !== undefined && await documentDigest(result.diskMarkdown) !== hash) {
        await checkDocumentDisk(document, { markdown: result.diskMarkdown, reference: result.reference });
      }
    } else if (result.reference) fileHandles.set(document.id, result.reference);
    document.name = result.name;
    if(asNew||!platform.native&&result.reference)delete document.builtinId;
    rememberRecent(document);
    notify(result.message);
    await persist();
  } catch (error) {
    if (error.name !== 'AbortError') notify(`保存失败：${error.message}`);
  } finally {
    diskOperations.delete(document.id);
  }
}

function setMode(nextMode) {
  if (busy.value || !cherry) return;
  mode.value = nextMode;
  menu.value = '';

  schedulePersist();
}

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light';

  menu.value = '';
}

function insertSnippet(type) {
  menu.value = '';
  if (!active.value || busy.value) return;
  if (mode.value === 'previewOnly') setMode('edit&preview');
  const snippet = mermaidSnippet(type) || snippets[type];
  if (snippet) cherry?.insert(`\n${snippet}\n`, false);
}

async function openMermaidExamples() {
  return openBuiltinDocument('common-diagrams');
}

async function openBuiltinDocument(name){
  menu.value='';if(busy.value||presetOpening.value)return;
  if(platform.native){
    presetOpening.value=true;
    try{
      const alias=builtinRecord(name);
      const selection=await platform.openPreset(alias?.name||name);
      platform.clearRenderCaches();const document=await importFile(selection.file,selection.reference);
      if(document.id===activeId.value&&!rendering.value)refreshPreview();
      return document;
    }catch(error){notify('打开预置文档失败：'+(error.message||String(error)));}finally{presetOpening.value=false;}
    return;
  }
  const builtin=(await webBuiltinLibrary()).get(name);if(!builtin)return;
  const existing=documents.value.find(document=>document.builtinId===builtin.id);
  if(existing){await activateDocument(existing.id);return existing;}
  const document=Object.assign(createDocument(builtin.name,builtin.markdown),{builtinId:builtin.id});
  documents.value.unshift(document);await activateDocument(document.id);return document;
}

function openDiagramViewer(svg) {
  const clone = svg.cloneNode(true);
  clone.style.width = '100%';
  clone.style.height = 'auto';
  clone.style.maxWidth = 'none';
  diagramViewer.value = { html: clone.outerHTML, ...diagramSize(svg) };
  viewerZoom.value = 1;
  nextTick(() => document.querySelector('.diagram-viewer-close')?.focus());
}

function openDiagramFromEvent(event) {
  if (event.target.closest('a,button')) return;
  const svg = diagramSvg(event.target.closest('figure[data-type="mermaid"]'));
  if (svg) { event.preventDefault(); openDiagramViewer(svg); }
}

function changeViewerZoom(value) {
  viewerZoom.value = Math.max(.1, Math.min(4, value));
}

function fitDiagramViewer() {
  if (diagramViewer.value) changeViewerZoom((window.innerWidth - 64) / diagramViewer.value.width);
}

async function followNoteLink(path,fragment=''){
  const link=parseWikiLink(path+(fragment?'#'+fragment:''));if(!link)return;
  const nativePreset=platform.native&&active.value?.preset&&active.value?.path&&link.path;
  const builtin=!nativePreset&&active.value?.builtinId&&builtinRecord(link.path);
  const match=builtin?{}:resolveWikiDocument(documents.value,active.value,link.path);
  if(match.ambiguous)throw new Error('有多个同名文档，请使用相对路径：'+link.path);
  let target=match.document;
  if(nativePreset){const selection=await platform.openRelative(active.value.path,link.href);target=await importFile(selection.file,selection.reference);}
  else if(builtin)target=await openBuiltinDocument(builtin.id);
  else if(target)await activateDocument(target.id);
  else if(platform.native&&active.value?.path){const selection=await platform.openRelative(active.value.path,link.href);target=await importFile(selection.file,selection.reference);}
  else if(active.value?.folderKey){const {entry,selection}=await relativeFolderDocument(active.value.folderKey,link.href);target=await importFile(selection.file,selection.reference,{folderKey:entry.id,folderLocation:entry.path});}
  else throw new Error('未找到关联笔记：'+link.path+'；请先打开目标文件或所在文件夹');
  if(fragment&&target){
    await nextTick();
    await waitForCurrentRender({isCurrent:()=>activeId.value===target.id,isReady:()=>!rendering.value&&lastRenderedDocument===target.id,isRendering:()=>rendering.value,requestRender:refreshPreview});
    if(!pageNavigator?.fragment('#'+fragment,{editorVisible:mode.value!=='previewOnly',previewVisible:mode.value!=='editOnly'}))notify('未找到章节：'+fragment);
  }
}
function handlePreviewLink(event) {
  const anchor = event.target.closest('a');
  const href = (anchor?.getAttribute('href') || anchor?.getAttribute('xlink:href') || '').trim();
  if (!href) return;
  if(anchor.hasAttribute('data-wikilink')){event.preventDefault();followNoteLink(anchor.getAttribute('data-wikilink')||'',anchor.getAttribute('data-wiki-fragment')||'').catch(error=>notify(error.message||String(error)));return false;}
  if(href.startsWith('#')){
    if(pageNavigator?.fragment(href,{editorVisible:mode.value!=='previewOnly',previewVisible:mode.value!=='editOnly'})){
      event.preventDefault();
      if(diagramViewer.value)diagramViewer.value=null;
      try{if(new URL(href,location.href).hash!==location.hash)history.pushState(null,'',href);}catch{}
      return false;
    }
    return;
  }
  const isDiagramLink = Boolean(anchor.closest('svg'));
    if(active.value?.builtinId&&!isDiagramLink){
      try{
        const hash=href.indexOf('#'),path=decodeURIComponent((hash<0?href:href.slice(0,hash)).split('?')[0]);
        if(builtinRecord(path)){event.preventDefault();followNoteLink(path,hash<0?'':decodeURIComponent(href.slice(hash+1))).catch(error=>notify(error.message||String(error)));return false;}
      }catch{}
    }
  if (isDiagramLink && !/^(?:https?:|mailto:)/i.test(href)) { event.preventDefault(); return false; }
  if (!platform.native) {
    if (active.value?.folderKey && /\.(md|markdown|txt|mdown|mkd)(?:[?#]|$)/i.test(href)) {
      event.preventDefault();
      relativeFolderDocument(active.value.folderKey,href).then(({entry,selection})=>importFile(selection.file,selection.reference,{folderKey:entry.id,folderLocation:entry.path})).catch(error=>notify(error.message||String(error)));
      return false;
    }
    return;
  }
  event.preventDefault();
  if (/^https?:/i.test(href)) platform.openExternal(href).catch((error) => notify(String(error)));
  else if (!isDiagramLink && active.value?.path && /\.(md|markdown|txt|mdown|mkd)(?:[?#]|$)/i.test(href)) {
    platform.openRelative(active.value.path, href).then((selection) => importFile(selection.file, selection.reference)).catch((error) => notify(String(error)));
  }
  return false;
}

function jumpToHeading(heading) {
  pageNavigator?.line(heading.line,{editorVisible:mode.value!=='previewOnly',previewVisible:mode.value!=='editOnly',focusEditor:true});
}

function requestEditorMeasure() {
  const editor=cherry?.getCodeMirror();
  (editor?.view || editor)?.requestMeasure?.();
}
function previewClick(event) {
  diagramAction(event,openDiagramViewer);
  if(event.target.closest('.cherry-previewer') && handlePreviewLink(event)===false) event.stopPropagation();
}

function setInterfaceScale(value) {
  interfaceScale.value = normalizeInterfaceScale(Number(value));
  nextTick(()=>requestAnimationFrame(requestEditorMeasure));
}
function paneForTarget(target) {
  if (!(target instanceof Element)) return null;
  if (target.closest('.cherry-previewer')) return 'preview';
  if (target.closest('.cherry-editor')) return 'editor';
  return null;
}
function rememberPane(event) {
  const pane = paneForTarget(event.target);
  if (pane) activePane.value = pane;
}
function setPaneFontZoom(pane,value) {
  updateSetting(pane==='editor'?'editorFontSize':'previewFontSize',(pane==='editor'?14:15)+Number(value));
  if (pane === 'editor') nextTick(requestEditorMeasure);
}
function fontWheel(event) {
  if ((!event.ctrlKey && !event.metaKey)||!settings.ctrlWheelZoom) return;
  const pane = paneForTarget(event.target);
  if (!pane) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.deltaY) return;
  const now = Date.now();
  if (now - fontWheelTime[pane] < 80) return;
  fontWheelTime[pane] = now;
  activePane.value = pane;
  setPaneFontZoom(pane,paneFontZoom.value[pane] + (event.deltaY > 0 ? -settings.fontZoomStep : settings.fontZoomStep));
}
function toggleWordWrap() {
  wordWrap.value = !wordWrap.value;
  menu.value = '';

  nextTick(requestEditorMeasure);
}

async function installFolder(root) {
  if (!root) return;
  folderRoot.value = root;
  folderVisible.value = true;
  savedFolderPath.value = root.native ? root.path : '';
  sidebar.value = true; sidebarTab.value = 'files';
  await loadFolder(folderRoot.value);
  platform.clearFolderImageFailures(root.id);
  if(active.value?.folderKey?.startsWith(root.id+'/') && cherry) platform.hydrateImages(cherry.getPreviewer().getDom(),active.value.folderKey);
  schedulePersist();
}
function closeFolder() { folderRoot.value=null; savedFolderPath.value=''; folderVisible.value=false; schedulePersist(); }
function restoreFolderAssets(root) {
  if(!root)return;
  if(folderVisible.value)return installFolder(root);
  platform.clearFolderImageFailures(root.id);
  if(active.value?.folderKey?.startsWith(root.id+'/'))platform.hydrateImages(cherry.getPreviewer().getDom(),active.value.folderKey);
}
async function openFolder() {
  menu.value = '';
  try {
    const root = await chooseFolder();
    if (root === undefined) folderInput.value.click();
    else if (root) await installFolder(root);
  } catch (error) {
    if (error.name === 'SecurityError' || error.name === 'TypeError') folderInput.value.click();
    else if (error.name !== 'AbortError') notify(error.message || String(error));
  }
}
async function folderImported(event) {
  if (event.target.files.length) {
    const root=folderFromFiles([...event.target.files]);
    await installFolder(root);
    rememberImportedFolder(root).catch(()=>{});
  }
  event.target.value = '';
}
async function loadFolder(entry) {
  entry.loading = true;
  try { entry.children = await folderChildren(entry); entry.loaded = true; }
  catch (error) { notify(error.message || String(error)); }
  finally { entry.loading = false; }
}
async function toggleFolder(entry) {
  entry.expanded = !entry.expanded;
  if (entry.expanded && !entry.loaded) await loadFolder(entry);
}
async function refreshFolder() {
  if (!folderRoot.value) return;
  folderRoot.value.loaded = false;
  await loadFolder(folderRoot.value);
}
async function openFolderFile(entry) {
  const existing = documents.value.find((document) => document.folderKey === entry.id || document.path === entry.path);
  if (existing) { await openWorkspaceDocument(existing); return; }
  try {
    const selection = await folderSelection(entry);
    const document = await importFile(selection.file,selection.reference,{folderKey:entry.id,folderLocation:entry.path});
    if (document) { rememberRecent(document); schedulePersist(); }
  } catch (error) { notify(error.message || String(error)); }
}
function findFolderEntry(id, node = folderRoot.value) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const child of node.children || []) { const found = findFolderEntry(id,child); if (found) return found; }
  return null;
}
function rememberRecent(document) {
  if (!document || !(document.imported || document.path || document.folderKey || fileHandles.has(document.id))) return;
  const entry = {id:document.id,name:document.name,path:document.path || '',openedAt:Date.now()};
  recentFiles.value = [entry,...recentFiles.value.filter((item)=>item.id!==entry.id && (!entry.path || item.path!==entry.path))].slice(0,settings.recentFilesLimit);
}
async function openRecent(entry) {
  menu.value = '';
  const existing = documents.value.find((document)=>document.id===entry.id || entry.path && document.path===entry.path);
  if (existing) { await openWorkspaceDocument(existing); return; }
  if (platform.native && entry.path) {
    try { const selection=await platform.openDocumentPath(entry.path); await importFile(selection.file,selection.reference); }
    catch (error) { notify(error.message || String(error)); }
  } else notify('请从“打开”中重新选择这个文件');
}
async function exportSingleDiagram(svg) {
  if (!svg) return;
  try {
    const name = `${active.value?.name.replace(/\.[^.]+$/,'') || '文档'}-图表.svg`;
    await platform.exportSvg(standaloneDiagram(svg,await collectDocumentStyles(svg)),name);
    notify('图表 SVG 已导出');
  } catch (error) { if (error.name !== 'AbortError') notify(error.message || String(error)); }
}
function closePdfPreview() { printHtml.value=''; printBaseHtml.value=''; printReady.value=false; }
function closeHtmlPreview() { if(!htmlSaving.value)htmlSnapshot.value=null; }
function openHtmlContextMenu(event) {
  contextMenu.value={key:Date.now(),x:event.x,y:event.y,items:[
    {label:'保存 HTML…',icon:'download',run:()=>htmlPreview.value?.save(),disabled:!event.ready||htmlSaving.value,shortcut:'Ctrl+S'},
    {label:'关闭 HTML 预览',icon:'close',run:closeHtmlPreview,disabled:htmlSaving.value,shortcut:'Esc'},
  ]};
}
async function saveHtml(html) {
  if(!htmlSnapshot.value||htmlSaving.value)return;
  htmlSaving.value=true;
  try {
    await platform.exportHtml(html,htmlSnapshot.value.name.replace(/\.(md|markdown|txt|mdown|mkd)$/i,'')+'.html');
    notify('HTML 已保存，目录、图表和字体已包含在文件中');
  } catch(error) { if(error.name!=='AbortError')notify(error.message||'HTML 保存失败'); }
  finally { htmlSaving.value=false; }
}

function updatePdfLayout() {
  pdfOptions.value = normalizePdfOptions(pdfOptions.value);

  if (printBaseHtml.value) { printReady.value=false; printHtml.value=withPdfOptions(printBaseHtml.value,pdfOptions.value); }
}
function insertEmoji(emoji) {
  showEmoji.value = false;
  if (!active.value || !cherry) return;
  if (mode.value === 'previewOnly') setMode('edit&preview');
  const view = cherry.getCodeMirror();
  const selection = view.state.selection.main;
  view.dispatch({changes:{from:selection.from,to:selection.to,insert:emoji},selection:{anchor:selection.from+emoji.length}});
  view.focus();
}

async function renderedSnapshot(format='pdf') {
  const currentDocument=active.value;
  const markdown = editorMarkdown(cherry);
  const sourceVersion=cherry.getCodeMirror().state.doc;
  const previousMode = mode.value;
  if (previousMode === 'editOnly') switchEditorMode(cherry,'edit&preview');
  try {
    if(diagramSettingsDirty)applyMermaidSettings();
    else if(previousMode==='editOnly')refreshPreview();
    const configVersion=renderConfigVersion;
    // CodeMirror's document is immutable. Identity detects edits without making
    // another full-document string on every readiness poll.
    const isCurrent=()=>activeId.value===currentDocument.id&&cherry.getCodeMirror().state.doc===sourceVersion&&renderConfigVersion===configVersion&&!diagramSettingsDirty;
    const assertCurrent=()=>{if(!isCurrent())throw new Error('文档或图表配置已变化，请完成编辑后重新导出');};
    await waitForCurrentRender({isCurrent,isReady:()=>lastRenderedDocument===currentDocument.id&&lastRenderedMarkdown===markdown&&lastRenderedConfigVersion===configVersion&&!rendering.value,isRendering:()=>rendering.value,requestRender:refreshPreview});
    await document.fonts.ready;
    const preview = cherry.getPreviewer().getDom();
    platform.hydrateImages(preview, currentDocument.path || currentDocument.folderKey);
    await platform.waitForImages(currentDocument.path || currentDocument.folderKey);
    await waitForImages(preview);
    assertCurrent();
    if (diagramError.value) throw new Error('有 Mermaid 图表未能渲染，请检查语法或图表类型后重试');
    const cloned = preview.cloneNode(true);
    cloned.querySelectorAll('button,.cherry-code-block-tool-bar,.cherry-code-block-toolbar,.cherry-flowchart-toolbar,.cherry-mermaid-toolbar,.cherry-previewer-table-content-handler,.cherry-previewer-code-block-toolbar').forEach((element) => element.remove());
    cloned.querySelectorAll('[contenteditable]').forEach((element) => element.removeAttribute('contenteditable'));
    prepareReadOnlyMarkdown(cloned,{pdf:format==='pdf'});
    prepareExportDiagrams(cloned);
    if(format==='html') {
      const headings=prepareHtmlExportBody(cloned);
      await inlineImages(cloned);
      cloned.querySelectorAll('img[srcset]').forEach(image=>image.removeAttribute('srcset'));
      const styles=await collectDocumentStyles(preview,{html:true});assertCurrent();
      const {paddingLeft,paddingRight}=getComputedStyle(preview);
      const contentWidth=Math.floor(preview.clientWidth-parseFloat(paddingLeft)-parseFloat(paddingRight));
      const appearance={
        dark:isPreviewDark(),previewFont:settings.previewFont,previewFontSize:settings.previewFontSize,
        previewLineHeight:settings.previewLineHeight,previewWidth:settings.previewWidth,
        previewPadding:settings.previewPadding,previewCodeWrap:settings.previewCodeWrap,contentWidth,
      };
      return {name:currentDocument.name,title:currentDocument.name.replace(/\.md$/i,''),bodyHtml:cloned.innerHTML,headings,styles,appearance};
    }
    if (exportToc.value) addExportToc(cloned,settings.tocDepth);
    await inlineImages(cloned);
    const styles=await collectDocumentStyles(preview);assertCurrent();
    return createHtmlDocument(currentDocument.name.replace(/\.md$/i, ''), cloned.innerHTML, styles,settings);
  } finally {
    if (previousMode === 'editOnly') {switchEditorMode(cherry,previousMode);nextTick(requestEditorMeasure);}
  }
}

async function exportDocument(type) {
  if (!cherry || !active.value || busy.value || settingsActive.value) return;
  menu.value = '';
  busy.value = true;
  const exportStarted=performance.now();
  const previewEvent=type==='html'?'html_preview':'pdf_preview';
  try {
    if (type === 'html') {
      htmlSnapshot.value = await renderedSnapshot('html');
      closePdfPreview();
    } else {
      const html = await renderedSnapshot();
      closeHtmlPreview();
      printReady.value = false;
      printBaseHtml.value = html;
      printHtml.value = withPdfOptions(html,pdfOptions.value);
    }
    void platform.logEvent(previewEvent,'ok',Math.round(performance.now()-exportStarted));
  } catch (error) {
    if (error.name === 'AbortError') return;
    void platform.logEvent(previewEvent,'failed',Math.round(performance.now()-exportStarted));
    notify(error.message || '导出失败');
  } finally { busy.value = false; }
}

async function printLoaded() {
  const frameDocument = printFrame.value?.contentDocument;
  if (!frameDocument) return;
  try {
    await frameDocument.fonts.ready;
    await waitForImages(frameDocument);
    if (printFrame.value?.contentDocument === frameDocument) printReady.value = true;
    frameDocument.addEventListener('contextmenu',(event)=>{
      event.preventDefault();
      const bounds=printFrame.value.getBoundingClientRect();
      contextMenu.value={key:Date.now(),x:bounds.left+event.clientX,y:bounds.top+event.clientY,items:[{label:'保存 PDF…',icon:'printer',run:printPdf,disabled:!printReady.value||pdfDownloading.value},{label:'关闭 PDF 预览',icon:'close',run:closePdfPreview}]};
    });
  } catch (error) { notify(error.message); }
}

async function printPdf() {
  if (!printReady.value || pdfDownloading.value) return;
  pdfDownloading.value = true;
  const filename = active.value.name.replace(/\.md$/i, '.pdf');
  try {
    await platform.exportPdf(printHtml.value, filename, pdfOptions.value);
    notify('PDF 文件已生成');
  } catch (error) { if (error.name !== 'AbortError') notify(error.message || 'PDF 导出失败'); }
  finally { pdfDownloading.value = false; }
}

function persistExportToc() {
  flushSettings();
}

function openContextMenu(event) {
  menu.value = '';
  const target = event.target;
  const item = (label, icon, run, disabled = false, shortcut = '') => ({ label, icon, run, disabled, shortcut });
  const separator = { separator: true };
  let items;
  const documentElement = target.closest('[data-document-id],[data-tab-id]');
  const figure = target.closest('figure[data-type="mermaid"]');
  const viewerSvg = target.closest('.diagram-viewer-canvas')?.querySelector('svg');
  const folderElement = target.closest('[data-folder-entry]');
  if (folderElement) {
    const entry=findFolderEntry(folderElement.dataset.folderEntry);
    if(!entry)return;
    items=[item(entry.kind==='directory'?(entry.expanded?'折叠文件夹':'展开文件夹'):'打开文档',entry.kind==='directory'?'folder':'file',()=>entry.kind==='directory'?toggleFolder(entry):openFolderFile(entry)),separator,item('复制路径','copy',()=>platform.writeClipboard(entry.path))];
  } else if (documentElement) {
    const id = documentElement.dataset.documentId || documentElement.dataset.tabId;
    const document = documents.value.find((entry) => entry.id === id);
    if (!document) return;
    items = [
      item('打开文档', 'file', () => activateDocument(id)),
      ...(diskChanges.has(id) ? [item('重新载入磁盘版本', 'refresh', () => requestDiskReload(document), diskOperations.has(id))] : []),
      item('重命名…', 'file', () => beginRename(document)),
      item('复制路径','copy',()=>platform.writeClipboard(document.path || document.folderLocation || document.name)),
      separator,
      item('关闭标签页', 'close', () => closeDocumentTab(id), !openDocumentIds.value.includes(id)),
      item('删除工作区草稿…', 'trash', () => { deletingId.value = id; }),
    ];
  } else if (figure || viewerSvg) {
    const svg=diagramSvg(figure) || viewerSvg;
    const zoom=(action)=>figure?applyDiagramAction(figure,action,openDiagramViewer):action==='fit'?fitDiagramViewer():changeViewerZoom(action==='in'?viewerZoom.value*1.25:action==='out'?viewerZoom.value/1.25:1);
    items = [item('放大查看', 'eye', () => svg && openDiagramViewer(svg),!svg),
      item('放大', 'plus', () => zoom('in'),!svg),item('缩小', 'minus', () => zoom('out'),!svg),
      item('原始大小', 'refresh', () => zoom('reset'),!svg),item('适应宽度', 'split', () => zoom('fit'),!svg),separator,
      item('导出 SVG…','download',()=>exportSingleDiagram(svg),!svg),item('复制 SVG 源码', 'copy', async () => platform.writeClipboard(standaloneDiagram(svg,await collectDocumentStyles(svg))),!svg)];
  } else if (target.closest('.cherry-editor') && active.value && cherry) {
    const view = cherry.getCodeMirror();
    const original = view.state.doc;
    const selection = view.state.selection.main;
    const id = activeId.value;
    const selected = original.sliceString(selection.from, selection.to);
    const replace = (text) => {
      if (activeId.value !== id || view.state.doc !== original) throw new Error('文档已变化，请重新选择插入位置');
      view.dispatch({ changes: { from: selection.from, to: selection.to, insert: text }, selection: { anchor: selection.from + text.length } });
      view.focus();
    };
    items = [item('撤销', 'undo', () => editorCommand('undo'), false, 'Ctrl+Z'), item('重做', 'redo', () => editorCommand('redo'), false, 'Ctrl+Y'), separator,
      item('剪切', 'cut', async () => { await platform.writeClipboard(selected); replace(''); }, !selected, 'Ctrl+X'),
      item('复制', 'copy', () => platform.writeClipboard(selected), !selected, 'Ctrl+C'),
      item('粘贴', 'paste', async () => replace(await platform.readClipboard()), false, 'Ctrl+V'), separator,
      item('全选', 'select', () => { view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } }); view.focus(); }, false, 'Ctrl+A'),
      item('查找 / 替换…', 'search', () => editorCommand('search'), false, 'Ctrl+F')];
  } else if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const selected = target.value.slice(start, end);
    const replace = (text) => { target.focus(); target.setRangeText(text, start, end, 'end'); target.dispatchEvent(new Event('input', { bubbles: true })); };
    items = [item('剪切', 'cut', async () => { await platform.writeClipboard(selected); replace(''); }, !selected || target.readOnly), item('复制', 'copy', () => platform.writeClipboard(selected), !selected), item('粘贴', 'paste', async () => replace(await platform.readClipboard()), target.readOnly), separator, item('全选', 'select', () => { target.focus(); target.select(); })];
  } else if (target.closest('.cherry-previewer,.diagram-viewer-scroll')) {
    const selected = window.getSelection()?.toString() || '';
    items = [item('复制选中文字', 'copy', () => platform.writeClipboard(selected), !selected), separator,
      item('显示文档大纲', 'outline', () => { sidebar.value = true; sidebarTab.value = 'outline'; schedulePersist(); }),
      item('导出 HTML…', 'code', () => exportDocument('html'), !active.value || busy.value), item('导出 PDF…', 'printer', () => exportDocument('pdf'), !active.value || busy.value)];
  } else {
    items = [item('新建文档', 'plus', newDocument, busy.value), item('打开文件…', 'folder', openFiles, busy.value), item('打开文件夹…','folder',openFolder,busy.value), separator, item(sidebar.value ? '收起侧栏' : '展开侧栏', 'panel', toggleSidebar)];
  }
  contextMenu.value = { key: Date.now(), x: event.clientX, y: event.clientY, items };
}

function closeMenus(event) {
  if (!event.composedPath().some(node=>node instanceof Element && node.classList.contains('menu-container'))) menu.value = '';
}

function keyboard(event) {
  const ctrl=event.ctrlKey||event.metaKey;
  if (diskChangeDialog.value?.open) {
    if (ctrl) event.preventDefault();
    return;
  }
  if(ctrl&&event.key===','){event.preventDefault();openSettings();return;}
  if(htmlSnapshot.value){
    if(event.key==='Escape'||ctrl&&event.key.toLowerCase()==='w'){event.preventDefault();closeHtmlPreview();}
    else if(ctrl&&event.key.toLowerCase()==='s'){event.preventDefault();htmlPreview.value?.save();}
    return;
  }
  if(settingsActive.value&&ctrl){
    const key=event.key.toLowerCase();
    if(key==='w'){event.preventDefault();closeSettings();return;}
    if(key==='s'){event.preventDefault();flushSettings();return;}
    if(key==='f'){event.preventDefault();document.querySelector('.settings-search input')?.focus();return;}
    if(!event.altKey&&['+','=','-','0','h'].includes(key)){event.preventDefault();return;}
  }
  if (event.altKey && event.key.toLowerCase() === 'z' && !event.ctrlKey) { event.preventDefault(); toggleWordWrap(); return; }
  if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'o') { event.preventDefault(); openFolder(); return; }
  if ((event.ctrlKey || event.metaKey) && event.altKey && ['+','=','-','0'].includes(event.key)) {
    event.preventDefault();
    setInterfaceScale(event.key === '0' ? 1 : adjacentInterfaceScale(interfaceScale.value, event.key === '-' ? -1 : 1));
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['+','=','-','0'].includes(event.key)) {
    event.preventDefault(); rememberPane(event); setPaneFontZoom(activePane.value,event.key === '0' ? 0 : paneFontZoom.value[activePane.value] + (event.key === '-' ? -settings.fontZoomStep : settings.fontZoomStep)); return;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const menus = { f: 'file', e: 'edit', i: 'insert', v: 'view', h: 'help' };
    const nextMenu = menus[event.key.toLowerCase()];
    if (nextMenu) {
      event.preventDefault();
      menu.value = menu.value === nextMenu ? '' : nextMenu;
      nextTick(() => document.querySelector('.menubar .selected')?.focus());
      return;
    }
  }
  if (menu.value && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    const buttons = [...document.querySelectorAll('.app-chrome .dropdown button:not(:disabled)')];
    if (buttons.length) {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      return;
    }
  }
  if (event.key === 'Escape') {
    menu.value = '';
    contextMenu.value = null;
    renameId.value = '';
    deletingId.value = '';
    closePdfPreview();
    showHelp.value = false;
    diagramViewer.value = null;
    showEmoji.value = false;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    if (event.key.toLowerCase() === 's') { event.preventDefault(); saveMarkdown(event.shiftKey); }
    if (event.key.toLowerCase() === 'o') { event.preventDefault(); openFiles(); }
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); newDocument(); }
    if (event.key.toLowerCase() === 'w') { event.preventDefault(); closeDocumentTab(activeId.value); }
    if (event.key === 'Tab' && openDocumentIds.value.length+(settingsTabOpen.value?1:0)>1) {
      event.preventDefault();
      const ids=[...openDocumentIds.value,...(settingsTabOpen.value?['__settings__']:[])];
      const current=settingsActive.value?'__settings__':activeId.value;
      const index=(ids.indexOf(current)+(event.shiftKey?-1:1)+ids.length)%ids.length;
      if(ids[index]==='__settings__')openSettings();else activateDocument(ids[index]);
    }
  }
}

async function dropped(event) {
  const files = [...(event.dataTransfer?.files || [])].filter((file) => /\.(md|markdown|txt)$/i.test(file.name));
  if (!files.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try { for (const file of files) await importFile(file); } catch (error) { notify(error.message); }
}

async function presentStartup() {
  markStartup('readiness-start');
  const boot=window.markdownDeskBoot;
  if(platform.native){
    boot?.setContinue(()=>{startupContinue=true;});
    await platform.startupEditorReady();
    await nextTick();
    host.value?.getBoundingClientRect();
    const ready=await waitForStartupReady({
      isCancelled:()=>startupCancelled,canContinue:()=>startupContinue,onSlow:()=>boot?.slow(),
      isReady:()=>!loading.value&&!platform.isOpeningDocuments()&&document.fonts.status!=='loading'&&!diagramSettingsDirty&&
        (!active.value||!platform.hasPendingImages(active.value.path||active.value.folderKey)&&
          (mode.value==='editOnly'||!rendering.value&&lastRenderedDocument===activeId.value&&lastRenderedConfigVersion===renderConfigVersion&&lastRenderedSourceDoc===cherry.getCodeMirror().state.doc)),
    });
    if(!ready)return;
  }
  if(startupCancelled)return;
  markStartup('readiness-complete');
  if(boot)boot.complete();
  else {document.documentElement.classList.add('app-ready');document.querySelector('body > #app-startup-screen')?.remove();}
  await platform.finishStartup(theme.value);
}

onMounted(async () => {
  markStartup('app-mounted');
  try {
    const startupData=props.takeStartupData?.();
    nativeStorageInfo.value=startupData?.storage||null;
    platform.setStorageInfo(nativeStorageInfo.value);
    if(platform.native)presetEntries.value=startupData?.presets||[];
    if (platform.native) {
      try {
        systemDisplayScale.value = startupData?.displayScale ?? await platform.systemDisplayScale();
      } catch (error) { notify('界面缩放设置失败：'+(error.message || String(error))); }
    }
    markStartup('workspace-start');
    const [saved,cachedDiagrams] = await Promise.all([
      startupData?startupData.workspace:loadWorkspace(),
      startupData?startupData.diagramCache:loadDiagramCache().catch(()=>null),
    ]);
    markStartup('workspace-loaded');
    if (saved?.documents?.length) {
      documents.value = saved.documents.filter((item) => typeof item.markdown === 'string' && typeof item.name === 'string' && item.id);
      if (!initialSettings.hasStored) {
        if (['edit&preview', 'editOnly', 'previewOnly'].includes(saved.mode)) mode.value = saved.mode;
        sidebar.value = saved.sidebar !== false;
        if(Number.isFinite(saved.sidebarWidth))sidebarWidth.value=saved.sidebarWidth;
      }
      recentFiles.value = Array.isArray(saved.recentFiles) ? saved.recentFiles.slice(0,12) : [];
      folderVisible.value = saved.folderVisible !== false;
      savedFolderPath.value = platform.native && typeof saved.folderPath === 'string' ? saved.folderPath : '';

    }
    for(const document of documents.value){const legacy=await legacyPresetId(document);if(legacy)document.builtinId=legacy;}
    for (const document of documents.value) {
      if (document.path) fileHandles.set(document.id, { path: document.path, modified: document.modified, diskStamp: document.diskStamp,managed:document.managed,preset:document.preset });
    }
    openDocumentIds.value = Array.isArray(saved?.openDocumentIds)
      ? [...new Set(saved.openDocumentIds)].filter((id) => documents.value.some((document) => document.id === id))
      : documents.value.map((document) => document.id);
    openDocumentIds.value=openDocumentIds.value.filter(id=>!isPresetDocument(documents.value.find(document=>document.id===id)));
    if(!settings.restoreSession)openDocumentIds.value=[];
    activeId.value = openDocumentIds.value.includes(saved?.activeId) ? saved.activeId : openDocumentIds.value[0] || '';
    if(!activeId.value)sidebarTab.value='files';
    // Resolve OS launch files before Cherry exists, retaining any matching draft.
    for(const document of startupData?.documents||[])await importFile(new File([document.markdown],document.name,{type:'text/markdown'}),{path:document.path,modified:document.modified,diskStamp:document.diskStamp,managed:document.managed,preset:document.preset});
    for(const error of startupData?.errors||[])notify(error);
    loadedDocument = activeId.value;
    // The restored settings are now complete. Save them while building the editor.
    markStartup('preferences-save-start');
    const startupPreferences=flushSettings().then(()=>markStartup('preferences-save-complete'));
    const needsStartupDiagrams=Boolean(documentAnalysis.value.diagrams);
    if(needsStartupDiagrams)await diagramCache.restore(cachedDiagrams).catch(console.warn);
    markStartup('cache-restored');
    if(documentAnalysis.value.diagrams&&!diagramCache.size)mermaidWithFlags.preload().catch(console.error);
    await nextTick();
    markStartup('editor-create-start');
    cherry = new Cherry({
      el: host.value,
      value: active.value?.markdown || '',
      locale: 'zh_CN',
      nameSpace: 'markdown-desk',
      externals: { katex },
      editor: { defaultModel: mode.value, height: '100%', autoSave2Textarea: false, keepDocumentScrollAfterInit: true, showSuggestList: false, showFullWidthMark: false, largeDocumentConfig: { lineThreshold: 3000, strategy: 'degrade' } },
      themeSettings: { mainTheme: 'default', codeBlockTheme: 'default', inlineCodeTheme: 'black' },
      toolbars: { toolbar: ['bold', 'italic', 'strikethrough', 'header', 'list', 'quote', 'code', 'link', 'image', 'table', 'insert', 'undo', 'redo', 'search'], showToolbar: false, toolbarRight: [], toc: false, sidebar: false, bubble: false, float: false },
      engine: { customSyntax:createMarkdownCompatibility(Cherry), syntax: { codeBlock: { customRenderer: { mermaid: mermaidRenderer }, copyCode: true, editCode: false, changeLang: false, expandCode: false, mermaid: { svg2img: false, showSourceToolbar: false } }, header: { anchorStyle: 'none' }, mathBlock: { engine: 'katex', plugins: false }, inlineMath: { engine: 'katex' } } },
      previewer: { enablePreviewerBubble: false, lazyLoadImg: { noLoadImgNum: -1, autoLoadImgNum: -1 } },
      callback: {
        urlProcessor: (url, type) => type === 'image' ? platform.imageUrl(url, active.value?.path || active.value?.folderKey) : url,
        onClickPreview: handlePreviewLink,
        afterChange: contentChanged,
        afterInit: (markdown) => { contentChanged(markdown); },
        afterAsyncRender: (markdown) => {
          const refresh=diagramRefresh;
          queueMicrotask(()=>renderingFinished(markdown,refresh));
        },
        fileUpload: async (file, callback) => {
          if (!file.type.startsWith('image/')) { notify('图片按钮仅接受图片；Markdown 文件请使用「打开」'); return; }
          if (file.size > 8 * 1024 * 1024) { notify('单张图片请控制在 8 MB 以内'); return; }
          const reader = new FileReader();
          reader.onload = () => callback(reader.result);
          reader.onerror = () => notify('读取图片失败');
          reader.readAsDataURL(file);
        },
      },
    });
    switchEditorMode(cherry,mode.value);
    markStartup('editor-created');
    pageNavigator=createPageNavigator(cherry,{onJump:line=>{activeHeadingLine.value=line;}});
    cherryIconCleanup=installCherryIcons(cherry);
    cherry.setCodeWrap(settings.previewCodeWrap?'wrap':'nowrap');
    cherry.setCodeBlockTheme(isPreviewDark()?'vs-dark':'default');
    loading.value = false;
    if (!active.value) rendering.value = false;
    nextTick(requestEditorMeasure);
    markStartup('desktop-bind-start');
    desktopCleanup = await platform.bindDesktop({
      onFiles: async (selections) => { for (const selection of selections) await importFile(selection.file, selection.reference); },
      onBeforeClose: async () => {
        if (pdfDownloading.value) throw new Error('PDF 正在生成，请完成后再关闭窗口');
        if (active.value && cherry) active.value.markdown = editorMarkdown(cherry);
        await persist();
        await persistDiagramCache().catch(console.warn);
        if(!await flushSettings())throw new Error('配置保存失败：'+settingsSaveError.value);
        if (storageError.value) throw new Error('草稿保存失败，请先保存 Markdown 文件后再关闭');
      },
      onError: notify,
    });
    markStartup('desktop-bound');
    schedulePersist();
    await startupPreferences;
    if(initialSettings.invalid)notify('已使用可用的默认设置，可在设置页重新调整');
    systemTheme.addEventListener('change',themeChanged);
    if (platform.native) {
      window.addEventListener('focus', refreshFileAssociation);
      window.addEventListener('focus', checkDiskOnFocus);
      checkDiskOnFocus();
      diskCheckTimer = setInterval(() => void checkOpenDiskFiles(), 2500);
    }
    window.addEventListener('pagehide',flushSettings);
    window.addEventListener('pagehide',saveOptionalDiagramCache);
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', keyboard, true);
    window.addEventListener('drop', dropped, true);
    window.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') {flushSettings();persist();} });
    await presentStartup();
    if(!startupCancelled){
      if(!needsStartupDiagrams)diagramCache.restore(cachedDiagrams).catch(console.warn);
      if (settings.restoreFolder&&savedFolderPath.value) restoreFolder(savedFolderPath.value).then(installFolder).catch(() => notify('上次的文件夹暂时无法访问，可重新选择文件夹'));
      else if (settings.restoreFolder&&!platform.native) restoreBrowserFolder().then(restoreFolderAssets).catch(()=>{});
    }
  } catch (error) {
    fatalError.value = error.message || String(error);
    loading.value = false;
    console.error(error);
    window.markdownDeskBoot?.fail(error);
    await platform.failStartup(error,theme.value).catch(console.error);
  }
});

onBeforeUnmount(() => {
  startupCancelled=true;
  desktopCleanup();
  flushSettings();
  saveOptionalDiagramCache();
  clearTimeout(mermaidSettingsTimer);
  systemTheme.removeEventListener('change',themeChanged);
  window.removeEventListener('focus',refreshFileAssociation);
  window.removeEventListener('focus',checkDiskOnFocus);
  clearInterval(diskCheckTimer);
  window.removeEventListener('pagehide',flushSettings);
  window.removeEventListener('pagehide',saveOptionalDiagramCache);
  clearTimeout(persistTimer);
  clearTimeout(persistMaxTimer);
  clearTimeout(toastTimer);
  discardDiagramRefresh();
  pageNavigator?.destroy();
  cherryIconCleanup();
  cherry?.destroy();
  document.removeEventListener('click', closeMenus);
  document.removeEventListener('keydown', keyboard, true);
  window.removeEventListener('drop', dropped, true);
});
</script>

<template>
  <div class="workspace" @contextmenu.prevent="openContextMenu" :class="{ 'is-dark': theme === 'dark', 'sidebar-hidden': !sidebar || settingsActive, 'word-wrap-off': !wordWrap, 'toolbar-hidden':!settings.toolbarVisible,'statusbar-hidden':!settings.statusbarVisible,'preview-dark':isPreviewDark(),'preview-code-wrap':settings.previewCodeWrap,'no-active-line':!settings.highlightLine,'reading-width-limited':settings.previewWidth>0 }" :style="workspaceStyles">
    <header class="app-chrome">
      <div class="menubar" role="menubar" aria-label="主菜单">
        <div class="menu-container">
          <button role="menuitem" :class="{ selected: ['file','recent'].includes(menu) }" :aria-expanded="['file','recent'].includes(menu)" @click="menu = menu === 'file' ? '' : 'file'">文件<span>(F)</span></button>
          <div v-if="menu === 'file'" class="dropdown menu-left">
            <button @click="menu = ''; newDocument()"><Icon name="file-plus" />新建文档<kbd>Ctrl+N</kbd></button>
            <button @click="openFiles"><Icon name="folder-open" />打开文件…<kbd>Ctrl+O</kbd></button>
            <button @click="openFolder"><Icon name="folder-open" />打开文件夹…<kbd>Ctrl+Alt+O</kbd></button>
            <button v-if="!platform.native" @click="menu='';folderInput.click()"><Icon name="download" />导入文件夹副本…</button>
            <button @click="menu='recent'"><Icon name="clock" />最近打开<Icon name="arrow" :size="13" /></button>
            <button v-if="activeDiskChange && !showDiskChange" @click="showDismissedDiskChange"><Icon name="refresh" />重新载入磁盘版本…</button>
            <div class="menu-separator"></div>
            <button :disabled="!active" @click="menu = ''; saveMarkdown()"><Icon name="save" />保存<kbd>Ctrl+S</kbd></button>
            <button :disabled="!active" @click="menu = ''; saveMarkdown(true)"><Icon name="save" />另存为…<kbd>Ctrl+Shift+S</kbd></button>
            <button :disabled="!active" @click="active && beginRename(active)"><Icon name="file" />重命名文档</button>
            <button :disabled="!active" @click="menu = ''; closeDocumentTab(activeId)"><Icon name="close" />关闭标签页<kbd>Ctrl+W</kbd></button>
            <div class="menu-separator"></div>
            <button :disabled="!active || busy || settingsActive" @click="exportDocument('html')"><Icon name="code" />导出 HTML…</button>
            <button :disabled="!active || busy || settingsActive" @click="exportDocument('pdf')"><Icon name="printer" />导出 PDF…</button>
            <div class="menu-separator"></div>
            <button :disabled="!active" class="danger" @click="deletingId = activeId; menu = ''"><Icon name="trash" />删除工作区草稿…</button>
          </div>
          <div v-if="menu==='recent'" class="dropdown menu-left recent-menu"><button @click="menu='file'"><Icon name="arrow" class="back-arrow" />返回文件菜单</button><div class="menu-separator"></div><button v-for="entry in recentFiles" :key="entry.id" :title="entry.path || entry.name" @click="openRecent(entry)"><Icon name="markdown" /><span><span>{{ entry.name }}</span><small v-if="entry.path">{{ entry.path }}</small></span></button><p v-if="!recentFiles.length" class="empty-message">暂无最近文件</p><div v-if="recentFiles.length" class="menu-separator"></div><button v-if="recentFiles.length" @click="recentFiles=[];menu='';schedulePersist()"><Icon name="close" />清空最近记录</button></div>
        </div>
        <div class="menu-container">
          <button role="menuitem" :class="{ selected: menu === 'edit' }" :aria-expanded="menu === 'edit'" @click="menu = menu === 'edit' ? '' : 'edit'">编辑<span>(E)</span></button>
          <div v-if="menu === 'edit'" class="dropdown menu-left">
            <button :disabled="!active" @click="editorCommand('undo')"><Icon name="undo" />撤销<kbd>Ctrl+Z</kbd></button>
            <button :disabled="!active" @click="editorCommand('redo')"><Icon name="redo" />重做<kbd>Ctrl+Y</kbd></button>
            <div class="menu-separator"></div>
            <button :disabled="!active" @click="editorCommand('search')"><Icon name="search" />查找 / 替换…<kbd>Ctrl+F</kbd></button>
            <div class="menu-separator"></div>
            <button :disabled="!active" @click="editorCommand('bold')"><Icon name="bold" />粗体<kbd>Ctrl+B</kbd></button>
            <button :disabled="!active" @click="editorCommand('italic')"><Icon name="italic" />斜体<kbd>Ctrl+I</kbd></button>
          </div>
        </div>
        <div class="menu-container">
          <button role="menuitem" :class="{ selected: menu === 'insert' }" :aria-expanded="menu === 'insert'" @click="menu = menu === 'insert' ? '' : 'insert'">插入<span>(I)</span></button>
          <div v-if="menu === 'insert'" class="dropdown menu-left">
            <button :disabled="!active" @click="editorCommand('insert', 'link')"><Icon name="link" />链接</button>
            <button :disabled="!active" @click="editorCommand('insert', 'image')"><Icon name="image" />图片…</button>
            <button :disabled="!active" @click="editorCommand('insert', 'normal-table-3*3')"><Icon name="table" />表格</button>
            <button :disabled="!active" @click="editorCommand('insert', 'code')"><Icon name="code" />代码块</button>
            <button :disabled="!active" @click="showEmoji=true;menu=''"><Icon name="smile" />表情符号…</button>
            <div class="menu-separator"></div>
            <MermaidMenu :types="settings.mermaidTypes" :disabled="!active || busy || settingsActive" @insert="insertSnippet" @examples="openMermaidExamples" />
          </div>
        </div>
        <div class="menu-container">
          <button role="menuitem" :class="{ selected: menu === 'view' }" :aria-expanded="menu === 'view'" @click="menu = menu === 'view' ? '' : 'view'">视图<span>(V)</span></button>
          <div v-if="menu === 'view'" class="dropdown menu-left">
            <button @click="setMode('editOnly')"><Icon :name="mode === 'editOnly' ? 'check' : 'code'" />仅源码</button>
            <button @click="setMode('edit&preview')"><Icon :name="mode === 'edit&preview' ? 'check' : 'split'" />源码与预览</button>
            <button @click="setMode('previewOnly')"><Icon :name="mode === 'previewOnly' ? 'check' : 'eye'" />仅预览</button>
            <div class="menu-separator"></div>
            <button @click="toggleWordWrap"><Icon :name="wordWrap ? 'check' : 'wrap'" />自动换行<kbd>Alt+Z</kbd></button>
            <div class="menu-separator"></div>
              <label class="interface-scale">界面缩放<select aria-label="界面缩放比例" :value="interfaceScale" @change="setInterfaceScale($event.target.value)"><option v-for="scale in interfaceScales" :key="scale" :value="scale">{{ Math.round(scale*100) }}%</option></select></label>
              <button @click="setInterfaceScale(1)"><Icon name="refresh" />恢复界面缩放 100%<kbd>Ctrl+Alt+0</kbd></button>
              <div class="menu-separator"></div>
            <label class="interface-scale">窗格字号<select v-model="activePane" aria-label="字号调整窗格"><option value="editor">源码 {{14+paneFontZoom.editor}}px</option><option value="preview">预览 {{15+paneFontZoom.preview}}px</option></select></label>
            <button @click="setPaneFontZoom(activePane,paneFontZoom[activePane]+1)"><Icon name="plus" />增大字号<kbd>Ctrl++</kbd></button><button @click="setPaneFontZoom(activePane,paneFontZoom[activePane]-1)"><Icon name="minus" />减小字号<kbd>Ctrl+-</kbd></button><button @click="setPaneFontZoom(activePane,0);menu='' "><Icon name="refresh" />恢复当前窗格字号<kbd>Ctrl+0</kbd></button>
            <div class="dropdown-label">Ctrl＋鼠标滚轮：调整鼠标所在窗格</div>
            <div class="menu-separator"></div>
            <button @click="toggleSidebar"><Icon :name="sidebar ? 'check' : 'panel'" />文档侧栏</button>
            <button @click="sidebar = true; sidebarTab = 'outline'; menu = ''; schedulePersist()"><Icon name="outline" />文档大纲</button>
            <button @click="toggleTheme"><Icon :name="theme === 'dark' ? 'sun' : 'moon'" />{{ theme === 'dark' ? '使用浅色界面' : '使用深色界面' }}</button>
            <div class="menu-separator"></div>
            <button :disabled="!active" @click="refreshPreview"><Icon name="refresh" />重新渲染</button>
          </div>
        </div>
        <div class="menu-container">
          <button role="menuitem" :class="{ selected: menu === 'help' }" :aria-expanded="menu === 'help'" @click="menu = menu === 'help' ? '' : 'help'">帮助<span>(H)</span></button>
          <div v-if="menu === 'help'" class="dropdown menu-left preset-menu">
            <button :disabled="presetOpening" @click="openBuiltinDocument('demo')"><Icon name="code" />Markdown 全功能演示</button>
            <div class="preset-menu-title">预置 Markdown</div>
            <div class="preset-menu-list"><button v-for="entry in presetEntries.filter(entry=>entry.relativePath.toLowerCase()!=='demo.md')" :key="entry.relativePath" :title="entry.relativePath" :disabled="presetOpening" @click="openBuiltinDocument(entry.relativePath)"><Icon name="file"/><span>{{entry.relativePath}}</span></button></div>
            <template v-if="platform.native"><button @click="menu='';openStorageFolder('builtin')"><Icon name="folder"/>打开预置文档目录…</button><button @click="refreshPresets(true)"><Icon name="refresh"/>刷新预置文档目录</button></template>
            <button @click="showHelp = true; menu = ''"><Icon name="help" />快捷键与关于墨台</button>
          </div>
        </div>
        <span class="menubar-title">{{ settingsActive ? '设置' : active?.name || '墨台' }}</span>
        <button class="theme-button" title="设置 (Ctrl+,)" aria-label="打开设置" @click="openSettings"><Icon name="settings" :size="15"/></button>
        <button class="theme-button" :title="theme === 'dark' ? '切换浅色界面' : '切换深色界面'" aria-label="切换主题" @click="toggleTheme"><Icon :name="theme === 'dark' ? 'sun' : 'moon'" :size="14" />{{ theme === 'dark' ? '深色' : '浅色' }}</button>
      </div>
      <div class="main-toolbar" role="toolbar" aria-label="文档工具栏">
        <div class="toolbar-group">
          <button class="tool-button" title="新建文档 (Ctrl+N)" aria-label="新建文档" :disabled="busy" @click="newDocument"><Icon name="file-plus" /></button>
          <button class="tool-button" title="打开文件 (Ctrl+O)" aria-label="打开文件" :disabled="busy" @click="openFiles"><Icon name="folder-open" /></button>
          <button class="tool-button" title="保存 (Ctrl+S)" aria-label="保存 Markdown" :disabled="!active || busy || settingsActive" @click="saveMarkdown()"><Icon name="save" /></button>
        </div>
        <fieldset class="toolbar-group format-tools" :disabled="!active || busy || loading || settingsActive">
          <button class="tool-button" title="粗体 (Ctrl+B)" aria-label="粗体" @pointerdown.prevent @click="editorCommand('bold')"><Icon name="bold" /></button>
          <button class="tool-button" title="斜体 (Ctrl+I)" aria-label="斜体" @pointerdown.prevent @click="editorCommand('italic')"><Icon name="italic" /></button>
          <button class="tool-button" title="删除线" aria-label="删除线" @pointerdown.prevent @click="editorCommand('strikethrough')"><Icon name="strikethrough" /></button>
          <button class="tool-button" title="代码块" aria-label="代码块" @pointerdown.prevent @click="editorCommand('insert', 'code')"><Icon name="code" /></button>
          <span class="toolbar-separator"></span>
          <button class="tool-button" title="引用" aria-label="引用" @pointerdown.prevent @click="editorCommand('quote')"><Icon name="quote" /></button>
          <button class="tool-button" title="无序列表" aria-label="无序列表" @pointerdown.prevent @click="editorCommand('list', 'ul')"><Icon name="list" /></button>
          <button class="tool-button" title="有序列表" aria-label="有序列表" @pointerdown.prevent @click="editorCommand('list', 'ol')"><Icon name="ordered" /></button>
          <button class="tool-button" title="表格" aria-label="插入表格" @pointerdown.prevent @click="editorCommand('insert', 'normal-table-3*3')"><Icon name="table" /></button>
          <span class="toolbar-separator"></span>
          <div class="menu-container heading-container">
            <button class="tool-button heading-tool" title="标题 H1～H6" aria-label="标题级别" :aria-expanded="menu === 'heading'" @pointerdown.prevent @click="menu = menu === 'heading' ? '' : 'heading'"><Icon name="heading" /><Icon name="chevron" :size="10" /></button>
            <div v-if="menu === 'heading'" class="dropdown menu-left heading-dropdown"><button v-for="level in 6" :key="level" @pointerdown.prevent @click="editorCommand('header', String(level))"><Icon :name="`heading-${level}`" /><span>{{ level }} 级标题</span></button></div>
          </div>
          <span class="toolbar-separator"></span>
          <button class="tool-button" title="链接" aria-label="插入链接" @pointerdown.prevent @click="editorCommand('insert', 'link')"><Icon name="link" /></button>
          <button class="tool-button" title="图片" aria-label="插入图片" @pointerdown.prevent @click="editorCommand('insert', 'image')"><Icon name="image" /></button>
          <button class="tool-button" title="表情符号" aria-label="插入表情符号" @pointerdown.prevent @click="showEmoji=true"><Icon name="smile" /></button>
        </fieldset>
        <div class="toolbar-group menu-container">
          <button class="tool-button diagram-tool" title="插入 Mermaid 图表" aria-label="插入 Mermaid 图表" :disabled="!active || busy || settingsActive" @click="menu = menu === 'diagram' ? '' : 'diagram'"><Icon name="graph" /><Icon name="chevron" :size="10" /></button>
          <div v-if="menu === 'diagram'" class="dropdown menu-left"><MermaidMenu :types="settings.mermaidTypes" :disabled="!active || busy || settingsActive" @insert="insertSnippet" @examples="openMermaidExamples" /></div>
        </div>
        <fieldset class="toolbar-group history-tools" :disabled="!active || busy || loading || settingsActive">
          <button class="tool-button" title="撤销 (Ctrl+Z)" aria-label="撤销" @pointerdown.prevent @click="editorCommand('undo')"><Icon name="undo" /></button>
          <button class="tool-button" title="重做 (Ctrl+Y)" aria-label="重做" @pointerdown.prevent @click="editorCommand('redo')"><Icon name="redo" /></button>
          <button class="tool-button" title="查找 / 替换 (Ctrl+F)" aria-label="查找和替换" @pointerdown.prevent @click="editorCommand('search')"><Icon name="search" /></button>
        </fieldset>
        <div class="toolbar-spacer"></div>
        <div class="toolbar-group view-tools" role="group" aria-label="编辑视图">
          <button class="tool-button" :class="{ active: mode === 'editOnly' }" title="仅源码" aria-label="仅源码" :aria-pressed="mode === 'editOnly'" @click="setMode('editOnly')"><Icon name="code" :size="17" /></button>
          <button class="tool-button" :class="{ active: mode === 'edit&preview' }" title="源码与预览" aria-label="源码与预览" :aria-pressed="mode === 'edit&preview'" @click="setMode('edit&preview')"><Icon name="split" :size="17" /></button>
          <button class="tool-button" :class="{ active: mode === 'previewOnly' }" title="仅预览" aria-label="仅预览" :aria-pressed="mode === 'previewOnly'" @click="setMode('previewOnly')"><Icon name="eye" :size="17" /></button>
        </div>
        <div class="menu-container export-container">
          <button class="tool-button export-button" aria-label="导出" :disabled="!active || busy || loading || settingsActive" @click="menu = menu === 'export' ? '' : 'export'"><Icon name="download" :size="17" /><span>{{ busy ? '准备中…' : '导出' }}</span><Icon name="chevron" :size="10" /></button>
          <div v-if="menu === 'export'" class="dropdown export-menu"><button @click="exportDocument('html')"><Icon name="code" />导出 HTML<span class="extension">.html</span></button><button @click="exportDocument('pdf')"><Icon name="printer" />导出 PDF<span class="extension">.pdf</span></button><div class="menu-separator"></div><label class="export-toc-option"><input v-model="htmlHasToc" type="checkbox" @change="persistExportToc" />HTML 包含目录</label><label class="export-toc-option"><input v-model="exportToc" type="checkbox" @change="persistExportToc" />PDF 包含目录</label></div>
        </div>
      </div>
    </header>

    <div class="workarea" :style="{ gridTemplateColumns: sidebar && !settingsActive ? `${sidebarWidth*interfaceScale}px ${4*interfaceScale}px minmax(0, 1fr)` : '0 0 minmax(0, 1fr)' }">
      <aside class="sidebar" aria-label="文档侧栏">
        <div class="activitybar"><button :class="{ active: sidebarTab === 'files' }" title="文档" aria-label="显示文档" @click="sidebarTab = 'files'"><Icon name="folder" :size="21" /></button><button :class="{ active: sidebarTab === 'outline' }" title="大纲" aria-label="显示大纲" @click="sidebarTab = 'outline'"><Icon name="outline" :size="21" /></button><button class="activity-bottom" title="收起侧栏" aria-label="收起侧栏" @click="toggleSidebar"><Icon name="panel" :size="19" /></button></div>
        <div class="explorer">
          <div class="explorer-header"><span>{{ sidebarTab === 'files' ? '文档' : '大纲' }}</span><span class="explorer-count">{{ sidebarTab === 'files' ? workspaceDocuments.length : headings.length }}</span><button class="small-button" title="新建文档" aria-label="侧栏新建文档" @click="newDocument"><Icon name="plus" :size="15" /></button></div>
          <template v-if="sidebarTab === 'files'">
            <div class="file-search"><Icon name="search" :size="13" /><input v-model="filter" placeholder="筛选文档" aria-label="筛选文档" /><button v-if="filter" title="清除筛选" aria-label="清除筛选" @click="filter = ''"><Icon name="close" :size="12" /></button></div>
            <nav class="preset-section" aria-label="预置文档目录树">
              <div class="folder-heading"><button class="preset-root-toggle" :aria-expanded="presetRootExpanded" aria-label="预置文档" @click="presetRootExpanded=!presetRootExpanded"><Icon name="chevron" :size="10" :class="{collapsed:!presetRootExpanded}"/><Icon name="folder" :size="14"/><span>预置文档</span><small>{{presetEntries.length}}</small></button><button class="small-button" title="刷新预置文档目录" aria-label="刷新预置文档目录" @click="refreshPresets(true)"><Icon name="refresh" :size="13"/></button><button v-if="platform.native" class="small-button" title="打开预置文档目录" aria-label="打开预置文档目录" @click="openStorageFolder('builtin')"><Icon name="folder" :size="13"/></button></div>
              <div v-if="presetRootExpanded" class="folder-content"><FolderTree :entries="presetTree" :active-key="currentPresetKey" @open="openBuiltinDocument($event.relativePath)" @toggle="togglePresetFolder"/><p v-if="!presetTree.length" class="empty-message">没有匹配的预置文档</p><small v-if="presetOpening" class="preset-opening" role="status">正在打开预置文档…</small></div>
            </nav>
            <div v-if="!folderRoot" class="folder-open-row"><button @click="openFolder"><Icon name="folder" :size="14" />打开文件夹…</button></div>
            <div v-if="folderRoot" class="folder-section"><div class="folder-heading"><Icon name="folder" :size="14" /><span :title="folderRoot.path">{{ folderRoot.name }}</span><button class="small-button" title="刷新文件夹" aria-label="刷新文件夹" @click="refreshFolder"><Icon name="refresh" :size="13" /></button><button class="small-button" title="关闭文件夹" aria-label="关闭文件夹" @click="closeFolder"><Icon name="close" :size="13" /></button></div><div class="folder-content"><FolderTree :entries="folderRoot.children" :filter="filter" :active-key="active?.folderKey || active?.path" @open="openFolderFile" @toggle="toggleFolder" /><p v-if="folderRoot.loading" class="empty-message">正在读取文件夹…</p><p v-else-if="!folderRoot.children.length" class="empty-message">没有 Markdown 或文本文件</p></div></div>
            <div class="explorer-root" :title="activeDirectory"><Icon name="chevron" :size="11" /><Icon name="folder" :size="15" /><span>工作区文档</span></div>
            <nav class="document-list" aria-label="文档列表">
              <button v-for="document in filteredDocuments" :key="document.id" class="document-item" :data-document-id="document.id" :class="{ active: !settingsActive && activeId === document.id }" :title="document.path || `${document.name}（本地草稿）`" @click="activateDocument(document.id)" @dblclick="beginRename(document)"><Icon name="markdown" :size="16" /><span>{{ document.name }}</span></button>
              <p v-if="!filteredDocuments.length" class="empty-message">没有匹配的文档</p>
            </nav>
          </template>
          <nav v-else class="outline-list" aria-label="文档大纲"><button v-for="heading in headings" :key="heading.line" :class="{active:activeHeadingLine===heading.line}" :style="{ paddingLeft: `${10 + (heading.level - 1) * 12}px` }" @click="jumpToHeading(heading)"><span class="heading-level">H{{ heading.level }}</span><span>{{ heading.title }}</span></button><p v-if="!headings.length" class="empty-message">此文档没有标题</p></nav>
        </div>
      </aside>
      <div class="sidebar-resizer" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" :aria-valuenow="sidebarWidth" @pointerdown="resizeSidebar"></div>
      <main class="main-area">
        <div class="tabstrip">
          <button v-if="!sidebar" class="tool-button reopen-sidebar" title="展开侧栏" aria-label="展开侧栏" @click="toggleSidebar"><Icon name="panel" :size="16" /></button>
          <div class="document-tabs" role="tablist" aria-label="打开的文档">
            <div v-for="document in openDocuments" :key="document.id" class="document-tab" :data-tab-id="document.id" :class="{ active: !settingsActive && activeId === document.id }">
              <button class="tab-label" role="tab" :aria-selected="!settingsActive && activeId === document.id" :title="document.path || document.name" @click="activateDocument(document.id)" @dblclick="beginRename(document)"><Icon name="markdown" :size="15" /><span>{{ document.name }}</span><span v-if="hasUnacknowledgedDiskChange(document)" class="disk-change-dot" role="img" aria-label="磁盘版本已更新" title="磁盘版本已更新"></span></button>
              <button v-if="diskChanges.has(document.id)" class="tab-disk-reload" type="button" :aria-label="`重新载入 ${document.name}`" title="重新载入磁盘版本" :disabled="diskOperations.has(document.id)" @click="requestDiskReload(document)"><Icon name="refresh" :size="14" /></button>
              <button class="tab-close" :aria-label="`关闭 ${document.name}`" title="关闭标签页（草稿会保留）" @click="closeDocumentTab(document.id)"><Icon name="close" :size="12" /></button>
            </div>
          </div>
          <div v-if="settingsTabOpen" class="document-tab settings-tab" :class="{active:settingsActive}"><button class="tab-label" role="tab" :aria-selected="settingsActive" aria-label="设置" @click="openSettings"><Icon name="settings" :size="15"/><span>设置</span></button><button class="tab-close" aria-label="关闭设置标签页" @click="closeSettings"><Icon name="close" :size="12"/></button></div>
          <button class="tab-new" title="新建文档 (Ctrl+N)" aria-label="新建标签页" @click="newDocument"><Icon name="plus" :size="16" /></button>
          <button class="tab-refresh" title="重新渲染" aria-label="重新渲染" :disabled="!active" @click="refreshPreview"><Icon name="refresh" :size="14" /></button>
        </div>
        <div class="editor-stage" v-show="!settingsActive" @wheel.capture="fontWheel" @pointerdown.capture="rememberPane" @focusin="rememberPane" @click.capture="previewClick" @dblclick.capture="openDiagramFromEvent" :class="{ 'only-preview': mode === 'previewOnly', 'no-document': !active }">
          <div ref="host" class="editor-host" :aria-hidden="!active"></div>
          <div v-if="!loading && !fatalError && !active" class="empty-editor"><Icon name="file" :size="40" /><p>没有打开的文档</p><div><button @click="newDocument">新建文档 <kbd>Ctrl+N</kbd></button><button @click="openFiles">打开文件 <kbd>Ctrl+O</kbd></button></div><small>点击左侧预置文档的文件名，可打开示例和模板</small></div>
          <div v-if="loading || fatalError" class="loading-overlay"><span v-if="loading" class="loader"></span><p>{{ fatalError ? '编辑器未能启动' : '正在加载文档…' }}</p><small v-if="fatalError">{{ fatalError }}</small></div>
        </div>
        <SettingsPage v-if="settingsTabOpen" v-show="settingsActive" :values="settings" :saving="settingsSaving" :error="settingsSaveError" :storage="nativeStorageInfo" :file-association="fileAssociation" @open-folder="openStorageFolder" @update="updateSetting" @reset-group="resetSettingsGroup" @reset-all="resetAllSettings" @export="exportSettings" @clear-cache="clearRenderCaches" @import="importSettings" @error="notify"
          @register-file-association="runAssociationAction(platform.registerMarkdownAssociation)"
          @unregister-file-association="runAssociationAction(platform.unregisterMarkdownAssociation)"
          @clear-file-association-history="runAssociationAction(platform.clearMarkdownOpenWithHistory,$event)"
          @clear-legacy-file-association-apps="runAssociationAction(platform.clearLegacyMarkdownOpenWithApps,$event)"
          @open-file-association-settings="runAssociationAction(platform.openMarkdownDefaultApps)"
          @refresh-file-association="associationError='';refreshFileAssociation()" />
      </main>
    </div>
    <footer class="statusbar"><div class="status-left"><span class="status-dot" :class="{ pending: rendering, error: diagramError || storageError }"></span><span>{{ storageError ? '草稿保存失败' : saving ? '保存草稿…' : '草稿已保存' }}</span><span class="status-separator"></span><span class="status-path" :title="active?.path || ''">{{ active?.path || active?.name || '就绪' }}</span></div><div class="status-right"><button class="interface-scale-status" aria-label="调整界面缩放" @click.stop="menu = menu === 'view' ? '' : 'view'">界面 {{ Math.round(interfaceScale*100) }}%</button><span v-if="active" class="render-state">{{ renderLabel }}</span><span>{{ characterCount }} 字符</span><span>{{ lineCount }} 行</span><span>UTF-8</span><span>Markdown</span></div></footer>

    <HtmlExportPreview v-if="htmlSnapshot" ref="htmlPreview" :snapshot="htmlSnapshot" :preferences="settings" :saving="htmlSaving" @setting="updateSetting" @save="saveHtml" @close="closeHtmlPreview" @settings="openSettings" @contextmenu="openHtmlContextMenu" @error="notify" />
    <ContextMenu v-if="contextMenu" :key="contextMenu.key" v-bind="contextMenu" :scale="interfaceScale" @close="contextMenu = null" @error="notify" />
    <EmojiPicker :preferences="settings" :persist="persistEmojiPreferences" :on-save-error="notify" @setting="updateSetting" v-if="showEmoji" @select="insertEmoji" @close="showEmoji=false" />
    <input ref="folderInput" type="file" webkitdirectory multiple hidden @change="folderImported" />
    <input ref="input" type="file" accept=".md,.markdown,.txt" multiple hidden @change="imported" />
    <dialog ref="diskChangeDialog" class="dialog disk-change-dialog" role="alertdialog" aria-modal="true" aria-labelledby="disk-change-title" aria-describedby="disk-change-file disk-change-description" @cancel.prevent="dismissDiskChange">
      <h2 id="disk-change-title">{{ activeDiskChange?.kind === 'unknown' ? '磁盘内容与旧工作区草稿不同' : '文件已在磁盘上更改' }}</h2>
      <p id="disk-change-file" class="disk-change-file" :title="active?.path">{{ active?.name }}</p>
      <p id="disk-change-description">{{ diskReloadNeedsBackup ? '重新载入会替换当前内容。选择备份后，可以在工作区找回当前草稿。' : '重新载入后，编辑区和预览将显示磁盘上的最新内容。' }}</p>
      <p v-if="diskReloadMessage" class="disk-change-message" role="alert">{{ diskReloadMessage }}</p>
      <div class="dialog-actions">
        <button type="button" class="secondary-button" autofocus :disabled="diskOperations.has(activeId)" @click="dismissDiskChange">{{ diskReloadNeedsBackup ? '保留当前草稿' : '稍后' }}</button>
        <button type="button" class="primary-button" :disabled="diskOperations.has(activeId)" @click="reloadDiskDocument(diskReloadNeedsBackup)">{{ diskReloadNeedsBackup ? '备份草稿并重新载入' : '重新载入' }}</button>
      </div>
    </dialog>
    <div v-if="toast" class="toast" role="status"><Icon name="check" :size="16" />{{ toast }}<button aria-label="关闭提示" @click="toast = ''"><Icon name="close" :size="14" /></button></div>
    <div v-if="renameId" class="modal-backdrop" @click.self="renameId = ''"><form class="dialog rename-dialog" @submit.prevent="applyRename"><h2>重命名文档</h2><p>修改工作区名称，不会重命名磁盘上的文件。</p><label class="rename-input"><input v-model="renameValue" aria-label="文档名称" autofocus maxlength="100" /><span>.md</span></label><div class="dialog-actions"><button type="button" class="secondary-button" @click="renameId = ''">取消</button><button type="submit" class="primary-button">确定</button></div></form></div>
    <div v-if="deletingId" class="modal-backdrop" @click.self="deletingId = ''"><div class="dialog"><h2>删除草稿</h2><p>移除「{{ deletedDocument?.name }}」在工作区中的草稿。已保存到磁盘的文件不受影响。</p><div class="dialog-actions"><button class="secondary-button" @click="deletingId = ''">取消</button><button class="danger-button" @click="removeDocument">删除草稿</button></div></div></div>
    <div v-if="showHelp" class="modal-backdrop" @click.self="showHelp = false"><div class="dialog help-dialog"><h2>墨台</h2><p>本地 Markdown 编辑器 · v{{ appVersion }}</p><p v-if="platform.native">系统显示缩放 {{ Math.round(systemDisplayScale*100) }}% · 界面缩放 {{ Math.round(interfaceScale*100) }}%</p><dl><dt>新建文档</dt><dd>Ctrl+N</dd><dt>打开文件</dt><dd>Ctrl+O</dd><dt>保存 / 另存为</dt><dd>Ctrl+S / Ctrl+Shift+S</dd><dt>关闭当前标签页</dt><dd>Ctrl+W</dd><dt>切换标签页</dt><dd>Ctrl+Tab / Ctrl+Shift+Tab</dd><dt>查找 / 替换</dt><dd>Ctrl+F / Ctrl+H</dd><dt>当前窗格字号</dt><dd>Ctrl++ / Ctrl+- / Ctrl+0</dd><dt>鼠标所在窗格字号</dt><dd>Ctrl＋鼠标滚轮</dd><dt>界面控件缩放</dt><dd>Ctrl+Alt++ / Ctrl+Alt+- / Ctrl+Alt+0</dd></dl><p>拖动侧栏边界或源码 / 预览之间的分隔线可调整宽度。双击文档名可重命名。</p><div class="dialog-actions"><button class="primary-button" @click="showHelp = false">关闭</button></div></div></div>
    <div v-if="diagramViewer" class="diagram-viewer" role="dialog" aria-modal="true" aria-label="图表放大查看">
      <header><span>Mermaid 图表</span><div><button aria-label="放大视图缩小" title="缩小" @click="changeViewerZoom(viewerZoom / 1.25)"><Icon name="zoom-out" :size="16" /></button><span>{{ Math.round(viewerZoom * 100) }}%</span><button aria-label="放大视图放大" title="放大" @click="changeViewerZoom(viewerZoom * 1.25)"><Icon name="zoom-in" :size="16" /></button><button @click="changeViewerZoom(1)"><Icon name="rotate-ccw" :size="16" />100%</button><button @click="fitDiagramViewer"><Icon name="move-horizontal" :size="16" />适应宽度</button><button class="diagram-viewer-close" aria-label="关闭图表查看" @click="diagramViewer = null"><Icon name="close" :size="18" /></button></div></header>
      <div class="diagram-viewer-scroll" @click="handlePreviewLink"><div class="diagram-viewer-canvas" :style="{ width: `${diagramViewer.width * viewerZoom}px` }" v-html="diagramViewer.html"></div></div>
    </div>
    <div v-if="printHtml" class="print-modal"><header><div><Icon name="printer" :size="18" /><span>PDF 导出预览<small>{{ active?.name }}</small></span></div><div><div class="pdf-options"><label>纸张<select v-model="settings.pdfPaper" aria-label="PDF 纸张" @change="updatePdfLayout"><option>A4</option><option>Letter</option></select></label><label>方向<select v-model="settings.pdfLandscape" aria-label="PDF 方向" @change="updatePdfLayout"><option :value="false">纵向</option><option :value="true">横向</option></select></label><label>页边距<select v-model.number="settings.pdfMargin" aria-label="PDF 页边距" @change="updatePdfLayout"><option v-for="value in [10,14,20,25]" :key="value" :value="value">{{ value }} mm</option></select></label></div><button class="primary-button" :disabled="!printReady || pdfDownloading" @click="printPdf"><Icon name="printer" :size="15" />{{ pdfDownloading ? '正在生成…' : printReady ? '保存 PDF…' : '正在排版…' }}</button><button class="small-button" aria-label="关闭 PDF 预览" @click="closePdfPreview"><Icon name="close" :size="18" /></button></div></header><iframe ref="printFrame" :style="{width:pdfOptions.landscape?'min(1160px,calc(100% - 40px))':'min(960px,calc(100% - 40px))'}" :srcdoc="printHtml" title="PDF 文档预览" @load="printLoaded"></iframe></div>
  </div>
</template>
