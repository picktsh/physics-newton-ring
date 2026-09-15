<script setup>
/* global cv */
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NSpace,
  NInputNumber,
  NSwitch,
  NSlider,
  NCheckbox,
  NTag,
  NModal,
  NAlert,
  NCollapse,
  NCollapseItem,
  NInput,
  useMessage,
} from 'naive-ui'
import {
  detectNewtonRingCenter,
  detectRingsWithCenter,
  extractRingDataForManual,
  mergeAndNumberRings,
} from '@/utils/imageProcessor'
import { drawOverlay } from '@/utils/canvasDrawer'
import { initDragDrop } from '@/utils/interactionHandler'
import {
  calculateDiameterData,
  calculateRadiusData,
  calculateAverageRadius,
  generateCalculationResults,
  calculateRadiusUncertainty,
} from '@/utils/dataCalculator'
import { useMeasureStore } from '@/composables/useMeasureStore'
import { useHistoryStore } from '@/composables/useHistoryStore'
import ResultTables from '@/components/ResultTables.vue'
import RingCanvasViewer from '@/components/RingCanvasViewer.vue'

// §8 识别页：上传 → 自动圆心 → 人工核对 → 识别暗环 → 环编辑/补环 → 表1表2/不确定度
const message = useMessage()
const router = useRouter()
const { pixelScale, pixelScaleNumber, setSession, saveImageSession, loadImageSession } =
  useMeasureStore()
const { add: addHistory } = useHistoryStore()

// ===== 基础状态 =====
const isProcessing = ref(false)
const logs = ref([])
const logContainerRef = ref(null)
const fileInputRef = ref(null)
const algoImageRef = ref(null) // 隐藏 img，供算法写调试帧 & 提取 processedDataUrl

const fileName = ref('')
const imgWidth = ref(0)
const imgHeight = ref(0)

// imageManager 适配器：算法层仅需 getOriginalImageSrc / saveCurrentResultToCache / getCurrentImageData
const imgState = reactive({ src: '', rings: null, center: null })
const imageManager = {
  getOriginalImageSrc: () => imgState.src,
  getCurrentImageData: () =>
    imgState.rings
      ? {
          detectedRings: imgState.rings,
          center: imgState.center,
          originalWidth: imgWidth.value,
          originalHeight: imgHeight.value,
        }
      : null,
  saveCurrentResultToCache: (rings, center) => {
    imgState.rings = rings
    imgState.center = center
  },
}

// ===== 两步流程状态 =====
const centerPhase = ref('idle') // idle | awaiting-center | done
const detectedCenter = ref(null)
const centerCrossArm = ref(24)
const centerProcessedDataUrl = ref(null)
const detectedOuterRadius = ref(0)
const hoveredRing = ref(null)

// ===== 环列表（可编辑副本）=====
const ringList = ref([])
const renumberOnRemove = ref(false)
const diffStep = ref(5)
const enabledRings = computed(() => ringList.value.filter((r) => r.enabled))
const manualRingCount = computed(() => ringList.value.filter((r) => r.manual).length)

// ===== 预处理预览（仅影响显示预览，不进入识别算法）=====
const filterParams = reactive({
  brightness: 1.0,
  contrast: 1.0,
  blur: 0,
  grayscale: 0,
  sharpen: 0,
  edgeEnhance: 0,
  claheClip: 2.0,
  claheTile: 8,
})
const resultGrayscale = ref(false)
const previewFilterStyle = computed(() => {
  const f = filterParams
  const parts = []
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`)
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`)
  if (f.blur > 0) parts.push(`blur(${f.blur}px)`)
  const gs = resultGrayscale.value ? 1 : f.grayscale
  if (gs > 0) parts.push(`grayscale(${gs})`)
  if (f.sharpen > 0) parts.push('url(#sharpenFilter)')
  else if (f.edgeEnhance > 0) parts.push('url(#edgeFilter)')
  return parts.length ? `filter: ${parts.join(' ')};` : ''
})
function resetFilterParams() {
  Object.assign(filterParams, {
    brightness: 1.0,
    contrast: 1.0,
    blur: 0,
    grayscale: 0,
    sharpen: 0,
    edgeEnhance: 0,
    claheClip: 2.0,
    claheTile: 8,
  })
}
const sharpenMatrix = computed(() => {
  const s = filterParams.sharpen
  return `0 ${-s} 0 ${-s} ${1 + 4 * s} ${-s} 0 ${-s} 0`
})
const edgeMatrix = computed(() => {
  const s = filterParams.edgeEnhance
  return `${s} ${s} ${s} ${s} ${1 + s * 2} ${s} ${-s} ${-s} ${-s}`
})

