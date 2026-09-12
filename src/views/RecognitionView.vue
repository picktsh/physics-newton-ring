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
import { loadOpenCv } from '@/utils/loadOpenCv'
import {
  detectNewtonRingCenter,
  detectRingsWithCenter,
  extractRingDataForManual,
  mergeAndNumberRings,
} from '@/utils/imageProcessor'
import { clearCanvas, drawDetectionResults, drawCenterOverlay, drawOverlay } from '@/utils/canvasDrawer'
import {
  initCanvasInteraction,
  onTableRowHover,
  onTableRowLeave,
  initCenterAdjustInteraction,
  initDragDrop,
} from '@/utils/interactionHandler'
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

// §8 识别页（对应旧 Tab2）：上传 → 自动圆心 → 人工核对 → 识别暗环 → 环编辑/补环 → 表1表2/不确定度
const message = useMessage()
const router = useRouter()
const { pixelScale, pixelScaleNumber, setSession } = useMeasureStore()
const { add: addHistory } = useHistoryStore()

// ===== 基础状态 =====
const cvReady = ref(false)
const isProcessing = ref(false)
const logs = ref([])
const logContainerRef = ref(null)
const fileInputRef = ref(null)

const resultImageRef = ref(null) // <img> DOM，算法在预处理阶段直接写 .src
const resultCanvasRef = ref(null) // 覆盖层 <canvas>
const resultImageSrc = ref('') // 绑定到 <img :src>，识别完成后恢复为原图

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
let cleanupCenterAdjust = null

// ===== 环列表（可编辑副本）=====
const ringList = ref([])
const renumberOnRemove = ref(false)
const diffStep = ref(5)
const enabledRings = computed(() => ringList.value.filter((r) => r.enabled))
const manualRingCount = computed(() => ringList.value.filter((r) => r.manual).length)

// ===== 预处理预览（仅影响显示预览，不进入识别算法，与旧口径一致）=====
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
const radiusData = computed(() => calculateRadiusData(enabledRings.value, psNum.value, diffStep.value))
const averageRadius = computed(() => calculateAverageRadius(radiusData.value))
const radiusUncertainty = computed(() => calculateRadiusUncertainty(radiusData.value, averageRadius.value))
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
  if (!cvReady.value) {
    message.warning('OpenCV 尚在加载，请稍候…')
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
  if (!imgState.src || !cvReady.value) {
    return showStatus('❌ 请先上传图像并等待 OpenCV 加载', 'error')
  }
  if (isProcessing.value) return showStatus('⏳ 正在处理中，请稍候…', 'info')
  isProcessing.value = true
  try {
    cleanupCenterAdjust?.()
    cleanupCenterAdjust = null
    centerPhase.value = 'idle'
    detectedCenter.value = null
    centerProcessedDataUrl.value = null
    detectedOuterRadius.value = 0
    ringList.value = []
    imgState.rings = null
    closeZoom()
    resultImageSrc.value = ''
    clearCanvas(resultCanvasRef.value)

    const centerResult = await detectNewtonRingCenter(imageManager, showStatus, resultImageRef)
    if (!centerResult) {
      showStatus('❌ 无法检测到牛顿环中心，请检查图像质量', 'error')
      resultImageSrc.value = imgState.src
      return
    }
    detectedCenter.value = { x: Math.round(centerResult.x), y: Math.round(centerResult.y) }
    detectedOuterRadius.value = centerResult.outerRadius
    centerProcessedDataUrl.value = centerResult.processedDataUrl
    enterAwaitingCenterPhase()
    showStatus('🔍 请核对圆心：可拖拽 / 方向键微调 / 输入坐标，确认后再识别环', 'info')
  } catch (error) {
    showStatus(`❌ 处理失败: ${error.message}`, 'error')
    resultImageSrc.value = imgState.src
  } finally {
    isProcessing.value = false
  }
}

function enterAwaitingCenterPhase() {
  centerPhase.value = 'awaiting-center'
  // 圆心确认阶段：底图恢复原图，覆盖层画圆心十字
  resultImageSrc.value = imgState.src
  nextTick(() => {
    cleanupCenterAdjust?.()
    cleanupCenterAdjust = initCenterAdjustInteraction(resultImageRef, resultCanvasRef, (c) => {
      detectedCenter.value = c
    })
    drawCenterOverlay(
      resultCanvasRef,
      detectedCenter.value,
      imgWidth.value,
      imgHeight.value,
      centerCrossArm.value,
    )
  })
}

