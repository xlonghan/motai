<script setup>
import Icon from './Icon.vue';
defineProps({ entries: Array, filter: {type:String,default:''}, activeKey: String, depth: { type: Number, default: 0 } });
defineEmits(['open', 'toggle']);
</script>
<template>
  <div class="folder-tree" role="group">
    <template v-for="entry in entries" :key="entry.id">
      <button v-show="entry.kind==='directory'||entry.name.toLowerCase().includes(filter.toLowerCase())" class="folder-tree-item" :class="{ active: activeKey === entry.id }" :style="{ paddingLeft: `${8 + depth * 14}px` }" :title="entry.path || entry.name" :data-folder-entry="entry.id" :aria-expanded="entry.kind === 'directory' ? entry.expanded : undefined" @click="entry.kind === 'directory' ? $emit('toggle',entry) : $emit('open',entry)"><Icon v-if="entry.kind === 'directory'" name="chevron" :size="10" :class="{ collapsed: !entry.expanded }" /><span v-else class="tree-indent"></span><Icon :name="entry.kind === 'directory' ? 'folder' : 'markdown'" :size="15" /><span>{{ entry.name }}</span><small v-if="entry.loading">…</small></button>
      <FolderTree v-if="entry.kind === 'directory' && entry.expanded" :entries="entry.children || []" :filter="filter" :active-key="activeKey" :depth="depth + 1" @open="$emit('open',$event)" @toggle="$emit('toggle',$event)" />
    </template>
  </div>
</template>