// ===== 计算链（表1/表2/平均/不确定度）=====
const psNum = computed(() => pixelScaleNumber())
const diameterData = computed(() => calculateDiameterData(enabledRings.value, psNum.value))
const radiusData = computed(() =>
  calculateRadiusData(enabledRings.value, psNum.value, diffStep.value),
)
const averageRadius = computed(() => calculateAverageRadius(radiusData.value))
const radiusUncertainty = computed(() =>
  calculateRadiusUncertainty(radiusData.value, averageRadius.value),
)
const calculationResults = computed(() =>
  generateCalculationResults(
    diameterData.value,
    radiusData.value,
    averageRadius.value,
    psNum.value,
    radiusUncertainty.value,
  ),
)
const resultPayload = computed(() => {
  const cr = calculationResults.value
  if (!cr) return null
  return {
    fileName: fileName.value,
    pixelScale: cr.pixelScale,
    center: detectedCenter.value,
    rings: enabledRings.value,
    diameterData: cr.diameterData,
    radiusData: cr.radiusData,
    averageR: cr.averageR,
    uncertainty: cr.uncertainty,
  }
})

// ===== 全屏放大 =====
const zoomOpen = ref(false)
const zoomCrop = ref(null)
const zoomCanUse = computed(() => centerPhase.value === 'done' && !!imgState.src)

function computeZoomCrop() {
  const center = detectedCenter.value || imgState.center
  if (!imgWidth.value || !imgHeight.value || !center) return null
  let R = detectedOuterRadius.value
  if (!(R > 0)) R = enabledRings.value.reduce((m, r) => Math.max(m, r.avgRadius), 0) * 1.02
  if (!(R > 0)) return { x: 0, y: 0, w: imgWidth.value, h: imgHeight.value }
  const side = Math.max(24, Math.round(2 * R))
  const w = Math.min(side, imgWidth.value)
  const h = Math.min(side, imgHeight.value)
  const x = Math.max(0, Math.min(imgWidth.value - w, Math.round(center.x - w / 2)))
  const y = Math.max(0, Math.min(imgHeight.value - h, Math.round(center.y - h / 2)))
  return { x, y, w, h }
}
function openZoom() {
  if (!zoomCanUse.value) return
  zoomCrop.value = computeZoomCrop()
  zoomOpen.value = true
}
function closeZoom() {
  zoomOpen.value = false
  zoomCrop.value = null
}

// ===== 日志 =====
function showStatus(msg, type = 'info') {
  logs.value.push({ msg, type, time: new Date().toLocaleTimeString('zh-CN') })
  if (logs.value.length > 20) logs.value.shift()
  nextTick(() => {
    const el = logContainerRef.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// ===== 上传 / 加载 =====
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
function dataURLToImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = dataURL
  })
}

async function loadFiles(files) {
  const file = Array.isArray(files) ? files[0] : files
  if (!file || !file.type?.startsWith('image/')) {
    message.error('请选择图片文件')
    return
  }
  const dataUrl = await readFileAsDataURL(file)
  const img = await dataURLToImage(dataUrl)
  fileName.value = file.name
  imgState.src = dataUrl
  imgWidth.value = img.naturalWidth
  imgHeight.value = img.naturalHeight
  showStatus(`📷 已载入图像：${file.name} (${img.naturalWidth}×${img.naturalHeight})`, 'success')
  await processImage()
}

function onFilePick(e) {
  const files = Array.from(e.target.files || [])
  if (files.length) loadFiles(files)
  e.target.value = ''
}

