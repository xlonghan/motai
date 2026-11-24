<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { settingsGroups, fontFamilies, decodeSettings } from './settings.js';
const props=defineProps({values:Object,saving:Boolean,error:String,storage:Object,fileAssociation:Object});
const emit=defineEmits([
  'update','reset-group','reset-all','export','clear-cache','import','error','open-folder',
  'register-file-association','unregister-file-association','open-file-association-settings','refresh-file-association','clear-file-association-history',
  'clear-legacy-file-association-apps',
]);
const directories=[['builtin','预置文档目录'],['data','数据目录'],['documents','新建文档目录'],['exports','导出目录'],['logs','日志目录']];
const category=ref('appearance'), query=ref(''), fileInput=ref(null), search=ref(null), content=ref(null), confirmReset=ref(false);
onMounted(()=>search.value?.focus());
const advancedMatch=computed(()=>{const q=query.value.trim().toLowerCase();return q&&'高级 数据 目录 预置 builtin 便携 日志 logs 导入设置 导出设置 备份 迁移 渲染缓存 清理缓存 恢复默认 重置 import export cache reset'.includes(q);});
const fileAssociationMatch=computed(()=>{
  const q=query.value.trim().toLowerCase();
  return Boolean(props.fileAssociation?.supported&&q&&'文件与保存 markdown .md 文件关联 打开方式 打开记录 清理墨台打开记录 添加到打开方式 从打开方式移除 清理重复墨台登记 清理失效程序项 双击 注册 取消注册 windows 默认应用 file association default app'.includes(q));
});
const fileAssociationUnavailable=computed(()=>props.fileAssociation?.busy||!props.fileAssociation?.loaded);
const hasOwnedAssociation=computed(()=>props.fileAssociation?.registered||props.fileAssociation?.hasOwnedRegistration&&!props.fileAssociation?.defaultHandlerRetained);
const openWithHistory=computed(()=>props.fileAssociation?.openWithHistory??[]);
const legacyOpenWithGroups=computed(()=>{
  const apps=props.fileAssociation?.legacyOpenWithApps??[];
  return [
    {label:'清理重复墨台登记',description:'这些旧副本和当前墨台位于同一目录，Windows 会把它们显示为同名应用。清理只移除登记，程序文件会保留。',items:apps.filter(item=>item.duplicate)},
    {label:'清理失效程序项',description:'以下旧版程序文件已不存在，可清理 Windows 中对应的失效登记。',items:apps.filter(item=>!item.duplicate)},
  ].filter(group=>group.items.length);
});
const filtered=computed(()=>{
  const q=query.value.trim().toLowerCase();
  return settingsGroups.map(group=>({...group,fields:group.fields.filter(field=>!q||`${group.label} ${field.label} ${field.description} ${field.key} ${(field.options||[]).map(option=>option.label).join(' ')}`.toLowerCase().includes(q))}))
    .filter(group=>q?group.fields.length||group.id==='shortcuts'&&visibleShortcuts.value.length||group.id==='advanced'&&advancedMatch.value||group.id==='files'&&fileAssociationMatch.value:group.id===category.value);
});
const count=computed(()=>filtered.value.reduce((total,group)=>total+group.fields.length,0)+Number(fileAssociationMatch.value));
const visibleShortcuts=computed(()=>{const q=query.value.trim().toLowerCase();return shortcuts.filter(([label,keys])=>!q||`${label} ${keys} 快捷键`.toLowerCase().includes(q));});
function choose(id){category.value=id;query.value='';confirmReset.value=false;if(content.value)content.value.scrollTop=0;}
function update(field,event){
  let value=event.target.value;
  if(field.type==='toggle')value=event.target.checked;
  if(field.type==='number'){
    if(value===''||!Number.isFinite(Number(value))){event.target.value=props.values[field.key];return;}
    value=Number(value);
  }
  if(field.type==='select')value=field.options.find(option=>String(option.value)===value)?.value;
  emit('update',field.key,value);
  if(field.type==='number')nextTick(()=>{event.target.value=props.values[field.key];});
}
function numberInput(field,event){if(event.target.value!==''&&event.target.validity.valid)update(field,event);}
function checklist(field,option,checked){const values=props.values[field.key];emit('update',field.key,checked?[...values,option]:values.filter(value=>value!==option));}
async function imported(event){
  const file=event.target.files?.[0];if(!file)return;
  try{if(file.size>256*1024)throw new Error('设置文件不能超过 256KB');emit('import',decodeSettings(await file.text()));}
  catch(error){emit('error',error.message);}finally{event.target.value='';}
}
const shortcuts=[['打开设置','Ctrl+,'],['新建 / 打开','Ctrl+N / Ctrl+O'],['保存 / 另存为','Ctrl+S / Ctrl+Shift+S'],['关闭标签页','Ctrl+W'],['切换标签页','Ctrl+Tab / Ctrl+Shift+Tab'],['查找 / 替换','Ctrl+F / Ctrl+H'],['自动换行','Alt+Z'],['当前窗格字号','Ctrl++ / Ctrl+- / Ctrl+0'],['鼠标所在窗格字号','Ctrl＋鼠标滚轮'],['界面控件比例','Ctrl+Alt++ / Ctrl+Alt+- / Ctrl+Alt+0']];
</script>
<template>
  <section class="settings-page" aria-label="设置">
    <header class="settings-header"><Icon name="settings" :size="18" /><strong>设置</strong><div class="settings-search"><Icon name="search" :size="15"/><input ref="search" v-model="query" aria-label="搜索设置" placeholder="搜索设置，例如字号、目录、Mermaid"/><button v-if="query" class="small-button" aria-label="清空设置搜索" @click="query=''"><Icon name="close" :size="14" /></button></div><span class="settings-save-state" :class="{failed:error}" role="status">{{error?'保存失败':saving?'正在保存…':'已自动保存'}}</span></header>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类"><button v-for="group in settingsGroups" :key="group.id" :class="{active:!query&&category===group.id}" :aria-current="!query&&category===group.id?'page':undefined" @click="choose(group.id)"><Icon :name="group.icon" :size="16"/><span>{{group.label}}</span></button></nav>
      <div ref="content" class="settings-content">
        <p v-if="error" class="settings-error" role="alert">{{error}}。可以导出设置备份后重试。</p>
        <p v-if="query" class="settings-results">找到 {{count}} 个设置<span v-if="visibleShortcuts.length">，{{visibleShortcuts.length}} 条快捷键参考</span><span v-if="advancedMatch">，数据维护操作</span></p>
        <p v-if="!filtered.length" class="empty-message">没有匹配的设置，请尝试其他关键词。</p>
        <section v-for="group in filtered" :key="group.id" class="settings-group" :aria-label="group.label">
          <div class="settings-group-heading"><div><h2>{{group.label}}</h2><p>{{group.description}}</p></div><button class="secondary-button" :aria-label="`恢复${group.label}默认设置`" @click="emit('reset-group',group.id)"><Icon name="refresh" :size="13"/>恢复本组默认</button></div>
          <div v-for="field in group.fields" :key="field.key" class="setting-row" :class="{'setting-row-wide':field.type==='checklist'||field.type==='textarea'}">
            <div class="setting-label"><label :for="`setting-${field.key}`">{{field.label}}</label><small v-if="field.description" :id="`hint-${field.key}`">{{field.description}}</small></div>
            <div class="setting-control" @contextmenu.stop>
              <input v-if="field.type==='toggle'" :id="`setting-${field.key}`" type="checkbox" :checked="values[field.key]" :aria-describedby="field.description?`hint-${field.key}`:undefined" @change="update(field,$event)"/>
              <select v-else-if="field.type==='select'" :id="`setting-${field.key}`" :value="String(values[field.key])" @change="update(field,$event)"><option v-for="option in field.options" :key="String(option.value)" :value="String(option.value)">{{option.label}}</option></select>
              <template v-else-if="field.type==='number'"><input :id="`setting-${field.key}`" type="number" :value="values[field.key]" :min="field.min" :max="field.max" :step="field.step" @input="numberInput(field,$event)" @change="update(field,$event)"/><span class="setting-unit">{{field.unit}}</span></template>
              <textarea v-else-if="field.type==='textarea'" :id="`setting-${field.key}`" :value="values[field.key]" :maxlength="field.maxLength" rows="5" spellcheck="false" @input="update(field,$event)"></textarea>
              <div v-else-if="field.type==='checklist'" :id="`setting-${field.key}`" class="setting-checklist" role="group" :aria-label="field.label"><label v-for="option in field.options" :key="option.value"><input type="checkbox" :checked="values[field.key].includes(option.value)" @change="checklist(field,option.value,$event.target.checked)"/>{{option.label}}</label></div>
            </div>
          </div>
          <div v-if="group.id==='files'&&fileAssociation?.supported&&(!query.trim()||fileAssociationMatch)" class="settings-data-actions settings-file-association">
            <h3>Markdown 文件关联</h3>
            <p v-if="fileAssociation.busy" role="status">正在处理文件关联…</p>
            <p v-else-if="fileAssociation.error" class="settings-error" role="alert">{{fileAssociation.error}}</p>
            <div role="status"><p v-if="fileAssociation.notice">{{fileAssociation.notice}}</p></div>
            <section>
              <h4>打开方式</h4>
              <p>管理右键点击 <code>.md</code> 文件时的候选登记和打开记录。</p>
              <template v-if="fileAssociation.loaded">
                <dl class="file-association-status" aria-live="polite">
                  <div><dt>此副本的候选登记</dt><dd>{{fileAssociation.registered?'已添加':hasOwnedAssociation?'登记不完整':'未添加'}}</dd></div>
                  <div v-if="openWithHistory.length"><dt>可清理的打开记录</dt><dd>{{openWithHistory.join('、')}}</dd></div>
                </dl>
                <p v-if="fileAssociation.registeredElsewhere">Windows 中还有其他位置的墨台登记。</p>
                <p v-if="fileAssociation.defaultHandlerRetained">此副本的候选登记已撤销，启动命令已保留。</p>
              </template>
              <div class="file-association-actions">
                <button type="button" class="secondary-button" :disabled="fileAssociationUnavailable||fileAssociation.registered" @click="emit('register-file-association')"><Icon name="file-plus" :size="14"/>添加到打开方式</button>
                <button type="button" class="secondary-button" :disabled="fileAssociationUnavailable||!hasOwnedAssociation" @click="emit('unregister-file-association')"><Icon name="trash" :size="14"/>从打开方式移除</button>
                <button v-if="openWithHistory.length" type="button" class="secondary-button" :disabled="fileAssociationUnavailable" @click="emit('clear-file-association-history',[...openWithHistory])"><Icon name="trash" :size="14"/>清理墨台打开记录</button>
              </div>
              <template v-for="group in legacyOpenWithGroups" :key="group.label">
                <p>{{group.description}}</p>
                <ul class="file-association-legacy"><li v-for="item in group.items" :key="item.name"><strong>{{item.name}}</strong><code>{{item.path}}</code></li></ul>
                <button type="button" class="secondary-button" :disabled="fileAssociationUnavailable" @click="emit('clear-legacy-file-association-apps',group.items.map(item=>item.name))"><Icon name="trash" :size="14"/>{{group.label}}</button>
              </template>
            </section>
            <section>
              <h4>Windows 默认应用</h4>
              <p>决定双击 <code>.md</code> 文件时使用的程序。设为默认时，墨台会先完成必要的登记，再打开 Windows 设置供你确认。</p>
              <dl v-if="fileAssociation.loaded" class="file-association-status" aria-live="polite">
                <div><dt>默认打开程序</dt><dd>{{fileAssociation.defaultKnown===false?'暂时无法读取':fileAssociation.isDefault?'此墨台':fileAssociation.defaultExecutable||'其他应用或未设置'}}</dd></div>
              </dl>
              <div class="file-association-actions">
                <button type="button" class="secondary-button" :disabled="fileAssociation.busy" @click="emit('open-file-association-settings')"><Icon name="external-link" :size="14"/>{{fileAssociation.isDefault?'打开 Windows 默认应用':'设为 .md 默认应用…'}}</button>
                <button type="button" class="secondary-button" :disabled="fileAssociation.busy" @click="emit('refresh-file-association')"><Icon name="refresh" :size="14"/>刷新状态</button>
              </div>
            </section>
          </div>
          <div v-if="group.id==='editor'||group.id==='preview'" class="settings-sample"><small>字号与行距预览</small><div :style="{fontFamily:fontFamilies[values[group.id+'Font']],fontSize:values[group.id+'FontSize']+'px',lineHeight:values[group.id+'LineHeight'],zoom:1/values.interfaceScale}">Markdown，让内容清晰呈现。<br/>Aa Bb 0123456789 · 中文与 English</div></div>
          <dl v-if="group.id==='shortcuts'&&visibleShortcuts.length" class="settings-shortcuts"><template v-for="[label,keys] in visibleShortcuts" :key="label"><dt>{{label}}</dt><dd>{{keys}}</dd></template></dl>
          <div v-if="group.id==='advanced'&&storage&&(!query||advancedMatch)" class="settings-data-actions storage-directories">
            <h3>{{storage.installed?'用户数据与日志':'便携数据与日志'}}</h3>
            <p v-if="storage.installed">数据保存在当前 Windows 账户下。数据目录为 <code>{{storage.root}}</code>。</p>
            <p v-else>数据随程序目录保存。迁移到其他位置时，请复制整个文件夹。</p>
            <div v-for="[key,label] in directories" :key="key" class="storage-directory"><div><strong>{{label}}</strong><code>{{storage[key]}}</code></div><button class="secondary-button" @click="emit('open-folder',key)"><Icon name="folder-open" :size="14" />打开{{label}}</button></div>
            <p>日志单文件上限 1 MB，保留最近 5 份历史日志。记录启动、保存、导出及异常状态，不包含文档正文、图片或剪贴板内容。</p>
          </div>
          <div v-if="group.id==='advanced'&&(!query||advancedMatch)" class="settings-data-actions">
            <h3>设置备份与迁移</h3><p>只包含偏好设置，不包含文档、草稿或最近文件。</p>
            <div><button class="secondary-button" @click="emit('export')"><Icon name="download" :size="14"/>导出设置…</button><button class="secondary-button" @click="fileInput.click()"><Icon name="upload" :size="14"/>导入设置…</button></div>
            <h3>渲染缓存</h3><p>清理图表和图片缓存，保留文档与草稿。</p>
            <button class="secondary-button" @click="emit('clear-cache')"><Icon name="trash" :size="14" />清理渲染缓存</button>
            <h3>恢复默认</h3>
            <button v-if="!confirmReset" class="secondary-button" @click="confirmReset=true"><Icon name="rotate-ccw" :size="14" />恢复全部默认设置…</button>
            <div v-else class="settings-confirm"><span>恢复全部设置，保留文档和草稿。</span><button class="primary-button" @click="emit('reset-all');confirmReset=false"><Icon name="check" :size="14" />确认恢复</button><button class="secondary-button" @click="confirmReset=false">取消</button></div>
          </div>
        </section>
      </div>
    </div>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden aria-label="导入设置文件" @change="imported"/>
  </section>
</template>