watch([detectedCenter, centerCrossArm], () => {
  if (centerPhase.value !== 'awaiting-center' || !detectedCenter.value) return
  drawCenterOverlay(
    resultCanvasRef,
    detectedCenter.value,
    imgWidth.value,
    imgHeight.value,
    centerCrossArm.value,
  )
}, { deep: true })

// ===== 第二步：确认圆心并识别暗环 =====
async function confirmCenterAndDetectRings() {
  if (!detectedCenter.value || isProcessing.value) return
  isProcessing.value = true
  try {
    cleanupCenterAdjust?.()
    cleanupCenterAdjust = null
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
      enterAwaitingCenterPhase()
      return
    }
    centerPhase.value = 'done'
    ringList.value = darkRings.map((r) => ({ ...r, enabled: r.enabled !== false }))
    showStatus(`✅ 识别到 ${darkRings.length} 个暗环，可在表1去除错环/改编号，或点击图像/全屏放大补环`, 'success')
    nextTick(() => {
      drawDetectionResults(resultCanvasRef, imageManager)
      initCanvasInteractionWrapper()
      resultImageSrc.value = imgState.src
    })
  } catch (error) {
    showStatus(`❌ 环识别失败: ${error.message}`, 'error')
    enterAwaitingCenterPhase()
  } finally {
    isProcessing.value = false
  }
}

async function redetectCenter() {
  if (isProcessing.value) return
  cleanupCenterAdjust?.()
  cleanupCenterAdjust = null
  await processImage()
}

