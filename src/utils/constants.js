// 物理 / 仪器常量（抽芯自旧 js/constants.js，1:1 保留）
// 钠光波长 (m)
export const LAMBDA = 589.3e-9
// 读数显微镜示值误差限 Δ (mm)，用于直径 D 的 B 类不确定度 u_B = Δ/k（正态 p=0.95, k=2）
export const INSTRUMENT_ERROR = 0.002
// 包含因子 k（置信概率 p=0.95）：B 类 u_B = Δ/k 与扩展 U = k·u_C 共用同一口径
export const COVERAGE_K = 2
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

// 文档中心（§Docs）
// - 本地拖入 tab 的会话快照 key：sessionStorage，刷新保留、× 手动关闭清除
export const DOCS_TABS_KEY = `${STORAGE_PREFIX}docs-tabs`
// - 单个本地 md tab 允许进 sessionStorage 的字节上限；超过则 tab 转 transient（能预览但不落盘）
export const DOCS_TAB_PERSIST_MAX_BYTES = 1 * 1024 * 1024
// - 所有本地 tab 累计字节上限（sessionStorage 浏览器配额一般 5 MB，留余量）
export const DOCS_TABS_TOTAL_MAX_BYTES = 3 * 1024 * 1024
// - zip 压缩包体积上限，超过 unzip 前二次确认（避免长时间冻结主线程）
export const DOCS_ZIP_MAX_BYTES = 50 * 1024 * 1024
// - 内置 2 篇文档的元数据：文件名（含中文）→ 展示标题；fetch 时 encodeURI
export const DOCS_BUILTIN = [
  { file: '操作流程与建议.md', title: '操作流程与建议' },
  { file: '重构项目需求说明.md', title: '重构需求说明' },
]
