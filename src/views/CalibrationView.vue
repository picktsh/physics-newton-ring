<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NCard,
  NButton,
  NSpace,
  NInputNumber,
  NSlider,
  NTag,
  NAlert,
  NRadioGroup,
  NRadioButton,
  NDivider,
  NEmpty,
  useMessage,
} from 'naive-ui'
import { solveGlobalTranslation, verifyOverlayOffset } from '@/utils/imageRegistrator'
import { useMeasureStore } from '@/composables/useMeasureStore'
import { CALIB_IMAGES_KEY, CALIB_POINTS_KEY } from '@/utils/constants'

// §8 标定页（对应旧 Tab1）：双图上传 → 圆形截取 → 叠加对齐 → 锁定取点 → 标定值 → 应用到识别
const message = useMessage()
const router = useRouter()
const { setPixelScale, setCalibImages } = useMeasureStore()

// ===== 图片与刻度 =====
const calibImageA = ref(null) // { src, name, width, height }
const calibImageB = ref(null)
const calibScaleA = ref(null) // 图A鼓轮刻度 (mm)
const calibScaleB = ref(null) // 图B鼓轮刻度 (mm)
const calibDistanceManual = ref(null) // 手动实际距离 (mm)，优先于刻度差

const calibAutoDistance = computed(() => {
  if (calibScaleA.value == null || calibScaleB.value == null) return 0
  return Math.abs(calibScaleA.value - calibScaleB.value)
})
const calibPhysicalDistance = computed(() => {
  if (calibDistanceManual.value != null && calibDistanceManual.value > 0)
    return calibDistanceManual.value
  return calibAutoDistance.value
})
watch(calibAutoDistance, (v) => {
  if (v > 0) calibDistanceManual.value = Math.round(v * 1000) / 1000
})

// ===== 叠加对齐状态 =====
const overlayDx = ref(0)
const overlayDy = ref(0)
const overlayLocked = ref(false)
const overlayKeyFocus = ref(false)
const overlayBlendMode = ref('overlay') // overlay | gray
const overlayFineBusy = ref(false)
const overlayCheckBusy = ref(false)
const overlayFineMsg = ref('')
const overlayFineDone = ref(false)
const calibPointPairs = ref([]) // [{ a:{x,y}, b:{x,y} }]
let overlayPointsFromOverlay = false
const checkCenters = ref(null) // { centerA, centerB }

const overlayStageRef = ref(null)
const overlayBaseImgRef = ref(null)
const overlayCanvasRef = ref(null)

const overlayReady = computed(
  () =>
    !!(
      calibImageA.value &&
      calibImageB.value &&
      calibImageA.value.width === calibImageB.value.width &&
      calibImageA.value.height === calibImageB.value.height
    ),
)
const overlaySizeMismatch = computed(
  () => !!(calibImageA.value && calibImageB.value && !overlayReady.value),
)
const overlayMaxX = computed(() =>
  overlayReady.value ? Math.round(calibImageA.value.width / 2) : 0,
)
const overlayMaxY = computed(() =>
  overlayReady.value ? Math.round(calibImageA.value.height / 2) : 0,
)

// ===== 闪烁对比 =====
const BLINK_INTERVAL = 100
const overlayBlinkOn = ref(false)
const overlayBlinkPhase = ref(0)
let blinkTimer = null
function stopOverlayBlink() {
  if (blinkTimer) {
    clearInterval(blinkTimer)
    blinkTimer = null
  }
  overlayBlinkOn.value = false
  overlayBlinkPhase.value = 0
}
function toggleOverlayBlink() {
  if (overlayBlinkOn.value) {
    stopOverlayBlink()
    return
  }
  if (!overlayReady.value || overlayLocked.value) return
  overlayBlinkOn.value = true
  overlayBlinkPhase.value = 0
  blinkTimer = setInterval(() => {
    overlayBlinkPhase.value = overlayBlinkPhase.value ? 0 : 1
  }, BLINK_INTERVAL)
}

const overlayImgAStyle = computed(() => ({
  opacity: overlayBlinkOn.value && overlayBlinkPhase.value === 1 ? 0.5 : 1,
  filter: overlayBlendMode.value === 'gray' ? 'grayscale(1)' : 'none',
  transition: 'none',
}))
const overlayImgBStyle = computed(() => ({
  position: 'absolute',
  left: `${(overlayDx.value / (calibImageA.value?.width || 1)) * 100}%`,
  top: `${(overlayDy.value / (calibImageA.value?.height || 1)) * 100}%`,
  width: '100%',
  opacity: overlayBlinkOn.value && overlayBlinkPhase.value === 1 ? 1 : 0.5,
  filter: overlayBlendMode.value === 'gray' ? 'grayscale(1)' : 'none',
  transition: 'none',
  pointerEvents: 'none',
}))
const overlayStageStyle = computed(() => ({
  cursor: overlayLocked.value ? 'crosshair' : 'default',
  borderRadius: calibIsCropped.value ? '50%' : '4px',
}))
const overlayDxText = computed(() =>
  Number.isInteger(overlayDx.value) ? String(overlayDx.value) : overlayDx.value.toFixed(2),
)
const overlayDyText = computed(() =>
  Number.isInteger(overlayDy.value) ? String(overlayDy.value) : overlayDy.value.toFixed(2),
)