// ===== 第一步：自动检测圆心 =====
async function processImage() {
  if (!imgState.src) return showStatus('❌ 请先上传图像', 'error')
  if (isProcessing.value) return showStatus('⏳ 正在处理中，请稍候…', 'info')
  isProcessing.value = true
  try {
    centerPhase.value = 'idle'
    detectedCenter.value = null
    centerProcessedDataUrl.value = null
    detectedOuterRadius.value = 0
    ringList.value = []
    imgState.rings = null
    closeZoom()

    const centerResult = await detectNewtonRingCenter(imageManager, showStatus, algoImageRef)
    if (!centerResult) {
      showStatus('❌ 无法检测到牛顿环中心，请检查图像质量', 'error')
      return
    }
    detectedCenter.value = { x: Math.round(centerResult.x), y: Math.round(centerResult.y) }
    detectedOuterRadius.value = centerResult.outerRadius
    centerProcessedDataUrl.value = centerResult.processedDataUrl
    centerPhase.value = 'awaiting-center'
    showStatus('🔍 请核对圆心：可拖拽 / 方向键微调 / 输入坐标，确认后再识别环', 'info')
    persistToSession()
  } catch (error) {
    showStatus(`❌ 处理失败: ${error.message}`, 'error')
  } finally {
    isProcessing.value = false
  }
}

// ===== 第二步：确认圆心并识别暗环 =====
async function confirmCenterAndDetectRings() {
  if (!detectedCenter.value || isProcessing.value) return
  isProcessing.value = true
  try {
    const darkRings = await detectRingsWithCenter(
      imageManager,
      showStatus,
      detectedCenter.value.x,
      detectedCenter.value.y,
      centerProcessedDataUrl.value,
      detectedOuterRadius.value,
    )
    if (darkRings.length === 0) {
      showStatus('⚠️ 未检测到暗环，请微调圆心或调整预处理参数后重试', 'error')
      centerPhase.value = 'awaiting-center'
      return
    }
    centerPhase.value = 'done'
    ringList.value = darkRings.map((r) => ({ ...r, enabled: r.enabled !== false }))
    showStatus(
      `✅ 识别到 ${darkRings.length} 个暗环，可在表1去除错环/改编号，或点击图像/全屏放大补环`,
      'success',
    )
    persistToSession()
  } catch (error) {
    showStatus(`❌ 环识别失败: ${error.message}`, 'error')
    centerPhase.value = 'awaiting-center'
  } finally {
    isProcessing.value = false
  }
}

async function redetectCenter() {
  if (isProcessing.value) return
  await processImage()
}

// ===== Viewer 事件 =====
function onViewerClick({ x, y }) {
  if (centerPhase.value !== 'done') return
  addManualRingAt(x, y)
}
function onViewerCenterUpdate(c) {
  detectedCenter.value = c
}
function handleRowHover(n) {
  hoveredRing.value = n
}
function handleRowLeave() {
  hoveredRing.value = null
}

// ===== 环人工核对 =====
function persistRings() {
  const rings = ringList.value
  if (rings.length === 0) return
  imgState.rings = rings.map((r) => ({ ...r }))
  imgState.center = detectedCenter.value || imgState.center || null
  persistToSession()
}
function onToggleRingEnabled() {
  if (renumberOnRemove.value) renumberEnabledRings()
  persistRings()
}
function renumberEnabledRings() {
  const enabled = ringList.value.filter((r) => r.enabled).sort((a, b) => a.avgRadius - b.avgRadius)
  enabled.forEach((r, i) => {
    r.number = i + 1
  })
}
function onRenumberModeChange() {
  if (renumberOnRemove.value) {
    renumberEnabledRings()
    persistRings()
    showStatus('✅ 已切换为顺延重排：启用环按半径重新编号 1..N', 'success')
  } else {
    showStatus('✅ 已切换为保持原编号：取消勾选不再改变其余环编号', 'info')
  }
}
function onRingNumberChange(ring) {
  const n = Math.round(Number(ring.number))
  if (!Number.isFinite(n) || n < 1) {
    showStatus('⚠️ 编号需为不小于 1 的整数，已还原', 'info')
    return
  }
  ring.number = n
  const dup = ringList.value.filter((r) => r.enabled && r.number === n).length
  if (dup > 1) showStatus(`⚠️ 编号 ${n} 重复，曲率分组计算可能异常`, 'info')
  persistRings()
}

