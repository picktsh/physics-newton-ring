<script setup>
import { ref, computed, onMounted } from 'vue'
import { NButton, NPopconfirm, NTag, NSpin, NAlert, NDropdown, useMessage } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { useImageLibrary } from '@/stores/imageLibrary'
import SamplePicker from '@/components/SamplePicker.vue'

// 顶部图片管理区（识别 / 标定两页共用），与 IDB 图片库 1:1 同步展示。
// 普通模式（识别页）：扁平缩略图列表，点图 emit update:modelValue（选中 id）。
// assignMode（标定页）：按 pairId 渲染「组卡」（参考示例图库弹窗布局）——
//   一卡双框 A/B，缺图槽位为虚线占位「+」；点占位/已填框在点击处弹来源菜单
//   （库内未配对图 / 示例图库 / 本地文件）完成替换或填充；点卡片空白处 = 选中该组（select-pair）；
//   框上 × = 退组（emit unpair，页面负责库改写+选择态 remap，因退组可能重派 groupId）。
//   未配对零散图单独一区，点图弹菜单「新建组并设为图 A/B」（new-pair）。
// 事件契约：slot-assign {pairId, slot, recId} / new-pair {recId, slot} / group-assign recs[] / unpair recId。
const props = defineProps({
  modelValue: { type: String, default: '' },
  assignMode: { type: Boolean, default: false },
  activePair: { type: String, default: '' },
})
const emit = defineEmits([
  'update:modelValue',
  'select-pair',
  'slot-assign',
  'new-pair',
  'group-assign',
  'unpair',
])

const message = useMessage()
const imageLibrary = useImageLibrary()
const { images, ready, degraded } = storeToRefs(imageLibrary)
const { loadLibrary, addFiles, removeImage, clearAll, getObjectURL } = imageLibrary

const dragOver = ref(false)
const pickerOpen = ref(false)
const hideSamples = ref(false) // 仅展示过滤，不删数据
const displayed = computed(() =>
  hideSamples.value ? images.value.filter((r) => r.source !== 'sample') : images.value,
)
const hasSamples = computed(() => images.value.some((r) => r.source === 'sample'))

// 组卡：按 pairId 聚合，组内取最早 addedAt 排序；a/b 槽位独占由 setRecordPair 保证
const pairs = computed(() => {
  const map = new Map()
  for (const r of images.value) {
    if (!r.pairId) continue
    if (!map.has(r.pairId)) map.set(r.pairId, { id: r.pairId, a: null, b: null, at: r.addedAt })
    const p = map.get(r.pairId)
    if (r.slot === 'a') p.a = r
    else if (r.slot === 'b') p.b = r
    p.at = Math.min(p.at, r.addedAt)
  }
  return [...map.values()].sort((x, y) => x.at - y.at)
})
// 未配对零散图：assignMode 下作为组卡占位的候选来源 + 新建组入口；hideSamples 同样过滤
const singles = computed(() => displayed.value.filter((r) => !r.pairId))

// 选择器/隐藏 input 的落槽上下文：{ pairId, slot } 或 null（无上下文）
const pendingTarget = ref(null)
const fileTarget = ref(null)
const fileInputRef = ref(null)

// 页面上传入口的 dropdown「从示例图库选择」经 ref 调用（target 为页面指定的落槽上下文）
function openPicker(target = null) {
  pendingTarget.value = target
  pickerOpen.value = true
}
defineExpose({ openPicker })

onMounted(() => {
  loadLibrary()
})

function pick(id) {
  emit('update:modelValue', id)
}

// 组卡槽位来源菜单（点击处弹出，x/y 手动定位）：库内未配对图 + 示例图库 + 本地文件
const frameMenu = ref({ show: false, x: 0, y: 0, pairId: '', slot: '' })
const frameMenuOptions = computed(() => {
  const opts = singles.value.map((r) => ({ label: r.title || r.name, key: `rec:${r.id}` }))
  return [
    ...opts,
    ...(opts.length ? [{ type: 'divider', key: 'div' }] : []),
    { label: '示例图库…', key: 'sample' },
    { label: '本地文件…', key: 'file' },
  ]
})
function openFrameMenu(e, pairId, slot) {
  frameMenu.value = { show: true, x: e.clientX, y: e.clientY, pairId, slot }
}
function onFrameMenuSelect(key) {
  const { pairId, slot } = frameMenu.value
  frameMenu.value.show = false
  if (key === 'sample') openPicker({ pairId, slot })
  else if (key === 'file') {
    fileTarget.value = { pairId, slot }
    fileInputRef.value?.click()
  } else emit('slot-assign', { pairId, slot, recId: key.slice(4) })
}

// 未配对零散图菜单：新建组落槽
const singleMenu = ref({ show: false, x: 0, y: 0, id: '' })
const singleMenuOptions = [
  { label: '新建组并设为图 A', key: 'a' },
  { label: '新建组并设为图 B', key: 'b' },
]
function onSingleClick(e, r) {
  singleMenu.value = { show: true, x: e.clientX, y: e.clientY, id: r.id }
}
function onSingleMenuSelect(slot) {
  emit('new-pair', { recId: singleMenu.value.id, slot })
  singleMenu.value.show = false
}

