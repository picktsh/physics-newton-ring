<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NMenu } from 'naive-ui'
import { useMenu } from '@/composables/useMenu'

// §4 侧栏菜单：数据源为路由表；站名/Logo 已上移到页头，此处只渲染菜单。
// PC 可折叠侧栏传 collapsed（折叠为 64px 图标栏）；移动端抽屉不传（默认展开态）。
defineProps({
  collapsed: { type: Boolean, default: false },
})
// 选中菜单项后通知父级（抽屉用它来收起自己）
const emit = defineEmits(['select'])

const route = useRoute()
const router = useRouter()
const { menuOptions } = useMenu()

const activeKey = computed(() => route.path)

function handleMenuSelect(key) {
  if (key !== route.path) router.push(key)
  emit('select')
}
</script>

<template>
  <n-menu
    :value="activeKey"
    :options="menuOptions"
    :collapsed="collapsed"
    :indent="20"
    :collapsed-width="64"
    @update:value="handleMenuSelect"
  />
</template>
