// 物理 / 仪器常量（抽芯自旧 js/constants.js，1:1 保留）
// 钠光波长 (m)
export const LAMBDA = 589.3e-9
// 读数显微镜示值误差限 Δ (mm)，用于直径 D 的 B 类不确定度 u_B = Δ/k（正态 p=0.683, k=1）
export const INSTRUMENT_ERROR = 0.002
// 暗环标记颜色 RGB
export const RING_COLOR = '144, 238, 144'

// 存储与治理常量（§1 前缀统一；§11.5#6 图片爆仓治理）
export const STORAGE_PREFIX = 'physics-newton-ring:'
export const HISTORY_KEY = `${STORAGE_PREFIX}history`
export const THEME_KEY = `${STORAGE_PREFIX}theme`
export const WATERMARK_KEY = `${STORAGE_PREFIX}watermark`
// 像素标定值 (mm/像素) 跨页共享持久化：标定页「应用到识别」写入，识别/数据/导出页读取
export const PIXEL_SCALE_KEY = `${STORAGE_PREFIX}pixel-scale`
// 标定页图片缓存（双图对齐用，sessionStorage，与旧 CALIB_KEY 同口径，刷新内保持）
export const CALIB_IMAGES_KEY = `${STORAGE_PREFIX}calib-images`
export const CALIB_POINTS_KEY = `${STORAGE_PREFIX}calib-points`
// 历史条数上限（LRU：超出淘汰最旧）
export const HISTORY_MAX = 20
// 存入前压缩：最长边像素 + JPEG 质量
export const IMAGE_MAX_EDGE = 1600
export const IMAGE_QUALITY = 0.85
