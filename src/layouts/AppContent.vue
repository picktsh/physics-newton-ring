<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NLayoutContent } from 'naive-ui'
import AppFooter from '@/layouts/AppFooter.vue'

// §4 右侧主内容区：滚动由 naive-ui 的 n-scrollbar 承载（n-layout-content 内置）。
// 顶部为路由 meta 驱动的页面大标题 + 说明（靠左）；尾部接页脚。
// 页脚为 sticky footer：内容不足一屏时贴底，内容长时随内容滚动（不常驻占用底部空间）。
const route = useRoute()

const title = computed(() => route.meta?.title || '')
const description = computed(() => route.meta?.description || '')
</script>

<template>
  <!-- 底色不写 bg-base：.n-layout-content 复用 .n-layout 的 background-color: var(--n-color)，
       而 Layout.color = common.bodyColor = palette.base，与我们的 --c-base 同源，写类反而多余。
       content-style 作用在 .n-scrollbar-content 上：它的父级 .n-scrollbar-container 是 height:100% 的确定高度，
       所以 min-height:100% 在此成立（写在内层 div 上会因父级高度 auto 而失效）；
       再把它做成 flex 列，内容块 flex-grow 吃掉多余高度 → 页脚被顶到底部
       （用 flex-grow 而非 flex-1：flex-basis 保持 auto，自动高度容器的 intrinsic 尺寸计算更稳） -->
  <n-layout-content
    :native-scrollbar="false"
    content-style="min-height: 100%; display: flex; flex-direction: column"
    class="h-full min-w-0"
  >
    <div class="flex-grow p-4 md:p-6">
      <!-- 页面标题区（参考 naive-ui 官网内容页头部） -->
      <div class="mb-6">
        <div class="text-2xl font-bold md:text-3xl">{{ title }}</div>
        <p v-if="description" class="mt-2 text-sm opacity-60">{{ description }}</p>
      </div>

      <!-- 路由切换过渡动画 -->
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>

    <app-footer />
  </n-layout-content>
</template>
