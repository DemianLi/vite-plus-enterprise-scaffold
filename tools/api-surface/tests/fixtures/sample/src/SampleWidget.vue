<script setup lang="ts">
// api-surface 的 SFC 解析用的假元件。與 sample/src/index.ts 同一個用途：
// 它存在就是為了被改壞。
type Tone = "muted" | "loud";

defineProps<{
  label: string;
  tone?: Tone;
}>();
</script>

<template>
  <span>{{ label }}</span>
</template>
