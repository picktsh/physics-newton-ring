<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useBreakpoints, breakpointsTailwind, useStorage } from '@vueuse/core'
import {
  NLayout,
  NLayoutSider,
  NLayoutHeader,
  NLayoutContent,
  NButton,
  NDrawer,
  NWatermark,
  NSwitch,
} from 'naive-ui'
import { useTheme } from '@/composables/useTheme'
import SideNav from '@/components/SideNav.vue'
import SiteQrcode from '@/components/SiteQrcode.vue'
import { WATERMARK_KEY } from '@/utils/constants'

const route = useRoute()
const { isDark, toggleTheme } = useTheme()
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
    :font-size="14"
    :global-rotate="-15"
    :height="300"
    :width="400"
    :z-index="1500"
    content="牛顿环测量工具"
    cross
    fullscreen
  />
  <!-- h-screen(100vh) 直接锚定视口，不依赖 #app→provider 的百分比高度链，保证铺满 -->
  <n-layout :has-sider="!isMobile" class="h-screen">
    <!-- PC / 平板：可折叠侧栏（naive-ui 内置宽度过渡动画） -->
    <n-layout-sider
      v-if="!isMobile"
      v-model:collapsed="collapsed"
      bordered
      :width="240"
      :collapsed-width="64"
      :native-scrollbar="false"
      collapse-mode="width"
      class="relative bg-layout"
    >
      <side-nav :collapsed="collapsed" />
      <!-- 侧栏底部二维码：折叠时隐藏（移动端在抽屉外，不渲染） -->
      <div
        v-show="!collapsed"
        class="absolute inset-x-0 bottom-0 border-t border-gray-500/20 px-4 py-4"
      >
        <site-qrcode />
      </div>
    </n-layout-sider>

    <!-- 移动端：左滑抽屉导航（内置滑动动画） -->
    <n-drawer v-model:show="drawerVisible" placement="left" :width="264">
      <div class="flex h-full flex-col bg-layout">
        <side-nav @select="drawerVisible = false" />
      </div>
    </n-drawer>

    <n-layout>
      <n-layout-header bordered class="flex h-14 items-center bg-card px-4 md:px-5">
        <!-- 菜单按钮：移动端开抽屉 / PC 折叠侧栏，统一放头部左侧 -->
        <n-button quaternary circle class="mr-2" @click="toggleMenu">
          <i class="i-carbon:menu text-lg" />
        </n-button>
        <span class="text-sm opacity-70">{{ route.meta.title }}</span>
        <!-- §3 水印开关（顶栏） -->
        <n-switch v-model:value="watermarkOn" size="small" class="ml-auto mr-3" title="水印开关" />
        <!-- 右上角主题切换（参考 naive-ui 官网）；选择持久化到 localStorage -->
        <n-button
          quaternary
          circle
          :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
          @click="toggleTheme"
        >
          <i :class="isDark ? 'i-carbon:moon' : 'i-carbon:sun'" class="text-lg" />
        </n-button>
      </n-layout-header>
      <n-layout-content :native-scrollbar="false" class="bg-base">
        <!-- 响应式内边距 + 路由切换过渡动画 -->
        <div class="p-4 md:p-6">
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>