// ===== 点击补环 =====
async function loadPreprocessedGrayMat() {
  const url = centerProcessedDataUrl.value || imgState.src
  if (!url) return null
  try {
    const img = await dataURLToImage(url)
    let mat = cv.imread(img)
    if (mat.channels() > 1) {
      const tmp = new cv.Mat()
      cv.cvtColor(mat, tmp, cv.COLOR_BGR2GRAY)
      mat.delete()
      mat = tmp
    }
    return mat
  } catch {
    return null
  }
}
async function addManualRingAt(px, py) {
  const center = detectedCenter.value || imgState.center
  if (!center) return false
  const radius = Math.hypot(px - center.x, py - center.y)
  if (radius < 5) {
    showStatus('⚠️ 点击位置距圆心太近，无法补环', 'info')
    return false
  }
  const grayMat = await loadPreprocessedGrayMat()
  if (!grayMat) {
    showStatus('⚠️ 预处理图已失效，请点击「重新检测圆心」后再补环', 'info')
    return false
  }
  const ring = extractRingDataForManual(grayMat, center.x, center.y, radius)
  grayMat.delete()
  if (!ring) {
    showStatus('❌ 补环失败：无法提取环数据', 'error')
    return false
  }
  ring.manual = true
  const merged = mergeAndNumberRings([...ringList.value, ring])
  ringList.value = merged.map((r) => ({ ...r, enabled: r.enabled !== false }))
  persistRings()
  showStatus(`✅ 已手动补环 (半径 ${radius.toFixed(2)}px)，编号按半径重排`, 'success')
  return true
}

// ===== 圆心键盘微调 =====
function onCenterKeydown(e) {
  if (centerPhase.value !== 'awaiting-center' || !detectedCenter.value) return
  if (zoomOpen.value) return
  const ae = document.activeElement
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return
  if (['+', '=', '-', '_'].includes(e.key)) {
    e.preventDefault()
    const step = 8 * (e.shiftKey ? 5 : 1)
    const delta = e.key === '+' || e.key === '=' ? step : -step
    const maxArm = imgWidth.value
      ? Math.round(Math.hypot(imgWidth.value, imgHeight.value) / 2)
      : 200
    centerCrossArm.value = Math.max(4, Math.min(maxArm, centerCrossArm.value + delta))
    return
  }
  const step = e.shiftKey ? 5 : 1
  let dx = 0
  let dy = 0
  switch (e.key) {
    case 'ArrowUp': dy = -step; break
    case 'ArrowDown': dy = step; break
    case 'ArrowLeft': dx = -step; break
    case 'ArrowRight': dx = step; break
    default: return
  }
  e.preventDefault()
  detectedCenter.value = {
    x: Math.max(0, Math.min((imgWidth.value || 1) - 1, detectedCenter.value.x + dx)),
    y: Math.max(0, Math.min((imgHeight.value || 1) - 1, detectedCenter.value.y + dy)),
  }
}

// ===== sessionStorage 持久化 =====
function persistToSession() {
  if (!imgState.src) return
  saveImageSession({
    src: imgState.src,
    fileName: fileName.value,
    width: imgWidth.value,
    height: imgHeight.value,
    center: detectedCenter.value,
    rings: ringList.value.length ? ringList.value.map((r) => ({ ...r })) : null,
    phase: centerPhase.value,
    filterParams: { ...filterParams },
    grayscale: resultGrayscale.value,
    outerRadius: detectedOuterRadius.value,
  })
}

function restoreFromSession() {
  const saved = loadImageSession()
  if (!saved?.src) return
  imgState.src = saved.src
  fileName.value = saved.fileName || ''
  imgWidth.value = saved.width || 0
  imgHeight.value = saved.height || 0
  detectedCenter.value = saved.center || null
  detectedOuterRadius.value = saved.outerRadius || 0
  resultGrayscale.value = saved.grayscale || false
  if (saved.filterParams) Object.assign(filterParams, saved.filterParams)
  if (saved.rings && saved.rings.length) {
    ringList.value = saved.rings.map((r) => ({ ...r, enabled: r.enabled !== false }))
    imgState.rings = saved.rings
    imgState.center = saved.center
  }
  centerPhase.value = saved.phase || 'idle'
  // processedDataUrl 无法持久化（太大），恢复后若需补环则用原图 fallback
  centerProcessedDataUrl.value = null
  showStatus('📂 已从会话恢复上次识别状态', 'success')
}

// ===== 合成标注图（存历史 / 会话）=====
function composeAnnotated() {
  return new Promise((resolve) => {
    if (!imgState.src) return resolve(null)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      drawOverlay(ctx, enabledRings.value, null)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => resolve(null)
    img.src = imgState.src
  })
}

