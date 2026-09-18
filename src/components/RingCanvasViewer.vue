<script setup>
/**
 * 环纹标注画布查看器 —— 封装「底图 + canvas overlay + 工具栏 + 交互」。
 * 同时服务于 inline 视图和全屏放大弹窗，通过 fullscreen prop 切换布局策略。
 * 缩放仅由工具栏按钮触发（不拦截滚轮，让原生滚动正常工作）。
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { NButton, NSwitch } from 'naive-ui'
import { drawOverlay } from '@/utils/canvasDrawer'

const MAX_SCALE = 8
const ZOOM_STEP = 1.4
const PAN_THRESHOLD = 5
const KEY_PAN_RATIO = 0.1

const props = defineProps({
  src: { type: String, default: '' },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  rings: { type: Array, default: () => [] },
  center: { type: Object, default: null },
  grayscale: { type: Boolean, default: false },
  filterStyle: { type: String, default: '' },
  fullscreen: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  centerDraggable: { type: Boolean, default: false },
  hoveredRing: { type: Number, default: null },
  crossArm: { type: Number, default: 24 },
  showCenter: { type: Boolean, default: false },
  initialCrop: { type: Object, default: null },
})

const emit = defineEmits(['click-image', 'update:grayscale', 'update:center', 'close'])

// ===== DOM refs =====
const stageRef = ref(null)
const scrollRef = ref(null)
const canvasRef = ref(null)

// ===== Internal state =====
const scale = ref(1)
const cursor = ref(null)
const panning = ref(false)
const viewport = ref({ w: 0, h: 0 })
const internalHover = ref(null)
let panState = null
let suppressClick = false
let resizeObserver = null

// ===== Computed =====
const scaleMin = computed(() => {
  const V = viewport.value
  if (!V.w || !props.width || !props.height) return 0.1
  if (props.fullscreen && V.h) return Math.min(V.w / props.width, V.h / props.height)
  return V.w / props.width
})

const imgStyle = computed(() => ({
  width: `${props.width * scale.value}px`,
  height: `${props.height * scale.value}px`,
}))

const stageStyle = computed(() => {
  if (props.fullscreen) return {}
  if (props.width && props.height) return { aspectRatio: `${props.width} / ${props.height}` }
  return { minHeight: '120px' }
})

const effectiveHover = computed(() =>
  props.hoveredRing !== null ? props.hoveredRing : internalHover.value,
)

const cursorClass = computed(() => {
  if (panning.value) return 'cursor-grabbing'
  if (props.centerDraggable) return 'cursor-move'
  if (props.interactive) return 'cursor-crosshair'
  return 'cursor-default'
})

// ===== Viewport measurement =====
function measureViewport() {
  const stage = stageRef.value
  viewport.value = stage
    ? { w: stage.clientWidth || 0, h: stage.clientHeight || 0 }
    : { w: 0, h: 0 }
}

function getScroll() {
  const el = scrollRef.value
  return el ? { left: el.scrollLeft, top: el.scrollTop } : { left: 0, top: 0 }
}

// ===== Zoom controls =====
function resetView() {
  if (!props.width || !props.height) return
  const V = viewport.value
  if (!V.w) return
  if (props.fullscreen && props.initialCrop) {
    const crop = props.initialCrop
    const s = Math.min(V.w / crop.w, (V.h || V.w) / crop.h)
    scale.value = Math.max(scaleMin.value, Math.min(MAX_SCALE, s))
    nextTick(() => {
      const el = scrollRef.value
      if (el) {
        el.scrollLeft = Math.max(0, (crop.x + crop.w / 2) * scale.value - V.w / 2)
        el.scrollTop = Math.max(0, (crop.y + crop.h / 2) * scale.value - (V.h || 0) / 2)
      }
      draw()
    })
  } else {
    fitWidth()
  }
}

// 快捷缩放：适应宽度（默认初始态）/ 原始尺寸 1:1
function setScaleAndResetScroll(target) {
  scale.value = Math.max(scaleMin.value, Math.min(MAX_SCALE, target))
  nextTick(() => {
    const el = scrollRef.value
    if (el) {
      el.scrollLeft = 0
      el.scrollTop = 0
    }
    draw()
  })
}
function fitWidth() {
  if (!props.width || !viewport.value.w) return
  setScaleAndResetScroll(viewport.value.w / props.width)
}
function fitOriginal() {
  setScaleAndResetScroll(1)
}

function zoomIn() {
  zoomAtCenter(ZOOM_STEP)
}
function zoomOut() {
  zoomAtCenter(1 / ZOOM_STEP)
}
function zoomAtCenter(factor) {
  const V = viewport.value
  zoomAt(V.w / 2, V.h / 2, factor)
}
function zoomAt(vx, vy, factor) {
  const old = scale.value
  const next = Math.max(scaleMin.value, Math.min(MAX_SCALE, old * factor))
  if (next === old) return
  const el = scrollRef.value
  if (!el) return
  const ix = (vx + el.scrollLeft) / old
  const iy = (vy + el.scrollTop) / old
  scale.value = next
  nextTick(() => {
    el.scrollLeft = ix * next - vx
    el.scrollTop = iy * next - vy
    draw()
  })
}

// ===== Coordinate conversion =====
function eventToImageCoords(event) {
  const stage = stageRef.value
  if (!stage) return null
  const rect = stage.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  const scroll = getScroll()
  const x = (event.clientX - rect.left + scroll.left) / scale.value
  const y = (event.clientY - rect.top + scroll.top) / scale.value
  return { x, y, inside: x >= 0 && y >= 0 && x < props.width && y < props.height }
}

// ===== Mouse: center drag mode =====
function onMouseDown(event) {
  if (event.button !== 0 || !props.src) return
  const el = scrollRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (event.clientX > rect.left + el.clientWidth || event.clientY > rect.top + el.clientHeight)
    return

  if (props.centerDraggable) {
    event.preventDefault()
    const p = eventToImageCoords(event)
    if (p?.inside) emit('update:center', { x: Math.round(p.x), y: Math.round(p.y) })
    panState = { mode: 'center' }
    document.addEventListener('mousemove', onCenterDragMove)
    document.addEventListener('mouseup', onCenterDragEnd)
    return
  }
  // Pan mode
  event.preventDefault()
  panState = {
    mode: 'pan',
    sx: event.clientX,
    sy: event.clientY,
    sl: el.scrollLeft,
    st: el.scrollTop,
    moved: false,
  }
  panning.value = true
  document.addEventListener('mousemove', onPanMove)
  document.addEventListener('mouseup', onPanEnd)
}

function onCenterDragMove(event) {
  const p = eventToImageCoords(event)
  if (p?.inside) emit('update:center', { x: Math.round(p.x), y: Math.round(p.y) })
}
function onCenterDragEnd() {
  document.removeEventListener('mousemove', onCenterDragMove)
  document.removeEventListener('mouseup', onCenterDragEnd)
  panState = null
}

// ===== Mouse: pan mode =====
function onPanMove(event) {
  if (!panState || panState.mode !== 'pan') return
  const dx = event.clientX - panState.sx
  const dy = event.clientY - panState.sy
  if (!panState.moved && Math.hypot(dx, dy) > PAN_THRESHOLD) panState.moved = true
  if (!panState.moved) return
  const el = scrollRef.value
  if (!el) return
  el.scrollLeft = panState.sl - dx
  el.scrollTop = panState.st - dy
  draw()
}
function onPanEnd() {
  document.removeEventListener('mousemove', onPanMove)
  document.removeEventListener('mouseup', onPanEnd)
  if (panState?.moved) suppressClick = true
  panState = null
  panning.value = false
}

// ===== Mouse: move / leave / click =====
function onMouseMove(event) {
  const p = eventToImageCoords(event)
  if (!p) return
  cursor.value = {
    x: p.x,
    y: p.y,
    inside: p.inside,
    r: props.center ? Math.hypot(p.x - props.center.x, p.y - props.center.y) : 0,
  }
  // Internal ring hover detection
  if (p.inside && props.rings.length > 0) {
    let hit = null
    for (const ring of props.rings) {
      const dist = Math.hypot(p.x - ring.x, p.y - ring.y)
      if (Math.abs(dist - ring.avgRadius) < Math.max(8, ring.avgRadius * 0.05)) {
        hit = ring.number
        break
      }
    }
    internalHover.value = hit
  } else {
    internalHover.value = null
  }
  draw()
}

function onMouseLeave() {
  cursor.value = null
  internalHover.value = null
  draw()
}

function onClick(event) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (!props.interactive) return
  const p = eventToImageCoords(event)
  if (!p?.inside) return
  emit('click-image', { x: p.x, y: p.y })
}

function onScroll() {
  draw()
}

// ===== Keyboard (fullscreen only) =====
function onKeydown(e) {
  const ae = document.activeElement
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    zoomIn()
    return
  }
  if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    zoomOut()
    return
  }
  const el = scrollRef.value
  const V = viewport.value
  if (!el || !V.w) return
  const step = KEY_PAN_RATIO * (e.shiftKey ? 3 : 1)
  let dx = 0
  let dy = 0
  switch (e.key) {
    case 'ArrowUp':
      dy = -V.h * step
      break
    case 'ArrowDown':
      dy = V.h * step
      break
    case 'ArrowLeft':
      dx = -V.w * step
      break
    case 'ArrowRight':
      dx = V.w * step
      break
    default:
      return
  }
  e.preventDefault()
  el.scrollLeft += dx
  el.scrollTop += dy
  draw()
}

// ===== Canvas drawing =====
function draw() {
  const canvas = canvasRef.value
  const V = viewport.value
  if (!canvas || !V.w || !V.h) return
  const dpr = window.devicePixelRatio || 1
  const cw = Math.round(V.w * dpr)
  const ch = Math.round(V.h * dpr)
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  const ctx = canvas.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  if (!props.src) return

  const scroll = getScroll()
  ctx.setTransform(
    scale.value * dpr,
    0,
    0,
    scale.value * dpr,
    -scroll.left * dpr,
    -scroll.top * dpr,
  )
  const unit = 1 / scale.value

  if (props.rings.length > 0) {
    drawOverlay(ctx, props.rings, effectiveHover.value, unit)
  }
  if (props.showCenter && props.center) {
    drawCenterMark(ctx, unit)
  }
  if (cursor.value?.inside && props.center && !props.centerDraggable) {
    drawCursorGuide(ctx, unit)
  }
}

function drawCenterMark(ctx, unit) {
  const { x, y } = props.center
  if (props.centerDraggable) {
    // 圆心确认阶段：贯穿辅助线 + 十字 + 小圆 + 虚线圆 + 坐标标注
    ctx.strokeStyle = 'rgba(255, 165, 0, 0.45)'
    ctx.lineWidth = 1 * unit
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(props.width, y)
    ctx.moveTo(x, 0)
    ctx.lineTo(x, props.height)
    ctx.stroke()
    const arm = props.crossArm * unit
    ctx.strokeStyle = 'rgba(0, 230, 118, 1)'
    ctx.lineWidth = 2 * unit
    ctx.beginPath()
    ctx.moveTo(x - arm, y)
    ctx.lineTo(x + arm, y)
    ctx.moveTo(x, y - arm)
    ctx.lineTo(x, y + arm)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, y, 6 * unit, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([6 * unit, 6 * unit])
    ctx.beginPath()
    ctx.arc(x, y, arm, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    const fontSize = 13 * unit
    ctx.font = `bold ${fontSize}px Arial`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    const text = `圆心 (${Math.round(x)}, ${Math.round(y)})`
    ctx.lineWidth = 3 * unit
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.strokeText(text, x + 10 * unit, y - 8 * unit)
    ctx.fillStyle = 'rgba(0, 230, 118, 1)'
    ctx.fillText(text, x + 10 * unit, y - 8 * unit)
  } else {
    // 识别完成阶段：简洁橙色十字
    const arm = 14 * unit
    ctx.lineWidth = 2 * unit
    ctx.strokeStyle = 'rgba(255, 165, 0, 1)'
    ctx.beginPath()
    ctx.moveTo(x - arm, y)
    ctx.lineTo(x + arm, y)
    ctx.moveTo(x, y - arm)
    ctx.lineTo(x, y + arm)
    ctx.stroke()
  }
}

function drawCursorGuide(ctx, unit) {
  const { x: cx, y: cy } = props.center
  const cur = cursor.value
  ctx.lineWidth = 1.5 * unit
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)'
  ctx.beginPath()
  ctx.arc(cx, cy, cur.r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + (cur.x - cx) * 1.15, cy + (cur.y - cy) * 1.15)
  ctx.stroke()
}

// ===== Lifecycle =====
onMounted(() => {
  measureViewport()
  resetView()
  if (stageRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureViewport()
      draw()
    })
    resizeObserver.observe(stageRef.value)
  }
  if (props.fullscreen) document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  cleanupPan()
  document.removeEventListener('keydown', onKeydown)
})

function cleanupPan() {
  if (panState?.mode === 'pan') {
    document.removeEventListener('mousemove', onPanMove)
    document.removeEventListener('mouseup', onPanEnd)
  }
  if (panState?.mode === 'center') {
    document.removeEventListener('mousemove', onCenterDragMove)
    document.removeEventListener('mouseup', onCenterDragEnd)
  }
  panState = null
  panning.value = false
}

// Reactive redraw on prop changes
watch(
  () => [props.rings, props.center, props.hoveredRing, props.showCenter, props.crossArm],
  () => draw(),
  { deep: true },
)

// Re-init when entering/leaving fullscreen
watch(
  () => props.fullscreen,
  (val) => {
    if (val) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
    nextTick(() => {
      measureViewport()
      resetView()
    })
  },
)

defineExpose({ resetView, zoomIn, zoomOut, fitWidth, fitOriginal, draw })
</script>

<template>
  <div class="ring-viewer flex flex-col overflow-hidden" :class="fullscreen ? 'h-full' : ''">
    <!-- Toolbar -->
    <div
      class="flex shrink-0 items-center gap-1.5 border-b border-gray-500/20 bg-black/40 px-2 py-1 text-xs text-white/90"
    >
      <n-button quaternary :disabled="scale <= scaleMin + 0.001" @click="zoomOut">
        <template #icon><i class="i-carbon:zoom-out" /></template>
      </n-button>
      <span class="min-w-14 text-center font-mono opacity-80">{{ scale.toFixed(2) }}x</span>
      <n-button quaternary :disabled="scale >= MAX_SCALE - 0.001" @click="zoomIn">
        <template #icon><i class="i-carbon:zoom-in" /></template>
      </n-button>
      <n-button quaternary @click="resetView">
        <template #icon><i class="i-carbon:reset" /></template>
      </n-button>
      <n-button quaternary title="适应屏幕宽度" @click="fitWidth">适应宽度</n-button>
      <n-button quaternary title="原始尺寸 1:1" @click="fitOriginal">原始尺寸</n-button>

      <div class="mx-1 h-4 w-px bg-white/20" />

      <n-switch :value="grayscale" size="small" @update:value="(v) => emit('update:grayscale', v)">
        <template #checked>灰度</template>
        <template #unchecked>彩色</template>
      </n-switch>

      <div class="flex-1" />

      <span v-if="cursor?.inside" class="hidden font-mono opacity-70 sm:inline">
        ({{ cursor.x.toFixed(0) }}, {{ cursor.y.toFixed(0) }}) · r={{ cursor.r.toFixed(1) }}px
      </span>

      <n-button v-if="fullscreen" quaternary class="!text-white/80" @click="emit('close')">
        <template #icon><i class="i-carbon:close" /></template>
        ESC
      </n-button>
    </div>

    <!-- Stage -->
    <div
      ref="stageRef"
      class="relative w-full overflow-hidden bg-black"
      :class="[fullscreen ? 'flex-1' : '', cursorClass]"
      :style="stageStyle"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseleave="onMouseLeave"
      @click="onClick"
    >
      <div v-if="src" ref="scrollRef" class="h-full w-full overflow-auto" @scroll="onScroll">
        <img
          :src="src"
          class="block select-none"
          :style="[imgStyle, filterStyle]"
          alt="识别底图"
          draggable="false"
        />
      </div>
      <div v-else class="flex h-full min-h-30 items-center justify-center text-sm text-white/30">
        请先在上方图片库选择或拖入牛顿环图像
      </div>
      <canvas ref="canvasRef" class="pointer-events-none absolute inset-0" />
    </div>
  </div>
</template>
