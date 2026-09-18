# 更新日志

> 本项目不追求语义化版本发布，本文按里程碑**倒序**沉淀关键决策与演进；待办与已知差异集中在顶部 `[Unreleased]`，遵循 [keepachangelog](https://keepachangelog.com/zh-CN/1.1.0/) 的分类精神。
> 现行架构与模块职责见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)；如何跑起来见 [`README.md`](./README.md)；本文只记「为什么这么做、走到哪一步、还差什么」。

## [未发布]

### Added / Changed / Fixed（2026-09-18 RingCanvasViewer 缩放渲染重构 + 全屏放大语义修正）

- **缩放档位量化**：`ZOOM_STEP=1.4` 几何级数 → `ZOOM_SNAP=0.25` 线性档位（0.5/0.75/1/1.25…，每次 ±一档）；非档位值时 `+` 进到最近档、`−` 退到最近档；缩小下限 `scaleMin` 钳到不超过原图 1x（窄图不强制放大），`fitWidth` 对小图退化为原尺寸。
- **渲染方案钉死原尺寸**（核心，详见 `AGENTS.local.md` 巨坑条目）：canvas backing 钉死为图像原始像素、坐标恒等映射、零 `setTransform`，缩放全交 CSS（canvas 与 img 同一内容层容器、`w-full h-full` 随容器拉伸），线宽/字号用 `unit=1/scale` 补偿恒定屏幕粗细；取舍「位置绝对正确 > 高倍率发糊」。移除 `resetView` / `initialCrop` / `onScroll` 及 `stageRef`（视口测量改 `scrollRef`）。
- **全屏放大 = 纯视图放大**：交互模式按 `centerPhase` 与内联视图镜像（`interactive`/`center-draggable`/`show-center`），不再硬绑「补环」——核对圆心阶段放大后拖拽即设圆心；弹窗标题 `zoomTitle` 随阶段动态；删除 `zoomCrop`/`computeZoomCrop`/`zoomCanUse`，全屏按钮不再禁用。
- **圆心确认悬停反馈**：新增 `drawCenterPreview`，核对圆心时鼠标悬停在光标处绘制半透明十字 + 虚线圆（臂长跟随 `crossArm`），按下前可预判落点（参考补环悬停高亮）。
- **重置本页回核对圆心**：`resetPage` 清过程数据后，工作图仍在时立即重跑 `processImage` 自动检测圆心回到 `awaiting-center`（此前停在 `idle` 且同图重选被短路，用户无从继续）。
- **工具栏 UI**：按钮图标化 + `NTooltip` 说明（含键盘提示），窄屏横向滑动隐藏滚动条。

### Added / Changed / Fixed（2026-09-18 图片库与会话持久化重构 → 状态层 Pinia 化，一至六轮合并）