async function saveResult() {
  if (!calculationResults.value) {
    message.warning('暂无结果可保存')
    return
  }
  if (!(psNum.value > 0)) {
    message.warning('请先设定像素标定值再保存（否则 mm 与曲率半径无效）')
    return
  }
  const annotated = await composeAnnotated()
  const payload = resultPayload.value
  setSession({
    fileName: fileName.value,
    imageSrc: imgState.src,
    imageWidth: imgWidth.value,
    imageHeight: imgHeight.value,
    center: detectedCenter.value,
    rings: ringList.value.map((r) => ({ ...r })),
    calculationResults: calculationResults.value,
    annotatedImage: annotated,
  })
  await addHistory({ title: fileName.value || '牛顿环测量', image: annotated, data: payload })
  message.success('已保存到历史记录，并同步到当前会话')
}

function goExport() {
  if (!calculationResults.value) {
    message.warning('暂无结果，请先完成识别')
    return
  }
  setSession({
    fileName: fileName.value,
    imageSrc: imgState.src,
    imageWidth: imgWidth.value,
    imageHeight: imgHeight.value,
    center: detectedCenter.value,
    rings: ringList.value.map((r) => ({ ...r })),
    calculationResults: calculationResults.value,
  })
  router.push('/export')
}

// ===== 生命周期 =====
onMounted(() => {
  restoreFromSession()
  document.addEventListener('keydown', onCenterKeydown)
  initDragDrop(loadFiles, () => true)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onCenterKeydown)
})

// 圆心变更时自动持久化
watch(detectedCenter, () => {
  if (centerPhase.value === 'awaiting-center') persistToSession()
})
</script>

