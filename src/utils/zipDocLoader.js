// 压缩包（.zip）解析：异步解压 → 抽出所有 md 与图片 → 图片转 objectURL → 提供相对路径解析器
// 依赖 fflate 走动态 import，只在真的拖入 zip 时才拉 chunk（~7 KB gzip）
// 生命周期：返回 { tabs, assets }；tabs 每项含 imageResolver(src) 闭包，assets 是 objectURL 列表由调用方 revoke

const IMAGE_EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

const MD_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd'])

function ext(name) {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

// 归一化路径：折叠 ./、xxx/../、去掉首层目录（zip 常见打包时会套一层根目录）
function normalize(p) {
  const parts = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

// 尝试找出「共同根前缀」并剥离：如所有条目都以 `mydocs/` 开头则去掉
function stripCommonRoot(entries) {
  if (!entries.length) return (p) => p
  const first = entries[0].name.split('/')
  let commonLen = 0
  for (let i = 0; i < first.length - 1; i++) {
    const prefix = first.slice(0, i + 1).join('/') + '/'
    if (entries.every((e) => e.name.startsWith(prefix))) commonLen = i + 1
    else break
  }
  if (commonLen === 0) return (p) => p
  const drop = first.slice(0, commonLen).join('/') + '/'
  return (p) => (p.startsWith(drop) ? p.slice(drop.length) : p)
}

// 计算 md 所在目录（用于相对图片解析）；根级 md 返回 ''
function dirname(p) {
  const i = p.lastIndexOf('/')
  return i === -1 ? '' : p.slice(0, i)
}

export async function loadZipDoc(file) {
  const { unzip } = await import('fflate')
  const buf = new Uint8Array(await file.arrayBuffer())
  const raw = await new Promise((resolve, reject) => {
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data)))
  })

  // 转成 entries 列表；过滤目录占位（fflate 已只给文件）
  const stripRoot = stripCommonRoot(Object.keys(raw).map((name) => ({ name })))
  const entries = Object.entries(raw).map(([name, bytes]) => ({
    name: normalize(stripRoot(name)),
    bytes,
  }))

  const mdEntries = entries.filter((e) => MD_EXT.has(ext(e.name)))
  const imageEntries = entries.filter((e) => IMAGE_EXT_MIME[ext(e.name)])

  // 图片 → objectURL 表：Map<绝对路径（zip 内相对根）, objectURL>
  const assets = []
  const imageMap = new Map()
  for (const img of imageEntries) {
    const blob = new Blob([img.bytes], { type: IMAGE_EXT_MIME[ext(img.name)] })
    const url = URL.createObjectURL(blob)
    assets.push(url)
    imageMap.set(img.name, url)
  }

  const decoder = new TextDecoder('utf-8')
  const tabs = mdEntries.map((md) => {
    const mdDir = dirname(md.name)
    const baseName = md.name.split('/').pop()
    const content = decoder.decode(md.bytes).replace(/^\uFEFF/, '')
    // 每个 tab 独立的解析器：把 md 里的相对 src 拼成 zip 根下路径查表
    const imageResolver = (src) => {
      if (!src) return null
      if (/^(https?:|data:|blob:)/i.test(src)) return null // 绝对 URL 不管
      const joined = mdDir ? normalize(`${mdDir}/${src}`) : normalize(src)
      return imageMap.get(joined) || imageMap.get(src) || null
    }
    return { fileName: baseName, name: md.name, content, imageResolver }
  })

  return { tabs, assets }
}

export function revokeAssets(assets) {
  if (!assets) return
  for (const url of assets) {
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* 忽略：已 revoke 或非法 */
    }
  }
}