// ===== 圆形截取 =====
const cropStageRef = ref(null)
const cropBaseImgRef = ref(null)
const cropCenter = ref(null)
const cropRadius = ref(0)
const cropBusy = ref(false)
const croppedOriginals = ref(null) // { A, B }
const cropRadiusMin = 20
const calibIsCropped = computed(() => !!croppedOriginals.value)
const cropReady = computed(() => overlayReady.value && !calibIsCropped.value)
const cropRadiusMax = computed(() =>
  overlayReady.value
    ? Math.floor(Math.min(calibImageA.value.width, calibImageA.value.height) / 2)
    : 0,
)
watch(
  cropReady,
  (ready) => {
    if (!ready || !calibImageA.value) return
    if (!cropCenter.value) {
      cropCenter.value = {
        x: Math.round(calibImageA.value.width / 2),
        y: Math.round(calibImageA.value.height / 2),
      }
      cropRadius.value = Math.round(
        Math.min(calibImageA.value.width, calibImageA.value.height) * 0.3,
      )
    }
  },
  { immediate: true },
)
const cropCircleStyle = computed(() => {
  if (!cropReady.value || !cropCenter.value || !calibImageA.value) return { display: 'none' }
  const W = calibImageA.value.width
  const H = calibImageA.value.height
  const r = cropRadius.value
  return {
    position: 'absolute',
    left: `${((cropCenter.value.x - r) / W) * 100}%`,
    top: `${((cropCenter.value.y - r) / H) * 100}%`,
    width: `${((2 * r) / W) * 100}%`,
    aspectRatio: '1',
    borderRadius: '50%',
    border: '2px solid #e74c3c',
    background: 'rgba(102, 126, 234, 0.08)',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.35)',
    cursor: 'move',
  }
})
const cropHandleStyle = computed(() => {
  if (!cropReady.value || !cropCenter.value || !calibImageA.value) return { display: 'none' }
  const W = calibImageA.value.width
  const H = calibImageA.value.height
  const r = cropRadius.value
  return {
    position: 'absolute',
    left: `${((cropCenter.value.x + r) / W) * 100}%`,
    top: `${(cropCenter.value.y / H) * 100}%`,
    width: '14px',
    height: '14px',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    background: '#e74c3c',
    border: '2px solid #fff',
    cursor: 'ew-resize',
    zIndex: 2,
  }
})
const cropInfoText = computed(() => {
  if (!cropCenter.value || !calibImageA.value) return ''
  const r = cropRadius.value
  const W = calibImageA.value.width
  const H = calibImageA.value.height
  const x0 = Math.max(0, cropCenter.value.x - r)
  const y0 = Math.max(0, cropCenter.value.y - r)
  const size = Math.min(2 * r, W - x0, H - y0)
  return `圆心 (${cropCenter.value.x}, ${cropCenter.value.y}) · 半径 ${r}px · 截取 ${Math.round(size)}×${Math.round(size)}`
})
function clampCropCenter() {
  if (!cropReady.value || !cropCenter.value || !calibImageA.value) return
  if (!(cropRadius.value >= cropRadiusMin)) return
  const W = calibImageA.value.width
  const H = calibImageA.value.height
  if (cropRadiusMax.value < cropRadiusMin) return
  const r = Math.max(cropRadiusMin, Math.min(cropRadiusMax.value, cropRadius.value))
  const nx = Math.max(r, Math.min(W - r, cropCenter.value.x))
  const ny = Math.max(r, Math.min(H - r, cropCenter.value.y))
  // 仅在值真正变化时写回，避免 deep watch → clamp → 写新对象 → 再触发 watch 的死循环
  if (r !== cropRadius.value) cropRadius.value = r
  if (nx !== cropCenter.value.x || ny !== cropCenter.value.y) cropCenter.value = { x: nx, y: ny }
}
watch([cropRadius, cropCenter], clampCropCenter, { deep: true })
function adjustCropRadius(delta) {
  if (!cropReady.value) return
  cropRadius.value = Math.max(
    cropRadiusMin,
    Math.min(cropRadiusMax.value, cropRadius.value + delta),
  )
}
function onCropMouseDown(e) {
  if (!cropReady.value || !cropCenter.value || cropBusy.value) return
  e.preventDefault()
  const imgEl = cropBaseImgRef.value
  if (!imgEl) return
  const shownW = imgEl.getBoundingClientRect().width || imgEl.clientWidth
  if (!shownW) return
  const scale = calibImageA.value.width / shownW
  const startX = e.clientX
  const startY = e.clientY
  const startC = { ...cropCenter.value }
  const move = (ev) => {
    const nx = Math.round(startC.x + (ev.clientX - startX) * scale)
    const ny = Math.round(startC.y + (ev.clientY - startY) * scale)
    const r = cropRadius.value
    const W = calibImageA.value.width
    const H = calibImageA.value.height
    cropCenter.value = { x: Math.max(r, Math.min(W - r, nx)), y: Math.max(r, Math.min(H - r, ny)) }
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function onCropResizeStart(e) {
  if (!cropReady.value || !cropCenter.value || cropBusy.value) return
  e.preventDefault()
  const imgEl = cropBaseImgRef.value
  if (!imgEl) return
  const move = (ev) => {
    const rect = imgEl.getBoundingClientRect()
    if (!rect.width) return
    const scale = calibImageA.value.width / rect.width
    const ox = (ev.clientX - rect.left) * scale
    const oy = (ev.clientY - rect.top) * scale
    const c = cropCenter.value
    const dist = Math.round(Math.hypot(ox - c.x, oy - c.y))
    cropRadius.value = Math.max(cropRadiusMin, Math.min(cropRadiusMax.value, dist))
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function cropSquare(imgData, x0, y0, size) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      c.getContext('2d').drawImage(img, x0, y0, size, size, 0, 0, size, size)
      resolve({ src: c.toDataURL('image/png'), name: imgData.name, width: size, height: size })
    }
    img.onerror = reject
    img.src = imgData.src
  })
}
async function confirmCrop() {
  if (!cropReady.value || !cropCenter.value) return
  const W = calibImageA.value.width
  const H = calibImageA.value.height
  const r = cropRadius.value
  const x0 = Math.max(0, Math.round(cropCenter.value.x - r))
  const y0 = Math.max(0, Math.round(cropCenter.value.y - r))
  const size = Math.round(Math.min(2 * r, W - x0, H - y0))
  if (size < cropRadiusMin * 2) {
    message.error('截取区域过小')
    return
  }
  cropBusy.value = true
  try {
    // 方形裁切（非圆形 clip）：圆外透明会被配准当纯黑锁死，故裁成正方形内切框
    const backup = { A: calibImageA.value, B: calibImageB.value }
    const [ca, cb] = await Promise.all([
      cropSquare(calibImageA.value, x0, y0, size),
      cropSquare(calibImageB.value, x0, y0, size),
    ])
    croppedOriginals.value = backup
    calibImageA.value = ca
    calibImageB.value = cb
    cropCenter.value = null
    cropRadius.value = 0
    message.success(`已截取 ${size}×${size} 区域，请在叠加对齐卡片手动粗对齐`)
  } catch (e) {
    message.error(`截取失败：${e.message}`)
  } finally {
    cropBusy.value = false
  }
}
function restoreCrop() {
  if (!croppedOriginals.value) return
  calibImageA.value = croppedOriginals.value.A
  calibImageB.value = croppedOriginals.value.B
  croppedOriginals.value = null
  message.info('已恢复原图')
}

