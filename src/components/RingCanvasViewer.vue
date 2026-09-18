<script setup>
/**
 * 环纹标注画布查看器 —— 封装「底图 + canvas overlay + 工具栏 + 交互」。
 * 同时服务于 inline 视图和全屏放大弹窗，通过 fullscreen prop 切换布局策略。
 * 缩放仅由工具栏按钮触发（不拦截滚轮，让原生滚动正常工作）。
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { NButton, NTooltip } from 'naive-ui'
import { drawOverlay } from '@/utils/canvasDrawer'

const MAX_SCALE = 8
// 缩放档位步长（口径：用户指定 0.5/0.75/1/1.25… 线性档位，每次 ±一档）
const ZOOM_SNAP = 0.25
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
})

const emit = defineEmits(['click-image', 'update:grayscale', 'update:center', 'close'])

// ===== DOM refs =====
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
// 缩小下限：不超过原图尺寸（1x）——窄于视口的小图不强制放大，缩小到原图即停
const scaleMin = computed(() => {
  const V = viewport.value
  if (!V.w || !props.width || !props.height) return 1
  const fit =
    props.fullscreen && V.h ? Math.min(V.w / props.width, V.h / props.height) : V.w / props.width
  return Math.min(fit, 1)
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
  const el = scrollRef.value
  viewport.value = el ? { w: el.clientWidth || 0, h: el.clientHeight || 0 } : { w: 0, h: 0 }
}

function getScroll() {
  const el = scrollRef.value
  return el ? { left: el.scrollLeft, top: el.scrollTop } : { left: 0, top: 0 }
}

// ===== Zoom controls =====
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
  // 小图不放大：窄于视口时「适应宽度」退化为原尺寸显示
  setScaleAndResetScroll(Math.min(viewport.value.w / props.width, 1))
}
function fitOriginal() {
  setScaleAndResetScroll(1)
}

// 非档位值（如 fitWidth 得出 0.82）时：+ 进到最近档位 1.00，− 退到最近档位 0.75
function zoomIn() {
  const next = Math.floor(scale.value / ZOOM_SNAP + 1) * ZOOM_SNAP
  zoomToCenter(Math.min(next, MAX_SCALE))
}
function zoomOut() {
  const next = Math.ceil(scale.value / ZOOM_SNAP - 1) * ZOOM_SNAP
  zoomToCenter(Math.max(next, scaleMin.value))
}
function zoomToCenter(target) {
  const V = viewport.value
  zoomAt(V.w / 2, V.h / 2, target)
}
function zoomAt(vx, vy, target) {
  const old = scale.value
  const next = Math.max(scaleMin.value, Math.min(MAX_SCALE, target))
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
  const el = scrollRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
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
// 钉死原始尺寸方案：backing = img 原始像素（加载/换图后写一次），坐标映射恒等，
// 缩放完全交给 CSS（canvas 随内容层 w-full h-full 拉伸，与 img 同一容器同一倍率）。
// 位置正确性优先于锐度：高倍率下线条/文字会发糊（1 backing px = scale CSS px），
// 但绘制坐标与图像像素天然同一，不存在任何随 scale 重配置产生的漂移可能。
// 坑（勿回退）：canvas 是替换元素，inset-0 不会拉伸其 CSS 尺寸（width:auto 取固有尺寸），
// w-full h-full 不可省；backing 尺寸绝不读 canvas.clientWidth 反推，避免自放大回路。
function draw() {
  const canvas = canvasRef.value
  if (!canvas || !props.src || !props.width || !props.height) return
  if (canvas.width !== props.width) canvas.width = props.width
  if (canvas.height !== props.height) canvas.height = props.height
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, props.width, props.height)
  // 线宽/字号/虚线间隔按 1/scale 补偿，保持恒定屏幕粗细（绘制仍在图像像素空间）
  const unit = 1 / scale.value

  if (props.rings.length > 0) {
    drawOverlay(ctx, props.rings, effectiveHover.value, unit)
  }
  if (props.showCenter && props.center) {
    drawCenterMark(ctx, unit)
  }
  // 悬停反馈：圆心确认阶段预览十字落点（参考补环的悬停高亮），其余阶段绘制半径辅助圆
  if (cursor.value?.inside && props.centerDraggable) {
    drawCenterPreview(ctx, unit)
  } else if (cursor.value?.inside && props.center) {
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

// 圆心确认阶段的悬停预览：在光标处绘制半透明十字+虚线圆（臂长跟随 crossArm），
// 让用户在按下前即可预判圆心落点与最内圈是否贴合，与正式圆心标记同色系但更淡以区分
function drawCenterPreview(ctx, unit) {
  const { x, y } = cursor.value
  const arm = props.crossArm * unit
  ctx.save()
  ctx.globalAlpha = 0.55
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
  ctx.restore()
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
  fitWidth()
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver(() => {
      measureViewport()
      draw()
    })
    resizeObserver.observe(scrollRef.value)
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

// 缩放变化后重绘：backing 不变，仅为刷新线宽/字号的 1/scale 补偿
watch(scale, () => nextTick(draw))

// 换图/首次载图：内容层挂载或尺寸重置后重建 overlay
watch(
  () => [props.src, props.width, props.height],
  () =>
    nextTick(() => {
      measureViewport()
      draw()
    }),
)

// Re-init when entering/leaving fullscreen
watch(
  () => props.fullscreen,
  (val) => {
    if (val) document.addEventListener('keydown', onKeydown)
    else document.removeEventListener('keydown', onKeydown)
    nextTick(() => {
      measureViewport()
      fitWidth()
    })
  },
)

defineExpose({ zoomIn, zoomOut, fitWidth, fitOriginal, draw })
</script>

<template>
  <div class="ring-viewer flex flex-col overflow-hidden" :class="fullscreen ? 'h-full' : ''">
    <!-- Toolbar：图标化 + tooltip 说明，窄屏时横向滑动不折行 -->
    <div
      class="ring-toolbar flex shrink-0 items-center gap-1 overflow-x-auto bg-black/30 p-2 text-xs text-white/90 [&>*]:shrink-0"
    >
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button secondary :disabled="scale <= scaleMin + 0.001" @click="zoomOut">
            <template #icon><i class="i-carbon:zoom-out" /></template>
          </n-button>
        </template>
        {{ fullscreen ? '缩小一档（0.25×，键盘 -）' : '缩小一档（0.25×）' }}
      </n-tooltip>
      <span class="min-w-14 text-center font-mono opacity-80">{{ scale.toFixed(2) }}x</span>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button secondary :disabled="scale >= MAX_SCALE - 0.001" @click="zoomIn">
            <template #icon><i class="i-carbon:zoom-in" /></template>
          </n-button>
        </template>
        {{ fullscreen ? '放大一档（0.25×，键盘 +）' : '放大一档（0.25×）' }}
      </n-tooltip>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button secondary @click="fitWidth">
            <template #icon><i class="i-carbon:fit-to-width" /></template>
          </n-button>
        </template>
        适应屏幕宽度
      </n-tooltip>
      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button secondary class="!font-mono" @click="fitOriginal">1:1</n-button>
        </template>
        原始尺寸 1:1
      </n-tooltip>

      <n-tooltip trigger="hover">
        <template #trigger>
          <n-button
            secondary
            :type="grayscale ? 'primary' : 'default'"
            @click="emit('update:grayscale', !grayscale)"
          >
            <template #icon><i class="i-carbon:contrast" /></template>
          </n-button>
        </template>
        {{ grayscale ? '当前灰度显示，点击切回彩色' : '当前彩色显示，点击切换灰度' }}
      </n-tooltip>

      <div class="flex-1" />

      <span v-if="cursor?.inside" class="hidden font-mono opacity-70 sm:inline">
        ({{ cursor.x.toFixed(0) }}, {{ cursor.y.toFixed(0) }}) · r={{ cursor.r.toFixed(1) }}px
      </span>

      <n-tooltip v-if="fullscreen" trigger="hover">
        <template #trigger>
          <n-button quaternary class="!text-white/80" @click="emit('close')">
            <template #icon><i class="i-carbon:close" /></template>
            ESC
          </n-button>
        </template>
        关闭全屏（ESC）
      </n-tooltip>
    </div>

    <!-- 视口层：overflow-auto 滚在 img|canvas 整体外面；尺寸由 fullscreen 布局决定，不强制 h-full w-full -->
    <div
      ref="scrollRef"
      class="relative overflow-auto bg-black"
      :class="[fullscreen ? 'flex-1' : '', cursorClass]"
      :style="stageStyle"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseleave="onMouseLeave"
      @click="onClick"
    >
      <!-- 内容层：img 与 canvas 是同一个缩放整体，尺寸单一来源（imgStyle） -->
      <div v-if="src" class="relative" :style="imgStyle">
        <img
          :src="src"
          class="block h-full w-full select-none"
          :style="filterStyle"
          alt="识别底图"
          draggable="false"
        />
        <!-- w-full h-full 不可省：canvas 是替换元素，inset-0 不会拉伸其 CSS 尺寸（见 draw() 上方注释） -->
        <canvas ref="canvasRef" class="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      <div
        v-if="!src"
        class="flex h-full min-h-30 items-center justify-center text-sm text-white/30"
      >
        请先在上方图片库选择或拖入牛顿环图像
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 窄屏工具栏靠横向滑动展示全部按钮，隐藏滚动条避免挤压高度/视觉噪音 */
.ring-toolbar {
  scrollbar-width: none;
}
.ring-toolbar::-webkit-scrollbar {
  display: none;
}
</style>
