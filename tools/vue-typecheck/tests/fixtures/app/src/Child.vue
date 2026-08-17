<script setup lang="ts">
import type { VNode } from "vue";

/** 反向測試用的假元件。三種公開面各一格：prop、帶 payload 的 slot、事件。 */
defineProps<{
  label: string;
  count: number;
}>();

defineSlots<{
  badge(props: { total: number }): VNode[];
}>();

defineEmits<{
  picked: [id: string];
}>();
</script>

<template>
  <div>
    <span>{{ label }}</span>
    <slot name="badge" :total="count" />
    <button type="button" @click="$emit('picked', label)">pick</button>
  </div>
</template>