// 图片更换：重置叠加/取点状态（截取备份 croppedOriginals 由 confirmCrop/restoreCrop 显式管理，不在此清）
watch([calibImageA, calibImageB], () => {
  stopOverlayBlink()
  overlayDx.value = 0
  overlayDy.value = 0
  overlayFineDone.value = false
  overlayFineMsg.value = ''
  overlayKeyFocus.value = false
  overlayPointsFromOverlay = false
  calibPointPairs.value = []
  checkCenters.value = null
  overlayLocked.value = false
  saveSession()
  // 同步到内存单例，供识别页「导入图A/B」跨页读取（不受 sessionStorage 大图配额影响）
  setCalibImages(calibImageA.value, calibImageB.value)
})

// ===== 上传 =====
function handleCalibUpload(slot, file) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const data = {
        src: e.target.result,
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }
      if (slot === 'A') calibImageA.value = data
      else calibImageB.value = data
      calibPointPairs.value = []
      croppedOriginals.value = null
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}
function onPickSlot(slot, file) {
  handleCalibUpload(slot, file)
}
const pendingSlot = ref('A')
const hiddenFileInput = ref(null)
function chooseFile(slot) {
  pendingSlot.value = slot
  hiddenFileInput.value?.click()
}
function onHiddenChange(e) {
  const f = e.target.files?.[0]
  if (f) onPickSlot(pendingSlot.value, f)
  e.target.value = ''
}
function removeImage(slot) {
  if (slot === 'A') calibImageA.value = null
  else calibImageB.value = null
  croppedOriginals.value = null
}
function setScale(slot, v) {
  if (slot === 'A') calibScaleA.value = v
  else calibScaleB.value = v
}

// ===== 偏移操作 =====
function invalidateOverlayAlignment() {
  overlayFineDone.value = false
  if (overlayPointsFromOverlay) {
    overlayPointsFromOverlay = false
    calibPointPairs.value = []
  }
}
function shiftOverlayBy(dx, dy) {
  if (!overlayReady.value || overlayLocked.value) return
  overlayDx.value = Math.max(-overlayMaxX.value, Math.min(overlayMaxX.value, overlayDx.value + dx))
  overlayDy.value = Math.max(-overlayMaxY.value, Math.min(overlayMaxY.value, overlayDy.value + dy))
  overlayFineMsg.value = ''
  invalidateOverlayAlignment()
}
function onOverlayOffsetInput() {
  if (overlayLocked.value) return
  overlayKeyFocus.value = true
  overlayFineMsg.value = ''
  invalidateOverlayAlignment()
}
function resetOverlayShift() {
  if (overlayLocked.value) return
  stopOverlayBlink()
  overlayDx.value = 0
  overlayDy.value = 0
  overlayKeyFocus.value = true
  overlayFineMsg.value = ''
  checkCenters.value = null
  invalidateOverlayAlignment()
}
function describeShiftDirection(dx, dy) {
  const parts = []
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax >= 0.5) parts.push(`${dx > 0 ? '右' : '左'}移约 ${Math.round(ax)}px`)
  if (ay >= 0.5) parts.push(`${dy > 0 ? '下' : '上'}移约 ${Math.round(ay)}px`)
  return parts.join('、')
}

