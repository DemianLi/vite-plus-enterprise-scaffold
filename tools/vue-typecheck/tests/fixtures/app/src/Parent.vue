<script setup lang="ts">
import Child from "./Child.vue";

function onPicked(id: string): void {
  void id;
}
</script>

<template>
  <Child label="hi" :count="1" @picked="onPicked">
    <template #badge="{ total }">{{ total.toFixed(0) }}</template>
  </Child>
</template>
