import { applyWatermarkToCanvas, watermarkCss } from '@/utils/watermark'

// 文档中心导出：md 原文 / doc / png / 打印。
// 设计：
// - md：Blob + <a download> 零依赖，保持原始源码（纯文本塞水印会污染内容，故不加）；
// - doc：Word 能直接打开的「MIME HTML」——application/msword + BOM + .doc；注入平铺水印层（best-effort，Word 版本对背景支持不一）；
// - png：html2canvas 动态 import → canvas 叠加平铺水印；
// - 打印/PDF：把当前文档克隆到 <body> 末尾的独立 print host，隐藏 #app，window.print()。
//   同文档克隆可复用 KaTeX 字体 / 相对图片 / blob 图 / mermaid SVG，彻底规避旧 visibility hack 的偏移与截断。
// 所有下载触发统一 <a download>（HTML5 原生支持 UTF-8 中文名），不引 file-saver。

const MIME_DOC = 'application/msword'
const MIME_MD = 'text/markdown;charset=utf-8'
const MIME_PNG = 'image/png'

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// 去掉扩展名，用于拼接不同导出后缀
export function baseName(titleWithExt) {
  return String(titleWithExt).replace(/\.(md|markdown|mdown|mkd|txt)$/i, '')
}

export function exportMd(name, rawText) {
  const blob = new Blob([rawText ?? ''], { type: MIME_MD })
  triggerDownload(blob, `${baseName(name) || 'doc'}.md`)
}

// 生成 Word 兼容 HTML：注入排版样式 + 平铺水印层；renderedHtml 应为 live DOM 的 innerHTML（含 mermaid SVG / KaTeX）
export function exportDoc(name, renderedHtml) {
  const wm = watermarkCss()
  const docHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>${escapeHtml(baseName(name))}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page { size: A4; margin: 2cm 1.8cm; }
body { font-family: 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif; line-height: 1.7; color: #222; }
h1, h2, h3, h4 { margin: 1em 0 0.5em; }
pre, code { font-family: 'Consolas', 'Menlo', monospace; background: #f5f5f5; }
pre { padding: 0.6em; border: 1px solid #ddd; white-space: pre-wrap; }
img { max-width: 100%; }
table { border-collapse: collapse; }
table th, table td { border: 1px solid #bbb; padding: 4px 8px; }
blockquote { border-left: 4px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
.mermaid svg { max-width: 100%; }
.doc-watermark { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-image: ${wm}; background-repeat: repeat; z-index: 9999; }
</style>
</head>
<body>
<div class="doc-watermark"></div>
${renderedHtml ?? ''}
</body>
</html>`
  const blob = new Blob(['\ufeff', docHtml], { type: MIME_DOC })
  triggerDownload(blob, `${baseName(name) || 'doc'}.doc`)
}

export async function exportPng(name, el) {
  if (!el) throw new Error('exportPng: 目标容器为空')
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(el, {
    scale: Math.min(window.devicePixelRatio || 1, 2),
    // 导出统一浅底深字，避免深色主题下 png 一片黑、水印看不见
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })
  await applyWatermarkToCanvas(canvas)
  await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas.toBlob 返回空'))
      triggerDownload(blob, `${baseName(name) || 'doc'}.png`)
      resolve()
    }, MIME_PNG)
  })
}

// 打印：克隆到 body 末尾的 print host（同文档，字体/图片/SVG 全部复用），隐藏主应用，打印后清理
export function printDoc(renderedHtml) {
  const existing = document.querySelector('.print-doc-host')
  if (existing) existing.remove()

  const host = document.createElement('div')
  host.className = 'print-doc-host'
  host.innerHTML = `<div class="print-watermark" style="background-image:${watermarkCss()}"></div><div class="markdown-body print-doc-inner">${renderedHtml ?? ''}</div>`
  document.body.appendChild(host)
  document.body.classList.add('printing-active')

  const cleanup = () => {
    host.remove()
    document.body.classList.remove('printing-active')
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  // 部分浏览器取消打印不触发 afterprint，兜底清理
  setTimeout(cleanup, 5 * 60 * 1000)
  window.print()
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

// 供 DocsView 新窗口预览（pdf/图片）用，独立于 tab 生命周期
export function openInNewWindow(file) {
  const url = URL.createObjectURL(file)
  const win = window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  if (!win) return { blocked: true, url }
  return { blocked: false, url }
}
