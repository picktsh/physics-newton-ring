<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useBreakpoints, breakpointsTailwind, useStorage } from '@vueuse/core'
import { NDrawer, NLayout, NScrollbar, NWatermark } from 'naive-ui'
import AppHeader from '@/layouts/AppHeader.vue'
import AppSider from '@/layouts/AppSider.vue'
import AppContent from '@/layouts/AppContent.vue'
import AppNavMenu from '@/layouts/AppNavMenu.vue'
import { WATERMARK_KEY } from '@/utils/constants'

// §4 布局壳（参考 naive-ui 官网）：页头全宽固定不滚动；
// 页头下方左右分栏 —— 左侧菜单高度铺满、内部独立滚动，右侧主内容（含 sticky 页脚）内部滚动。
const route = useRoute()

// §3 水印开关持久化
const watermarkOn = useStorage(WATERMARK_KEY, true)

// §4 响应式断点（VueUse breakpointsTailwind）：<768 移动用抽屉，≥768 用可折叠侧栏
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

// PC 侧栏折叠态；移动端抽屉开关
const collapsed = ref(false)
const drawerVisible = ref(false)

// 路由变化或回到桌面端时收起抽屉
watch([() => route.path, isMobile], ([, mobile]) => {
  if (!mobile) drawerVisible.value = false
})

// 头部菜单按钮：移动端开抽屉，PC 切换侧栏折叠（与移动端按钮同位置同样式）
function toggleMenu() {
  if (isMobile.value) drawerVisible.value = true
  else collapsed.value = !collapsed.value
}
</script>

<template>
  <!-- §3 全屏水印 + 顶栏开关 -->
  <n-watermark
    v-if="watermarkOn"
    :font-size="20"
    :global-rotate="-15"
    :height="150"
    :line-height="100"
    :width="300"
    :z-index="1500"
    content="牛顿环测量工具"
    font-color="rgba(128, 128, 128, .08)"
    fullscreen
  />

  <!-- h-screen(100vh) 直接锚定视口：整页不滚动，滚动只发生在侧栏菜单与主内容区内部 -->
  <div class="flex h-screen flex-col overflow-hidden">
    <app-header v-model:watermark-on="watermarkOn" @toggle-menu="toggleMenu" />

    <!-- 分栏区：页头全宽固定，其下左（侧栏）右（主内容）分栏，两栏各自内部滚动。
         flex-1 / min-h-0 能稳定覆盖 naive-ui 的 .n-layout{flex:auto}（依赖 index.html 的样式锚点 meta）。
         native-scrollbar=false 才会给分栏容器加 has-sider 的 flex 行布局，并用 n-scrollbar 接管滚动；
         content-style 给分栏容器确定高度，移动端（无侧栏、block 堆叠）也靠它避免退化成整页滚动 -->
    <n-layout
      :has-sider="!isMobile"
      :native-scrollbar="false"
      content-style="height: 100%"
      class="min-h-0 flex-1"
    >
      <app-sider v-if="!isMobile" :collapsed="collapsed" />
      <app-content />
    </n-layout>

    <!-- 移动端：左滑抽屉导航（内置滑动动画），菜单内部滚动；二维码只在 PC 侧栏显示 -->
    <n-drawer v-model:show="drawerVisible" placement="left" :width="264">
      <div class="h-full bg-layout">
        <n-scrollbar>
          <app-nav-menu @select="drawerVisible = false" />
        </n-scrollbar>
      </div>
    </n-drawer>
  </div>
</template>
