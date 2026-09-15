<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useDropZone } from '@vueuse/core'
import {
  NAlert,
  NButton,
  NDropdown,
  NSpace,
  NSpin,
  NTabs,
  NTabPane,
  useMessage,
} from 'naive-ui'
import { DOCS_BUILTIN, DOCS_ZIP_MAX_BYTES } from '@/utils/constants'
import { useDocsStore } from '@/composables/useDocsStore'
import { renderMarkdown } from '@/utils/markdownRenderer'
import { runMermaid } from '@/utils/mermaidRunner'
import { exportMd, exportDoc, exportPng, printDoc, openInNewWindow } from '@/utils/docsExport'

// 文档中心：内置 2 篇 + 本地拖入（md / txt / zip），NTabs 承载、NDropdown 收拢导出。
// 导出：.md 原文 / .doc（Word） / .png（html2canvas+水印） / 打印（同文档克隆 host+水印，另存 PDF）。
// pdf / 图片走新窗口原生预览；zip 展开多 md tab + 相对图片 objectURL。详见 CHANGELOG [未发布]。

const message = useMessage()
const { localTabs, activeKey, loadBuiltins, addLocalFile, addZipFile, closeTab, getTabContext } =
  useDocsStore()

const rootRef = ref(null)
const fileInputRef = ref(null)
const docBodyRef = ref(null)
const processing = ref(false)
const exportingPng = ref(false)
const imgErrorCount = ref(0)
const imgAlertDismissed = ref(new Set())
const toc = ref([])
const activeTocId = ref('')

const { isOverDropZone } = useDropZone(rootRef, { onDrop: onDropFiles })

const allTabs = computed(() => [
  ...DOCS_BUILTIN.map((b) => ({ key: `builtin:${b.file}`, title: b.title, isBuiltin: true })),
  ...localTabs.value.map((t) => ({ key: t.key, title: t.title, isBuiltin: false })),
])

const activeContext = computed(() => getTabContext(activeKey.value))

const renderedHtml = computed(() => {
  const c = activeContext.value
  if (!c.content) return ''
  return renderMarkdown(c.content, { imageResolver: c.imageResolver })
})

const exportOptions = computed(() => {
  const disabled = !activeContext.value.content
  return [
    { label: 'Markdown 原文 (.md)', key: 'md', disabled },
    { label: 'Word 文档 (.doc)', key: 'doc', disabled },
    { label: '图片快照 (.png)', key: 'png', disabled },
    { type: 'divider', key: 'div' },
    { label: '打印 / 另存为 PDF', key: 'print', disabled },
  ]
})

onMounted(() => loadBuiltins())

// 内容/切换后：跑 mermaid → 重建 TOC → 挂图片错误监听
watch([renderedHtml, activeKey], async () => {
  await nextTick()
  await runMermaid(docBodyRef.value)
  rebuildToc()
  bindImgWatchers()
})

function rebuildToc() {
  const root = docBodyRef.value
  if (!root) {
    toc.value = []
    return
  }
  const nodes = root.querySelectorAll('h1[id], h2[id], h3[id], h4[id]')
  toc.value = Array.from(nodes).map((el) => ({
    id: el.id,
    text: el.textContent.trim(),
    level: Number(el.tagName.slice(1)),
  }))
  activeTocId.value = toc.value[0]?.id || ''
}

function bindImgWatchers() {
  imgErrorCount.value = 0
  const root = docBodyRef.value
  if (!root) return
  root.querySelectorAll('img').forEach((img) => {
    img.addEventListener(
      'error',
      () => {
        imgErrorCount.value++
      },
      { once: true }
    )
    if (img.complete && img.naturalWidth === 0 && img.src) imgErrorCount.value++
  })
}

function selectTab(k) {
  activeKey.value = k
}

function onTabRemove(k) {
  closeTab(k)
}