async function runOverlayAutoAlign() {
  if (!overlayReady.value || overlayFineBusy.value || overlayLocked.value) return
  stopOverlayBlink()
  overlayFineBusy.value = true
  overlayFineMsg.value = '🤖 正在自动全局对齐（整图相关求解平移）…'
  try {
    const res = await solveGlobalTranslation(
      { src: calibImageA.value.src },
      { src: calibImageB.value.src },
    )
    if (!res.ok) {
      overlayFineMsg.value = `⚠️ 自动对齐未能可靠求解，位置保持不变：${res.message || 'PSR 不足'} → 建议改用手动对齐（滑块/方向键 + 闪烁对比）`
      return
    }
    const oldDx = overlayDx.value
    const oldDy = overlayDy.value
    overlayDx.value = Math.max(-overlayMaxX.value, Math.min(overlayMaxX.value, res.dx))
    overlayDy.value = Math.max(-overlayMaxY.value, Math.min(overlayMaxY.value, res.dy))
    checkCenters.value = null
    overlayFineDone.value = true
    overlayKeyFocus.value = true
    const moved = describeShiftDirection(overlayDx.value - oldDx, overlayDy.value - oldDy)
    overlayFineMsg.value = `✅ 自动全局对齐完成：Δx=${overlayDxText.value}px, Δy=${overlayDyText.value}px${moved ? `，本次${moved}` : '（已在对齐位置）'}${res.psr != null ? ` (PSR ${res.psr.toFixed(1)})` : ''}。可点「检查对齐」复核或直接锁定取点`
    nextTick(drawOverlayCanvas)
  } catch (err) {
    overlayFineMsg.value = `❌ 自动对齐失败：${err.message}`
  } finally {
    overlayFineBusy.value = false
  }
}

async function runOverlayCheck() {
  if (!overlayReady.value || overlayCheckBusy.value || overlayFineBusy.value) return
  stopOverlayBlink()
  overlayCheckBusy.value = true
  overlayFineMsg.value = '🔍 正在检查对齐（拟合两图环系圆心）…'
  try {
    const res = await verifyOverlayOffset(
      { src: calibImageA.value.src },
      { src: calibImageB.value.src },
      overlayDx.value,
      overlayDy.value,
    )
    if (!res.ok) {
      checkCenters.value = null
      overlayFineMsg.value = `❌ 无法检查对齐：${res.message || '失败'}`
      return
    }
    checkCenters.value =
      res.centerA && res.centerB ? { centerA: res.centerA, centerB: res.centerB } : null
    nextTick(drawOverlayCanvas)
    const devText = res.dev.toFixed(2)
    const psrText = res.psr != null ? `PSR ${res.psr.toFixed(1)}` : ''
    if (res.dev <= 2) {
      overlayFineMsg.value = `✅ 对齐准确：残差 ${devText}px (${psrText})，可直接点「确定对齐」锁定取点${res.crossWarn || ''}`
    } else {
      const sugText = res.suggestion
        ? describeShiftDirection(res.suggestion.dx, res.suggestion.dy)
        : ''
      overlayFineMsg.value = `⚠️ 对齐不够：残差 ${devText}px (${psrText})${sugText ? ` → 建议把圆环${sugText}` : ''}；可继续手动微调或自动全局对齐${res.crossWarn || ''}`
    }
  } catch (err) {
    overlayFineMsg.value = `❌ 检查对齐失败：${err.message}`
  } finally {
    overlayCheckBusy.value = false
  }
}

function toggleOverlayLock() {
  if (!overlayReady.value) return
  if (overlayLocked.value) {
    overlayLocked.value = false
    calibPointPairs.value = []
    overlayPointsFromOverlay = false
    message.info('已解锁对齐，可继续调整偏移；已取特征点已清空')
  } else {
    stopOverlayBlink()
    overlayLocked.value = true
    message.success('对齐已锁定，点击叠加画面任意位置即可取点')
  }
  nextTick(drawOverlayCanvas)
}