- **图片库 IndexedDB 化**：`stores/imageLibrary` meta/blob 分键（`nr:images-meta` + 每图一键 `nr:blob:<id>`，官方 `useIDBKeyval` + `idb-keyval`，旧单键数据首载自动拆分迁移）；原图不压缩直存、objectURL 统一缓存删除时 revoke；顶部 `ImageTray` 图片条（拖入入库 / 点选 / 清空 / 单图删除，IDB 不可用降级仅内存并提示）；示例素材迁 `public/samples/`、`SAMPLES_BUILTIN` 单一数据源；新增 `SamplePicker` 示例选择器，示例与上传图分离（预览直读 public 路径、选中才幂等入库、可整组赋 A/B 带默认鼓轮刻度）。
- **会话持久化与刷新恢复**：识别页 imageSession / 标定页 calibSession 过程数据全量防抖写（截取图不存、恢复时确定性重跑 cropSquare）；两页「重置本页」只清过程数据；选择态独立键 `rec-selection {imageId}` / `calib-selection {pairId}`（刷新/切页恢复、关 tab 自清，旧键 `calib-images` / `calib-points` 同步移除）；换选即旧过程会话作废。
- **标定页组卡化 + 内容寻址**：记录新增 `pairId`（同 pairId + slot a/b = 一组），assignMode 按组渲染组卡（A/B 双框 + 缺图虚线占位 + 点击处来源菜单 + × 退组，落槽交互由 radio 改点击处菜单）；imageId 改 SHA-256 内容寻址（同图同 id 幂等入库），groupId 由成员 imageId 组合派生（`pairIdFor`，同一组合重建后组不变、旧会话可再锚定）。
- **三个「刷新不恢复」根因修复**：① `loadLibrary` 改 promise 单例（布尔守卫竞态在空库上误判「原图已删」清会话）；② 识别页恢复锚点回退 `recSelection.imageId → saved.imageId`；③ **sessionStorage `[object Object]` 根因**——`useStorage` 按默认值类型推断序列化器，默认 `null` 落 `'any'`（`write = String(v)`），对象键自引入起即写坏，为历次「刷新不恢复」共同根因；四键显式传 JSON serializer + 模块加载一次性清理残留（残留信息不可恢复，当前会话需重做一遍）。
- **状态层 Pinia 化**（推翻「暂不引 Pinia」旧决策，用户拍板）：`src/stores/` 四个 setup store（measure / imageLibrary / history / docs），旧模块级单例 composable 删除，约 12 处消费点迁移（state 经 `storeToRefs`、actions 从 store 解构）；useMenu / useTheme 保留 composable；`main.js` 挂 `createPinia()`；新增运行时依赖 `pinia`。
- **交互与 UI**：识别视图工具栏新增「适应宽度 / 原始尺寸」（默认适应宽度）；标定页操作流程卡可折叠；缩略图角标实底白背景、删除钮常显（触屏可点）；识别页上传入口恢复按钮（移动端必需）。
- **关键取舍与 Fixed**：IDB 封装手写改官方（二轮推翻一轮）；原图不压缩（标定像素口径）；OpenCV 红线（算法层零改动）；修复图片库误报「IndexedDB 不可用」（响应式 Proxy 过 structured clone 抛 DataCloneError，入库前 toRaw）；回滚 `public/docs/` 越权上移。

### Changed / Fixed（2026-09-18 锁屏密码输入优化）

- **手机端唤起纯数字键盘**：`AccessLock` 输入框透传 `inputmode="numeric"` + `autocomplete="one-time-code"`（OTP 口径），保留 password 掩码。
- **非数字字符残留修复**：过滤后与原值相同时 Vue 不重渲染，原生框会残留非法字符；改为下一帧强制回写，框内永远只显示数字。
- **锁屏卡片样式**：遮罩底色 layout→base（浅色下两者同为纯白导致卡片隐形）、卡片加边框+阴影，输入框/按钮统一 large 尺寸。

### 待办 / 已知差异（非阻塞）

1. 标定页辅助对齐圆环（guide rings）未做。
2. 实时重合度残差 → 改为按需「检查对齐」返回 PSR。
3. 页面自检调试钩子未做（建议可略）。
4. 识别页「导入标定图 A/B」跨页按钮未做。
5. 步骤条组件 → 已改自定义两步流程 UI（待定是否补回）。
6. LoadingScreen 接线待定（当前用按钮 loading 态代替遮罩）。
7. 若要消除 OpenCV wasm 实例化瞬间的主线程冻结 → 评估迁移 Web Worker。
8. 识别页牛顿环图拖入缺「松手提示」遮罩（与文档中心 Drop 交互对齐）。
9. 存储层容量：历史记录 base64 仍可能顶爆 localStorage（~5 MB）→ 后续评估（图片库已迁 IndexedDB、跨页状态已六轮上 Pinia）。
10. 死代码清理：`interactionHandler.initDragDrop`（页面级拖入被图片条取代后已无引用）。

### 口径待定稿

- 识别算法细节阈值（环级数范围、半径精度、圆心允许偏差）。
- 导出表格 / 网页视图的列与样式。

## 2026-09-15 · 识别页重构：RingCanvasViewer 组件抽取 + 全屏放大重设计 + 会话持久化

### Added

