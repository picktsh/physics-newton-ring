import {
  defineConfig,
  presetUno,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

// §2：只启用 presetUno + presetIcons（+ directives / variant-group 两个 transformer），禁止 presetAttributify。
// 类名（含图标）只在使用处写一次：默认扫描 vue/html/md 等之外，
// 把 src 目录下的纯 .js/.ts 也纳入 pipeline（路由 meta 图标等类名字面量
// 过去提取不到，需在 safelist 重复声明一份，易漏）。
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
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/, // 默认扫描范围
        /[\\/]src[\\/].+\.[jt]s($|\?)/, // src 下 JS/TS 中的类名字面量（路由图标等）
      ],
    },
  },
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
