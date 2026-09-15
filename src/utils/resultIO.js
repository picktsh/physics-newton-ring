// 测量结果的序列化 / 反序列化（§11.5#3：JSON 导出与数据页导入互逆，schema 单一来源）
// 识别页产出 payload → 导出页序列化为 JSON/CSV/HTML/表格 → 数据页 parse 回显，全部走这里。

export const RESULT_SCHEMA_VERSION = 1
export const RESULT_APP_TAG = 'physics-newton-ring'

// 由识别会话快照构造规范化结果对象（导出 / 存历史 / 数据页统一消费）
export function buildResultPayload(session) {
  if (!session) return null
  const cr = session.calculationResults || null
  return {
    app: RESULT_APP_TAG,
    version: RESULT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    fileName: session.fileName || '',
    pixelScale: cr?.pixelScale ?? (Number(session.pixelScale) || 0),
    center: session.center || null,
    rings: (session.rings || []).map((r) => ({
      number: r.number,
      x: r.x,
      y: r.y,
      avgRadius: r.avgRadius,
      enabled: r.enabled !== false,
      manual: !!r.manual,
      ellipse: r.ellipse || null,
    })),
    diameterData: cr?.diameterData || [],
    radiusData: (cr?.radiusData || []).map((it) => ({
      group: it.group,
      m: it.m,
      n: it.n,
      Dm: it.Dm,
      Dn: it.Dn,
      diffSquared: it.diffSquared,
      diffSquaredText: it.diffSquaredText,
      radius: it.radius,
      radiusRounded: it.radiusRounded,
      radiusText: it.radiusText,
    })),
    averageR: cr?.averageR ?? 0,
    uncertainty: cr?.uncertainty || null,
    // 标注图（可选）：dataURL，用于导出图片 / 网页回显；体积大，JSON 导出时默认剔除
    annotatedImage: session.annotatedImage || null,
  }
}

// 解析并校验数据页导入的 JSON（容错：缺字段回落默认，非法直接抛错由调用方提示）
export function parseResultJSON(text) {
  const obj = JSON.parse(text)
  if (!obj || typeof obj !== 'object') throw new Error('JSON 结构非法')
  if (!Array.isArray(obj.diameterData) && !Array.isArray(obj.radiusData)) {
    throw new Error('缺少测量数据（diameterData / radiusData）')
  }
  return {
    app: obj.app || RESULT_APP_TAG,
    version: obj.version || RESULT_SCHEMA_VERSION,
    exportedAt: obj.exportedAt || '',
    fileName: obj.fileName || '',
    pixelScale: Number(obj.pixelScale) || 0,
    center: obj.center || null,
    rings: Array.isArray(obj.rings) ? obj.rings : [],
    diameterData: Array.isArray(obj.diameterData) ? obj.diameterData : [],
    radiusData: Array.isArray(obj.radiusData) ? obj.radiusData : [],
    averageR: Number(obj.averageR) || 0,
    uncertainty: obj.uncertainty || null,
    annotatedImage: obj.annotatedImage || null,
  }
}

// 导出 JSON（默认剔除大体积标注图，保证文件轻量且与数据页导入互逆）
export function toJSON(payload, { withImage = false } = {}) {
  const out = { ...payload }
  if (!withImage) delete out.annotatedImage
  return JSON.stringify(out, null, 2)
}

// 导出 CSV（1:1 复刻旧 exportCSV：BOM + 结果头 + 表1 + 表2）
export function toCSV(payload) {
  const { diameterData, radiusData, averageR, pixelScale, uncertainty, exportedAt } = payload
  let csv = '\uFEFF'
  csv += '牛顿环实验测量结果\n'
  csv += `生成时间:,${exportedAt || new Date().toLocaleString('zh-CN')}\n`
  csv += `像素标定:,${pixelScale} mm/像素\n`
  csv += `平均曲率半径:,${(averageR || 0).toFixed(3)} m\n`
  if (uncertainty && uncertainty.valid) {
    csv += `测量结果 (p=0.95):,R = (${uncertainty.meanText} ± ${uncertainty.uText}) m\n`
    csv += `仪器示值误差限 Δ:,${uncertainty.deltaInstrument} mm\n`
    csv += `直径 B 类 u_B(D):,${uncertainty.uBDText} mm\n`
    csv += `A类不确定度 u_A:,${uncertainty.uAText} m\n`
    csv += `B类不确定度 u_B:,${uncertainty.uBText} m\n`
    csv += `合成标准不确定度 u_C:,${uncertainty.uCText} m\n`
    csv += `扩展不确定度 U (p=0.95, k=${uncertainty.kText}):,${uncertainty.uText} m\n`
    csv += `相对不确定度 U/R:,${uncertainty.relativeText}\n`
  }
  csv += '\n'
  csv += '表1: 各暗环直径测量数据\n'
  csv += '环编号 (k),直径 (像素),直径 (mm)\n'
  diameterData.forEach((item) => {
    csv += `${item.number},${item.diameterPixel.toFixed(2)},${item.diameterMM.toFixed(3)}\n`
  })
  csv += '\n表2: 曲率半径计算结果\n'
  csv += '分组,m,n,Dm² - Dn² (mm²),曲率半径 R (m)\n'
  radiusData.forEach((item) => {
    csv += `${item.group},${item.m},${item.n},${item.diffSquaredText},${item.radiusText}\n`
  })
  return csv
}

