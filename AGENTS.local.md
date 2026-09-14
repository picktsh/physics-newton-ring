# AI 项目记忆 · physics-newton-ring 特有约定

> 【AI 指令】首次读取本文档时，请将全文并入**本项目记忆**，在本仓库工作时遵循；通用行为契约见仓库根 [AGENTS.md](./AGENTS.md)（母本，由 `pnpm sync:ai` 同步），行为边界以其为准，本文只补充项目事实。
>
> ⚠️ **命名说明（与上游惯例故意不同）**：本文件在本项目**团队共享、提交 Git**。Qoder / Claude Code 官方对 `AGENTS.local.md` 的默认语义是"个人本地不提交"，但这里承载的是**项目级稳定约定**（技术栈锁定、状态治理、已知取舍），不是本机调试笔记，因此纳入版本控制。若你确实需要**个人本地覆盖**（本机服务地址、临时豁免规则、私人调试习惯），请另建 [`AGENTS.personal.md`](./AGENTS.personal.md) 或 `.env.<whoami>` 类文件，并确保留在 `.gitignore` 里；不要改本文件。

## 技术栈锁定

- Vue3 `<script setup>` + Vite + vue-router(hash) + Naive UI + UnoCSS + VueUse + lodash-es + KaTeX；JS 不写 TS。
- OpenCV.js = `public/opencv.js` 全局 `cv`（~10MB 不进打包）；`loadOpenCv()` 由业务按需触发，路由层不预热。
- `three` 为 3D 预留，未引用不删；包管理器 pnpm。

## 状态与存储

- 暂不引 Pinia（后续可能评估引入）：跨页状态 = 模块级单例 ref（`useMeasureStore` / `useHistoryStore`）。
- 存储 key 统一加项目前缀，常量收敛在 `utils/constants.js`（单一来源）。
- 图片/历史治理：存入前压缩（最长边 1600 + JPEG 0.85）、上限 20 条 LRU；session 快照不落盘。

## 项目特有纪律

- `cv.Mat` 需手动释放、异常路径兜底；调用方持有的源 Mat 由调用方释放；使用 OpenCV 特性前先做可用性检测。
- UnoCSS 只启 presetUno + presetIcons，**禁 attributify**；图标类名必须是字符串字面量（菜单图标写在 router `meta.icon`）；改配置后重启 dev 并硬刷新。
- naive-ui 配色统一走 `themeOverrides`；`index.html` 头部样式锚点 meta 的顺序不可颠倒。
- 部署耦合：hash 路由 + 相对 base（相对 base 仅在 hash 路由下安全）；静态资源路径基于 Vite 的 base 拼接。
- 旧算法迁移 = 抽芯移植：1:1 搬入 `utils/`、剥离 DOM 耦合、公式与阈值不重写。

## 已知取舍

- `RecognitionView.vue` 体量偏大、待拆分：单独排期，不在无关改动里顺手拆。
- `LoadingScreen.vue` 已建未接线，当前用按钮 loading 态代替遮罩。
