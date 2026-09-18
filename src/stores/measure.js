import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import {
  PIXEL_SCALE_KEY,
  IMAGE_SESSION_KEY,
  CALIB_SESSION_KEY,
  REC_SELECTION_KEY,
  CALIB_SELECTION_KEY,
} from '@/utils/constants'

// 跨页共享的「测量会话」状态（旧项目是单页双 Tab，所有状态挤在一个 setup()；
// 新架构拆成识别 / 标定 / 数据 / 导出多页，故把这些真正跨页的量提到 pinia 单例 store）。
//
// 1) pixelScale：像素标定值 (mm/像素)。标定页「应用到识别」写入并持久化，
//    识别页 / 数据页 / 导出页读取；空串或 ≤0 视为「未设定」，下游按未设定处理（与旧口径一致）。
// 2) session：当前一次识别的结果快照（环列表 / 圆心 / 原图 / 计算结果），
//    识别页产出后写入，数据页 / 导出页 / 历史页可直接消费，无需强制走 JSON 往返。
//
// useStorage 按默认值类型推断序列化器：默认 null → 'any'（write = String(v)），
// 对象会被写成 "[object Object]"（刷新恢复失败的根因）；显式指定 JSON 读写，不依赖推断。
// read 容错损坏残留：遗留 "[object Object]" JSON.parse 失败 → null（按无会话处理；信息写入时已丢，不可恢复）
const jsonObjectSerializer = {
  read: (v) => {
    try {
      return JSON.parse(v)
    } catch {
      return null
    }
  },
  write: (v) => JSON.stringify(v),
}

// 一次性清理损坏残留：值仅为字面量 "[object Object]"，信息不可恢复，
// 删除避免 devtools 误导（模块加载执行一次；read 侧已有容错，此处仅为卫生）
for (const key of [IMAGE_SESSION_KEY, CALIB_SESSION_KEY, REC_SELECTION_KEY, CALIB_SESSION_KEY]) {
  if (sessionStorage.getItem(key) === '[object Object]') sessionStorage.removeItem(key)
}

export const useMeasureStore = defineStore('measure', () => {
  const pixelScale = useStorage(PIXEL_SCALE_KEY, '')

  // 会话快照（不落盘：图片 dataURL 体积大，仅在内存中跨页传递；需要留存请用历史页 / 导出 JSON）
  const session = ref(null)

  // 标定页上传的两张原图（内存单例：src 为图片库 objectURL，不落盘；
  // 识别页「导入图A/B」直接读此，避免 sessionStorage 大图置空的静默失败）。
  // 结构: { A: { id, src, name, width, height } | null, B: 同 }
  const calibImages = ref({ A: null, B: null })

  // 标定页会话（sessionStorage v2：切页/刷新不丢；只存过程数据，图片组选择态另存 calibSelection）
  // 结构: { version: 2, scaleA, scaleB, distanceManual, cropCenter, cropRadius, overlayDx, overlayDy, overlayLocked, blendMode, pointPairs, cropRect }
  const calibSession = useStorage(CALIB_SESSION_KEY, null, sessionStorage, {
    serializer: jsonObjectSerializer,
  })

  // 选择态（sessionStorage，与过程数据分离）：「重置本页」只清过程数据不清选择；关 tab 自清。
  // 识别页 { imageId }；标定页 { pairId }——顶部图片管理区的「当前选中」
  const recSelection = useStorage(REC_SELECTION_KEY, null, sessionStorage, {
    serializer: jsonObjectSerializer,
  })
  const calibSelection = useStorage(CALIB_SELECTION_KEY, null, sessionStorage, {
    serializer: jsonObjectSerializer,
  })

  // 识别页图像会话（sessionStorage v2：src 不落盘，以 imageId 锚定图片库；刷新不丢、关 tab 自动清理）
  // 结构: { version: 2, imageId, fileName, width, height, center, rings, phase, filterParams, grayscale, outerRadius }
  const imageSession = useStorage(IMAGE_SESSION_KEY, null, sessionStorage, {
    serializer: jsonObjectSerializer,
  })
  // 结构约定：
  // {
  //   fileName, imageSrc, imageWidth, imageHeight,
  //   center: { x, y },
  //   rings: [ { number, x, y, avgRadius, ellipse?, contour?, keyPoints?, enabled, manual } ],
  //   calculationResults: { diameterData, radiusData, averageR, pixelScale, uncertainty, timestamp },
  //   updatedAt
  // }

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

  function setCalibImages(a, b) {
    calibImages.value = { A: a || null, B: b || null }
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

  function clearCalibSession() {
    calibSession.value = null
  }

  function clearRecSelection() {
    recSelection.value = null
  }

  function clearCalibSelection() {
    calibSelection.value = null
  }

  return {
    pixelScale,
    session,
    calibImages,
    imageSession,
    calibSession,
    recSelection,
    calibSelection,
    setPixelScale,
    pixelScaleNumber,
    setSession,
    clearSession,
    setCalibImages,
    saveImageSession,
    loadImageSession,
    clearImageSession,
    clearCalibSession,
    clearRecSelection,
    clearCalibSelection,
  }
})
