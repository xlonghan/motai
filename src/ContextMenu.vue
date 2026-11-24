<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
const props = defineProps({ x: Number, y: Number, items: Array, scale: { type: Number, default: 1 } });
const emit = defineEmits(['close', 'error']);
const root = ref(null);
const position = ref({ left: `${props.x / props.scale}px`, top: `${props.y / props.scale}px` });
function outside(event) { if (!root.value?.contains(event.target)) emit('close'); }
async function run(item) {
  if (item.disabled) return;
  emit('close');
  try { await item.run(); } catch (error) { emit('error', error.message || String(error)); }
}
function keys(event) {
  if (event.key === 'Escape') { event.stopPropagation(); emit('close'); return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const items = [...root.value.querySelectorAll('button:not(:disabled)')];
  const current = items.indexOf(document.activeElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : current < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[index]?.focus();
}
onMounted(async () => {
  await nextTick();
  const bounds = root.value.getBoundingClientRect();
  position.value = { left: `${Math.max(4, Math.min(props.x, innerWidth - bounds.width - 4)) / props.scale}px`, top: `${Math.max(4, Math.min(props.y, innerHeight - bounds.height - 4)) / props.scale}px` };
  root.value.querySelector('button:not(:disabled)')?.focus();
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', outside);
});
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', outside); });
</script>

<template>
  <div ref="root" class="context-menu dropdown" :style="{...position,zoom:scale}" role="menu" aria-label="快捷操作" @keydown="keys" @contextmenu.prevent>
    <template v-for="(item,index) in items" :key="index">
      <div v-if="item.separator" class="menu-separator" role="separator"></div>
      <button v-else role="menuitem" :disabled="item.disabled" @pointerdown.prevent @click="run(item)"><Icon :name="item.icon || 'file'" :size="15" /><span>{{ item.label }}</span><kbd v-if="item.shortcut">{{ item.shortcut }}</kbd></button>
    </template>
  </div>
</template>
