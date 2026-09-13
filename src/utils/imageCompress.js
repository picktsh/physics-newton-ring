import { IMAGE_MAX_EDGE, IMAGE_QUALITY } from './constants'

/**
 * 把图片 dataURL 压缩（限最长边 + JPEG 质量），用于 localStorage 爆仓治理（§11.5#6）。
 * @param {string} dataUrl 原始图片 dataURL
 * @param {{ maxEdge?: number, quality?: number }} [opts]
 * @returns {Promise<string>} 压缩后的 JPEG dataURL
 */
export function compressImageDataUrl(
  dataUrl,
  { maxEdge = IMAGE_MAX_EDGE, quality = IMAGE_QUALITY } = {},
) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
      const width = Math.round(img.width * scale)
      const height = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = dataUrl
  })
}