function onSamplePick(rec) {
  if (props.assignMode) {
    const t = pendingTarget.value
    pendingTarget.value = null
    // 有上下文（占位/页面按钮指定）→ 落该槽；无上下文 → 单张自成新组
    if (t) emit('slot-assign', { ...t, recId: rec.id })
    else emit('new-pair', { recId: rec.id, slot: 'a' })
    return
  }
  pick(rec.id)
}
function onSampleGroupPick(recs) {
  if (props.assignMode) {
    pendingTarget.value = null
    emit('group-assign', recs) // 组内记录自带 slot（a/b），页面建组双槽赋值
    return
  }
  pick(recs[recs.length - 1].id)
}

async function onDrop(e) {
  dragOver.value = false
  const files = [...(e.dataTransfer?.files || [])]
  if (!files.length) return
  const added = await addFiles(files)
  if (!added.length) {
    message.warning('未检测到图片文件')
    return
  }
  // assignMode 下拖入即入库为未配对零散图（不自动建组，避免猜测用户意图）
  if (!props.assignMode) pick(added[added.length - 1].id)
}

async function onFileChange(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  const target = fileTarget.value
  fileTarget.value = null
  if (!files.length) return
  const added = await addFiles(files)
  if (!added.length) {
    message.warning('未检测到图片文件')
    return
  }
  const rec = added[added.length - 1]
  if (target) emit('slot-assign', { ...target, recId: rec.id })
  else if (!props.assignMode) pick(rec.id)
}

async function onClear() {
  await clearAll()
  emit('update:modelValue', '')
  message.success('图库已清空')
}

// assignMode 顶部「载入示例」的默认上下文：当前组的首个空槽；组满/无组 → 无上下文
function onOpenPickerClick() {
  if (!props.assignMode) {
    openPicker(null)
    return
  }
  const p = pairs.value.find((x) => x.id === props.activePair)
  if (p && !p.a) openPicker({ pairId: p.id, slot: 'a' })
  else if (p && !p.b) openPicker({ pairId: p.id, slot: 'b' })
  else openPicker(null)
}
</script>

