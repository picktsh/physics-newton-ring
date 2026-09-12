import {
  defineConfig,
  presetUno,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// §2：只启用 presetUno + presetIcons（+ directives / variant-group 两个 transformer），禁止 presetAttributify。
// 菜单 / 四象限所用图标集中在 safelist 声明，杜绝静态提取漏生成、图标不渲染。
export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  safelist: [
    'i-carbon:home',
    'i-carbon:image-search',
    'i-carbon:time',
    'i-carbon:chart-bar',
    'i-carbon:download',
    'i-carbon:moon',
    'i-carbon:sun',
    'i-carbon:menu',
  ],
  theme: {
    // 表面色走 CSS 变量，随深/浅主题翻转（变量由 useTheme 写入 <html>）
    colors: {
      base: 'var(--c-base)',
      card: 'var(--c-card)',
      layout: 'var(--c-layout)',
      primary: 'var(--c-primary)',
    },
  },
})
