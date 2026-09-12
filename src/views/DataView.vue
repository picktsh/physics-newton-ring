<script setup>
import { computed, ref } from 'vue'
import { NCard, NButton, NSpace, NAlert, NUpload, useMessage, NTag } from 'naive-ui'
import ResultTables from '@/components/ResultTables.vue'
import { parseResultJSON, buildResultPayload } from '@/utils/resultIO'
import { useMeasureStore } from '@/composables/useMeasureStore'

// §8 数据页：导入测量结果 JSON 回显（与导出页 JSON 互逆，schema 见 utils/resultIO）
const message = useMessage()
const { session } = useMeasureStore()

const payload = ref(null)
const errorText = ref('')
const fileName = ref('')

// 若识别页已有当前会话，提供一键载入（无需先导出再导入）
const sessionPayload = computed(() => buildResultPayload(session.value))

function handleFile(file) {
  const raw = file.file
  const reader = new FileReader()
  reader.onload = () => {
    try {
      payload.value = parseResultJSON(String(reader.result))
      fileName.value = raw.name
      errorText.value = ''
      message.success(`已载入：${raw.name}`)
    } catch (e) {
      errorText.value = e.message || '解析失败'
      payload.value = null
      message.error('JSON 解析失败')
    }
  }
  reader.onerror = () => message.error('文件读取失败')
  reader.readAsText(raw)
  return false // 阻止 naive 自动上传
}

function loadSession() {
  if (!sessionPayload.value) return
  payload.value = sessionPayload.value
  fileName.value = sessionPayload.value.fileName || '当前识别会话'
  errorText.value = ''
  message.success('已载入当前识别会话结果')
}
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-4">
    <n-card :bordered="false" class="bg-card" title="数据展示 · 导入测量结果 JSON">
      <n-space vertical :size="12">
        <n-upload
          accept=".json,application/json"
          :show-file-list="false"
          :default-upload="false"
          @change="({ file }) => handleFile({ file })"
        >
          <n-button type="primary" ghost>
            <template #icon><i class="i-carbon:document-add" /></template>
            选择 JSON 文件
          </n-button>
        </n-upload>
        <n-space align="center" :size="8">
          <n-button v-if="sessionPayload" size="small" @click="loadSession">
            <template #icon><i class="i-carbon:recently-viewed" /></template>
            载入当前识别会话
          </n-button>
          <n-tag v-if="fileName" type="success" :bordered="false" round>{{ fileName }}</n-tag>
        </n-space>
        <n-alert v-if="errorText" type="error" :bordered="false">{{ errorText }}</n-alert>
      </n-space>
    </n-card>

    <result-tables :payload="payload" />
  </div>
</template>
