<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NGrid, NGridItem } from 'naive-ui'
import { routes } from '@/router'

// §4 首页四象限：真实入口，数据源仍是路由表（quadrant:true 且非首页自身）
const router = useRouter()

const quadrantDesc = {
  recognition: '上传牛顿环图像，自动识别圆心与暗环，人工核对后计算曲率半径',
  history: '查看、恢复、删除历史测量记录（本地留存，最多 20 条）',
  data: '导入测量结果 JSON，回显表1/表2 与不确定度评定明细',
  export: '将当前测量结果导出为图片 / JSON / 表格 / 网页 / CSV',
}

const quadrants = computed(() =>
  routes
    .filter((r) => r.meta?.quadrant && r.name !== 'home')
    .map((r) => ({
      path: r.path,
      title: r.meta.title,
      icon: r.meta.icon,
      desc: quadrantDesc[r.name] || '',
    })),
)

function go(path) {
  router.push(path)
}
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <div class="mb-6 text-center md:mb-8">
      <h1 class="text-2xl font-bold text-primary md:text-3xl">牛顿环测量工具</h1>
      <p class="mt-2 text-sm opacity-60">
        基于逐差法与不确定度评定的牛顿环曲率半径测量 · 选择一个功能开始
      </p>
    </div>

    <n-grid :x-gap="16" :y-gap="16" cols="1 sm:2" responsive="screen">
      <n-grid-item v-for="q in quadrants" :key="q.path">
        <n-card
          :bordered="false"
          class="bg-card h-full cursor-pointer transition-transform duration-200 hover:-translate-y-1"
          content-style="display:flex;flex-direction:column;height:100%;"
          @click="go(q.path)"
        >
          <div class="flex items-center gap-3">
            <i :class="q.icon" class="text-3xl text-primary" />
            <span class="text-lg font-semibold">{{ q.title }}</span>
          </div>
          <p class="mt-3 flex-1 text-sm opacity-70">{{ q.desc }}</p>
          <div class="mt-4 flex items-center gap-1 text-sm text-primary">
            进入
            <i class="i-carbon:arrow-right" />
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
