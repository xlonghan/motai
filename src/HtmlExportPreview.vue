<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { htmlThemes, htmlTocPositions, htmlTocStates } from './html-export-options.js';
import { createHtmlExportDocument, applyHtmlExportOptions, serializeHtmlExportDocument } from './html-export.js';
import { installHtmlExportRuntime } from './html-export-runtime.js';
import { waitForImages } from './export-document.js';
const props=defineProps({snapshot:Object,preferences:Object,saving:Boolean});
const emit=defineEmits(['setting','save','close','settings','contextmenu','error']);
const frame=ref(null),ready=ref(false),error=ref('');
const initialHtml=createHtmlExportDocument(props.snapshot,props.preferences,false);
let runtime,frameDocument;
const relevant=computed(()=>Object.fromEntries(['htmlTheme','htmlTocPosition','htmlTocState','htmlTocDepth','htmlTocWidth','htmlCodeWrap','exportFont','exportFontSize','exportLineHeight','exportWidth','pdfFontSize'].map(key=>[key,props.preferences[key]])));
function setting(key,event){let value=event.target.value;if(['htmlTocDepth','htmlTocWidth','exportFontSize','exportWidth'].includes(key))value=Number(value);if(key==='htmlCodeWrap')value=event.target.checked;emit('setting',key,value);}
async function loaded(){
  cleanup();frameDocument=frame.value?.contentDocument;if(!frameDocument)return;
  try{
    runtime=installHtmlExportRuntime(frameDocument,{onTocWidthChange:width=>emit('setting','htmlTocWidth',width)});
    frameDocument.addEventListener('keydown',keys);
    frameDocument.addEventListener('contextmenu',frameContext);
    await frameDocument.fonts.ready;await waitForImages(frameDocument);
    ready.value=true;
  }catch(failure){error.value=failure.message||String(failure);emit('error',error.value);}
}
function save(){if(ready.value&&!props.saving)emit('save',serializeHtmlExportDocument(frameDocument));}
function close(){if(!props.saving)emit('close');}
function contextMenu(event,inFrame=false){
  event.preventDefault();event.stopPropagation();
  const bounds=inFrame?frame.value.getBoundingClientRect():{left:0,top:0};
  emit('contextmenu',{x:bounds.left+event.clientX,y:bounds.top+event.clientY,ready:ready.value});
}
const frameContext=event=>contextMenu(event,true);
function cleanup(){runtime?.destroy();frameDocument?.removeEventListener('keydown',keys);frameDocument?.removeEventListener('contextmenu',frameContext);}
function keys(event){
  const ctrl=event.ctrlKey||event.metaKey;
  if(event.key==='Escape'||ctrl&&event.key.toLowerCase()==='w'){event.preventDefault();close();}
  else if(ctrl&&event.key.toLowerCase()==='s'){event.preventDefault();save();}
  else if(ctrl&&event.key===','){event.preventDefault();emit('settings');}
}
watch(relevant,()=>{if(frameDocument){const change=applyHtmlExportOptions(frameDocument,props.snapshot,props.preferences);if(change.outlineChanged)runtime?.refresh();else runtime?.layout();}},{deep:true});
onBeforeUnmount(cleanup);
defineExpose({save});
</script>
<template>
  <section class="html-export-modal" role="dialog" aria-modal="true" aria-label="HTML 导出预览" @contextmenu.prevent.stop="contextMenu($event)">
    <header><div class="html-export-heading"><Icon name="code" :size="18"/><span>HTML 导出预览<small>{{snapshot.name}}</small></span></div>
      <div class="html-export-controls"><label>样式<select :value="preferences.htmlTheme" aria-label="HTML 导出样式" @change="setting('htmlTheme',$event)"><option v-for="[key,label] in htmlThemes" :key="key" :value="key">{{label}}</option></select></label>
        <label>目录<select :value="preferences.htmlTocPosition" aria-label="HTML 目录位置" @change="setting('htmlTocPosition',$event)"><option v-for="[key,label] in htmlTocPositions" :key="key" :value="key">{{label}}</option></select></label>
        <label v-if="preferences.htmlTocPosition!=='none'">层级<select :value="preferences.htmlTocDepth" aria-label="HTML 目录层级" @change="setting('htmlTocDepth',$event)"><option v-for="depth in 6" :key="depth" :value="depth">到 H{{depth}}</option></select></label>
        <label v-if="preferences.htmlTocPosition!=='none'" title="设置目录的展开方式；保存时保留预览中的实际展开状态">初始<select :value="preferences.htmlTocState" aria-label="HTML 目录初始状态" @change="setting('htmlTocState',$event)"><option v-for="[key,label] in htmlTocStates" :key="key" :value="key">{{label}}</option></select></label>
        <label v-if="['left','right'].includes(preferences.htmlTocPosition)">侧栏<select :value="preferences.htmlTocWidth" aria-label="HTML 侧栏目录宽度" @change="setting('htmlTocWidth',$event)"><option v-if="![220,260,300,340].includes(preferences.htmlTocWidth)" :value="preferences.htmlTocWidth">{{preferences.htmlTocWidth}}px</option><option v-for="width in [220,260,300,340]" :key="width" :value="width">{{width}}px</option></select></label>
        <template v-if="preferences.htmlTheme!=='preview'">
          <label>正文<select :value="preferences.exportWidth" aria-label="HTML 正文宽度" @change="setting('exportWidth',$event)"><option :value="0">自适应全宽</option><option :value="960">960px</option><option :value="1200">1200px</option></select></label>
          <label>字号<select :value="preferences.exportFontSize" aria-label="HTML 正文字号" @change="setting('exportFontSize',$event)"><option v-for="size in 19" :key="size" :value="size+9">{{size+9}}px</option></select></label>
          <label class="html-code-wrap"><input type="checkbox" :checked="preferences.htmlCodeWrap" aria-label="HTML 代码块自动换行" @change="setting('htmlCodeWrap',$event)"/>代码折行</label>
        </template>
      </div>
      <div class="html-export-actions"><button class="primary-button" :disabled="!ready||saving" @click="save"><Icon name="download" :size="15"/>{{saving?'正在保存…':'保存 HTML…'}}</button><button class="small-button" aria-label="关闭 HTML 预览" :disabled="saving" @click="close"><Icon name="close" :size="18"/></button></div>
    </header>
    <div v-if="error" class="html-export-error" role="alert">{{error}}</div>
    <div class="html-export-canvas"><iframe ref="frame" :srcdoc="initialHtml" sandbox="allow-same-origin" title="HTML 文档预览" @load="loaded"></iframe></div>
    <footer>{{ready?'预览与保存使用相同排版；导出的 HTML 可独立离线打开。':'正在准备字体与图片…'}}<span>Ctrl+S 保存 · Esc 关闭</span></footer>
  </section>
</template>
