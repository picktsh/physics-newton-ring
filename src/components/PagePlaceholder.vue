<script setup>
import { NCard, NTag, NSpace } from 'naive-ui'

defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
})
</script>

<template>
  <n-card :bordered="false" class="bg-card">
    <n-space align="center" :size="12">
      <i v-if="icon" :class="icon" class="text-2xl text-primary" />
      <span class="text-xl font-semibold">{{ title }}</span>
      <n-tag type="info" :bordered="false" round>开发中…</n-tag>
    </n-space>
    <p class="mt-4 text-sm opacity-60">
      这是「{{ title }}」页面的占位组件，业务功能将在后续里程碑逐步迁移进来。
    </p>
  </n-card>
</template>