- **`src/components/RingCanvasViewer.vue`**：独立的「底图 + canvas 标注 + 顶部工具栏 + 交互」组件，同时服务 inline 视图和全屏弹窗，通过 `fullscreen` prop 切换布局策略。
- **sessionStorage 图像会话持久化**：`useMeasureStore` 新增 `imageSession`（不压缩、刷新不丢、关 tab 自动清理），识别页 `onMounted` 自动恢复上次状态。
- **工具栏**：缩放 +/-、倍率显示、复位、彩色/灰度开关、光标坐标 + 半径信息，统一在顶部。

### Changed

- **放大弹窗**：从 `95vw + max-w-6xl + 70vh` 改为 `100dvw × 100dvh` 全屏；`content-style="padding:0"` 消除 naive-ui card 内边距。
- **缩放方式**：移除滚轮缩放（与页面滚动冲突），改为仅工具栏按钮 +/- 控制。
- **布局模式**：从 transform 定位改为原生滚动容器（`overflow: auto`），canvas 始终视口大小，绘制 transform 使用 `-scrollLeft/-scrollTop` 偏移，图像与 canvas 坐标严格对齐。
- **UI 板块始终可见**：移除 `v-if="imgState.src"` / `v-if="centerPhase === 'done'"` 条件，改为始终渲染 card 骨架 + 空态提示文字 + 禁用控件。
- **RecognitionView 瘦身**：1208 → ~700 行，全部 zoom/canvas/interaction 逻辑迁入组件。

### 关键取舍

- **不用 Teleport**：全屏放大通过 `v-if` 切换渲染位置（inline vs modal），避免 naive-ui modal 层叠上下文 + scoped style 边界问题。
- **sessionStorage 不压缩**：牛顿环实验图通常 1–3 MB dataURL，在 5 MB 配额内；超限时 graceful 降级（不存，不阻断流程）。
- **inline 视图用 `aspect-ratio`**：容器高度随图片比例自适应，放大后出滚动条，不硬编码 vh 值。

### 死代码（待后续清理）

- `interactionHandler.js`：`initCanvasInteraction` / `onTableRowHover` / `onTableRowLeave` / `initCenterAdjustInteraction` 已无引用。
- `canvasDrawer.js`：`drawDetectionResults` / `drawCenterOverlay` 已无引用。

## 2026-09-15 · 文档中心（内置手册 + 通用 MD 查看器）

### Added

- **`/docs` 文档中心**：内置 3 篇用户向手册（`public/docs/`，中文名保留） + 本地 md/zip 拖入预览，菜单/首页卡片自动纳入。
- **通用 MD 查看器**：拖入或点选 `.md/.markdown/.txt` → 新建 tab；`.zip` 自动展开（fflate）并提取同包内相对路径图片转 objectURL 映射到 md；`.pdf` / 图片类 → `window.open` 新窗口原生预览，不占 tab。
- **去重定位**：新加入内容若与已有 tab 完全一致 → 激活既有，不重复建；同名不同内容 → `basename (n).ext` 后缀区分。
- **会话暂存**：本地 tab 序列化到 `sessionStorage`（前缀 `physics-newton-ring:docs-tabs`），刷新保留、手动 `×` 清除；单 tab > 1 MB 或总量 > 3 MB → 自动转 `transient`，文档顶部温和提示「刷新会丢失」但不阻断预览；zip tab 一律 transient（objectURL 生命周期只在内存）。
- **导出 4 件套**：`.md` 原文（零依赖） / `.doc`（Word 兼容的 application/msword + BOM，免引 html-to-docx） / `.png`（html2canvas 懒加载） / **打印另存 PDF**（`window.print()` + `@media print` visibility 隔离，中文/公式完美）。
- **TOC + 锚点**：markdown-it-anchor 中文友好 slugify，右侧 sticky TOC（≥ 2 项时显示，lg 断点以上），点击 `scrollIntoView` 平滑跳转。
- **图片错误降级提示**：拖入的 md 有相对图片失败时 → 一次性 `NAlert closable` 引导改用 zip 打包（同一 tab 关闭后不再弹）。