// 导出 Markdown 表格（表1 + 表2 + 结果小结）
export function toMarkdown(payload) {
  const { diameterData, radiusData, averageR, pixelScale, uncertainty } = payload
  const lines = []
  lines.push('# 牛顿环实验测量结果\n')
  lines.push(`- 像素标定：${pixelScale} mm/像素`)
  lines.push(`- 平均曲率半径：${(averageR || 0).toFixed(3)} m`)
  if (uncertainty && uncertainty.valid) {
    lines.push(`- 测量结果 (p=0.95)：R = (${uncertainty.meanText} ± ${uncertainty.uText}) m`)
    lines.push(`- 相对不确定度 U/R：${uncertainty.relativeText}`)
  }
  lines.push('\n## 表1 各暗环直径测量数据\n')
  lines.push('| 环编号 (k) | 直径 (像素) | 直径 (mm) |')
  lines.push('| --- | --- | --- |')
  diameterData.forEach((it) => {
    lines.push(`| ${it.number} | ${it.diameterPixel.toFixed(2)} | ${it.diameterMM.toFixed(3)} |`)
  })
  lines.push('\n## 表2 曲率半径计算结果（逐差法）\n')
  lines.push('| 分组 | m | n | Dm²−Dn² (mm²) | R (m) |')
  lines.push('| --- | --- | --- | --- | --- |')
  radiusData.forEach((it) => {
    lines.push(`| ${it.group} | ${it.m} | ${it.n} | ${it.diffSquaredText} | ${it.radiusText} |`)
  })
  return lines.join('\n')
}

// 导出独立网页（自包含 HTML，内嵌样式 + 表1/表2 + 不确定度，可离线打开）
export function toHTMLPage(payload) {
  const { diameterData, radiusData, averageR, pixelScale, uncertainty, fileName, exportedAt } =
    payload
  const esc = (s) =>
    String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
  const rows1 = diameterData
    .map(
      (it) =>
        `<tr><td>${esc(it.number)}</td><td>${it.diameterPixel.toFixed(2)}</td><td>${it.diameterMM.toFixed(3)}</td></tr>`,
    )
    .join('')
  const rows2 = radiusData
    .map(
      (it) =>
        `<tr><td>${esc(it.group)}</td><td>${esc(it.m)}</td><td>${esc(it.n)}</td><td>${esc(it.diffSquaredText)}</td><td>${esc(it.radiusText)}</td></tr>`,
    )
    .join('')
  const u =
    uncertainty && uncertainty.valid
      ? `<p>测量结果 (p=0.95)：<b>R = (${esc(uncertainty.meanText)} ± ${esc(uncertainty.uText)}) m</b>，相对不确定度 U/R = ${esc(uncertainty.relativeText)}</p>
       <p>u_A = ${esc(uncertainty.uAText)} m，u_B = ${esc(uncertainty.uBText)} m，u_C = ${esc(uncertainty.uCText)} m，U = ${esc(uncertainty.uText)} m (k=${esc(uncertainty.kText)})</p>`
      : '<p class="muted">未评定不确定度（数据组数不足）。</p>'
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>牛顿环测量结果</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 32px; background: #f6f7f9; color: #1f2329; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 24px; } h2 { font-size: 18px; margin-top: 28px; }
  .meta { color: #5a6472; font-size: 14px; line-height: 1.8; }
  table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th, td { border: 1px solid #e3e6eb; padding: 8px 12px; text-align: center; font-size: 14px; }
  th { background: #eef1f5; }
  .muted { color: #98a1ad; }
</style>
</head>
<body>
<div class="wrap">
  <h1>牛顿环实验测量结果</h1>
  <div class="meta">
    <div>源文件：${esc(fileName) || '—'}</div>
    <div>生成时间：${esc(exportedAt || new Date().toLocaleString('zh-CN'))}</div>
    <div>像素标定：${esc(pixelScale)} mm/像素 ｜ 平均曲率半径：${(averageR || 0).toFixed(3)} m</div>
  </div>
  <h2>测量结果与不确定度</h2>
  <div class="meta">${u}</div>
  <h2>表1 各暗环直径测量数据</h2>
  <table><thead><tr><th>环编号 (k)</th><th>直径 (像素)</th><th>直径 (mm)</th></tr></thead><tbody>${rows1}</tbody></table>
  <h2>表2 曲率半径计算结果（逐差法）</h2>
  <table><thead><tr><th>分组</th><th>m</th><th>n</th><th>Dm²−Dn² (mm²)</th><th>R (m)</th></tr></thead><tbody>${rows2}</tbody></table>
</div>
</body>
</html>`
}

// 触发浏览器下载（Blob）
export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
