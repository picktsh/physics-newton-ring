<script setup>
import { NButton, NLayoutHeader, NSwitch } from 'naive-ui'
import { useTheme } from '@/composables/useTheme'

// §4 顶部固定页头：菜单按钮 + 站名 Logo（原侧栏顶部行迁移至此）+ §3 水印开关 + 主题切换
defineProps({
  // 水印开关状态由 BasicLayout 持有（useStorage 单一数据源）
  watermarkOn: { type: Boolean, default: true },
})
const emit = defineEmits(['toggle-menu', 'update:watermark-on'])

const { isDark, toggleTheme } = useTheme()

// 生产在 GitHub Pages 子路径 / 任意服务器下，logo 用 BASE_URL 拼相对路径，dev / build 都正确
const logoSrc = `${import.meta.env.BASE_URL}favicon.svg`
</script>

<template>
  <!-- 背景色与底部分割线交给 naive-ui 主题（headerColor = cardColor、headerBorderColor = dividerColor），
       不再手写 bg-card / border 类，主题切换时随之过渡；.n-layout-header 无 flex-shrink:0，需自己上 -->
  <n-layout-header bordered class="flex h-20 shrink-0 items-center px-4 md:px-5">
    <!-- 菜单按钮：移动端开抽屉 / PC 折叠侧栏，统一放头部左侧 -->
    <n-button quaternary circle class="mr-2" @click="emit('toggle-menu')">
      <i class="i-carbon:menu text-lg" />
    </n-button>
    <img :src="logoSrc" alt="logo" class="h-6 w-6 shrink-0" />
    <!-- 主标题 + 副标题两行；min-w-0 让 truncate 在 flex 子项内生效 -->
    <div class="ml-2 flex min-w-0 flex-col justify-center leading-tight">
      <span class="truncate text-xl font-semibold text-primary">牛顿环数字化智能测量系统</span>
      <!-- 副标题较长：窄屏（<sm）隐藏，避免与右侧开关挤成一行；颜色随主题 --c-text，仅降透明度做弱化 -->
      <span class="hidden truncate text-xs opacity-60 sm:block">
        基于OpenCV的透镜曲率半径检测与误差评定工具
      </span>
    </div>
    <!-- §3 水印开关（顶栏） -->
    <n-switch
      :value="watermarkOn"
      size="small"
      class="ml-auto mr-3"
      title="水印开关"
      @update:value="emit('update:watermark-on', $event)"
    />
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
</template>
