<script setup>
import { computed } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// 通用数学公式渲染组件：把 LaTeX 字符串交给 KaTeX 排版。
// 结果区（表1/表2/不确定度明细）与需要公式展示的地方复用，颜色继承父级以适配深浅主题。
const props = defineProps({
  latex: { type: String, required: true },
  // block=true 为独立成行的展示公式，否则为行内公式
  block: { type: Boolean, default: false },
})

const html = computed(() => {
  try {
    return katex.renderToString(props.latex, {
      throwOnError: false,
      displayMode: props.block,
      output: 'html',
    })
  } catch {
    return ''
  }
})
</script>

<template>
  <span v-if="!block" class="katex-inline" v-html="html" />
  <div v-else class="katex-block" v-html="html" />
</template>

<style scoped>
/* 让公式颜色跟随文本、字号贴合正文，避免深色主题下不可见 */
.katex-inline :deep(.katex) {
  font-size: 20px;
  color: inherit;
  line-height: 1.6;
}

.katex-block {
  color: inherit;
  overflow-x: auto;
  overflow-y: hidden;
}

.katex-block :deep(.katex-display) {
  margin: 0.25em 0;
}

.katex-block :deep(.katex) {
  color: inherit;
}
</style>
