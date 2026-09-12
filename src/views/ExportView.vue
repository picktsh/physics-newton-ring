<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NButton, NSpace, NAlert, NUpload, NDivider, useMessage, NEmpty } from 'naive-ui'
import ResultTables from '@/components/ResultTables.vue'
import {
  buildResultPayload,
  parseResultJSON,
  toJSON,
  toCSV,
  toMarkdown,
  toHTMLPage,
  downloadBlob,
} from '@/utils/resultIO'
import { drawOverlay } from '@/utils/canvasDrawer'
import { useMeasureStore } from '@/composables/useMeasureStore'

// §8 导出页：图片 / JSON / 表格 / 网页 / CSV 五种导出（§11.5#3）
const message = useMessage()
const router = useRouter()
const { session } = useMeasureStore()

const imported = ref(null) // 由 JSON 导入的 payload（无原图时不可导出图片）

// 导出源：优先当前识别会话，其次导入的 JSON
const payload = computed(() => imported.value || buildResultPayload(session.value))
// 图片导出需要原图 + 环（会话才有；纯 JSON 导入一般不含标注图）
const canExportImage = computed(
  () => !!(session.value?.imageSrc && session.value?.rings?.length) || !!payload.value?.annotatedImage,
)

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function handleFile({ file }) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      imported.value = parseResultJSON(String(reader.result))
      message.success(`已载入：${file.name}`)
    } catch (e) {
      message.error(e.message || 'JSON 解析失败')
    }
  }
  reader.readAsText(file.file)
  return false
}

// 合成标注图：原图 + 环覆盖层（彩色渐变 + 序号），与识别页所见一致
function composeAnnotatedImage() {
  return new Promise((resolve, reject) => {
    const existing = payload.value?.annotatedImage
    if (existing) return resolve(existing)
    const s = session.value
    if (!s?.imageSrc) return reject(new Error('缺少原图，无法导出图片'))
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const rings = (s.rings || []).filter((r) => r.enabled !== false)
      drawOverlay(ctx, rings, null)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('原图解码失败'))
    img.src = s.imageSrc
  })
}

async function exportImage() {
  try {
    const dataUrl = await composeAnnotatedImage()
    const link = document.createElement('a')
    link.download = `牛顿环识别结果_${stamp()}.png`
    link.href = dataUrl
    link.click()
    message.success('识别结果图片已导出')
  } catch (e) {
    message.error(e.message || '图片导出失败')
  }
}

function exportJSON() {
  downloadBlob(toJSON(payload.value), `牛顿环测量结果_${stamp()}.json`, 'application/json')
  message.success('JSON 已导出（可在数据页导入回显）')
}

function exportCSV() {
  downloadBlob(toCSV(payload.value), `牛顿环测量结果_${stamp()}.csv`, 'text/csv;charset=utf-8;')
  message.success('CSV 已导出')
}

function exportMarkdown() {
  downloadBlob(toMarkdown(payload.value), `牛顿环测量结果_${stamp()}.md`, 'text/markdown;charset=utf-8;')
  message.success('表格（Markdown）已导出')
}

function exportHTML() {
  downloadBlob(toHTMLPage(payload.value), `牛顿环测量结果_${stamp()}.html`, 'text/html;charset=utf-8;')
  message.success('网页（HTML）已导出')
}
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-4">
    <n-card :bordered="false" class="bg-card" title="导出 · 测量结果">
      <n-empty v-if="!payload" description="暂无可导出的测量结果" class="py-6">
        <template #extra>
          <n-space justify="center">
            <n-button size="small" type="primary" @click="router.push('/recognition')">
              去识别页测量
            </n-button>
            <n-upload
              accept=".json,application/json"
              :show-file-list="false"
              :default-upload="false"
              @change="handleFile"
            >
              <n-button size="small" ghost>导入 JSON 导出</n-button>
            </n-upload>
          </n-space>
        </template>
      </n-empty>

      <template v-else>
        <n-alert v-if="!canExportImage" type="warning" :bordered="false" class="mb-3">
          当前结果来自 JSON 导入且不含标注图，「导出图片」不可用；其余格式正常。
        </n-alert>
        <n-space wrap :size="10">
          <n-button type="primary" :disabled="!canExportImage" @click="exportImage">
            <template #icon><i class="i-carbon:image" /></template>
            导出图片 (PNG)
          </n-button>
          <n-button @click="exportJSON">
            <template #icon><i class="i-carbon:code" /></template>
            导出 JSON
          </n-button>
          <n-button @click="exportMarkdown">
            <template #icon><i class="i-carbon:table" /></template>
            导出表格 (MD)
          </n-button>
          <n-button @click="exportHTML">
            <template #icon><i class="i-carbon:document-html" /></template>
            导出网页 (HTML)
          </n-button>
          <n-button @click="exportCSV">
            <template #icon><i class="i-carbon:document" /></template>
            导出 CSV
          </n-button>
        </n-space>
        <n-divider />
        <n-upload
          accept=".json,application/json"
          :show-file-list="false"
          :default-upload="false"
          @change="handleFile"
        >
          <n-button size="small" quaternary>切换为导入的 JSON…</n-button>
        </n-upload>
      </template>
    </n-card>

    <result-tables v-if="payload" :payload="payload" />
  </div>
</template>
