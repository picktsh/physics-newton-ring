<script setup>
import { ref } from 'vue'
import {
  NCard,
  NGrid,
  NGridItem,
  NButton,
  NSpace,
  NEmpty,
  NModal,
  NPopconfirm,
  NTag,
  useMessage,
} from 'naive-ui'
import ResultTables from '@/components/ResultTables.vue'
import { storeToRefs } from 'pinia'
import { useHistoryStore } from '@/stores/history'
import { useMeasureStore } from '@/stores/measure'

// §8 历史页：2×2 方格 + 查看 / 删除 / 清空（记录见 useHistoryStore）
const message = useMessage()
const historyStore = useHistoryStore()
const { records } = storeToRefs(historyStore)
const { remove, clear } = historyStore
const { setSession } = useMeasureStore()

const viewOpen = ref(false)
const viewRecord = ref(null)

function fmtDate(ts) {
  return new Date(ts).toLocaleString('zh-CN')
}

// 查看：弹窗回显该记录的标注图 + 表1/表2/不确定度
function view(record) {
  viewRecord.value = record
  viewOpen.value = true
}

// 恢复到识别会话：把历史结果写回跨页 session，供数据/导出页直接消费
function restore(record) {
  if (!record.data) {
    message.warning('该记录不含可恢复的结果数据')
    return
  }
  setSession({
    fileName: record.title,
    imageSrc: record.image,
    center: record.data.center,
    rings: record.data.rings,
    calculationResults: {
      diameterData: record.data.diameterData,
      radiusData: record.data.radiusData,
      averageR: record.data.averageR,
      pixelScale: record.data.pixelScale,
      uncertainty: record.data.uncertainty,
    },
    annotatedImage: record.image,
  })
  viewOpen.value = false
  message.success('已恢复到当前会话，可在数据/导出页继续')
}

function removeOne(record) {
  remove(record.id)
  message.success('已删除')
}

function clearAll() {
  clear()
  message.success('已清空全部历史记录')
}
</script>

<template>
  <div class="flex max-w-5xl flex-col gap-4">
    <n-card :bordered="false" class="bg-card">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-lg font-semibold">历史记录</span>
          <n-tag class="ml-2" :bordered="false" round size="small">{{ records.length }} / 20</n-tag>
        </div>
        <n-popconfirm
          v-if="records.length"
          positive-text="确认清空"
          negative-text="取消"
          @positive-click="clearAll"
        >
          <template #trigger>
            <n-button type="error" ghost>
              <template #icon><i class="i-carbon:trash-can" /></template>
              清空全部
            </n-button>
          </template>
          确定清空全部 {{ records.length }} 条历史记录？此操作不可撤销。
        </n-popconfirm>
      </div>
    </n-card>

    <n-empty
      v-if="!records.length"
      description="暂无历史记录，去识别页测量后会自动留存"
      class="py-16"
    />

    <n-grid v-else :x-gap="16" :y-gap="16" cols="1 sm:2" responsive="screen">
      <n-grid-item v-for="r in records" :key="r.id">
        <n-card
          :bordered="false"
          class="bg-card h-full"
          content-style="display:flex;flex-direction:column;gap:10px;"
        >
          <div class="flex h-40 items-center justify-center overflow-hidden rounded bg-black/5">
            <img
              v-if="r.image"
              :src="r.image"
              alt="缩略图"
              class="max-h-full max-w-full object-contain"
            />
            <i v-else class="i-carbon:image text-4xl opacity-30" />
          </div>
          <div class="truncate font-medium" :title="r.title">{{ r.title }}</div>
          <div class="text-xs opacity-60">{{ fmtDate(r.createdAt) }}</div>
          <n-space class="mt-auto" :size="8">
            <n-button type="primary" ghost @click="view(r)">查看</n-button>
            <n-popconfirm positive-text="删除" negative-text="取消" @positive-click="removeOne(r)">
              <template #trigger>
                <n-button type="error" ghost>删除</n-button>
              </template>
              删除这条历史记录？
            </n-popconfirm>
          </n-space>
        </n-card>
      </n-grid-item>
    </n-grid>

    <!-- 查看弹窗 -->
    <n-modal
      v-model:show="viewOpen"
      preset="card"
      :title="viewRecord?.title || '历史记录'"
      class="!w-[92vw] max-w-3xl"
      :bordered="false"
    >
      <div v-if="viewRecord" class="flex flex-col gap-4">
        <div class="flex justify-center rounded bg-black/5 p-2">
          <img
            v-if="viewRecord.image"
            :src="viewRecord.image"
            alt="标注图"
            class="max-h-72 object-contain"
          />
        </div>
        <div class="text-xs opacity-60">记录时间：{{ fmtDate(viewRecord.createdAt) }}</div>
        <result-tables :payload="viewRecord.data" />
        <n-space justify="end">
          <n-button type="primary" @click="restore(viewRecord)">恢复到当前会话</n-button>
        </n-space>
      </div>
    </n-modal>
  </div>
</template>