<template>
  <div class="flex max-w-6xl flex-col gap-4">
    <!-- 内联 SVG 卷积核（锐化 / 边缘增强预览） -->
    <svg width="0" height="0" class="absolute">
      <filter id="sharpenFilter">
        <feConvolveMatrix order="3" :kernelMatrix="sharpenMatrix" />
      </filter>
      <filter id="edgeFilter">
        <feConvolveMatrix order="3" :kernelMatrix="edgeMatrix" />
      </filter>
    </svg>
    <!-- 隐藏 img 供算法调试帧写入 -->
    <img ref="algoImageRef" class="hidden" alt="" />

    <!-- 上传 / 状态 -->
    <n-card :bordered="false" class="bg-card">
      <n-space align="center" wrap :size="12">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onFilePick"
        />
        <n-button type="primary" @click="fileInputRef?.click()">
          <template #icon><i class="i-carbon:upload" /></template>
          上传牛顿环图像
        </n-button>
        <n-tag v-if="fileName" :bordered="false" round>
          {{ fileName }} · {{ imgWidth }}×{{ imgHeight }}
        </n-tag>
        <span class="text-xs opacity-50">支持拖拽图片到页面任意处</span>
      </n-space>
    </n-card>

    <!-- 日志 -->
    <n-card :bordered="false" class="bg-card" size="small">
      <div ref="logContainerRef" class="max-h-32 overflow-y-auto font-mono text-xs leading-5">
        <div v-for="(l, i) in logs" :key="i">
          <span class="opacity-50">{{ l.time }}</span>
          <span
            :class="
              l.type === 'error'
                ? 'text-red-500'
                : l.type === 'success'
                  ? 'text-green-500'
                  : 'opacity-80'
            "
          >
            {{ l.msg }}
          </span>
        </div>
        <div v-if="!logs.length" class="opacity-40">暂无日志</div>
      </div>
    </n-card>

    <!-- 识别视图 (RingCanvasViewer) -->
    <n-card :bordered="false" class="bg-card" title="识别视图">
      <template #header-extra>
        <n-button size="small" :disabled="!zoomCanUse" @click="openZoom">
          <template #icon><i class="i-carbon:maximize" /></template>
          全屏放大
        </n-button>
      </template>
      <RingCanvasViewer
        v-if="!zoomOpen"
        v-model:grayscale="resultGrayscale"
        :src="imgState.src"
        :width="imgWidth"
        :height="imgHeight"
        :rings="enabledRings"
        :center="detectedCenter"
        :filter-style="previewFilterStyle"
        :fullscreen="false"
        :interactive="centerPhase === 'done'"
        :center-draggable="centerPhase === 'awaiting-center'"
        :hovered-ring="hoveredRing"
        :show-center="centerPhase !== 'idle' && !!detectedCenter"
        :cross-arm="centerCrossArm"
        @click-image="onViewerClick"
        @update:center="onViewerCenterUpdate"
      />

      <!-- 圆心确认面板 -->
      <div v-if="centerPhase === 'awaiting-center'" class="mt-4">
        <n-alert type="info" :bordered="false" class="mb-2">
          请核对圆心：拖拽图像 / 方向键微调（Shift 加速 5px）/ +/- 调十字臂长 / 直接输入坐标。
        </n-alert>
        <n-space align="center" wrap :size="12">
          <span class="text-sm">圆心 X</span>
          <n-input-number v-model:value="detectedCenter.x" size="small" :step="1" class="!w-28" />
          <span class="text-sm">圆心 Y</span>
          <n-input-number v-model:value="detectedCenter.y" size="small" :step="1" class="!w-28" />
          <n-button size="small" @click="redetectCenter">重新检测</n-button>
          <n-button
            size="small"
            type="primary"
            :loading="isProcessing"
            @click="confirmCenterAndDetectRings"
          >
            确认圆心并识别暗环
          </n-button>
        </n-space>
      </div>

      <!-- 环编辑提示 -->
      <div v-else-if="centerPhase === 'done'" class="mt-3">
        <n-alert type="success" :bordered="false">
          已识别 {{ enabledRings.length }} 个启用环（人工补入
          {{ manualRingCount }} 个）。点击图像可直接补环，或在下方表1调整。
        </n-alert>
      </div>
    </n-card>

    <!-- 环人工核对（表1）-->
    <n-card :bordered="false" class="bg-card" title="表1 · 环人工核对">
      <template #header-extra>
        <n-space align="center" :size="10">
          <span class="text-xs opacity-60">顺延重排</span>
          <n-switch
            v-model:value="renumberOnRemove"
            size="small"
            :disabled="centerPhase !== 'done'"
            @update:value="onRenumberModeChange"
          />
        </n-space>
      </template>
      <div v-if="centerPhase === 'done' && ringList.length" class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-black/5">
              <th class="border border-gray-400/30 px-3 py-2">启用</th>
              <th class="border border-gray-400/30 px-3 py-2">编号</th>
              <th class="border border-gray-400/30 px-3 py-2">半径 (px)</th>
              <th class="border border-gray-400/30 px-3 py-2">直径 (px)</th>
              <th class="border border-gray-400/30 px-3 py-2">直径 (mm)</th>
              <th class="border border-gray-400/30 px-3 py-2">来源</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ring in ringList"
              :key="ring.__key || `${ring.number}-${ring.avgRadius}`"
              class="transition-colors hover:bg-primary/5"
              @mouseenter="handleRowHover(ring.number)"
              @mouseleave="handleRowLeave"
            >
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                <n-checkbox v-model:checked="ring.enabled" @update:checked="onToggleRingEnabled" />
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                <n-input-number
                  v-model:value="ring.number"
                  size="tiny"
                  :step="1"
                  class="!w-20"
                  @update:value="onRingNumberChange(ring)"
                />
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                {{ ring.avgRadius.toFixed(2) }}
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                {{ (ring.avgRadius * 2).toFixed(2) }}
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                {{ (ring.avgRadius * 2 * psNum).toFixed(3) }}
              </td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">
                <n-tag size="tiny" :type="ring.manual ? 'warning' : 'default'" :bordered="false">
                  {{ ring.manual ? '人工' : '自动' }}
                </n-tag>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="py-8 text-center text-sm opacity-40">
        请先上传图像并完成环识别
      </div>
    </n-card>

    <!-- 标定值 + 逐差步长 -->
    <n-card :bordered="false" class="bg-card" title="测量参数">
      <n-space align="center" wrap :size="16">
        <n-space align="center" :size="8">
          <span class="text-sm">像素标定值 (mm/像素)</span>
          <n-input v-model:value="pixelScale" size="small" class="!w-32" placeholder="如 0.0025" />
        </n-space>
        <n-space align="center" :size="8">
          <span class="text-sm">逐差法步长 (m−n)</span>
          <n-input-number v-model:value="diffStep" size="small" :min="1" :step="1" class="!w-24" />
        </n-space>
        <n-button size="small" @click="router.push('/calibration')">去标定页获取标定值</n-button>
      </n-space>
      <p class="mt-2 text-xs opacity-50">
        标定值未设定（空 / ≤0）时，直径 mm 与曲率半径按未设定处理；可手动输入或在标定页「应用到识别」。
      </p>
    </n-card>

    <!-- 预处理预览（不影响识别算法） -->
    <n-card :bordered="false" class="bg-card" size="small">
      <n-collapse>
        <n-collapse-item title="预处理参数调试（仅影响预览显示，不改变识别算法）" name="filter">
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div class="text-xs opacity-60">亮度 {{ filterParams.brightness.toFixed(2) }}</div>
              <n-slider v-model:value="filterParams.brightness" :min="0.2" :max="2" :step="0.01" />
            </div>
            <div>
              <div class="text-xs opacity-60">对比度 {{ filterParams.contrast.toFixed(2) }}</div>
              <n-slider v-model:value="filterParams.contrast" :min="0.2" :max="3" :step="0.01" />
            </div>
            <div>
              <div class="text-xs opacity-60">模糊 {{ filterParams.blur.toFixed(1) }}px</div>
              <n-slider v-model:value="filterParams.blur" :min="0" :max="5" :step="0.1" />
            </div>
            <div>
              <div class="text-xs opacity-60">灰度 {{ filterParams.grayscale.toFixed(2) }}</div>
              <n-slider v-model:value="filterParams.grayscale" :min="0" :max="1" :step="0.01" />
            </div>
            <div>
              <div class="text-xs opacity-60">锐化 {{ filterParams.sharpen.toFixed(2) }}</div>
              <n-slider v-model:value="filterParams.sharpen" :min="0" :max="2" :step="0.01" />
            </div>
            <div>
              <div class="text-xs opacity-60">
                边缘增强 {{ filterParams.edgeEnhance.toFixed(2) }}
              </div>
              <n-slider v-model:value="filterParams.edgeEnhance" :min="0" :max="1" :step="0.01" />
            </div>
            <div>
              <div class="text-xs opacity-60">
                CLAHE clip {{ filterParams.claheClip.toFixed(1) }}
              </div>
              <n-slider v-model:value="filterParams.claheClip" :min="1" :max="5" :step="0.1" />
            </div>
            <div>
              <div class="text-xs opacity-60">CLAHE tile {{ filterParams.claheTile }}</div>
              <n-slider v-model:value="filterParams.claheTile" :min="4" :max="16" :step="1" />
            </div>
          </div>
          <n-button size="small" class="mt-3" @click="resetFilterParams">重置参数</n-button>
        </n-collapse-item>
      </n-collapse>
    </n-card>

    <!-- 计算结果（表2 + 不确定度） -->
    <result-tables v-if="centerPhase === 'done'" :payload="resultPayload" />
    <n-card v-else :bordered="false" class="bg-card" title="计算结果">
      <div class="py-8 text-center text-sm opacity-40">请先完成环识别</div>
    </n-card>

    <!-- 结果操作 -->
    <n-card :bordered="false" class="bg-card">
      <n-space>
        <n-button type="primary" :disabled="centerPhase !== 'done'" @click="saveResult">
          <template #icon><i class="i-carbon:save" /></template>
          保存到历史
        </n-button>
        <n-button :disabled="centerPhase !== 'done'" @click="goExport">
          <template #icon><i class="i-carbon:download" /></template>
          去导出页
        </n-button>
      </n-space>
    </n-card>

    <!-- 全屏放大弹窗 -->
    <n-modal
      :show="zoomOpen"
      preset="card"
      title="全屏放大补环（拖拽平移 / 点击补环 / ESC 关闭）"
      class="!w-100dvw !h-100dvh !max-w-none"
      :bordered="false"
      :mask-closable="false"
      content-style="padding:0;height:100%;display:flex;flex-direction:column;overflow:hidden"
      @update:show="(v) => !v && closeZoom()"
    >
      <RingCanvasViewer
        v-model:grayscale="resultGrayscale"
        :src="imgState.src"
        :width="imgWidth"
        :height="imgHeight"
        :rings="enabledRings"
        :center="detectedCenter"
        :filter-style="previewFilterStyle"
        :fullscreen="true"
        :interactive="true"
        :hovered-ring="hoveredRing"
        :show-center="true"
        :cross-arm="centerCrossArm"
        :initial-crop="zoomCrop"
        @click-image="onViewerClick"
        @update:center="onViewerCenterUpdate"
        @close="closeZoom"
      />
    </n-modal>
  </div>
</template>

<style scoped>
.hidden {
  display: none;
}
</style>
