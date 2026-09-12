import { h } from 'vue'
import { routes } from '@/router'

// 菜单项由路由表单一来源生成（§4）；key 用 path，选中即跳转。
// 升级到折叠 / 抽屉布局时，此数据源无需返工。
export function useMenu() {
  const menuOptions = routes
    .filter((route) => route.meta?.title)
    .map((route) => ({
      label: route.meta.title,
      key: route.path,
      icon: () => h('i', { class: route.meta.icon }),
    }))

  return { menuOptions }
}
