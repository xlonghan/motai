import { interfaceScales, normalizePaneFontZoom } from './display-settings.js';
import { htmlThemes, htmlTocPositions, htmlTocStates, htmlTocWidthLimits } from './html-export-options.js';

export const SETTINGS_KEY = 'markdown-desk-settings-v1';
export const commonDiagramTypes = [
  ['flowchart','流程图'],['sequence','时序图'],['class','类图'],['state','状态图'],['pie','饼图'],['mindmap','思维导图'],['er','ER 图'],['kanban','看板'],['architecture','架构图'],
];
const options = values => values.map(value => Array.isArray(value) ? {value:value[0],label:value[1]} : {value,label:String(value)});
const select = (key,label,value,values,description='') => ({key,label,default:value,type:'select',options:options(values),description});
const number = (key,label,value,min,max,step=1,unit='',description='') => ({key,label,default:value,type:'number',min,max,step,unit,description});
const toggle = (key,label,value,description='') => ({key,label,default:value,type:'toggle',description});
const fonts = [['system','系统无衬线'],['yahei','微软雅黑'],['consolas','Consolas'],['cascadia','Cascadia Code'],['serif','衬线字体']];
export const fontFamilies = {
  system:'"Segoe UI","Microsoft YaHei",sans-serif', yahei:'"Microsoft YaHei","Segoe UI",sans-serif',
  consolas:'Consolas,"Cascadia Code","Microsoft YaHei",monospace', cascadia:'"Cascadia Code",Consolas,"Microsoft YaHei",monospace',
  serif:'Georgia,"Songti SC",SimSun,serif',
};
export const settingsGroups = [
  {id:'appearance',label:'外观与布局',icon:'panel',description:'界面控件与两个文档窗格保持独立。',fields:[
    select('theme','界面主题','dark',[['dark','深色'],['light','浅色'],['system','跟随系统']]),
    select('interfaceScale','界面缩放',1.25,interfaceScales.map(value=>[value,`${Math.round(value*100)}%`]),'只调整菜单、工具栏、侧栏等控件，不改变源码、预览及导出字号。'),
    select('viewMode','文档视图','edit&preview',[['edit&preview','源码与预览'],['editOnly','仅源码'],['previewOnly','仅预览']]),
    toggle('sidebarVisible','显示文档侧栏',true,'返回文档时显示侧栏。'),
    select('sidebarTab','侧栏默认页','files',[['files','文档'],['outline','大纲']]),
    number('sidebarWidth','侧栏宽度',250,190,420,1,'px'),
    toggle('toolbarVisible','显示快捷工具栏',true),toggle('statusbarVisible','显示底部状态栏',true),
  ]},
  {id:'editor',label:'源码编辑',icon:'code',description:'修改后即时应用，Ctrl＋鼠标滚轮只调整鼠标所在窗格。',fields:[
    select('editorFont','源码字体','consolas',fonts),number('editorFontSize','源码字号',14,10,36,1,'px'),
    number('editorLineHeight','源码行距',1.6,1.2,2.6,.1,'倍'),toggle('wordWrap','自动换行',true),
    select('tabWidth','Tab 显示宽度',4,[2,4,8],'调整已有 Tab 字符的显示宽度，不转换文档内容。'),
    toggle('highlightLine','高亮当前行',true),
  ]},
  {id:'preview',label:'预览与阅读',icon:'eye',description:'实时预览和 HTML 的「跟随编辑器预览」样式使用这些阅读设置。',fields:[
    select('previewFont','预览字体','system',fonts),number('previewFontSize','预览字号',15,10,36,1,'px'),
    number('previewLineHeight','预览行距',1.7,1.2,2.6,.1,'倍'),
    select('previewTheme','预览配色','system',[['light','浅色'],['dark','深色'],['system','跟随界面']]),
    select('previewWidth','正文最大宽度',0,[[0,'使用窗格全部宽度'],[720,'720px'],[960,'960px'],[1200,'1200px']]),
    number('previewPadding','正文留白',32,12,64,2,'px'),toggle('previewCodeWrap','代码块自动换行',false),
  ]},
  {id:'mermaid',label:'Mermaid 图表',icon:'graph',description:'图表样式独立于界面缩放。修改排版设置会重新渲染图表。',fields:[
    select('mermaidTheme','图表主题','auto',[['auto','跟随预览配色'],['default','默认'],['neutral','中性'],['dark','深色'],['forest','森林']]),
    number('mermaidFontSize','图表字号',18,12,32,1,'px'),number('mermaidWrapWidth','节点换行宽度',280,160,600,20,'px'),
    select('mermaidFit','初始显示比例','original',[['original','原始大小，可横向滚动'],['fit','适应窗格宽度']]),
    {key:'mermaidTypes',label:'插入菜单中的常用类型',type:'checklist',default:commonDiagramTypes.map(([id])=>id),options:options(commonDiagramTypes),description:'只影响插入菜单，不限制文档中的 Mermaid 类型。'},
  ]},
  {id:'files',label:'文件与保存',icon:'folder',description:'草稿自动保存不会自动写回磁盘上的 Markdown 原文件。',fields:[
    number('autosaveMs','停止输入后保存草稿',1200,500,10000,100,'ms','持续输入时也会定期保存草稿。Ctrl+S 用于保存原文件。'),
    select('recentFilesLimit','最近文件数量',12,[5,12,24,50]),
    toggle('restoreSession','启动时恢复打开的标签页',true,'下次启动时生效；关闭此项仍会保留工作区里的文档与草稿。'),
    toggle('restoreFolder','启动时恢复上次文件夹',true,'下次启动时生效。'),
  ]},
  {id:'export',label:'HTML / PDF 导出',icon:'download',description:'PDF 和其他 HTML 样式使用独立的导出排版设置。',fields:[
    select('htmlTheme','HTML 导出样式','preview',htmlThemes),
    select('htmlTocPosition','HTML 目录位置','left',htmlTocPositions),
    select('htmlTocState','HTML 目录初始状态','expanded',htmlTocStates),
    select('htmlTocDepth','HTML 目录包含层级',3,[[1,'到 H1'],[2,'到 H2'],[3,'到 H3'],[4,'到 H4'],[5,'到 H5'],[6,'到 H6']]),
    number('htmlTocWidth','HTML 侧栏目录宽度',htmlTocWidthLimits.default,htmlTocWidthLimits.min,htmlTocWidthLimits.max,1,'px','也可在 HTML 预览中拖动目录分割线；双击分割线恢复默认宽度。'),
    toggle('htmlCodeWrap','HTML 代码块自动换行',false,'关闭时保留代码行，并在代码块内横向滚动。'),
    toggle('exportToc','PDF 默认包含可点击目录',true),select('tocDepth','PDF 目录包含层级',6,[[1,'到 H1'],[2,'到 H2'],[3,'到 H3'],[4,'到 H4'],[5,'到 H5'],[6,'到 H6']]),
    select('exportFont','导出正文字体','system',fonts),number('exportFontSize','HTML 正文字号',15,10,28,1,'px'),
    number('exportLineHeight','导出正文行距',1.85,1.2,2.6,.05,'倍'),select('exportWidth','HTML 正文最大宽度',0,[[0,'自适应窗口全宽'],[960,'960px'],[1200,'1200px']]),
    select('pdfPaper','PDF 纸张','A4',['A4','Letter']),select('pdfLandscape','PDF 方向',false,[[false,'纵向'],[true,'横向']]),
    select('pdfMargin','PDF 页边距',14,[[10,'10mm'],[14,'14mm'],[20,'20mm'],[25,'25mm']]),number('pdfFontSize','PDF 正文字号',10.5,8,20,.5,'pt'),
  ]},
  {id:'insert',label:'插入与 Emoji',icon:'smile',description:'新建模板与标准 Unicode 表情。',fields:[
    {key:'newDocumentTemplate',label:'新建文档默认内容',default:'# {{title}}\n\n',type:'textarea',maxLength:10000,description:'{{title}} 会替换为新文档标题。只影响之后新建的文档。'},
    select('emojiTone','默认表情肤色','',[['','默认黄色'],['🏻','浅色'],['🏼','中浅'],['🏽','中等'],['🏾','中深'],['🏿','深色'],['all','显示全部变体']],'仅作用于支持肤色的人物和手势，符号、旗帜等分类不显示肤色控件。'),
    select('emojiRecentLimit','最近表情数量',24,[12,24,48]),select('emojiSearchScope','表情搜索范围','all',[['all','全部分类'],['category','当前分类']]),
  ]},
  {id:'shortcuts',label:'快捷键与鼠标',icon:'keyboard',description:'常用快捷键保留原有操作方式。',fields:[
    toggle('ctrlWheelZoom','启用 Ctrl＋滚轮调整字号',true,'源码和预览分别调整，普通滚轮保持滚动。'),
    select('fontZoomStep','每次调整字号幅度',1,[[1,'1px'],[2,'2px'],[3,'3px']]),
  ]},
  {id:'advanced',label:'高级与数据',icon:'advanced',description:'配置可以单独迁移；恢复设置或清理渲染缓存不会删除文档和草稿。',fields:[
    number('noticeMs','操作提示停留时间',4200,1000,10000,100,'ms'),
    select('logLevel','桌面日志级别','info',[['error','仅错误'],['warn','警告与错误'],['info','常规（推荐）'],['debug','详细诊断']],'桌面版即时生效。记录操作状态与耗时，不记录文档、图片或剪贴板内容。网页版仅保存此偏好。'),
  ]},
];
export const settingsFields = settingsGroups.flatMap(group=>group.fields);
const definitions = new Map(settingsFields.map(field=>[field.key,field]));
export function defaultSettings(native=false) {
  return Object.fromEntries(settingsFields.map(field=>[field.key,field.key==='interfaceScale'&&!native?1:structuredClone(field.default)]));
}
export function normalizeSettings(input={},native=false) {
  const defaults=defaultSettings(native), result={};
  for(const field of settingsFields){
    let value=input?.[field.key];
    if(field.type==='toggle') value=typeof value==='boolean'?value:defaults[field.key];
    else if(field.type==='number') {
      value=value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value):defaults[field.key];
      value=Math.max(field.min,Math.min(field.max,value));
      value=Number((field.min+Math.round((value-field.min)/field.step)*field.step).toFixed(5));
    } else if(field.type==='select') value=field.options.some(option=>option.value===value)?value:defaults[field.key];
    else if(field.type==='checklist') value=Array.isArray(value)?[...new Set(value.filter(entry=>field.options.some(option=>option.value===entry)))]:defaults[field.key];
    else value=typeof value==='string'?value.slice(0,field.maxLength):defaults[field.key];
    result[field.key]=value;
  }
  return result;
}
export function readSettings(storage,native=false) {
  let stored=null, invalid=false;
  try {const raw=storage.getItem(SETTINGS_KEY);if(raw){const parsed=JSON.parse(raw);if(parsed&&parsed.version===1&&parsed.values&&typeof parsed.values==='object'&&!Array.isArray(parsed.values))stored=parsed.values;else invalid=true;}} catch {invalid=true;}
  const legacy={};
  const get=key=>{try{return storage.getItem(`markdown-desk-${key}`);}catch{return null;}};
  const set=(key,value)=>{if(value!==null)legacy[key]=value;};
  set('theme',get('desktop-theme'));set('interfaceScale',get('interface-scale')===null?null:Number(get('interface-scale')));
  const oldZoom=get('font-zoom');
  legacy.editorFontSize=14+normalizePaneFontZoom(get('editor-font-zoom')??oldZoom);
  legacy.previewFontSize=15+normalizePaneFontZoom(get('preview-font-zoom')??oldZoom);
  set('wordWrap',get('word-wrap')===null?null:get('word-wrap')!=='false');set('exportToc',get('export-toc')===null?null:get('export-toc')!=='false');set('emojiTone',get('emoji-tone'));
  try {const pdf=JSON.parse(get('pdf-options')||'null');if(pdf){set('pdfPaper',pdf.paper??null);set('pdfLandscape',pdf.landscape??null);set('pdfMargin',pdf.margin??null);}}catch{}
  if(stored?.htmlTocPosition===undefined&&(stored?.exportToc===false||legacy.exportToc===false))legacy.htmlTocPosition='none';
  if(stored?.htmlTocDepth===undefined&&stored?.tocDepth)legacy.htmlTocDepth=stored.tocDepth;
  return {values:normalizeSettings({...legacy,...stored},native),hasStored:stored!==null,invalid};
}
export function encodeSettings(values,native=false) {
  return JSON.stringify({application:'墨台',version:1,values:normalizeSettings(values,native)},null,2);
}
export function decodeSettings(text) {
  if(text.length>256*1024)throw new Error('设置文件不能超过 256KB');
  let data;try{data=JSON.parse(text);}catch{throw new Error('设置文件不是有效的 JSON');}
  if(!data||data.version!==1||!data.values||typeof data.values!=='object'||Array.isArray(data.values))throw new Error('设置文件格式或版本不受支持');
  const values=Object.fromEntries(Object.entries(data.values).filter(([key])=>definitions.has(key)));
  if(!Object.keys(values).length)throw new Error('设置文件中没有可识别的设置项');
  return values;
}
