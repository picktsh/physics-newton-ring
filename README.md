# physics-newton-ring · 牛顿环测量工具

> 基于 Vue 3 的牛顿环照片测量前端工具：上传干涉条纹图 → 自动识别环心与暗环 → 人工核对 → 计算半径 / 不确定度 → 导出结果。
> 本 README 只解决「怎么跑起来」；架构与协作见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)，决策历史与待办见 [`CHANGELOG.md`](./CHANGELOG.md)。

## 环境要求

- Node.js ≥ 20（开发环境为 22.x）
- 包管理器统一使用 **pnpm**（不要用 npm / yarn，避免污染 lockfile）
- pnpm 版本约束 **`>=10 <11`**（以 `package.json` 的 `engines` / `packageManager` 为准）；`pnpm-lock.yaml` 为 `lockfileVersion 9.0`，pnpm 9/10 通用，**禁用 pnpm ≤ 8**（会因读不了新 lock 而安装失败）

## 快速开始

```bash
pnpm install     # 安装依赖（postinstall 钩子自动同步 AI 协作契约，无需额外操作）
pnpm dev         # 开发服务器 http://localhost:5173
pnpm build       # 构建产物到 dist/
pnpm preview     # 预览构建产物
pnpm lint        # ESLint 自动修复
pnpm format      # Prettier 格式化 src
```

> **AI 协议文件说明**：`pnpm install` 完成后，`postinstall` 钩子会自动拉取团队母本 `picktsh/ai-protocol`，写入 `AGENTS.md` / `.aiassistant/rules.md` / `.trae/rules/project_rules.md` / `.qoder/rules/ai-protocol.md`（均已 `.gitignore`，不提交）。也可手动 `pnpm sync:ai` 触发。详见 [CONTRIBUTING.md](./CONTRIBUTING.md#ai-协议同步)。

## 目录速览

```
src/
├── components/   # 可复用展示组件
├── composables/  # use* 组合式函数与跨页共享状态
├── layouts/      # 布局壳
├── router/       # 路由表（菜单由路由 meta 驱动）
├── theme/        # 单一色板与主题派生
├── utils/        # 纯逻辑 / 算法（与 Vue 解耦，含 OpenCV 图像处理）
└── views/        # 页面组件
public/opencv.js  # OpenCV.js（全局 cv）
```

## 部署

- 构建采用相对 base + hash 路由：`dist/` 可丢到任意静态服务器或 GitHub Pages 子路径直接运行。
- 自动部署见 `.github/workflows/jekyll-gh-pages.yml`。

## 文档导引

| 文档 | 面向 | 内容 |
|---|---|---|
| [AGENTS.md](./AGENTS.md) | AI（项目根） | AI 协作契约；Qoder CN / Trae / Codex 等自动识别，JetBrains Junie 需在设置里指一次路径；AI Assistant 走 `.aiassistant/rules.md` |
| [AGENTS.local.md](./AGENTS.local.md) | AI（项目根） | 本项目特有约定（技术栈 / 状态 / 取舍）；团队共享并提交，与上游“local=个人本地”惯例故意不同，见文件顶部说明 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 开发者 | 架构、模块职责、数据流、AI 协议同步、提交前自查 |
| [CHANGELOG.md](./CHANGELOG.md) | 人 | 关键决策、里程碑、待办（`[Unreleased]`）|

> 仓库根的 `README / CONTRIBUTING / CHANGELOG / AGENTS*` 是与代码并列的元信息文档；新增文档请统一放仓库根并在上方导引表登记。
