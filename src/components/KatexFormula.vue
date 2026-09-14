<script setup>
import { computed } from 'vue'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// 通用数学公式渲染组件：把 LaTeX 字符串交给 KaTeX 排版。
// 结果区（表1/表2/不确定度明细）与需要公式展示的地方复用，KaTeX 默认继承父级颜色以适配深浅主题。
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
/* 浅背景与字号行内/展示共用一份，不再写两遍；颜色由 KaTeX 默认继承父级 */
.katex-inline,
.katex-block {
  background: rgba(128, 128, 128, 0.08);
}

.katex-inline :deep(.katex),
.katex-block :deep(.katex) {
  font-size: 18px;
}

/* 行内：贴合正文，换行时背景不断裂 */
.katex-inline {
  padding: 0.05em 0.35em;
  border-radius: 4px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

/* 展示：独立成行，超宽可横向滚动 */
.katex-block {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.6em 0.9em;
  border-radius: 8px;
}

.katex-block :deep(.katex-display) {
  margin: 0.25em 0;
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
