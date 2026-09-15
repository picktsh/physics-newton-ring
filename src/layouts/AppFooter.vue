<script setup>
import { HISTORY_MAX, LAMBDA } from '@/utils/constants'

// §4 页脚：sticky footer —— 在 AppContent 的滚动容器内，内容不足一屏时贴底、内容长时随内容滚动；
// 底色与左侧菜单一致（--c-layout = peers.Layout.siderColor）。shrink-0 防止作为 flex 项被压缩。
const year = new Date().getFullYear()
// 钠光波长换算为 nm 展示，避免页脚硬编码数字与常量脱节
const lambdaNm = (LAMBDA * 1e9).toFixed(1)
</script>

<template>
  <!-- opacity 只能给文字容器，不能给 footer 本身：否则连 bg-layout 一起半透，
       与背层 bodyColor 混色后就和侧栏底色对不上了 -->
  <footer class="shrink-0 bg-layout px-4 py-3 text-xs leading-relaxed md:px-6">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 opacity-60">
      <span>© {{ year }} 牛顿环数字化智能测量系统 · 大学物理实验 · 等厚干涉测透镜曲率半径</span>
      <span class="opacity-40">|</span>
      <span>
        默认光源钠光 λ = {{ lambdaNm }} nm · 读数误差限取自读数显微镜示值 · 逐差法求平均环间距 ·
        不确定度按 A / B 类分量合成
      </span>
      <span class="opacity-40">|</span>
      <span>
        图像与结果仅存本机浏览器 localStorage（最多 {{ HISTORY_MAX }} 条，超出淘汰最旧），
        不上传服务器；换设备或清缓存前先导出备份
      </span>
    </div>
  </footer>
</template>
