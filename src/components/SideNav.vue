<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NMenu } from 'naive-ui'
import { useMenu } from '@/composables/useMenu'

// 侧栏导航复用块（§4）：logo 标题行 + 菜单。
// PC 可折叠侧栏传 collapsed；移动端抽屉不传（默认展开态）。
defineProps({
  collapsed: { type: Boolean, default: false },
})
// 选中菜单项后通知父级（抽屉用它来收起自己）
const emit = defineEmits(['select'])

const route = useRoute()
const router = useRouter()
const { menuOptions } = useMenu()

// 生产在 GitHub Pages 子路径 / 任意服务器下，logo 用 BASE_URL 拼相对路径，dev / build 都正确
const logoSrc = `${import.meta.env.BASE_URL}favicon.svg`
const activeKey = computed(() => route.path)

function handleMenuSelect(key) {
  if (key !== route.path) router.push(key)
  emit('select')
}
</script>

<template>
  <div class="flex h-14 items-center gap-2 px-5">
    <img :src="logoSrc" alt="logo" class="h-6 w-6 shrink-0" />
    <span v-show="!collapsed" class="truncate font-semibold text-primary">牛顿环测量工具</span>
  </div>
  <n-menu
    :value="activeKey"
    :options="menuOptions"
    :collapsed="collapsed"
    :indent="20"
    :collapsed-width="64"
    @update:value="handleMenuSelect"
  />
</template>
