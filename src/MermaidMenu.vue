<script setup>
import Icon from './Icon.vue';
import { computed } from 'vue';
import { commonMermaidCatalog } from './mermaid-catalog.js';
const props=defineProps({ disabled: Boolean, types: {type:Array,default:()=>commonMermaidCatalog.map(item=>item.id)} });
const visibleTypes=computed(()=>commonMermaidCatalog.filter(item=>props.types.includes(item.id)));
const diagramIcons={flowchart:'workflow',sequence:'arrow-down-up',class:'boxes',state:'git-branch',pie:'chart-pie',mindmap:'waypoints',er:'database',kanban:'kanban',architecture:'layers'};
const emit = defineEmits(['insert', 'examples']);
</script>

<template>
  <div class="mermaid-menu-block">
    <div class="dropdown-label">Mermaid 图表</div>
    <div class="mermaid-menu-list" role="group" aria-label="Mermaid 图表类型">
      <button v-for="item in visibleTypes" :key="item.id" :disabled="disabled" :title="item.syntax" @pointerdown.prevent @click="emit('insert', item.id)"><Icon :name="diagramIcons[item.id] || 'graph'" :size="16" /><span>{{ item.id === 'er' ? 'ER 图' : item.id === 'architecture' ? '架构图' : item.name }}</span></button><p v-if="!visibleTypes.length" class="dropdown-label">可在设置中选择常用图表类型。</p>
    </div>
    <div class="menu-separator"></div>
    <button :disabled="disabled" @click="emit('examples')"><Icon name="file" />打开常用图表示例</button>
  </div>
</template>
