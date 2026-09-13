<script setup>
import { NLayoutSider } from 'naive-ui'
import AppNavMenu from '@/layouts/AppNavMenu.vue'
import SiteQrcode from '@/components/SiteQrcode.vue'

// §4 PC / 平板可折叠侧栏（naive-ui 内置宽度过渡，折叠宽 64）
// 菜单在侧栏内独立滚动；二维码 absolute 锚侧栏底部（依赖根元素 relative 定位锚），折叠时隐藏
// 侧栏底色走 themeOverrides.peers.Layout.siderColor（见 src/theme/index.js），不用原子类覆盖
defineProps({
  collapsed: { type: Boolean, default: false },
})
</script>

<template>
  <n-layout-sider
    :collapsed="collapsed"
    bordered
    :width="240"
    :collapsed-width="64"
    :native-scrollbar="false"
    collapse-mode="width"
    class="relative"
  >
    <app-nav-menu :collapsed="collapsed" />
    <!-- 侧栏底部二维码：折叠时隐藏（移动端在抽屉外，不渲染） -->
    <div
      v-show="!collapsed"
      class="absolute inset-x-0 bottom-0 border-t border-gray-500/20 px-4 py-4"
    >
      <site-qrcode />
    </div>
  </n-layout-sider>
</template>
