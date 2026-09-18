<script setup>
import { computed, ref } from 'vue'
import { NModal, NButton, NTag, useMessage } from 'naive-ui'
import { SAMPLES_BUILTIN } from '@/utils/constants'
import { useImageLibrary } from '@/stores/imageLibrary'

// 示例图库选择器（PC/移动通用）：预览直读 public/samples 路径（不落库），
// 用户选中后才 seedSample 幂等入库（source='sample'），实现「示例与上传图逻辑分离、选后入库」。
// 标定对（同 group）合并为一张组卡；assignMode（标定页）下提供「整组赋 A/B」一键双槽。
const props = defineProps({
  show: { type: Boolean, default: false },
  assignMode: { type: Boolean, default: false },
})
const emit = defineEmits(['update:show', 'pick', 'pick-group'])

const message = useMessage()
const { seedSample } = useImageLibrary()

function previewURL(file) {
  return `${import.meta.env.BASE_URL}samples/${encodeURIComponent(file)}`
}

// 分组：带 group 的条目（标定对）合并一张卡在前，零散图单卡在后
const cards = computed(() => {
  const groups = new Map()
  const singles = []
  for (const s of SAMPLES_BUILTIN) {
    if (s.group) {
      if (!groups.has(s.group)) groups.set(s.group, { group: s.group, items: [] })
      groups.get(s.group).items.push(s)
    } else {
      singles.push({ group: '', items: [s] })
    }
  }
  return [...groups.values(), ...singles]
})

const busy = ref('') // 正在入库的卡标识（文件名/组号），防重复点击
async function choose(entry) {
  if (busy.value) return
  busy.value = entry.file
  try {
    const rec = await seedSample(entry)
    emit('pick', rec)
    emit('update:show', false)
  } catch {
    message.error(`示例「${entry.title || entry.file}」载入失败`)
  } finally {
    busy.value = ''
  }
}
async function chooseGroup(card) {
  if (busy.value) return
  busy.value = card.group
  try {
    // slot 升序（a 在前）保证 emit 给父级的赋值顺序稳定为 A → B
    const sorted = [...card.items].sort((a, b) => (a.slot || '').localeCompare(b.slot || ''))
    const recs = []
    for (const item of sorted) recs.push(await seedSample(item))
    emit('pick-group', recs)
    emit('update:show', false)
  } catch {
    message.error(`示例组「${card.group}」载入失败`)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="示例图库"
    class="!w-[92vw] max-w-640px"
    @update:show="emit('update:show', $event)"
  >
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div
        v-for="card in cards"
        :key="card.group || card.items[0].file"
        class="rounded-8px border-1 border-solid border-[var(--c-hover)] p-2"
        :class="card.group ? 'col-span-2' : ''"
      >
        <div class="mb-1 flex items-center gap-1 text-xs font-semibold">
          <template v-if="card.group">
            标定对 {{ card.group }}
            <n-tag size="tiny" :bordered="false">A/B 一组</n-tag>
          </template>
          <template v-else>{{ card.items[0].title }}</template>
        </div>
        <div class="flex gap-2">
          <div v-for="s in card.items" :key="s.file" class="min-w-0 flex-1">
            <img
              :src="previewURL(s.file)"
              :alt="s.title"
              class="aspect-square w-full cursor-pointer rounded-6px object-cover"
              :class="busy === s.file ? 'opacity-50' : ''"
              @click="choose(s)"
            />
            <div class="mt-1 truncate text-center text-10px opacity-60">{{ s.title }}</div>
          </div>
        </div>
        <n-button
          v-if="card.group && props.assignMode"
          type="primary"
          secondary
          class="mt-2 w-full"
          :loading="busy === card.group"
          @click="chooseGroup(card)"
        >
          整组赋 A/B（含默认刻度）
        </n-button>
        <n-button
          v-else-if="!card.group"
          class="mt-2 w-full"
          :loading="busy === card.items[0].file"
          @click="choose(card.items[0])"
        >
          选用
        </n-button>
      </div>
    </div>
    <p class="mt-3 text-xs opacity-50">
      点缩略图单张选用；标定对可「整组赋 A/B」一键双槽并自动填默认鼓轮刻度。
      选中后入图片库并带「示例」标识，与上传图分开管理、可在图片条隐藏。
    </p>
  </n-modal>
</template>
