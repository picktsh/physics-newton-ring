import { ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { PIXEL_SCALE_KEY, IMAGE_SESSION_KEY } from '@/utils/constants'

// 跨页共享的「测量会话」状态（旧项目是单页双 Tab，所有状态挤在一个 setup()；
// 新架构拆成识别 / 标定 / 数据 / 导出多页，故把这些真正跨页的量提到模块级单例）。
//
// 1) pixelScale：像素标定值 (mm/像素)。标定页「应用到识别」写入并持久化，
//    识别页 / 数据页 / 导出页读取；空串或 ≤0 视为「未设定」，下游按未设定处理（与旧口径一致）。
// 2) session：当前一次识别的结果快照（环列表 / 圆心 / 原图 / 计算结果），
//    识别页产出后写入，数据页 / 导出页 / 历史页可直接消费，无需强制走 JSON 往返。
export const pixelScale = useStorage(PIXEL_SCALE_KEY, '')

// 会话快照（不落盘：图片 dataURL 体积大，仅在内存中跨页传递；需要留存请用历史页 / 导出 JSON）
export const session = ref(null)

// 识别页图像会话（sessionStorage，不压缩，刷新不丢、关 tab 自动清理）
// 结构: { src, fileName, width, height, center, rings, phase, filterParams, grayscale, outerRadius }
export const imageSession = useStorage(IMAGE_SESSION_KEY, null, sessionStorage)
// 结构约定：
// {
//   fileName, imageSrc, imageWidth, imageHeight,
//   center: { x, y },
//   rings: [ { number, x, y, avgRadius, ellipse?, contour?, keyPoints?, enabled, manual } ],
//   calculationResults: { diameterData, radiusData, averageR, pixelScale, uncertainty, timestamp },
//   updatedAt
// }

export function useMeasureStore() {
  function setPixelScale(v) {
    pixelScale.value = v == null ? '' : String(v)
  }

  // pixelScale 数值化（未设定 / 非法 → 0，调用方据此判断是否可算 mm）
  function pixelScaleNumber() {
    const n = Number(pixelScale.value)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  function setSession(payload) {
    session.value = payload ? { ...payload, updatedAt: Date.now() } : null
  }

  function clearSession() {
    session.value = null
  }

  function saveImageSession(payload) {
    try {
      imageSession.value = payload ? { ...payload, updatedAt: Date.now() } : null
    } catch {
      // sessionStorage 满（大图超 ~5MB），graceful 降级：不存，下次刷新丢失
      imageSession.value = null
    }
  }

  function loadImageSession() {
    return imageSession.value || null
  }

  function clearImageSession() {
    imageSession.value = null
  }

  return {
    pixelScale,
    session,
    imageSession,
    setPixelScale,
    pixelScaleNumber,
    setSession,
    clearSession,
    saveImageSession,
    loadImageSession,
    clearImageSession,
  }
}