### Changed

- `src/utils/constants.js` 新增 `DOCS_TABS_KEY` / `DOCS_TAB_PERSIST_MAX_BYTES` / `DOCS_TABS_TOTAL_MAX_BYTES` / `DOCS_ZIP_MAX_BYTES` / `DOCS_BUILTIN`；`DOCS_BUILTIN` 是内置文档元数据的单一来源（文件名 ↔ 展示标题），router 与 fetch 都从这里读。
- `src/styles/global.css` 追加 `.markdown-body` 排版样式 + `@media print` 打印隔离规则。

### 新增依赖

| 包 | 用途 | 备注 |
|---|---|---|
| `markdown-it` + `markdown-it-anchor` + `@vscode/markdown-it-katex` | MD 渲染栈，公式复用已装 katex | 常规包 |
| `html2canvas` | DOM → PNG | 动态 `import()` 懒加载 |
| `fflate` | ZIP 解压 | 动态 `import()`，~7 KB gzip |

> 初稿曾计划 `html-to-docx`（~50 KB + Node polyfill 风险），实现时改用 Word 直接打开的 `application/msword` MIME HTML，零依赖且对齐原始需求里的「doc」叫法。

### 关键取舍

- **md 源加载 = 运行时 fetch**（`public/docs/*.md` + `${BASE_URL}docs/${encodeURIComponent(name)}`）：改文档不需重新 build，代价是必须用 BASE_URL 拼相对路径（项目已有 favicon/logo 同款先例）。
- **PDF 导出 = 浏览器打印**：`jspdf + html2canvas` 方案中文会变图、体积大、分页难看，效果不如浏览器原生「另存为 PDF」，不引。
- **文件名保留中文**：内置 3 篇用中文文件名 + `encodeURI` fetch；本地拖入用 File 对象原生 `name`；下载全走 `<a download>`（HTML5 原生支持 UTF-8 文件名），避免 slug 映射层维护成本。
- **不引** `md-editor-v3`（内置编辑器 UI 冗余）、`marked`（插件生态薄）、`highlight.js`（当前文档以中文叙述为主，视觉收益低）、`file-saver`（`<a download>` 足够）、`DOMPurify`（威胁模型是自伤）。

### Fixed（首轮验收后的 5 项修正）

