<script setup>
import { NSpin, NButton } from 'naive-ui'

// §5 LoadingScreen 收敛：全屏深色遮罩只保留转圈 + 文字；失败态给重试入口
defineProps({
  text: { type: String, default: '正在加载图像处理引擎…' },
  error: { type: String, default: '' },
})
defineEmits(['retry'])
</script>

<template>
  <div class="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-4 bg-layout">
    <template v-if="!error">
      <n-spin size="large" />
      <p class="text-sm opacity-70">{{ text }}</p>
    </template>
    <template v-else>
      <p class="text-sm text-red-400">{{ error }}</p>
      <n-button type="primary" @click="$emit('retry')">重试</n-button>
    </template>
  </div>
</template>
