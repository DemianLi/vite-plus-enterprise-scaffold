<script setup lang="ts">
// api-surface 的 SFC 解析用的假元件。與 sample/src/index.ts 同一個用途：
// 它存在就是為了被改壞。
//
// 三種公開面各留一格：prop、slot、emit。2026-08-17 之前這裡只有 prop，
// 於是「slot 與 emit 有沒有被守到」這個問題連問都問不出來。
//
// ⚠️ slot 的回傳型別寫 `unknown[]` 而不是真的 `VNode[]`：這份 fixture 沒有
// 裝 vue，而這支解析記的是**原文**，型別是什麼對它沒有差別。寫成 VNode[]
// 只會讓 fixture 多一個它不需要的相依。
type Tone = "muted" | "loud";

defineProps<{
  label: string;
  tone?: Tone;
}>();

defineSlots<{
  default(): unknown[];
  icon(): unknown[];
}>();

const emit = defineEmits<{
  picked: [label: string];
}>();
</script>

<!-- 用 <button> 而不是 <span>：click 掛在非互動元素上會被 a11y 閘門擋
     （vuejs-accessibility/click-events-have-key-events）。fixture 也要過閘門 ——
     產生器與 fixture 都是教學品，示範什麼別人就照抄什麼。 -->
<template>
  <button type="button" @click="emit('picked', label)">
    <slot name="icon" />{{ label }}<slot />
  </button>
</template>
