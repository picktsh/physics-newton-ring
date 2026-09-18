import { reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import { until } from '@vueuse/core'
import { useIDBKeyval } from '@vueuse/integrations/useIDBKeyval'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { IMAGES_META_KEY, IMAGES_BLOB_PREFIX, IMAGES_LEGACY_KEY } from '@/utils/constants'

// 图片库（长期存储）：pinia 单例 store。存储结构 = meta 与 blob 分键：
// - meta：记录元数据数组（不含 blob），官方 useIDBKeyval 托管（shallow；其内部写库前 toRaw，
//   整数组替换式更新不产生深层 Proxy，规避 structured clone 的 DataCloneError）
// - blob：每图一键 `${IMAGES_BLOB_PREFIX}${id}`，idb-keyval 原生 get/set/del
// 分键理由：单键整数组每次增删图都全量重写所有 Blob（写放大），拆分后只动对应 blob 键。
// 记录结构：{ id, name, title?, group?, slot?, pairId?, scale?, width, height, size, addedAt, source: 'upload'|'sample' }
// id = 内容寻址：SHA-256(blob) hex——同图重复入库同 id 幂等复用（不重复存 blob/不产生重复记录），
// 会话/选择态锚点因此跨删除重传稳定；非安全上下文无 crypto.subtle 时降级 randomUUID。
// pairId+slot 构成「标定组」：同 pairId 的 a/b 两条记录为一组（标定页组卡布局的数据源）；
// pairId 由成员 imageId 组合派生（pairIdFor，确定性）：同一 A/B 组合重建后 groupId 不变，旧过程会话可再锚定；
// 未配对（pairId 为 null）的零散图供识别页单选用 / 待配对。
// Blob 原图直存不压缩——标定对像素尺寸敏感（a 组原宽 1706，压到 1600 会破坏标定口径）。
// objectURL 统一缓存于 urlCache（reactive Map：blob 异步到位后模板自动重渲染），
// 删除/清空时 revoke（谁开谁关），组件禁止自行 createObjectURL。

export const useImageLibrary = defineStore('imageLibrary', () => {
  const degraded = ref(false) // IDB 不可用（隐私模式等）时降级仅内存：功能不阻断，刷新丢失
  const { data: images, isFinished } = useIDBKeyval(IMAGES_META_KEY, [], {
    shallow: true,
    writeDefaults: false,
    onError: () => {
      degraded.value = true
    },
  })
  const ready = ref(false)
  const urlCache = reactive(new Map()) // id -> objectURL
  let loadPromise = null

  function blobKey(id) {
    return `${IMAGES_BLOB_PREFIX}${id}`
  }

  function revokeURL(id) {
    const url = urlCache.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      urlCache.delete(id)
    }
  }

  // 异步确保 objectURL 就绪（blob 按需从 IDB 拉取）；算法/赋槽等消费方 await 此函数
  async function ensureObjectURL(id) {
    if (urlCache.has(id)) return urlCache.get(id)
    if (degraded.value) return ''
    try {
      const blob = await idbGet(blobKey(id))
      if (!blob) return ''
      const url = URL.createObjectURL(blob)
      urlCache.set(id, url)
      return url
    } catch {
      degraded.value = true
      return ''
    }
  }

  // 同步读缓存（模板缩略图用；未就绪返回 ''，blob 到位后 reactive Map 触发重渲染）
  function getObjectURL(id) {
    return urlCache.get(id) || ''
  }

  // 旧版单键结构一次性迁移：记录内嵌 blob 拆到 blob 键，id 原样保留（sessionStorage 会话锚点不失效）
  async function migrateLegacy() {
    if (degraded.value) return
    try {
      const old = await idbGet(IMAGES_LEGACY_KEY)
      if (!Array.isArray(old)) return
      const metas = []
      for (const r of old) {
        if (!r?.id || !(r.blob instanceof Blob)) continue
        await idbSet(blobKey(r.id), r.blob)
        const { blob, ...meta } = r
        metas.push(meta)
        urlCache.set(r.id, URL.createObjectURL(blob))
      }
      if (metas.length && !images.value.length) images.value = metas
      await idbDel(IMAGES_LEGACY_KEY)
    } catch {
      /* 迁移失败保留旧键，下次进库重试 */
    }
  }

  // promise 单例：多组件并发 await 必须等同一个加载流程。
  // 曾用布尔 loaded 守卫：子组件 onMounted 先触发、父页面 await 时立即返回（IDB 未读完），
  // 导致恢复会话时在空库上误判「原图已删」而清会话（刷新假丢失根因）。
  function loadLibrary() {
    if (!loadPromise) loadPromise = doLoadLibrary()
    return loadPromise
  }

  async function doLoadLibrary() {
    await until(isFinished).toBe(true) // IDB 打开失败时 onError 已置 degraded，isFinished 仍会置位不死等
    await migrateLegacy()
    ready.value = true
    for (const r of images.value) ensureObjectURL(r.id) // 预热缩略图，失败静默（渲染兜底 ''）
  }

  // 解码取自然尺寸；临时 objectURL 用完即 revoke（与 urlCache 的展示用 URL 无关）
  function decodeSize(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        resolve({ width: 0, height: 0 })
        URL.revokeObjectURL(url)
      }
      img.src = url
    })
  }

  // 内容寻址 id：SHA-256(blob) hex；同图重复入库得到同 id（addBlob 据此幂等复用）
  async function contentId(blob) {
    if (!crypto?.subtle) return crypto.randomUUID() // 非安全上下文（http LAN 等）降级：去重能力丢失但功能不阻断
    const buf = await blob.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async function addBlob(blob, meta = {}) {
    const id = await contentId(blob)
    const exist = findImage(id)
    if (exist) return exist // 内容寻址幂等：重复传同一张图直接复用既有记录
    const { width, height } = await decodeSize(blob)
    const record = {
      id,
      name: meta.name || 'image',
      title: meta.title,
      group: meta.group,
      slot: meta.slot,
      pairId: meta.pairId || null,
      scale: meta.scale,
      width,
      height,
      size: blob.size,
      addedAt: Date.now(),
      source: meta.source || 'upload',
    }
    if (!degraded.value) {
      try {
        await idbSet(blobKey(record.id), blob)
      } catch {
        degraded.value = true
      }
    }
    urlCache.set(record.id, URL.createObjectURL(blob))
    images.value = [...images.value, record] // 整数组替换：shallow 触发 useIDBKeyval 自动写 meta
    return record
  }

  async function addFiles(fileList) {
    const added = []
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue
      added.push(await addBlob(file, { name: file.name, source: 'upload' }))
    }
    return added
  }

  async function removeImage(id) {
    revokeURL(id)
    images.value = images.value.filter((r) => r.id !== id)
    if (!degraded.value) {
      try {
        await idbDel(blobKey(id))
      } catch {
        degraded.value = true
      }
    }
  }

  async function clearAll() {
    const ids = images.value.map((r) => r.id)
    for (const id of ids) revokeURL(id)
    images.value = []
    if (!degraded.value) {
      try {
        await Promise.all(ids.map((id) => idbDel(blobKey(id))))
      } catch {
        degraded.value = true
      }
    }
  }

  function findImage(id) {
    return images.value.find((r) => r.id === id) || null
  }

  // ===== 标定组（pair）辅助 =====
  // groupId = 成员 imageId 组合派生（用户口径）：同步双路 FNV-1a 32bit → 16 hex。
  // 输入已是 SHA-256 hex（高熵），64bit 组合地址对本应用规模足够；选同步哈希保持赋槽链路同步。
  // 槽位语义保留：'a>b' 与 'b>a' 不同组。
  function pairIdFor(aId, bId) {
    const s = `${aId || ''}>${bId || ''}`
    let h1 = 0x811c9dc5
    let h2 = 0x01000193
    for (let i = 0; i < s.length; i++) {
      h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0
      h2 = Math.imul(h2 + s.charCodeAt(i), 0x85ebca6b) >>> 0
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
  }

  function pairRecords(pid) {
    let a = null
    let b = null
    for (const r of images.value) {
      if (r.pairId !== pid) continue
      if (r.slot === 'a') a = r
      else if (r.slot === 'b') b = r
    }
    return { a, b }
  }

  // 组构成变化后重派 groupId（成员记录同步改写）；返回规范 id
  function normalizePair(pid) {
    const { a, b } = pairRecords(pid)
    if (!a && !b) return pid // 已解散（无成员记录），无需改写
    const canonical = pairIdFor(a?.id, b?.id)
    if (canonical !== pid)
      images.value = images.value.map((r) => (r.pairId === pid ? { ...r, pairId: canonical } : r))
    return canonical
  }

  // 存量旧随机 UUID 组一次性重命名到派生 groupId；返回 old→new 映射供选择态 remap
  function normalizeAllPairs() {
    const remap = new Map()
    const pids = [...new Set(images.value.map((r) => r.pairId).filter(Boolean))]
    for (const pid of pids) {
      const canonical = normalizePair(pid)
      if (canonical !== pid) remap.set(pid, canonical)
    }
    return remap
  }

  // 赋槽：槽位独占——若 (pairId, slot) 已被另一张图占用，先将其退回未配对；
  // 返回操作后的规范 pairId（组构成变化可能重派），调用方据此回写选择态
  function setRecordPair(recId, pairId, slot) {
    let prevPid = null
    images.value = images.value.map((r) => {
      if (r.id === recId) {
        prevPid = r.pairId
        return { ...r, pairId, slot }
      }
      if (r.pairId === pairId && r.slot === slot && r.id !== recId)
        return { ...r, pairId: null, slot: null }
      return r
    })
    const canonical = normalizePair(pairId)
    if (prevPid && prevPid !== pairId) normalizePair(prevPid) // 原组构成也变了（可能解散）
    return canonical
  }

  // 退组：记录回到未配对零散图；返回剩余成员重派后的规范 pairId（组解散则 null）
  function unpairRecord(recId) {
    let pid = null
    images.value = images.value.map((r) => {
      if (r.id !== recId) return r
      pid = r.pairId
      return { ...r, pairId: null, slot: null }
    })
    if (!pid) return null
    const { a, b } = pairRecords(pid)
    if (!a && !b) return null
    return normalizePair(pid)
  }

  // 示例按文件名幂等入库：已在库直接复用记录，否则 fetch public 路径转 Blob 入库。
  // 不再首启自动 seeding——示例仅经 SamplePicker 用户主动选择时进库（与上传图 UI 分离）。
  async function seedSample(entry) {
    const exist = images.value.find((r) => r.source === 'sample' && r.name === entry.file)
    if (exist) return exist
    const url = `${import.meta.env.BASE_URL}samples/${encodeURIComponent(entry.file)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${res.status}`)
    return addBlob(await res.blob(), {
      name: entry.file,
      title: entry.title,
      group: entry.group,
      slot: entry.slot,
      scale: entry.scale,
      source: 'sample',
    })
  }

  return {
    images,
    ready,
    degraded,
    loadLibrary,
    addFiles,
    addBlob,
    removeImage,
    clearAll,
    findImage,
    getObjectURL,
    ensureObjectURL,
    seedSample,
    pairIdFor,
    pairRecords,
    normalizeAllPairs,
    setRecordPair,
    unpairRecord,
  }
})