- **打印/PDF 偏移与截断**：旧 `@media print` 用 `position:absolute` + visibility 把 `[data-doc-body]` 拉回左上角，但逃不出 `BasicLayout` 的 `overflow:hidden` + naive-ui `n-scrollbar` 祖先 → 偏移、内容看不全。改为把当前文档**克隆到 `<body>` 末尾的 `.print-doc-host`**（同文档，KaTeX 字体/相对图片/blob 图/mermaid SVG 全复用），打印时隐藏除它以外的所有 body 子节点，内容从页首正常流动、自然跨页。
- **流程图显示为字符**：文档含 ```` ```mermaid ```` 的 `graph TD`，markdown-it 不识别。新增 `mermaid` 依赖（懒加载、独立 chunk、仅含流程图时按需拉），`markdownRenderer` 加 mermaid fence 规则输出 `<div class="mermaid">`，`mermaidRunner` 在 DOM 挂载后按深浅主题 `mermaid.run` 转 SVG。
- **导出按钮太散**：右上角 4 个平铺按钮收拢为 `NButton`「导出」+ `NDropdown`（click 触发，二级选 md/doc/png/print）。
- **PNG 缺水印**：屏幕水印是 `<n-watermark fullscreen>` 固定覆盖层、非 doc-body 子节点，html2canvas 截不到。新增 `watermark.js` 单一来源生成平铺旋转文字水印，png（canvas `createPattern` 叠加）/ doc / 打印三处复用；**导出水印始终附加**（与可关闭的屏幕水印解耦，「关水印需二次密码」为后续构思未实现）。附带 png 导出统一浅底避免深色主题下全黑。
- **按钮/标签样式**：手搓的 tab 栏改用 `NTabs(type="card" addable)` + `NTabPane`（`addable` 的 + 触发本地导入、本地 tab `closable`、`@remove` 关闭），工具条统一 naive-ui 组件。

> 说明：`.md` 原文导出保持源码不变（纯文本塞水印会污染内容）；`.doc` 水印为 Word HTML 背景层 best-effort，不同 Word 版本对固定背景支持不一。

## 2026-09-15 · 不确定度口径改为 p=0.95 / k=2 + 菜单文案调整

### Changed

- 不确定度评定的置信概率由 p=0.683 改为 **p=0.95**，包含因子由 k=1 改为 **k=2**；计算方法（A+B 五步、修约规则）不变。
- 两处口径同时受影响并统一：仪器 B 类 `u_B = Δ/k`（Δ=0.002 mm 不变）与扩展不确定度 `U = k·u_C`。
- k 收敛为单一数据源 `COVERAGE_K`（`src/utils/constants.js`），计算层与展示层均引用，不再散落硬编码。
- 结果表 / 公式速查页 / CSV·Markdown·HTML 导出的文本与 LaTeX 同步为新口径；直径 B 类显示为 `√2·(Δ/k)`（k≠1 后原简化写法不再成立）。
- 「起源与关键决策」表 ④ 中的 p=0.683、k=1 为迁移当时快照，**以本条为准**。
- 菜单文案：「识别」→「识别环纹」、「导出」→「导出结果」。改路由表 `meta.title` 一处，菜单 / 内容区大标题 / 首页卡片 / 浏览器 tab 四处同步（沿用单一数据源，不新增 menuTitle 字段）；页面内局部标题与按钮文案按最小改动原则不动。

## 2026-09-14 · 公式速查页 + 导航组件化

### Added

- 新增 `/formula`「公式原理」静态速查页（KaTeX 渲染等厚干涉 / 逐差法 / 不确定度评定步骤）。

### Changed

- 侧栏导航抽出为独立组件、页头 Logo 上移；页面总数 6 → 7（首页卡片与菜单均由路由表自动纳入，无需手改）。

## 2026-09-13 · 布局重构 + 迁移快照

### Changed

- 布局重构：页头全宽固定、拆分为五布局组件；sticky footer 经内容区下推实现；菜单 / 二维码 / 首页卡片均由路由 meta 单一来源驱动。
- OpenCV 加载策略收敛为「业务按需触发」（演进路径：全局预热 → 路由层预热 → 业务按需）。

### Added

- 迁移抽芯完成：6 页面 + 共享层 + 算法层全部就位；ESLint 0 错误、构建成功。
- MVP-0 地基一次配齐；5 个真实路由占位页；naive-ui 采用显式 import。

## 起源与关键决策

旧仓 `newton-ring`（vue3 分支）完成方案验证后，因工作区污染弃用，**代码不整体迁移**；仅需求文档与 `public/` 静态资源带入新仓 `physics-newton-ring`。

| 决策 | 结论 |
|---|---|
| 部署 | 纯静态无后端，GitHub Pages；hash 路由 + 相对 base（相对 base 仅在 hash 路由下安全） |
| 技术栈 | JS 不 TS（维护成本 + 旧算法零摩擦移植）；pnpm；ESLint flat + Prettier |
| 状态管理 | 不引 Pinia，用 useStorage / 模块级单例 |
| 识别交互 | 画布「点击空区/环上弹提示加改环」→ 改为 Zoom 放大模态补环 + 环列表勾选/悬停联动；NSteps 步骤条 → 自定义两步流程 UI（等价取舍，已实现）|
| 业务迁移七项 | ① 像素标定完整迁移 ② 算法抽芯 1:1 ③ 导出全保留、JSON 与导入互逆 ④ 不确定度 A+B 五步（p=0.683、k=1、Δ=0.002）与修约 1:1 ⑤ 逐差法步长 5 ⑥ 存储前缀 + 压缩 + LRU ⑦ access-lock 软锁（2026-09-25 自动失效） |
