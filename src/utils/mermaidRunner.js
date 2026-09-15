import { useTheme } from '@/composables/useTheme'

// Mermaid 流程图渲染：懒加载（mermaid 体积大，仅含流程图的文档触发时才 import），
// 随深浅主题选 theme，把 markdownRenderer 产出的 <div class="mermaid"> 源码块转成内联 SVG。
// 幂等：mermaid.run 会给处理过的节点打 data-processed，重复调用只补渲染未处理的。

let mermaidMod = null

async function ensureMermaid() {
  if (mermaidMod) return mermaidMod
  const ns = await import('mermaid')
  mermaidMod = ns.default || ns
  return mermaidMod
}

export async function runMermaid(container) {
  if (!container) return
  const nodes = container.querySelectorAll('.mermaid:not([data-processed="true"])')
  if (!nodes.length) return
  const mermaid = await ensureMermaid()
  const { isDark } = useTheme()
  mermaid.initialize({
    startOnLoad: false,
    theme: isDark.value ? 'dark' : 'default',
    securityLevel: 'loose', // 允许图中出现 <br> 等标签（我们自己的文档，非可信第三方输入）
    fontFamily: 'inherit',
  })
  try {
    await mermaid.run({ nodes: Array.from(nodes) })
  } catch (e) {
    // 单张图语法错误不应阻断整篇预览：保留原始源码文本，控制台留痕
    console.warn('[mermaid] 渲染失败：', e)
  }
}