// ===== 环人工核对 =====
function persistRings() {
  const rings = ringList.value
  if (rings.length === 0) return
  imgState.rings = rings.map((r) => ({ ...r }))
  imgState.center = detectedCenter.value || imgState.center || null
  nextTick(() => drawDetectionResults(resultCanvasRef, imageManager))
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
async function completeRingAtClick(event) {
  if (centerPhase.value !== 'done') return
  const imgEl = resultImageRef.value
  const canvas = resultCanvasRef.value
  if (!imgEl || !canvas) return
  const rect = imgEl.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const px = (event.clientX - rect.left) * scaleX
  const py = (event.clientY - rect.top) * scaleY
  await addManualRingAt(px, py)
}
function initCanvasInteractionWrapper() {
  initCanvasInteraction(resultImageRef, resultCanvasRef, imageManager, hoveredRing)
  const img = resultImageRef.value
  if (img) img.addEventListener('click', completeRingAtClick)
}
function handleRowHover(n) {
  onTableRowHover(n, resultCanvasRef, imageManager, hoveredRing)
}
function handleRowLeave() {
  onTableRowLeave(resultCanvasRef, imageManager, hoveredRing)
}

// ===== 圆心键盘微调 =====
function onCenterKeydown(e) {
  if (centerPhase.value !== 'awaiting-center' || !detectedCenter.value) return
  const ae = document.activeElement
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return
  if (['+', '=', '-', '_'].includes(e.key)) {
    e.preventDefault()
    const step = 8 * (e.shiftKey ? 5 : 1)
    const delta = e.key === '+' || e.key === '=' ? step : -step
    const maxArm = imgWidth.value ? Math.round(Math.hypot(imgWidth.value, imgHeight.value) / 2) : 200
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

// ===== 全屏放大补环 =====
const ZOOM_MAX_SCALE = 8
const ZOOM_WHEEL_STEP = 1.25
const ZOOM_PAN_THRESHOLD = 5
const ZOOM_KEY_PAN_RATIO = 0.1
const zoomOpen = ref(false)
const zoomCrop = ref(null)
const zoomViewport = ref({ w: 0, h: 0 })
const zoomScale = ref(1)
const zoomOffset = ref({ x: 0, y: 0 })
const zoomCursor = ref(null)
const zoomHoveredRing = ref(null)
const zoomPanning = ref(false)
const zoomStageRef = ref(null)
const zoomCanvasRef = ref(null)
let zoomPan = null
let zoomSuppressClick = false

const zoomCanUse = computed(() => centerPhase.value === 'done' && !!imgState.src)
const zoomScaleMin = computed(() => {
  const V = zoomViewport.value
  const img = { width: imgWidth.value, height: imgHeight.value }
  if (!V.w || !V.h || !img.width || !img.height) return 0.1
  return Math.min(V.w / img.width, V.h / img.height)
})
const zoomImgStyle = computed(() => {
  const img = { width: imgWidth.value, height: imgHeight.value }
  return {
    width: `${img.width * zoomScale.value}px`,
    height: `${img.height * zoomScale.value}px`,
    transform: `translate(${zoomOffset.value.x}px, ${zoomOffset.value.y}px)`,
    transformOrigin: '0 0',
  }
})

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
function measureZoomViewport() {
  const stage = zoomStageRef.value
  zoomViewport.value = stage ? { w: stage.clientWidth || 0, h: stage.clientHeight || 0 } : { w: 0, h: 0 }
}
function clampZoomOffset() {
  const V = zoomViewport.value
  if (!imgWidth.value || !imgHeight.value || !V.w || !V.h) return
  const dispW = imgWidth.value * zoomScale.value
  const dispH = imgHeight.value * zoomScale.value
  const o = zoomOffset.value
  zoomOffset.value = {
    x: dispW >= V.w ? Math.min(0, Math.max(V.w - dispW, o.x)) : (V.w - dispW) / 2,
    y: dispH >= V.h ? Math.min(0, Math.max(V.h - dispH, o.y)) : (V.h - dispH) / 2,
  }
}
function resetZoomView() {
  const crop = zoomCrop.value
  const V = zoomViewport.value
  if (!crop || !V.w || !V.h) return
  const s = Math.min(V.w / crop.w, V.h / crop.h)
  zoomScale.value = Math.max(zoomScaleMin.value, Math.min(ZOOM_MAX_SCALE, s))
  zoomOffset.value = {
    x: V.w / 2 - (crop.x + crop.w / 2) * zoomScale.value,
    y: V.h / 2 - (crop.y + crop.h / 2) * zoomScale.value,
  }
  clampZoomOffset()
  drawZoom()
}
function openZoom() {
  if (!zoomCanUse.value) return
  const crop = computeZoomCrop()
  if (!crop) return showStatus('❌ 无法取景：缺少圆心或图像尺寸', 'error')
  zoomCrop.value = crop
  zoomCursor.value = null
  zoomHoveredRing.value = null
  zoomSuppressClick = false
  zoomOpen.value = true
  nextTick(() => {
    measureZoomViewport()
    resetZoomView()
  })
  showStatus(`⛶ 已全屏放大：取景 ${crop.w}×${crop.h}px，滚轮缩放 / 拖拽平移 / 点击补环，ESC 关闭`, 'success')
}
function closeZoom() {
  if (zoomPan) {
    document.removeEventListener('mousemove', onZoomPanMove)
    document.removeEventListener('mouseup', onZoomPanEnd)
    zoomPan = null
  }
  zoomPanning.value = false
  zoomSuppressClick = false
  zoomOpen.value = false
  zoomCrop.value = null
  zoomCursor.value = null
  zoomHoveredRing.value = null
  zoomViewport.value = { w: 0, h: 0 }
}
function zoomScaleAt(vx, vy, factor) {
  const old = zoomScale.value
  const next = Math.max(zoomScaleMin.value, Math.min(ZOOM_MAX_SCALE, old * factor))
  if (next === old) return
  const ix = (vx - zoomOffset.value.x) / old
  const iy = (vy - zoomOffset.value.y) / old
  zoomScale.value = next
  zoomOffset.value = { x: vx - ix * next, y: vy - iy * next }
  clampZoomOffset()
  drawZoom()
}
function onZoomWheel(event) {
  const stage = zoomStageRef.value
  if (!stage) return
  event.preventDefault()
  const rect = stage.getBoundingClientRect()
  zoomScaleAt(
    event.clientX - rect.left,
    event.clientY - rect.top,
    event.deltaY < 0 ? ZOOM_WHEEL_STEP : 1 / ZOOM_WHEEL_STEP,
  )
}
function onZoomMouseDown(event) {
  if (!zoomOpen.value || event.button !== 0) return
  event.preventDefault()
  zoomPan = { sx: event.clientX, sy: event.clientY, ox: zoomOffset.value.x, oy: zoomOffset.value.y, moved: false }
  zoomPanning.value = true
  document.addEventListener('mousemove', onZoomPanMove)
  document.addEventListener('mouseup', onZoomPanEnd)
}
function onZoomPanMove(event) {
  if (!zoomPan) return
  const dx = event.clientX - zoomPan.sx
  const dy = event.clientY - zoomPan.sy
  if (!zoomPan.moved && Math.hypot(dx, dy) > ZOOM_PAN_THRESHOLD) zoomPan.moved = true
  if (!zoomPan.moved) return
  zoomOffset.value = { x: zoomPan.ox + dx, y: zoomPan.oy + dy }
  clampZoomOffset()
  drawZoom()
}
function onZoomPanEnd() {
  document.removeEventListener('mousemove', onZoomPanMove)
  document.removeEventListener('mouseup', onZoomPanEnd)
  const pan = zoomPan
  zoomPan = null
  zoomPanning.value = false
  if (pan?.moved) zoomSuppressClick = true
}
function zoomEventToImageCoords(event) {
  const stage = zoomStageRef.value
  if (!stage) return null
  const rect = stage.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const x = (event.clientX - rect.left - zoomOffset.value.x) / zoomScale.value
  const y = (event.clientY - rect.top - zoomOffset.value.y) / zoomScale.value
  return { x, y, inside: x >= 0 && y >= 0 && x < imgWidth.value && y < imgHeight.value }
}
function onZoomMouseMove(event) {
  const p = zoomEventToImageCoords(event)
  if (!p) return
  const center = detectedCenter.value || imgState.center
  zoomCursor.value = { x: p.x, y: p.y, inside: p.inside, r: center ? Math.hypot(p.x - center.x, p.y - center.y) : 0 }
  let hit = null
  for (const ring of enabledRings.value) {
    const dist = Math.hypot(p.x - ring.x, p.y - ring.y)
    if (Math.abs(dist - ring.avgRadius) < Math.max(8, ring.avgRadius * 0.05)) {
      hit = ring.number
      break
    }
  }
  zoomHoveredRing.value = hit
  drawZoom()
}
function onZoomMouseLeave() {
  zoomCursor.value = null
  zoomHoveredRing.value = null
  drawZoom()
}
async function onZoomClick(event) {
  if (zoomSuppressClick) {
    zoomSuppressClick = false
    return
  }
  const p = zoomEventToImageCoords(event)
  if (!p) return
  if (!p.inside) return showStatus('⚠️ 请点击图像范围内', 'info')
  const ok = await addManualRingAt(p.x, p.y)
  if (ok) drawZoom()
}
function onZoomKeydown(e) {
  if (!zoomOpen.value) return
  const ae = document.activeElement
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeZoom()
    return
  }
  const V = zoomViewport.value
  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    zoomScaleAt(V.w / 2, V.h / 2, ZOOM_WHEEL_STEP)
    return
  }
  if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    zoomScaleAt(V.w / 2, V.h / 2, 1 / ZOOM_WHEEL_STEP)
    return
  }
  const step = ZOOM_KEY_PAN_RATIO * (e.shiftKey ? 3 : 1)
  let dx = 0
  let dy = 0
  switch (e.key) {
    case 'ArrowUp': dy = V.h * step; break
    case 'ArrowDown': dy = -V.h * step; break
    case 'ArrowLeft': dx = V.w * step; break
    case 'ArrowRight': dx = -V.w * step; break
    default: return
  }
  e.preventDefault()
  zoomOffset.value = { x: zoomOffset.value.x + dx, y: zoomOffset.value.y + dy }
  clampZoomOffset()
  drawZoom()
}
function onZoomResize() {
  if (!zoomOpen.value) return
  measureZoomViewport()
  clampZoomOffset()
  drawZoom()
}
function drawZoom() {
  const canvas = zoomCanvasRef.value
  const V = zoomViewport.value
  if (!canvas || !V.w || !V.h) return
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(V.w * dpr)
  const ch = Math.round(V.h * dpr)
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  const scale = zoomScale.value
  const off = zoomOffset.value
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, off.x * dpr, off.y * dpr)
  const unit = 1 / scale
  drawOverlay(ctx, enabledRings.value, zoomHoveredRing.value, unit)
  const center = detectedCenter.value || imgState.center
  if (!center) return
  const arm = 14 * unit
  ctx.lineWidth = 2 * unit
  ctx.strokeStyle = 'rgba(255, 165, 0, 1)'
  ctx.beginPath()
  ctx.moveTo(center.x - arm, center.y)
  ctx.lineTo(center.x + arm, center.y)
  ctx.moveTo(center.x, center.y - arm)
  ctx.lineTo(center.x, center.y + arm)
  ctx.stroke()
  const cur = zoomCursor.value
  if (!cur || !cur.inside) return
  ctx.lineWidth = 1.5 * unit
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)'
  ctx.beginPath()
  ctx.arc(center.x, center.y, cur.r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(center.x, center.y)
  ctx.lineTo(center.x + (cur.x - center.x) * 1.15, center.y + (cur.y - center.y) * 1.15)
  ctx.stroke()
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
onMounted(async () => {
  document.addEventListener('keydown', onCenterKeydown)
  document.addEventListener('keydown', onZoomKeydown)
  window.addEventListener('resize', onZoomResize)
  initDragDrop(loadFiles, () => true)
  try {
    await loadOpenCv()
    cvReady.value = true
    showStatus('✅ OpenCV 已就绪，请上传或拖拽牛顿环图像', 'success')
  } catch (e) {
    showStatus(`❌ OpenCV 加载失败：${e.message}`, 'error')
  }
})
onUnmounted(() => {
  cleanupCenterAdjust?.()
  closeZoom()
  document.removeEventListener('keydown', onCenterKeydown)
  document.removeEventListener('keydown', onZoomKeydown)
  window.removeEventListener('resize', onZoomResize)
})
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-4">
    <!-- 内联 SVG 卷积核（锐化 / 边缘增强预览） -->
    <svg width="0" height="0" class="absolute">
      <filter id="sharpenFilter">
        <feConvolveMatrix order="3" :kernelMatrix="sharpenMatrix" />
      </filter>
      <filter id="edgeFilter">
        <feConvolveMatrix order="3" :kernelMatrix="edgeMatrix" />
      </filter>
    </svg>

    <!-- 上传 / 状态 -->
    <n-card :bordered="false" class="bg-card">
      <n-space align="center" wrap :size="12">
        <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="onFilePick" />
        <n-button type="primary" :disabled="!cvReady" @click="fileInputRef?.click()">
          <template #icon><i class="i-carbon:upload" /></template>
          上传牛顿环图像
        </n-button>
        <n-tag :type="cvReady ? 'success' : 'warning'" :bordered="false" round>
          {{ cvReady ? 'OpenCV 就绪' : 'OpenCV 加载中…' }}
        </n-tag>
        <n-tag v-if="fileName" :bordered="false" round>{{ fileName }} · {{ imgWidth }}×{{ imgHeight }}</n-tag>
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
              l.type === 'error' ? 'text-red-500' : l.type === 'success' ? 'text-green-500' : 'opacity-80'
            "
          >
            {{ l.msg }}
          </span>
        </div>
        <div v-if="!logs.length" class="opacity-40">暂无日志</div>
      </div>
    </n-card>

    <n-alert v-if="!cvReady" type="info" :bordered="false">正在加载 OpenCV（首次约 10MB），请稍候…</n-alert>

    <!-- 主视图：原图 + 覆盖层 -->
    <n-card v-if="imgState.src" :bordered="false" class="bg-card" title="识别视图">
      <template #header-extra>
        <n-space :size="8">
          <n-switch v-model:value="resultGrayscale" size="small">
            <template #checked>灰度</template>
            <template #unchecked>彩色</template>
          </n-switch>
          <n-button size="small" :disabled="!zoomCanUse" @click="openZoom">
            <template #icon><i class="i-carbon:maximize" /></template>
            全屏放大补环
          </n-button>
        </n-space>
      </template>
      <div class="flex justify-center">
        <div class="relative inline-block max-w-full">
          <img
            ref="resultImageRef"
            :src="resultImageSrc"
            class="block max-w-full select-none"
            :style="previewFilterStyle"
            alt="识别底图"
          />
          <canvas
            ref="resultCanvasRef"
            class="pointer-events-none absolute inset-0 h-full w-full"
          />
        </div>
      </div>

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
          <n-button size="small" type="primary" :loading="isProcessing" @click="confirmCenterAndDetectRings">
            确认圆心并识别暗环
          </n-button>
        </n-space>
      </div>

      <!-- 环编辑提示 -->
      <div v-else-if="centerPhase === 'done'" class="mt-3">
        <n-alert type="success" :bordered="false">
          已识别 {{ enabledRings.length }} 个启用环（人工补入 {{ manualRingCount }} 个）。点击图像可直接补环，或在下方表1调整。
        </n-alert>
      </div>
    </n-card>

    <!-- 环人工核对（表1）+ 参数 -->
    <n-card v-if="centerPhase === 'done'" :bordered="false" class="bg-card" title="表1 · 环人工核对">
      <template #header-extra>
        <n-space align="center" :size="10">
          <span class="text-xs opacity-60">顺延重排</span>
          <n-switch v-model:value="renumberOnRemove" size="small" @update:value="onRenumberModeChange" />
        </n-space>
      </template>
      <div class="overflow-x-auto">
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
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ ring.avgRadius.toFixed(2) }}</td>
              <td class="border border-gray-400/30 px-3 py-1.5 text-center">{{ (ring.avgRadius * 2).toFixed(2) }}</td>
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
    </n-card>

    <!-- 标定值 + 逐差步长 -->
    <n-card v-if="centerPhase === 'done'" :bordered="false" class="bg-card" title="测量参数">
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
    <n-card v-if="imgState.src" :bordered="false" class="bg-card" size="small">
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
              <div class="text-xs opacity-60">边缘增强 {{ filterParams.edgeEnhance.toFixed(2) }}</div>
              <n-slider v-model:value="filterParams.edgeEnhance" :min="0" :max="1" :step="0.01" />
            </div>
            <div>
              <div class="text-xs opacity-60">CLAHE clip {{ filterParams.claheClip.toFixed(1) }}</div>
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

    <!-- 结果操作 -->
    <n-card v-if="centerPhase === 'done'" :bordered="false" class="bg-card">
      <n-space>
        <n-button type="primary" @click="saveResult">
          <template #icon><i class="i-carbon:save" /></template>
          保存到历史
        </n-button>
        <n-button @click="goExport">
          <template #icon><i class="i-carbon:download" /></template>
          去导出页
        </n-button>
      </n-space>
    </n-card>

    <!-- 全屏放大补环弹窗 -->
    <n-modal
      :show="zoomOpen"
      preset="card"
      title="全屏放大补环（滚轮缩放 / 拖拽平移 / 点击补环 / ESC 关闭）"
      class="!w-[95vw] max-w-6xl"
      :bordered="false"
      :mask-closable="false"
      @update:show="(v) => !v && closeZoom()"
    >
      <div
        ref="zoomStageRef"
        class="relative h-[70vh] w-full overflow-hidden rounded bg-black"
        :class="zoomPanning ? 'cursor-grabbing' : 'cursor-crosshair'"
        @wheel="onZoomWheel"
        @mousedown="onZoomMouseDown"
        @mousemove="onZoomMouseMove"
        @mouseleave="onZoomMouseLeave"
        @click="onZoomClick"
      >
        <img :src="imgState.src" class="absolute left-0 top-0 select-none" :style="zoomImgStyle" alt="放大底图" />
        <canvas ref="zoomCanvasRef" class="pointer-events-none absolute inset-0" />
      </div>
      <div class="mt-2 flex items-center justify-between text-xs opacity-60">
        <span>
          缩放 {{ zoomScale.toFixed(2) }}x
          <template v-if="zoomCursor?.inside">
            · 光标 ({{ zoomCursor.x.toFixed(0) }}, {{ zoomCursor.y.toFixed(0) }}) · 半径 {{ zoomCursor.r.toFixed(1) }}px
          </template>
        </span>
        <n-space :size="8">
          <n-button size="tiny" @click="resetZoomView">复位全览</n-button>
          <n-button size="tiny" @click="closeZoom">关闭</n-button>
        </n-space>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.hidden {
  display: none;
}
</style>
