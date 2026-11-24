<script setup>
import { iconAttributes, iconNodes } from './icons.js';

defineProps({ name: String, size: { type: [Number, String], default: 18 } });
</script>

<template>
  <svg v-bind="iconAttributes(name, size)">
    <component v-for="([tag, attrs], index) in iconNodes(name)" :key="index" :is="tag" v-bind="attrs" />
  </svg>
</template>
