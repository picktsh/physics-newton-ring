import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import katexPlugin from '@vscode/markdown-it-katex'
import 'katex/dist/katex.min.css'

// 文档中心 md → html 渲染单例。
// 设计：
// - html:true 允许 md 内联 HTML（内置文档我们自己写、拖入文档是用户本机文件，威胁模型是自伤，不引入 DOMPurify）；
// - 锚点用中文友好 slugify（保留 CJK，其他非单词字符转 -），配合手搓 TOC；
// - katex 复用已装 katex，throwOnError:false 保证单处公式错误不整篇白屏；
// - image resolver：由 renderMarkdown(text, env) 的 env.imageResolver 注入（zip 场景把相对路径映射到 objectURL）；
//   未注入时保持默认（内置文档从 BASE_URL 相对路径自然解析）。

// CJK 感知的 slug：中文保留、其他符号转连字符，避免默认 slugify 把中文标题变空
function slugify(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u4e00-\u9fa5\w-]/g, '')
    .replace(/-+/g, '-')
}

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  breaks: false,
})

md.use(katexPlugin, { throwOnError: false, output: 'html' })
md.use(anchor, {
  level: [1, 2, 3, 4],
  slugify,
  permalink: anchor.permalink.ariaHidden({ placement: 'before', symbol: '' }),
})

// image 规则：优先用 env.imageResolver（zip tab 场景），否则走默认属性渲染 + 加 lazy/class
const defaultImageRender = function (tokens, idx, options, env, slf) {
  return slf.renderToken(tokens, idx, options)
}
md.renderer.rules.image = (tokens, idx, options, env, slf) => {
  const token = tokens[idx]
  const srcIdx = token.attrIndex('src')
  const resolver = env && typeof env.imageResolver === 'function' ? env.imageResolver : null
  if (resolver && srcIdx >= 0) {
    const original = token.attrs[srcIdx][1]
    const resolved = resolver(original)
    if (resolved) token.attrs[srcIdx][1] = resolved
  }
  token.attrSet('loading', 'lazy')
  token.attrJoin('class', 'doc-img')
  return defaultImageRender(tokens, idx, options, env, slf)
}

// 外链默认新窗口打开，避免误走 hash 路由
const defaultLinkRender = function (tokens, idx, options, env, slf) {
  return slf.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = (tokens, idx, options, env, slf) => {
  const hrefIdx = tokens[idx].attrIndex('href')
  if (hrefIdx >= 0) {
    const href = tokens[idx].attrs[hrefIdx][1]
    if (/^https?:\/\//i.test(href)) {
      tokens[idx].attrSet('target', '_blank')
      tokens[idx].attrSet('rel', 'noopener noreferrer')
    }
  }
  return defaultLinkRender(tokens, idx, options, env, slf)
}

// mermaid fence：```mermaid 代码块输出为 <div class="mermaid">源码</div>，
// 交由 mermaidRunner 在 DOM 挂载后转 SVG；其余代码块走默认渲染。
const defaultFence = function (tokens, idx, options, env, slf) {
  return slf.renderToken(tokens, idx, options)
}
md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
  const token = tokens[idx]
  if (token.info.trim().toLowerCase() === 'mermaid') {
    return `<div class="mermaid">${escapeHtml(token.content)}</div>\n`
  }
  return defaultFence(tokens, idx, options, env, slf)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  )
}

export function renderMarkdown(text, env = {}) {
  if (!text) return ''
  return md.render(text, env)
}
