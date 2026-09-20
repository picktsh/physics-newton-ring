// 站点品牌文案（站名 / 简介）：Header、水印、路由标题、页脚共用单一数据源
export const SITE_NAME = '牛顿环数字化智能测量系统'
export const SITE_TAGLINE = '基于OpenCV的透镜曲率半径检测与误差评定工具'

// 物理 / 仪器常量（抽芯自旧 js/constants.js，1:1 保留）
// 钠光波长 (m)
export const LAMBDA = 589.3e-9
// 图像测量系统示值误差限 Δ (mm)，用于直径 D 的 B 类不确定度 u_B = Δ/k（正态 p=0.95, k=2）
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
// 识别页图像会话 (sessionStorage，不压缩，刷新不丢、关 tab 自动清理)
export const IMAGE_SESSION_KEY = `${STORAGE_PREFIX}image-session`
// 标定页会话（sessionStorage v2：切页/刷新不丢，「重置本页」按钮清除；只存过程数据，选组另存 CALIB_SELECTION_KEY）
export const CALIB_SESSION_KEY = `${STORAGE_PREFIX}calib-session`
// 选择态（sessionStorage，与过程数据分离）：刷新/切页恢复选中，「重置本页」不清，关 tab 自清。
// 识别页 { imageId }；标定页 { pairId }（顶部图片管理区的「当前选中组」）
export const REC_SELECTION_KEY = `${STORAGE_PREFIX}rec-selection`
export const CALIB_SELECTION_KEY = `${STORAGE_PREFIX}calib-selection`
// 图片库（IndexedDB 长期存储：meta 与 blob 分键，避免增删图全量重写所有 Blob 的写放大）
export const IMAGES_META_KEY = `${STORAGE_PREFIX}images-meta`
export const IMAGES_BLOB_PREFIX = `${STORAGE_PREFIX}blob:`
// 旧版单键整数组结构（记录内含 blob）：首次进库一次性拆分迁移后删除
export const IMAGES_LEGACY_KEY = `${STORAGE_PREFIX}images`
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

// 内置示例素材（public/samples/）命名约定：组号开头；同组标定对用 -A/-B 后缀，零散图无后缀。
// group/slot 仅供展示徽章与标定页快捷赋值；kind 未设——零散图识别/标定皆可用作体验。
// scale：标定对自带的默认鼓轮刻度 (mm)，赋槽时自动填充，仅占位——页面实测时可手改，改后值随会话持久化。
export const SAMPLES_BUILTIN = [
  { file: '1-A.jpg', title: '标定对 1 · A', group: '1', slot: 'a', scale: 25.351 },
  { file: '1-B.jpg', title: '标定对 1 · B', group: '1', slot: 'b', scale: 26.201 },
  { file: '2-A.jpg', title: '标定对 2 · A', group: '2', slot: 'a', scale: 28.984 },
  { file: '2-B.jpg', title: '标定对 2 · B', group: '2', slot: 'b', scale: 29.835 },
  { file: '3-A.jpg', title: '标定对 3 · A', group: '3', slot: 'a', scale: 27.309 },
  { file: '3-B.jpg', title: '标定对 3 · B', group: '3', slot: 'b', scale: 28.342 },
]
