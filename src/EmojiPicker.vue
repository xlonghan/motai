<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import data from './data/emoji.json';
import Icon from './Icon.vue';
import { createEmojiCatalog } from './emoji-catalog.js';
const props=defineProps({preferences:{type:Object,default:()=>({emojiTone:'',emojiRecentLimit:24,emojiSearchScope:'all'})},persist:Function,onSaveError:Function});
const emit = defineEmits(['select','close','setting']);
const names = { 'Smileys & Emotion':'表情与情感','People & Body':'人物与身体','Component':'肤色与发型','Animals & Nature':'动物与自然','Food & Drink':'食物与饮品','Travel & Places':'旅行与地点','Activities':'活动','Objects':'物品','Symbols':'符号','Flags':'旗帜' };
const categoryIcons = { 'Smileys & Emotion':'smile','People & Body':'hand','Component':'puzzle','Animals & Nature':'paw-print','Food & Drink':'apple','Travel & Places':'car','Activities':'activity','Objects':'lightbulb','Symbols':'heart','Flags':'flag' };
const catalog = createEmojiCatalog(data);
let saved=[];
try { saved=JSON.parse(localStorage.getItem('markdown-desk-recent-emoji')||'[]'); } catch {}
const { byEmoji } = catalog;
const recent = ref(Array.isArray(saved)?saved.filter(e=>byEmoji.has(e)).slice(0,props.preferences.emojiRecentLimit):[]);
const group = ref(recent.value.length?'recent':data.groups[0]);
const query = ref('');
const subgroup = ref('');
const subgroups = computed(()=>data.subgroups.filter(item=>item.g===group.value));
const tone = computed({get:()=>props.preferences.emojiTone,set:value=>emit('setting','emojiTone',value)});
const search = ref(null);
const grid = ref(null);
const scrollTop = ref(0);
const focusedIndex = ref(0);
const activeName = ref('');
const options = computed(()=>({group:group.value,subgroup:subgroup.value,query:query.value,tone:tone.value,recent:recent.value,searchScope:props.preferences.emojiSearchScope}));
const candidates = computed(()=>catalog.candidates(options.value));
const showTone = computed(()=>(group.value!=='recent' || query.value.trim()) && candidates.value.some(catalog.supportsTone));
const matches = computed(()=>catalog.filter(options.value));
function glyph(item){
  // Modifiers are meaningful when joined to a person/hand. Show a hand sample,
  // while keeping the actual inserted character exactly as the catalog defines.
  return item.s==='skin-tone' ? '👋'+item.e : item.e;
}
const columns=8;
const rowHeight=40;
const firstRow=computed(()=>Math.max(0,Math.floor(scrollTop.value/rowHeight)-2));
const firstIndex=computed(()=>firstRow.value*columns);
const visibleItems=computed(()=>matches.value.slice(firstIndex.value,firstIndex.value+columns*11));
const topSpace=computed(()=>firstRow.value*rowHeight);
const bottomSpace=computed(()=>Math.max(0,Math.ceil(matches.value.length/columns)*rowHeight-topSpace.value-Math.ceil(visibleItems.value.length/columns)*rowHeight));
function choose(item){
  recent.value=[item.e,...recent.value.filter(e=>e!==item.e)].slice(0,props.preferences.emojiRecentLimit);
  try{localStorage.setItem('markdown-desk-recent-emoji',JSON.stringify(recent.value));Promise.resolve(props.persist?.()).catch(error=>props.onSaveError?.(String(error)));}
  catch(error){props.onSaveError?.('表情偏好保存失败：'+String(error));}
  emit('select',item.e);
}
function chooseGroup(value){group.value=value;subgroup.value='';query.value='';}
watch([group,subgroup,query,tone],()=>{activeName.value='';scrollTop.value=0;focusedIndex.value=0;if(grid.value)grid.value.scrollTop=0;});
function scroll(event){scrollTop.value=event.target.scrollTop;}
async function navigate(event){
  let index=focusedIndex.value;
  if(event.key==='ArrowRight')index++;else if(event.key==='ArrowLeft')index--;else if(event.key==='ArrowDown')index+=columns;else if(event.key==='ArrowUp')index-=columns;else if(event.key==='Home')index=0;else if(event.key==='End')index=matches.value.length-1;else return;
  event.preventDefault();focusedIndex.value=Math.max(0,Math.min(matches.value.length-1,index));
  const row=Math.floor(focusedIndex.value/columns)*rowHeight;
  if(row<grid.value.scrollTop)grid.value.scrollTop=row;
  else if(row+rowHeight>grid.value.scrollTop+grid.value.clientHeight)grid.value.scrollTop=row+rowHeight-grid.value.clientHeight;
  scrollTop.value=grid.value.scrollTop;
  await nextTick();grid.value.querySelector(`[data-emoji-index="${focusedIndex.value}"]`)?.focus();
}
onMounted(()=>search.value?.focus());
</script>
<template>
  <div class="emoji-backdrop" @pointerdown.self="emit('close')">
    <section class="emoji-picker" role="dialog" aria-label="Unicode 表情符号" @keydown.esc.stop="emit('close')">
      <header><span>表情符号</span><button class="small-button" aria-label="关闭表情选择器" @click="emit('close')"><Icon name="close" :size="16" /></button></header>
      <div class="emoji-search"><Icon name="search" :size="14" /><input ref="search" v-model="query" aria-label="搜索表情" placeholder="搜索表情（中文 / English）" /><button v-if="query" class="small-button" aria-label="清空表情搜索" @click="query=''"><Icon name="close" :size="14" /></button></div>
      <nav class="emoji-categories" role="tablist" aria-label="表情分类">
        <button role="tab" :aria-selected="group==='recent'" :disabled="!recent.length" title="最近使用" aria-label="最近使用" @click="chooseGroup('recent')"><Icon name="clock" :size="19" /></button>
        <button v-for="entry in data.groups" :key="entry" role="tab" :aria-selected="group===entry" :title="names[entry]" :aria-label="names[entry]" @click="chooseGroup(entry)"><Icon :name="categoryIcons[entry]" :size="19" /></button>
      </nav>
      <div class="emoji-group-title"><span>{{ query ? '搜索结果' : group==='recent' ? '最近使用' : names[group] }} <small>{{ matches.length }}</small></span><label v-if="showTone" class="emoji-tone">肤色 <select v-model="tone" aria-label="人物与手势肤色"><option value="">默认黄色</option><option v-for="(skin,index) in ['🏻','🏼','🏽','🏾','🏿']" :key="skin" :value="skin">{{ '👋'+skin }} {{ ['浅色','中浅','中等','中深','深色'][index] }}</option><option value="all">显示全部变体</option></select></label></div>
      <label v-if="!query && subgroups.length" class="emoji-subcategory">细分类 <select v-model="subgroup" aria-label="表情细分类"><option value="">全部{{ names[group] }}</option><option v-for="entry in subgroups" :key="entry.id" :value="entry.id">{{ entry.n }}</option></select></label>
      <p v-if="group==='Component' && !query" class="emoji-component-hint">这些是组合组件。给人物选肤色请使用“人物与身体”。</p>
      <div ref="grid" class="emoji-scroll" @scroll.passive="scroll" @keydown="navigate">
        <div :style="{height:`${topSpace}px`}"></div>
        <div class="emoji-grid"><button v-for="(item,index) in visibleItems" :key="item.e" :data-emoji-index="firstIndex+index" :tabindex="focusedIndex===firstIndex+index?0:-1" :aria-label="item.n" :title="item.n" @focus="focusedIndex=firstIndex+index;activeName=item.n" @mouseenter="activeName=item.n" @click="choose(item)">{{ glyph(item) }}</button></div>
        <div :style="{height:`${bottomSpace}px`}"></div><p v-if="!matches.length" class="empty-message">没有匹配的表情</p>
      </div>
      <footer><span>{{ activeName || '选择表情插入文档' }}</span><small>Unicode {{ data.version }}</small></footer>
    </section>
  </div>
</template>
