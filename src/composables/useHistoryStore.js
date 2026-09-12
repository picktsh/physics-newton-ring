import { useStorage } from '@vueuse/core'
import { HISTORY_KEY, HISTORY_MAX } from '@/utils/constants'
import { compressImageDataUrl } from '@/utils/imageCompress'

// §7 历史记录单条：{ id, title, image(dataURL), createdAt, data }
// 识别 / 历史 / 数据展示三页共享同一响应式数据源（§7）。
const records = useStorage(HISTORY_KEY, [])

function trim() {
  // LRU：保留最新 HISTORY_MAX 条，淘汰最旧（§11.5#6）
  if (records.value.length > HISTORY_MAX) {
    records.value = records.value.slice(0, HISTORY_MAX)
  }
}

export function useHistoryStore() {
  async function add({ title, image, data = null }) {
    const compressed = image ? await compressImageDataUrl(image) : image
    const record = {
      id: crypto.randomUUID(),
      title,
      image: compressed,
      createdAt: Date.now(),
      data,
    }
    records.value = [record, ...records.value]
    trim()
    return record
  }

  function update(id, patch) {
    const idx = records.value.findIndex((r) => r.id === id)
    if (idx === -1) return null
    records.value[idx] = { ...records.value[idx], ...patch }
    return records.value[idx]
  }

  function remove(id) {
    records.value = records.value.filter((r) => r.id !== id)
  }

  function clear() {
    records.value = []
  }

  function get(id) {
    return records.value.find((r) => r.id === id) || null
  }

  return { records, add, update, remove, clear, get }
}