function jumpTo(id) {
  const root = docBodyRef.value
  if (!root) return
  const el = root.querySelector(`#${CSS.escape(id)}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  activeTocId.value = id
}

function dismissImgAlert() {
  imgAlertDismissed.value = new Set([...imgAlertDismissed.value, activeKey.value])
}

// ---- 文件类型分流 ----
const MD_EXT = ['.md', '.markdown', '.mdown', '.mkd', '.txt']
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']
const ACCEPT = [...MD_EXT, ...IMAGE_EXT, '.pdf', '.zip'].join(',')

function classify(name) {
  const n = String(name || '').toLowerCase()
  if (MD_EXT.some((e) => n.endsWith(e))) return 'md'
  if (n.endsWith('.zip')) return 'zip'
  if (n.endsWith('.pdf')) return 'pdf'
  if (IMAGE_EXT.some((e) => n.endsWith(e))) return 'image'
  return 'other'
}

async function onDropFiles(files) {
  if (!files?.length) return
  await processFiles(files)
}

function onPickFiles(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (files.length) processFiles(files)
}

async function processFiles(fileList) {
  processing.value = true
  let added = 0
  let activated = 0
  let openedWindows = 0
  let ignored = 0
  let transient = 0
  try {
    for (const f of fileList) {
      const kind = classify(f.name)
      try {
        if (kind === 'md') {
          const res = await addLocalFile(f)
          if (res.action === 'activated') {
            activated++
            message.info(`已定位到已有文档：${res.title}`)
          } else {
            added++
            if (res.transient) transient++
          }
        } else if (kind === 'zip') {
          if (f.size > DOCS_ZIP_MAX_BYTES) {
            message.warning(`压缩包 ${f.name} 过大（${(f.size / 1024 / 1024).toFixed(1)} MB），已跳过`)
            ignored++
            continue
          }
          const res = await addZipFile(f)
          if (res.action === 'added') {
            added += res.count
            transient += res.count
          } else if (res.action === 'empty') {
            message.warning(`压缩包 ${f.name} 内未发现 md 文件`)
          } else if (res.action === 'error') {
            message.error(`解压 ${f.name} 失败：${res.message}`)
          }
        } else if (kind === 'pdf' || kind === 'image') {
          const r = openInNewWindow(f)
          if (r.blocked) message.warning('浏览器拦截了新窗口，请允许弹窗后重试')
          else openedWindows++
        } else {
          ignored++
        }
      } catch (err) {
        message.error(`处理 ${f.name} 出错：${err.message}`)
      }
    }
    const parts = []
    if (added) parts.push(`新增 ${added} 个 tab`)
    if (activated) parts.push(`定位 ${activated} 个`)
    if (openedWindows) parts.push(`新窗口打开 ${openedWindows} 个`)
    if (ignored) parts.push(`忽略 ${ignored} 个`)
    if (parts.length) message.success(parts.join(' · '))
    if (transient) message.info(`${transient} 个文档未纳入会话暂存（较大或来自压缩包）`)
  } finally {
    processing.value = false
  }
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

// live DOM 的 innerHTML：含已渲染的 mermaid SVG / KaTeX，供 doc / 打印复用
function liveHtml() {
  return docBodyRef.value ? docBodyRef.value.innerHTML : ''
}

async function onExportSelect(key) {
  const c = activeContext.value
  if (!c.content) return message.warning('当前 tab 无内容')
  await runMermaid(docBodyRef.value) // 确保导出前流程图已渲染
  if (key === 'md') {
    exportMd(c.title, c.content)
  } else if (key === 'doc') {
    exportDoc(c.title, liveHtml())
  } else if (key === 'png') {
    exportingPng.value = true
    try {
      await exportPng(c.title, docBodyRef.value)
    } catch (e) {
      message.error(`导出失败：${e.message}`)
    } finally {
      exportingPng.value = false
    }
  } else if (key === 'print') {
    printDoc(liveHtml())
  }
}
</script>

<template>
  <div ref="rootRef" class="docs-view flex flex-col gap-3">
    <!-- Tab 栏：NTabs 卡片式，内置 2 篇不可关，本地 tab closable，addable 的 + 触发本地导入 -->
    <n-tabs
      type="card"
      :value="activeKey"
      addable
      class="docs-tabs"
      @update:value="selectTab"
      @add="triggerFileInput"
      @remove="onTabRemove"
    >
      <n-tab-pane
        v-for="t in allTabs"
        :key="t.key"
        :name="t.key"
        :closable="!t.isBuiltin"
      >
        <template #tab>{{ t.title }}</template>
      </n-tab-pane>
    </n-tabs>

    <!-- 工具条：导入 + 导出（NDropdown 收拢） -->
    <n-space justify="space-between" align="center" :wrap="true">
      <n-space :size="8" align="center" :wrap="true">
        <n-button size="small" @click="triggerFileInput">
          <template #icon><i class="i-carbon-document-add" /></template>
          打开本地 .md / .zip
        </n-button>
        <span class="text-xs opacity-60">
          拖入 .md/.txt 建 tab · .zip 解压带图 · .pdf/图片 新窗口预览
        </span>
      </n-space>
      <n-dropdown
        trigger="click"
        :options="exportOptions"
        :disabled="!activeContext.content"
        @select="onExportSelect"
      >
        <n-button size="small" type="primary" :disabled="!activeContext.content">
          <template #icon><i class="i-carbon-export" /></template>
          导出
          <i class="i-carbon-chevron-down ml-1" />
        </n-button>
      </n-dropdown>
    </n-space>

    <!-- 状态提示条：按优先级只显示一个 -->
    <n-alert v-if="activeContext.loading" type="info" :bordered="false" size="small">
      加载中...
    </n-alert>
    <n-alert v-else-if="activeContext.error" type="error" :bordered="false" size="small">
      加载失败：{{ activeContext.error }}
    </n-alert>
    <n-alert v-else-if="activeContext.transient" type="info" :bordered="false" size="small">
      ⚠ 本文档{{ activeContext.source === 'zip' ? '来自压缩包' : '较大' }}，未纳入会话暂存，刷新页面后需重新拖入。
    </n-alert>
    <n-alert
      v-else-if="imgErrorCount > 0 && !imgAlertDismissed.has(activeKey)"
      type="warning"
      :bordered="false"
      size="small"
      closable
      @close="dismissImgAlert"
    >
      本文档有 {{ imgErrorCount }} 张相对路径图片未能加载（浏览器安全限制）。建议把图片与 md 一起打包为 .zip
      重新拖入，或改用绝对 URL / data URI。
    </n-alert>

    <!-- 主体：文档正文 + 右侧 TOC -->
    <div class="body flex min-h-96 gap-4">
      <article
        ref="docBodyRef"
        class="doc-body markdown-body min-w-0 flex-1 rounded bg-card p-6"
        data-doc-body
        v-html="renderedHtml"
      />
      <aside v-if="toc.length >= 2" class="toc hidden w-56 shrink-0 lg:block">
        <div class="sticky top-4 rounded bg-card p-3 text-sm">
          <div class="mb-2 font-semibold opacity-70">目录</div>
          <ul class="m-0 list-none p-0">
            <li
              v-for="item in toc"
              :key="item.id"
              :class="[
                'toc-item cursor-pointer py-1',
                `toc-l${item.level}`,
                { active: activeTocId === item.id },
              ]"
              @click="jumpTo(item.id)"
            >
              {{ item.text }}
            </li>
          </ul>
        </div>
      </aside>
    </div>

    <!-- 拖入遮罩层（全屏，仅本页挂载） -->
    <div v-if="isOverDropZone" class="drop-overlay">
      <div class="drop-inner">
        <i class="i-carbon-cloud-upload text-5xl" />
        <div class="mt-2 text-lg font-semibold">松开以导入</div>
        <div class="mt-1 text-sm opacity-90">
          .md / .txt 建 tab · .zip 解压带图预览 · .pdf / 图片 新窗口打开
        </div>
      </div>
    </div>

    <div v-if="processing || exportingPng" class="fixed bottom-6 right-6 z-50">
      <n-spin size="medium" />
    </div>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      :accept="ACCEPT"
      class="hidden"
      @change="onPickFiles"
    />
  </div>
</template>

<style scoped>
/* NTabs 只用作顶部标签条：内容单独渲染在下方 doc-body，隐藏空的 pane 容器 */
.docs-tabs :deep(.n-tabs-pane-wrapper) {
  display: none;
}

.toc-item {
  opacity: 0.7;
  border-left: 2px solid transparent;
  padding-left: 8px;
}
.toc-item:hover {
  opacity: 1;
}
.toc-item.active {
  opacity: 1;
  border-left-color: var(--c-primary);
  color: var(--c-primary);
}
.toc-l1 {
  font-weight: 600;
}
.toc-l2 {
  padding-left: 16px;
}
.toc-l3 {
  padding-left: 28px;
  font-size: 12px;
}
.toc-l4 {
  padding-left: 40px;
  font-size: 12px;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(32, 128, 240, 0.12);
  backdrop-filter: blur(2px);
  border: 3px dashed var(--c-primary);
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.drop-inner {
  padding: 32px 48px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  text-align: center;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.3);
}
</style>
