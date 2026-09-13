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
/* 统一给公式加浅背景以提升可读性：使用半透明中性色，深浅主题均可辨识 */
.katex-inline {
  padding: 0.05em 0.35em;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.07);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.katex-inline :deep(.katex) {
  font-size: 24px;
  color: inherit;
}

.katex-block {
  color: inherit;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.6em 0.9em;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.07);
}

.katex-block :deep(.katex-display) {
  font-size: 24px;
  color: inherit;
  margin: 0.25em 0;
}

.katex-block :deep(.katex) {
  color: inherit;
}

/* 相邻展示公式合并为一个连续框：消除接缝处的圆角缺口 */
/* 后面紧跟公式时，去掉自身下方圆角 */
.katex-block:has(+ .katex-block) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

/* 前面是公式时，去掉自身上方圆角 */
.katex-block + .katex-block {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
</style>