<template>
  <n-card :bordered="false" size="small" class="mb-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold">图片库</span>
        <n-tag v-if="degraded" size="small" type="warning">存储不可用·仅内存</n-tag>
        <span v-else class="text-xs opacity-60">拖入图片长期保存，切页/刷新不丢</span>
      </div>
      <div class="flex items-center gap-2">
        <n-button type="primary" secondary @click="onOpenPickerClick">载入示例</n-button>
        <n-button v-if="hasSamples" secondary @click="hideSamples = !hideSamples">
          {{ hideSamples ? '显示示例' : '隐藏示例' }}
        </n-button>
        <n-popconfirm @positive-click="onClear">
          <template #trigger>
            <n-button type="error" secondary :disabled="!images.length"> 清空图库 </n-button>
          </template>
          清空后依赖这些图的识别/标定会话将无法恢复，确认清空？
        </n-popconfirm>
      </div>
    </div>

    <n-alert v-if="degraded" type="warning" size="small" class="mb-2">
      当前浏览器 IndexedDB 不可用（隐私模式？），图片仅存内存，刷新即失。
    </n-alert>

    <!-- assignMode：组卡布局（标定页） -->
    <div v-if="assignMode">
      <n-spin v-if="!ready" size="small" class="mx-auto block py-4" />
      <template v-else>
        <div v-if="pairs.length" class="flex flex-wrap gap-3">
          <div
            v-for="(p, i) in pairs"
            :key="p.id"
            class="cursor-pointer rounded-8px border-1 border-solid p-2"
            :class="
              activePair === p.id
                ? 'border-primary ring-2 ring-primary/40'
                : 'border-[var(--c-hover)] hover:border-primary/60'
            "
            title="点击选中该组为当前标定组"
            @click="emit('select-pair', p.id)"
          >
            <div class="mb-1 flex items-center gap-1 text-xs font-semibold">
              组 {{ i + 1 }}
              <n-tag v-if="activePair === p.id" size="tiny" type="success" :bordered="false">
                当前组
              </n-tag>
            </div>
            <div class="flex gap-2">
              <div v-for="s in ['a', 'b']" :key="s" class="relative shrink-0" @click.stop>
                <img
                  v-if="p[s]"
                  :src="getObjectURL(p[s].id)"
                  :alt="p[s].title || p[s].name"
                  class="h-20 w-20 cursor-pointer rounded-6px bg-black/5 object-cover"
                  :title="`图 ${s.toUpperCase()}：点击替换`"
                  @click="openFrameMenu($event, p.id, s)"
                />
                <button
                  v-else
                  class="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-6px border-1 border-dashed border-[var(--c-hover)] text-xs opacity-70 hover:border-primary hover:text-primary hover:opacity-100"
                  :title="`图 ${s.toUpperCase()} 缺图：点击选择`"
                  @click="openFrameMenu($event, p.id, s)"
                >
                  <span class="text-base leading-none">+</span>
                  <span>图 {{ s.toUpperCase() }}</span>
                </button>
                <!-- 角标实底白背景：naive tag 默认半透明底会被底下深色图染色看不清 -->
                <n-tag
                  v-if="p[s]"
                  size="tiny"
                  type="info"
                  :bordered="false"
                  class="absolute left-1 top-1 !bg-white/90 !text-[#2080f0]"
                >
                  {{ s.toUpperCase() }}
                </n-tag>
                <!-- 退组钮常显：hover 才显在触屏设备上永远点不到；退组可能重派 groupId，由页面 remap 选择态 -->
                <button
                  v-if="p[s]"
                  class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white hover:bg-black/80"
                  title="移出本组（退回未配对）"
                  @click="emit('unpair', p[s].id)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="py-2 text-xs opacity-60">
          暂无标定组：在下方「未配对」区点图新建组，或点右上「载入示例」用示例组卡的「整组赋 A/B」。
        </p>

        <div
          class="mt-3 flex min-h-24 items-center gap-2 overflow-x-auto rounded-8px border-1 border-dashed border-[var(--c-hover)] p-2"
          :class="dragOver ? 'border-primary bg-hover' : ''"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <span class="shrink-0 text-xs font-semibold opacity-60">未配对</span>
          <span v-if="!singles.length" class="text-xs opacity-60">
            拖入图片到此处入库（入库后为未配对），点图可新建组
          </span>
          <div
            v-for="r in singles"
            :key="r.id"
            class="group relative shrink-0 cursor-pointer"
            @click="onSingleClick($event, r)"
          >
            <img
              :src="getObjectURL(r.id)"
              :alt="r.title || r.name"
              class="h-20 w-20 rounded-6px bg-black/5 object-cover"
            />
            <n-tag
              v-if="r.source === 'sample'"
              size="tiny"
              :bordered="false"
              class="absolute left-1 top-1 !bg-white/90 !text-black/70"
            >
              示例
            </n-tag>
            <button
              class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white hover:bg-black/80"
              title="从图库删除"
              @click.stop="removeImage(r.id)"
            >
              ×
            </button>
            <div class="mt-1 w-20 truncate text-center text-10px opacity-60">
              {{ r.title || r.name }}
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 普通模式：扁平缩略图列表（识别页） -->
    <div
      v-else
      class="flex min-h-24 items-center gap-2 overflow-x-auto rounded-8px border-1 border-dashed border-[var(--c-hover)] p-2"
      :class="dragOver ? 'border-primary bg-hover' : ''"
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <n-spin v-if="!ready" size="small" class="mx-auto" />
      <span v-else-if="!displayed.length" class="mx-auto text-xs opacity-60">
        {{
          hideSamples && images.length
            ? '示例已隐藏；点右上「显示示例」恢复展示'
            : '拖入图片到此处入库，或点右上「载入示例」从示例图库选择'
        }}
      </span>
      <div
        v-for="r in displayed"
        :key="r.id"
        class="group relative shrink-0 cursor-pointer"
        @click="pick(r.id)"
      >
        <img
          :src="getObjectURL(r.id)"
          :alt="r.title || r.name"
          class="h-20 w-20 rounded-6px bg-black/5 object-cover"
          :class="modelValue === r.id ? 'ring-2 ring-primary' : ''"
        />
        <!-- 角标实底白背景：naive tag 默认半透明底会被底下深色图染色看不清 -->
        <n-tag
          v-if="r.group"
          size="tiny"
          type="info"
          :bordered="false"
          class="absolute left-1 top-1 !bg-white/90 !text-[#2080f0]"
        >
          {{ r.group }}-{{ r.slot }}
        </n-tag>
        <n-tag
          v-else-if="r.source === 'sample'"
          size="tiny"
          :bordered="false"
          class="absolute left-1 top-1 !bg-white/90 !text-black/70"
        >
          示例
        </n-tag>
        <!-- 删除钮常显：hover 才显在触屏设备上永远点不到 -->
        <button
          class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white hover:bg-black/80"
          title="从图库删除"
          @click.stop="removeImage(r.id)"
        >
          ×
        </button>
        <div class="mt-1 w-20 truncate text-center text-10px opacity-60">
          {{ r.title || r.name }}
        </div>
      </div>
    </div>

    <input ref="fileInputRef" type="file" accept="image/*" multiple hidden @change="onFileChange" />

    <SamplePicker
      v-model:show="pickerOpen"
      :assign-mode="assignMode"
      @pick="onSamplePick"
      @pick-group="onSampleGroupPick"
    />

    <!-- 组卡槽位来源菜单（点击处弹出） -->
    <n-dropdown
      :show="frameMenu.show"
      :x="frameMenu.x"
      :y="frameMenu.y"
      :options="frameMenuOptions"
      @select="onFrameMenuSelect"
      @clickoutside="frameMenu.show = false"
    />
    <!-- 未配对零散图新建组菜单（点击处弹出） -->
    <n-dropdown
      :show="singleMenu.show"
      :x="singleMenu.x"
      :y="singleMenu.y"
      :options="singleMenuOptions"
      @select="onSingleMenuSelect"
      @clickoutside="singleMenu.show = false"
    />
  </n-card>
</template>