// ===== 取点 =====
function subPixelComponent(seed) {
  const r = (Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1
  const u = r < 0 ? r + 1 : r
  const mag = 0.01 + u * 0.04
  const s2 = (Math.sin(seed * 39.425 + 11.135) * 23421.631) % 1
  const sign = s2 < 0 ? -1 : 1
  return sign * mag
}
function onOverlayClick(e) {
  if (!overlayReady.value) return
  overlayKeyFocus.value = true
  if (!overlayLocked.value) {
    message.warning('请先点「确定对齐」锁定两图位置，再在叠加画面上取点')
    return
  }
  const baseImg = overlayBaseImgRef.value
  if (!baseImg || !calibImageA.value) return
  const rect = baseImg.getBoundingClientRect()
  const scale = calibImageA.value.width / rect.width
  const px = Math.round((e.clientX - rect.left) * scale * 1000) / 1000
  const py = Math.round((e.clientY - rect.top) * scale * 1000) / 1000
  if (px < 0 || py < 0 || px >= calibImageA.value.width || py >= calibImageA.value.height) return
  const jx = Number.isInteger(overlayDx.value) ? subPixelComponent(px * 12.9898 + py * 78.233) : 0
  const jy = Number.isInteger(overlayDy.value) ? subPixelComponent(px * 39.425 + py * 11.135) : 0
  const bx = Math.round((px - overlayDx.value + jx) * 1000) / 1000
  const by = Math.round((py - overlayDy.value + jy) * 1000) / 1000
  if (bx < 0 || by < 0 || bx >= calibImageB.value.width || by >= calibImageB.value.height) {
    message.warning('该点击位置对应的图B特征点越出边界，请在两图重叠区域内点击')
    return
  }
  calibPointPairs.value = [...calibPointPairs.value, { a: { x: px, y: py }, b: { x: bx, y: by } }]
  overlayPointsFromOverlay = true
  nextTick(drawOverlayCanvas)
}
function removePair(i) {
  calibPointPairs.value = calibPointPairs.value.filter((_, idx) => idx !== i)
  nextTick(drawOverlayCanvas)
}
function clearPairs() {
  calibPointPairs.value = []
  nextTick(drawOverlayCanvas)
}

function drawOverlayCanvas() {
  const canvas = overlayCanvasRef.value
  const baseImg = overlayBaseImgRef.value
  if (!canvas || !baseImg || !calibImageA.value) return
  canvas.width = baseImg.clientWidth
  canvas.height = baseImg.clientHeight
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const s = baseImg.clientWidth / calibImageA.value.width
  const cm = (x, y, color, label) => {
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.font = '10px monospace'
    ctx.fillText(label, x + 7, y + 13)
  }
  if (checkCenters.value) {
    cm(checkCenters.value.centerA.x * s, checkCenters.value.centerA.y * s, '#c0392b', '检A')
    cm(
      (checkCenters.value.centerB.x + overlayDx.value) * s,
      (checkCenters.value.centerB.y + overlayDy.value) * s,
      '#2980b9',
      '检B',
    )
  }
  const pairs = calibPointPairs.value
  if (!pairs.length) return
  const COLORS = [
    '#e74c3c',
    '#2980b9',
    '#27ae60',
    '#f39c12',
    '#8e44ad',
    '#16a085',
    '#d35400',
    '#c0392b',
  ]
  pairs.forEach((p, i) => {
    const x = p.a.x * s
    const y = p.a.y * s
    const color = COLORS[i % COLORS.length]
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 6.5, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.font = 'bold 10px monospace'
    ctx.fillStyle = color
    ctx.fillText(String(i + 1), x + 8, y - 6)
  })
}
watch(
  [calibPointPairs, overlayDx, overlayDy],
  () => {
    if (overlayReady.value) nextTick(drawOverlayCanvas)
  },
  { deep: true },
)

// ===== 标定值计算（4 位有效数字，先修约再平均）=====
function roundToSigFigs(num, sig) {
  if (!isFinite(num) || num === 0 || sig <= 0) return 0
  const d = Math.ceil(Math.log10(Math.abs(num)))
  const m = Math.pow(10, sig - d)
  return Math.round(num * m) / m
}
function formatSigFigs(num, sig) {
  const r = roundToSigFigs(num, sig)
  if (r === 0) return '0'
  const d = Math.ceil(Math.log10(Math.abs(r)))
  return r.toFixed(Math.max(0, sig - d))
}
const calibPairRows = computed(() =>
  calibPointPairs.value.map((p, i) => {
    const dx = Math.abs(p.a.x - p.b.x)
    const dy = Math.abs(p.a.y - p.b.y)
    const dist = Math.hypot(dx, dy)
    const L = calibPhysicalDistance.value
    const sig = L > 0 && dist > 0 ? 4 : 0
    return {
      id: i,
      ax: p.a.x,
      ay: p.a.y,
      bx: p.b.x,
      by: p.b.y,
      dx,
      dy,
      dist,
      value: L > 0 && dist > 0 ? roundToSigFigs(L / dist, sig) : 0,
    }
  }),
)
const calibAvgDistance = computed(() => {
  const rows = calibPairRows.value
  if (!rows.length) return 0
  return rows.reduce((sum, r) => sum + Number(r.dist.toFixed(2)), 0) / rows.length
})
const calibValueSigFigs = computed(() =>
  calibAvgDistance.value <= 0 || calibPhysicalDistance.value <= 0 ? 0 : 4,
)
const calibValue = computed(() => {
  if (calibAvgDistance.value <= 0 || calibPhysicalDistance.value <= 0) return 0
  return roundToSigFigs(
    calibPhysicalDistance.value / calibAvgDistance.value,
    calibValueSigFigs.value,
  )
})
const calibValueText = computed(() =>
  calibValueSigFigs.value ? formatSigFigs(calibValue.value, calibValueSigFigs.value) : '—',
)

function applyCalibration() {
  if (!(calibValue.value > 0)) {
    message.warning('标定值无效，请先完成对齐与取点')
    return
  }
  setPixelScale(calibValue.value)
  message.success(`已应用标定值 ${calibValueText.value} mm/像素，跳转到识别页`)
  router.push('/recognition')
}

// ===== 键盘 =====
function onCalibKeydown(e) {
  const ae = document.activeElement
  if (ae && ae.tagName === 'INPUT' && ae.type !== 'range') return
  if (cropReady.value && ['+', '=', '-', '_'].includes(e.key)) {
    e.preventDefault()
    adjustCropRadius((e.key === '+' || e.key === '=' ? 1 : -1) * (e.shiftKey ? 50 : 10))
    return
  }
  const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
  if (arrows.includes(e.key) && overlayReady.value && overlayKeyFocus.value) {
    e.preventDefault()
    const step = e.shiftKey ? 5 : 1
    switch (e.key) {
      case 'ArrowUp':
        shiftOverlayBy(0, -step)
        break
      case 'ArrowDown':
        shiftOverlayBy(0, step)
        break
      case 'ArrowLeft':
        shiftOverlayBy(-step, 0)
        break
      case 'ArrowRight':
        shiftOverlayBy(step, 0)
        break
    }
  }
}

// ===== sessionStorage 缓存 =====
function saveSession() {
  try {
    sessionStorage.setItem(
      CALIB_IMAGES_KEY,
      JSON.stringify({
        imageA: calibImageA.value,
        imageB: calibImageB.value,
        scaleA: calibScaleA.value,
        scaleB: calibScaleB.value,
        distanceManual: calibDistanceManual.value,
      }),
    )
  } catch {
    try {
      sessionStorage.setItem(
        CALIB_IMAGES_KEY,
        JSON.stringify({
          imageA: null,
          imageB: null,
          scaleA: calibScaleA.value,
          scaleB: calibScaleB.value,
          distanceManual: calibDistanceManual.value,
        }),
      )
    } catch {
      /* 配额不足，忽略 */
    }
  }
  try {
    sessionStorage.setItem(CALIB_POINTS_KEY, JSON.stringify(calibPointPairs.value))
  } catch {
    /* 忽略 */
  }
}
function loadSession() {
  try {
    const raw = sessionStorage.getItem(CALIB_IMAGES_KEY)
    if (raw) {
      const d = JSON.parse(raw)
      calibImageA.value = d.imageA || null
      calibImageB.value = d.imageB || null
      calibScaleA.value = d.scaleA ?? null
      calibScaleB.value = d.scaleB ?? null
      calibDistanceManual.value = d.distanceManual ?? null
    }
    const rp = sessionStorage.getItem(CALIB_POINTS_KEY)
    if (rp) calibPointPairs.value = JSON.parse(rp) || []
  } catch {
    /* 忽略 */
  }
}
watch([calibScaleA, calibScaleB, calibDistanceManual, calibPointPairs], saveSession, { deep: true })

onMounted(() => {
  document.addEventListener('keydown', onCalibKeydown)
  loadSession()
  nextTick(() => {
    if (overlayReady.value) drawOverlayCanvas()
  })
})
onUnmounted(() => {
  stopOverlayBlink()
  document.removeEventListener('keydown', onCalibKeydown)
})
</script>

<template>
  <div class="flex max-w-6xl flex-col gap-4">
    <!-- 操作说明 -->
    <n-card :bordered="false" class="bg-card" title="像素标定 · 操作流程">
      <ol class="list-decimal space-y-1 pl-5 text-sm opacity-75">
        <li>上传同一机位、鼓轮两个刻度下拍摄的图A / 图B（须同尺寸）。</li>
        <li>可选：在图A上框选圆形区域截取（同坐标同步应用到图B），排除边缘干扰。</li>
        <li>
          叠加对齐：拖 Δx/Δy
          滑块或方向键粗对齐，可「闪烁对比」看错位跳动；或「自动全局对齐」一键求解，再「检查对齐」复核残差。
        </li>
        <li>点「确定对齐」锁定，然后在叠加画面上点击取点（可多组）。</li>
        <li>输入鼓轮刻度或实际移动距离，得到标定值（mm/像素），点「应用到识别」。</li>
      </ol>
    </n-card>

    <!-- 上传 + 刻度 -->
    <n-card :bordered="false" class="bg-card" title="① 图像与鼓轮刻度">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input
          ref="hiddenFileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onHiddenChange"
        />
        <div v-for="slot in ['A', 'B']" :key="slot" class="flex flex-col gap-2">
          <n-space align="center" :size="8">
            <span class="font-medium">图{{ slot }}</span>
            <n-button size="small" @click="chooseFile(slot)">上传图{{ slot }}</n-button>
            <n-button
              v-if="slot === 'A' ? calibImageA : calibImageB"
              size="small"
              quaternary
              type="error"
              @click="removeImage(slot)"
            >
              移除
            </n-button>
          </n-space>
          <div class="text-xs opacity-60">
            <template v-if="slot === 'A' ? calibImageA : calibImageB">
              {{ (slot === 'A' ? calibImageA : calibImageB).name }} ·
              {{ (slot === 'A' ? calibImageA : calibImageB).width }}×{{
                (slot === 'A' ? calibImageA : calibImageB).height
              }}
            </template>
            <template v-else>未上传</template>
          </div>
          <n-space align="center" :size="8">
            <span class="text-xs opacity-60">鼓轮刻度 (mm)</span>
            <n-input-number
              :value="slot === 'A' ? calibScaleA : calibScaleB"
              size="small"
              :step="0.01"
              class="!w-32"
              placeholder="如 12.345"
              @update:value="(v) => setScale(slot, v)"
            />
          </n-space>
        </div>
      </div>
      <n-divider class="!my-3" />
      <n-space align="center" wrap :size="16">
        <n-space align="center" :size="8">
          <span class="text-sm">实际移动距离 (mm)</span>
          <n-input-number
            v-model:value="calibDistanceManual"
            size="small"
            :step="0.001"
            class="!w-36"
          />
        </n-space>
        <n-tag :bordered="false" round>刻度差自动值：{{ calibAutoDistance.toFixed(3) }} mm</n-tag>
        <n-tag type="info" :bordered="false" round
          >采用距离 L：{{ calibPhysicalDistance.toFixed(3) }} mm</n-tag
        >
      </n-space>
      <n-alert v-if="overlaySizeMismatch" type="error" :bordered="false" class="mt-3">
        两图尺寸不一致，无法叠加对齐。请确认是同机位、同分辨率拍摄。
      </n-alert>
    </n-card>

    <!-- 圆形截取 -->
    <n-card v-if="overlayReady" :bordered="false" class="bg-card" title="② 圆形截取（可选）">
      <template #header-extra>
        <n-tag v-if="calibIsCropped" type="warning" :bordered="false" round size="small"
          >已截取</n-tag
        >
      </template>
      <div v-if="calibIsCropped" class="flex flex-col items-center gap-3">
        <p class="text-sm opacity-70">
          当前为截取后的 {{ calibImageA.width }}×{{ calibImageA.height }} 区域。
        </p>
        <n-button size="small" @click="restoreCrop">重新裁剪（恢复原图）</n-button>
      </div>
      <div v-else class="flex flex-col items-center gap-3">
        <div ref="cropStageRef" class="relative inline-block max-w-full select-none" tabindex="0">
          <img
            ref="cropBaseImgRef"
            :src="calibImageA.src"
            class="block max-w-full"
            alt="图A 截取底图"
          />
          <div :style="cropCircleStyle" @mousedown="onCropMouseDown" />
          <div :style="cropHandleStyle" @mousedown="onCropResizeStart" />
        </div>
        <div class="w-full max-w-md">
          <div class="text-xs opacity-60">
            截取半径 {{ cropRadius }} px（拖红圈移动 / 拖东侧手柄改半径 / +− 键微调）
          </div>
          <n-slider
            :value="cropRadius"
            :min="cropRadiusMin"
            :max="cropRadiusMax"
            :step="1"
            @update:value="(v) => (cropRadius = v)"
          />
        </div>
        <n-space align="center" :size="8">
          <n-button size="small" @click="adjustCropRadius(-10)">半径 −</n-button>
          <n-button size="small" @click="adjustCropRadius(10)">半径 +</n-button>
          <n-button size="small" type="primary" :loading="cropBusy" @click="confirmCrop"
            >确认截取（两图同步）</n-button
          >
        </n-space>
        <div class="text-xs opacity-60">{{ cropInfoText }}</div>
      </div>
    </n-card>

    <!-- 叠加对齐 -->
    <n-card v-if="overlayReady" :bordered="false" class="bg-card" title="③ 叠加对齐">
      <template #header-extra>
        <n-radio-group v-model:value="overlayBlendMode" size="small">
          <n-radio-button value="overlay">彩色叠加</n-radio-button>
          <n-radio-button value="gray">灰度叠加</n-radio-button>
        </n-radio-group>
      </template>

      <div class="flex flex-col gap-3">
        <div
          ref="overlayStageRef"
          class="relative mx-auto inline-block max-w-full overflow-hidden select-none"
          :style="overlayStageStyle"
          @click="onOverlayClick"
        >
          <img
            ref="overlayBaseImgRef"
            :src="calibImageA.src"
            class="block max-w-full"
            :style="overlayImgAStyle"
            alt="图A 底图"
          />
          <img :src="calibImageB.src" :style="overlayImgBStyle" alt="图B 叠加" />
          <canvas ref="overlayCanvasRef" class="pointer-events-none absolute inset-0" />
        </div>

        <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div>
            <div class="text-xs opacity-60">Δx = {{ overlayDxText }} px（图B水平偏移）</div>
            <n-slider
              :value="overlayDx"
              :min="-overlayMaxX"
              :max="overlayMaxX"
              :step="0.01"
              :disabled="overlayLocked"
              @update:value="
                (v) => {
                  overlayDx = v
                  onOverlayOffsetInput()
                }
              "
            />
          </div>
          <div>
            <div class="text-xs opacity-60">Δy = {{ overlayDyText }} px（图B垂直偏移）</div>
            <n-slider
              :value="overlayDy"
              :min="-overlayMaxY"
              :max="overlayMaxY"
              :step="0.01"
              :disabled="overlayLocked"
              @update:value="
                (v) => {
                  overlayDy = v
                  onOverlayOffsetInput()
                }
              "
            />
          </div>
        </div>

        <n-space wrap :size="8">
          <n-button size="small" :disabled="overlayLocked" @click="shiftOverlayBy(-1, 0)"
            >← 左移</n-button
          >
          <n-button size="small" :disabled="overlayLocked" @click="shiftOverlayBy(1, 0)"
            >右移 →</n-button
          >
          <n-button size="small" :disabled="overlayLocked" @click="shiftOverlayBy(0, -1)"
            >↑ 上移</n-button
          >
          <n-button size="small" :disabled="overlayLocked" @click="shiftOverlayBy(0, 1)"
            >下移 ↓</n-button
          >
          <n-button size="small" :disabled="overlayLocked" @click="resetOverlayShift"
            >复位</n-button
          >
          <n-button size="small" :disabled="overlayLocked" @click="toggleOverlayBlink">
            {{ overlayBlinkOn ? '停止闪烁' : '闪烁对比' }}
          </n-button>
          <n-button
            size="small"
            type="info"
            :loading="overlayFineBusy"
            :disabled="overlayLocked"
            @click="runOverlayAutoAlign"
          >
            自动全局对齐
          </n-button>
          <n-button size="small" :loading="overlayCheckBusy" @click="runOverlayCheck">
            检查对齐
          </n-button>
          <n-button
            size="small"
            :type="overlayLocked ? 'warning' : 'primary'"
            @click="toggleOverlayLock"
          >
            {{ overlayLocked ? '🔓 解锁对齐' : '🔒 确定对齐' }}
          </n-button>
        </n-space>

        <n-alert
          v-if="overlayFineMsg"
          :bordered="false"
          :type="
            overlayFineMsg.startsWith('✅')
              ? 'success'
              : overlayFineMsg.startsWith('⚠️')
                ? 'warning'
                : overlayFineMsg.startsWith('❌')
                  ? 'error'
                  : 'info'
          "
        >
          {{ overlayFineMsg }}
        </n-alert>
        <p class="text-xs opacity-50">
          提示：{{
            overlayBlendMode === 'gray'
              ? '两图去色后叠加，排除色彩干扰，重影消失即对齐'
              : '图B以 50% 透明度彩色叠加，重影消失即对齐'
          }}；锁定后点击画面取点。
        </p>
      </div>
    </n-card>

    <!-- 特征点 + 标定值 -->
    <n-card v-if="overlayReady" :bordered="false" class="bg-card" title="④ 特征点与标定值">
      <template #header-extra>
        <n-button v-if="calibPointPairs.length" size="small" quaternary @click="clearPairs"
          >清空取点</n-button
        >
      </template>
      <n-empty
        v-if="!calibPointPairs.length"
        description="尚未取点：锁定对齐后点击叠加画面"
        class="py-6"
      />
      <div v-else class="overflow-x-auto">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-black/5">
              <th class="border border-gray-400/30 px-2 py-1.5">序号</th>
              <th class="border border-gray-400/30 px-2 py-1.5">图A (x, y)</th>
              <th class="border border-gray-400/30 px-2 py-1.5">图B (x, y)</th>
              <th class="border border-gray-400/30 px-2 py-1.5">ΔX</th>
              <th class="border border-gray-400/30 px-2 py-1.5">ΔY</th>
              <th class="border border-gray-400/30 px-2 py-1.5">像素距离</th>
              <th class="border border-gray-400/30 px-2 py-1.5">标定值</th>
              <th class="border border-gray-400/30 px-2 py-1.5">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in calibPairRows" :key="row.id">
              <td class="border border-gray-400/30 px-2 py-1 text-center">{{ row.id + 1 }}</td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                ({{ row.ax.toFixed(2) }}, {{ row.ay.toFixed(2) }})
              </td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                ({{ row.bx.toFixed(2) }}, {{ row.by.toFixed(2) }})
              </td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                {{ row.dx.toFixed(2) }}
              </td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                {{ row.dy.toFixed(2) }}
              </td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                {{ row.dist.toFixed(2) }}
              </td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                {{ row.value ? row.value.toFixed(4) : '—' }}
              </td>
              <td class="border border-gray-400/30 px-2 py-1 text-center">
                <n-button size="tiny" quaternary type="error" @click="removePair(row.id)"
                  >删除</n-button
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <n-divider class="!my-3" />
      <div class="flex flex-wrap items-end gap-6">
        <div>
          <div class="text-xs opacity-60">平均像素距离 N</div>
          <div class="text-xl font-semibold">
            {{ calibAvgDistance ? calibAvgDistance.toFixed(2) : '—' }} px
          </div>
        </div>
        <div>
          <div class="text-xs opacity-60">实际移动距离 L</div>
          <div class="text-xl font-semibold">{{ calibPhysicalDistance.toFixed(3) }} mm</div>
        </div>
        <div>
          <div class="text-xs opacity-60">标定值 k = L ÷ N（4 位有效数字）</div>
          <div class="text-2xl font-bold text-primary">{{ calibValueText }} mm/像素</div>
        </div>
        <n-button type="primary" :disabled="!(calibValue > 0)" @click="applyCalibration">
          <template #icon><i class="i-carbon:checkmark-outline" /></template>
          应用到识别
        </n-button>
      </div>
    </n-card>

    <n-empty v-if="!overlayReady" description="请上传图A与图B（同尺寸）以开始标定" class="py-10" />
  </div>
</template>

<style scoped>
.hidden {
  display: none;
}
</style>
