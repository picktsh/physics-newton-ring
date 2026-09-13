<script setup>
import { useRouter } from 'vue-router'
import { NCard, NGrid, NGridItem } from 'naive-ui'
import { routes } from '@/router'

// §4 首页功能入口：直接循环渲染路由表（排除首页自身），标题/图标/说明均取路由 meta
const router = useRouter()
const entries = routes.filter((route) => route.name !== 'home')

function go(path) {
  router.push(path)
}
</script>

<template>
  <div class="max-w-5xl">
    <n-grid :x-gap="16" :y-gap="16" cols="1 sm:2" responsive="screen">
      <n-grid-item v-for="item in entries" :key="item.path">
        <n-card
          :bordered="false"
          class="bg-card h-full cursor-pointer transition-transform duration-200 hover:-translate-y-1"
          content-style="display:flex;flex-direction:column;height:100%;"
          @click="go(item.path)"
        >
          <div class="flex items-center gap-3">
            <i :class="item.meta.icon" class="text-3xl text-primary" />
            <span class="text-lg font-semibold">{{ item.meta.title }}</span>
          </div>
          <p class="mt-3 flex-1 text-sm opacity-70">{{ item.meta.description }}</p>
          <div class="mt-4 flex items-center gap-1 text-sm text-primary">
            进入
            <i class="i-carbon:arrow-right" />
          </div>
        </n-card>
      </n-grid-item>
    </n-grid>
  </div>
</template>
