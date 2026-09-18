import { ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  DOCS_BUILTIN,
  DOCS_TABS_KEY,
  DOCS_TAB_PERSIST_MAX_BYTES,
  DOCS_TABS_TOTAL_MAX_BYTES,
} from '@/utils/constants'
import { loadZipDoc, revokeAssets } from '@/utils/zipDocLoader'

// 文档中心跨页/跨组件状态（pinia 单例 store）：
// - builtinState：2 篇内置 md 的 fetch 缓存，惰性并发；
// - localTabs：用户拖入的本地 tab 列表，md/txt 走文本；zip 展开成多个 transient tab；
// - sessionStorage 快照：只存 transient:false 的本地 tab；× 关闭清；刷新保留；
// - 去重定位：新加入内容若与已有 tab 完全一致 → 激活既有；仅同名不同内容 → 追加 ` (n)`；
// - zipAssets：objectURL 数组挂在首个衍生 tab 上，关闭时统一 revoke；不落盘（tab 本身 transient:true）。

const enc = new TextEncoder()
const byteLength = (s) => enc.encode(s).length

export const useDocsStore = defineStore('docs', () => {
  // builtin 结构：{ [file]: { loading, error, content } }
  const builtinState = shallowRef({})
  // local tab 结构：{ key, title, fileName, content, transient, source:'file'|'zip', _imageResolver?, _zipAssets? }
  const localTabs = ref([])
  const activeKey = ref(`builtin:${DOCS_BUILTIN[0].file}`)

  let fetchStarted = false
  let hydrated = false

  // -------------------------------------------------------------------------
  // 内置 2 篇 fetch：视图 mount 时调 loadBuiltins；单例守卫，重复调用无副作用
  // -------------------------------------------------------------------------
  async function fetchOne(b) {
    builtinState.value = {
      ...builtinState.value,
      [b.file]: { loading: true, error: null, content: '' },
    }
    try {
      const url = `${import.meta.env.BASE_URL}docs/${encodeURIComponent(b.file)}`
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const text = await res.text()
      builtinState.value = {
        ...builtinState.value,
        [b.file]: { loading: false, error: null, content: text.replace(/^\uFEFF/, '') },
      }
    } catch (e) {
      builtinState.value = {
        ...builtinState.value,
        [b.file]: { loading: false, error: e.message || String(e), content: '' },
      }
    }
  }

  function loadBuiltins() {
    if (fetchStarted) return
    fetchStarted = true
    DOCS_BUILTIN.forEach(fetchOne)
  }

  // -------------------------------------------------------------------------
  // sessionStorage 恢复：store 首次实例化时执行一次
  // -------------------------------------------------------------------------
  function hydrate() {
    if (hydrated) return
    hydrated = true
    try {
      const raw = sessionStorage.getItem(DOCS_TABS_KEY)
      if (!raw) return
      const items = JSON.parse(raw)
      if (!Array.isArray(items)) return
      localTabs.value = items.map((i) => ({
        key: i.key || `local:${crypto.randomUUID()}`,
        title: i.title,
        fileName: i.fileName,
        content: i.content,
        transient: false,
        source: 'file',
      }))
    } catch {
      /* 反序列化失败静默降级，不阻断预览 */
    }
  }

  // 把当前非 transient 的 local tab 写入 sessionStorage；超阈值 tab 转 transient
  function persist() {
    const items = []
    let total = 0
    for (const t of localTabs.value) {
      if (t.transient) continue
      const size = byteLength(t.content || '')
      if (size > DOCS_TAB_PERSIST_MAX_BYTES) {
        t.transient = true
        continue
      }
      if (total + size > DOCS_TABS_TOTAL_MAX_BYTES) {
        t.transient = true
        continue
      }
      total += size
      items.push({ key: t.key, title: t.title, fileName: t.fileName, content: t.content })
    }
    try {
      sessionStorage.setItem(DOCS_TABS_KEY, JSON.stringify(items))
    } catch {
      // 配额溢出（可能被同域其他数据挤占）→ 全部转 transient，静默失败
      for (const t of localTabs.value) if (!t.transient) t.transient = true
      try {
        sessionStorage.removeItem(DOCS_TABS_KEY)
      } catch {
        /* ignore */
      }
    }
  }

  // -------------------------------------------------------------------------
  // 去重定位 + 命名冲突处理
  // -------------------------------------------------------------------------
  function nextAvailableTitle(baseName) {
    const dotIdx = baseName.lastIndexOf('.')
    const stem = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName
    const ext = dotIdx > 0 ? baseName.slice(dotIdx) : ''
    const existing = new Set([
      ...localTabs.value.map((t) => t.title),
      ...DOCS_BUILTIN.map((b) => b.title),
    ])
    if (!existing.has(baseName)) return baseName
    let n = 2
    while (existing.has(`${stem} (${n})${ext}`)) n++
    return `${stem} (${n})${ext}`
  }

  function findByContent(content) {
    for (const b of DOCS_BUILTIN) {
      const entry = builtinState.value[b.file]
      if (entry && !entry.loading && entry.content && entry.content === content) {
        return { key: `builtin:${b.file}`, title: b.title, kind: 'builtin' }
      }
    }
    const dup = localTabs.value.find((t) => t.content === content)
    if (dup) return { key: dup.key, title: dup.title, kind: 'local' }
    return null
  }

  async function addLocalFile(file) {
    const content = (await file.text()).replace(/^\uFEFF/, '')
    const dup = findByContent(content)
    if (dup) {
      activeKey.value = dup.key
      return { action: 'activated', ...dup }
    }
    const size = byteLength(content)
    const tab = {
      key: `local:${crypto.randomUUID()}`,
      title: nextAvailableTitle(file.name),
      fileName: file.name,
      content,
      transient: size > DOCS_TAB_PERSIST_MAX_BYTES,
      source: 'file',
    }
    localTabs.value.push(tab)
    activeKey.value = tab.key
    return { action: 'added', key: tab.key, title: tab.title, transient: tab.transient, size }
  }

  // 压缩包：整包 transient，展开出的每个 md 建一个 tab，共享 objectURL 表挂在首个 tab 上
  async function addZipFile(file) {
    let result
    try {
      result = await loadZipDoc(file)
    } catch (e) {
      return { action: 'error', message: e.message || '解压失败' }
    }
    const { tabs, assets } = result
    if (!tabs.length) {
      revokeAssets(assets)
      return { action: 'empty' }
    }
    const keys = []
    tabs.forEach((t, i) => {
      const key = `local:${crypto.randomUUID()}`
      localTabs.value.push({
        key,
        title: nextAvailableTitle(t.fileName),
        fileName: t.fileName,
        content: t.content,
        transient: true,
        source: 'zip',
        _imageResolver: t.imageResolver,
        _zipAssets: i === 0 ? assets : null, // 只在首个 tab 上挂 revoke 责任
      })
      keys.push(key)
    })
    activeKey.value = keys[0]
    return { action: 'added', keys, count: tabs.length }
  }

  function closeTab(key) {
    const idx = localTabs.value.findIndex((t) => t.key === key)
    if (idx === -1) return
    const [removed] = localTabs.value.splice(idx, 1)
    if (removed?._zipAssets) revokeAssets(removed._zipAssets)
    if (activeKey.value === key) {
      const neighbor = localTabs.value[idx] || localTabs.value[idx - 1]
      activeKey.value = neighbor ? neighbor.key : `builtin:${DOCS_BUILTIN[0].file}`
    }
  }

  // 返回当前激活 tab 的渲染上下文：{ isBuiltin, title, content, loading, error, imageResolver }
  function getTabContext(key) {
    if (key.startsWith('builtin:')) {
      const file = key.slice('builtin:'.length)
      const meta = DOCS_BUILTIN.find((b) => b.file === file)
      const entry = builtinState.value[file] || { loading: true, error: null, content: '' }
      return {
        isBuiltin: true,
        title: meta?.title || file,
        content: entry.content,
        loading: entry.loading,
        error: entry.error,
        imageResolver: null,
      }
    }
    const t = localTabs.value.find((x) => x.key === key)
    if (!t)
      return {
        isBuiltin: false,
        title: '',
        content: '',
        loading: false,
        error: 'tab 已关闭',
        imageResolver: null,
      }
    return {
      isBuiltin: false,
      title: t.title,
      content: t.content,
      loading: false,
      error: null,
      transient: t.transient,
      source: t.source,
      imageResolver: t._imageResolver || null,
    }
  }

  // store 首次实例化即恢复 sessionStorage 快照 + 挂 push/splice 自动 persist 的 watcher
  // （store 为应用级单例，watcher 与 store 同生命期，无需手动 stop）
  hydrate()
  watch(
    () => localTabs.value.length,
    () => persist(),
  )

  return {
    // state
    builtinState,
    localTabs,
    activeKey,
    // actions
    loadBuiltins,
    addLocalFile,
    addZipFile,
    closeTab,
    getTabContext,
  }
})
