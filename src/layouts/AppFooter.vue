<script setup>
import { SITE_NAME } from '@/utils/constants'

// §4 页脚：sticky footer —— 在 AppContent 的滚动容器内，内容不足一屏时贴底、内容长时随内容滚动；
// 底色与左侧菜单一致（--c-layout = peers.Layout.siderColor）。shrink-0 防止作为 flex 项被压缩。
const year = new Date().getFullYear()
</script>

<template>
  <!-- opacity 只能给文字容器，不能给 footer 本身：否则连 bg-layout 一起半透，
       与背层 bodyColor 混色后就和侧栏底色对不上了 -->
  <footer class="shrink-0 bg-layout">
    <!-- 与 AppContent 同构的三层布局：外层全宽承担 padding，中层纯容器限宽 1440 居中，排版与内容在下一层 -->
    <div class="px-4 py-4 md:px-6">
      <div class="mx-auto w-full max-w-[1440px]">
        <div class="text-center text-xs leading-relaxed opacity-60">
          <p>© {{ year }} {{ SITE_NAME }}</p>
          <p class="mt-1">大学物理实验 · 等厚干涉测透镜曲率半径 · 仅供教学演示使用</p>
        </div>
      </div>
    </div>
  </footer>
</template>
