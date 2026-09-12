import { computed, watch } from 'vue'
import { useDark, useToggle } from '@vueuse/core'
import { darkTheme } from 'naive-ui'
import { cssVarsOf, themeOverridesOf } from '@/theme'

// §1：localStorage key 前缀统一 physics-newton-ring:；§2/§7：全局共享状态用 VueUse useDark（不引 Pinia）
// useDark 内置持久化 + 跟随系统偏好，storageKey 与旧实现兼容（'dark'/'light'），历史选择不丢失
const isDark = useDark({
  storageKey: 'physics-newton-ring:theme',
  valueDark: 'dark',
  valueLight: 'light',
})
const toggleDark = useToggle(isDark)

// naive-ui 只吃 themeOverrides，CSS 变量（供 UnoCSS / 全局样式）仍需手动写入 <html>
// 模块级监听：导入即应用一次（含刷新后恢复存储的主题），之后随切换响应
watch(
  isDark,
  (dark) => {
    const vars = cssVarsOf(dark ? 'dark' : 'light')
    for (const [key, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(key, value)
    }
  },
  { immediate: true },
)

export function useTheme() {
  const naiveTheme = computed(() => (isDark.value ? darkTheme : null))
  const themeOverrides = computed(() => themeOverridesOf(isDark.value ? 'dark' : 'light'))

  function toggleTheme() {
    toggleDark()
  }

  return { isDark, naiveTheme, themeOverrides, toggleTheme }
}
