# 开发手册 · 架构与协作指南

> 通用行为契约见仓库根 [`AGENTS.md`](./AGENTS.md)；项目特有约定见仓库根 [`AGENTS.local.md`](./AGENTS.local.md)；决策来龙去脉与待办见 [`CHANGELOG.md`](./CHANGELOG.md)。本文只讲「当前代码怎么组织、怎么跑、提交前怎么自查」，不重复上述文档。

## AI 协议同步

本仓库的 `AGENTS.md`、`.aiassistant/`、`.trae/rules/`、`.qoder/rules/ai-protocol.md` 四处生成物，均由团队母仓库 [picktsh/ai-protocol](https://github.com/picktsh/ai-protocol) 通过 `npx github:picktsh/ai-protocol` 同步产出。**所有生成物已加入 `.gitignore`，不提交 Git**（属衍生物，像 `dist/`）。

**自动触发（postinstall 钩子）**：`pnpm install` 完成后会自动执行同步命令，写入 4 个生成物 + 更新 `.gitignore` 标记段 + 创建 / 更新 `.aiignore`。同学 clone 后只要跑 `pnpm install`，AI 配置文件就自动落地。离线时静默失败、不阻塞安装，联网后重跑一次即可。

**手动触发**（可选，协议升级 / 换机器时）：

```bash
pnpm sync:ai     # 拉母本覆盖 4 处目标；无变化则静默跳过
```

**约定**：

- **不要**在消费项目手改这 4 个文件；顶部都有 `AUTO-GENERATED` 注释，改了也会被下次 sync 覆盖。
- 想升级协议：向 [picktsh/ai-protocol/AGENTS.md](https://github.com/picktsh/ai-protocol/blob/main/AGENTS.md) 提 PR；merge 后各消费项目重新 install 即自动拉新。
- 项目特有的行为约定：写在本仓库根 [`AGENTS.local.md`](./AGENTS.local.md)（团队共享、随代码提交），不进 ai-protocol 母本。
- AI 临时脚本 / 一次性验证代码 → `.tmp/`（已 gitignore，也写入了 `.aiignore`）。

**JetBrains 用户**（每位成员本地一次性动作）：

- **Junie**：`Settings → Tools → Junie → Project Settings → Guidelines Path` 指向 `<repo>/AGENTS.md`。
- **AI Assistant**：自动读 `.aiassistant/rules.md`，无需配置。

## 目录与模块职责

| 路径 | 职责 |
|---|---|
| `utils/constants.js` | 物理常量 + 存储 key 与治理参数（单一来源） |
| `utils/imageProcessor.js` | 识别主管线：两步式（圆心检测 → 径向剖面识暗环） |
| `utils/ringFitter.js` | 鲁棒环系圆心拟合：背景归一化 + 霍夫/梯度投票粗定位 + 极坐标精修 |
| `utils/imageRegistrator.js` | 像素标定配准：局部精修 / 叠加验证(PSR) / 多环圆心对齐 |
| `utils/canvasDrawer.js` | 覆盖层绘制（环、圆心、交叉验证标记） |
| `utils/interactionHandler.js` | 画布取点/拖拽与表格联动交互 |
| `utils/dataCalculator.js` | 表1/表2/平均/不确定度（逐差法，步长默认 5） |
| `utils/imageCompress.js` | 存入前压缩 |
| `utils/resultIO.js` | 结果序列化单一来源：JSON/CSV/Markdown/HTML，导出与数据页导入互逆 |
| `composables/` | useMenu（路由表驱动菜单）、useTheme、useMeasureStore、useHistoryStore |
| `layouts/` | AppHeader（全宽固定）+ AppSider / AppContent（sticky AppFooter）/ 移动抽屉 |
| `theme/` | 单一色板 palette → CSS 变量 + naive-ui 主题覆盖 |

## 页面与数据流

路由表是菜单 / 首页入口 / 内容页标题的单一来源（`src/router/index.js` 的 `meta`）。当前 7 个页面：

- `/`：首页（循环渲染路由表的功能入口卡片）。
- `/formula`：公式原理（KaTeX 静态速查：等厚干涉、逐差法、不确定度评定步骤）。
- `/recognition`：上传（存入前压缩）→ OpenCV 两步识别（圆心检测 → 径向剖面识暗环）→ 环列表编辑 / Zoom 补环 → 计算链实时预览 → 写 session + 入历史。引擎由业务按需触发（见「关键约定」）。
- `/calibration`：双图对齐 / 圆形截取 / 取点 → 标定值写入测量 store（持久化）。
- `/history`：历史记录（2×2 方格，查看 / 恢复 / 删除 / 清空）。
- `/data`：导入结果 JSON 回显（与导出互逆）。
- `/export`：构建结果载荷 → 图片 / JSON / CSV / 表格 / 网页。

数据结构以源码为唯一来源，不在此复制字段：历史单条结构见 `useHistoryStore.js` 头部注释，session 快照见 `useMeasureStore.js` 头部注释；存储 key 全部收敛在 `utils/constants.js`（统一前缀，新仓无旧数据迁移负担）。

## 关键约定与踩坑

> 这些是「为什么这么配」的沉淀，改动前务必先读、避免重踩；具体实现以源码为准。

### UnoCSS：禁用 attributify
只启用 `presetUno` + `presetIcons`，**禁止 `presetAttributify`**：本项目没有 attributify 写法，而该 preset 会把模板里任意「属性名 + 属性值」当作 utility 候选，导致组件 prop（如图标 prop）被误解析成不存在的图标 utility，产生 Iconify 加载告警并显著扩大 dev 扫描量、拖慢 CSS 生成。图标类名必须以**字符串字面量**写在源码里（UnoCSS 静态提取、不认运行时拼接）；菜单 / 首页卡片图标统一写在 `router/index.js` 的 `meta.icon`，由 `uno.config.js` 把 `src/**/*.js` 纳入扫描。改 `uno.config.js` 或图标用法后需**重启 dev + 硬刷新**验证，防缓存 / HMR 残留误判（旧仓「首页图标不渲染」即为此类，实际配置正常）。

### naive-ui：样式注入顺序
`index.html` 的 head 末尾保留 naive-ui / vueuc 两个样式锚点 meta（顺序不可颠倒、须是 head 最后几个元素）。naive-ui / vueuc 运行时注入的样式会被插到各自锚点 meta **之前**，我们的 UnoCSS / global 样式恒定排在**之后** → 同特异性时以原子类为准，无需 `!important`。机制依据：naive-ui 官网「潜在的样式冲突」与其 css-render 挂载实现。

### naive-ui：配色走主题而非原子类
组件配色优先用 `themeOverrides`（含 `peers.*` 组件级覆盖），例如侧栏底色、页头底色 / 分割线均由 naive-ui 主题键给出，不用原子类去压组件背景。原子类覆盖仅在 naive-ui 无对应主题键时使用。

### 布局：sticky footer
页头全宽固定、其下 `n-layout :has-sider` 左右分栏，页脚在内容区滚动容器内做 sticky footer（不足一屏贴底、内容长则随滚）。要点：min-height + flex 纵向布局需经 `n-layout-content` 的 `content-style` 下推到内部滚动内容；页脚撑开用 `flex-grow`（非 `flex-1`）；半透明只作用于页脚内文字容器而非 footer 本身，否则与侧栏底色混色对不齐。实现见 `layouts/`。

### 部署：相对 base 只在 hash 路由下安全
构建用相对 base + hash 路由（`createWebHashHistory` 不传 base、运行时按 location 推导），产物可原样放任意服务器 / GitHub Pages 子路径。**强约束**：一旦改用 HTML5 history（`createWebHistory`），嵌套路由会让相对资源解析错乱——务必保持 hash。

### OpenCV 加载：业务按需触发
引擎 `public/opencv.js`（~10MB）原样下发、不进打包。历经四次演进（全局预热 → 异步组件并行 → public 脚本 + 路由层预热 → **public 脚本 + 业务按需触发**）：路由层预热会在进页时让主线程解析巨型 UMD 而冻结数秒，且占位态识别页根本不用 cv，故改为真正用到 cv 的业务动作触发、配按钮 loading 态。遗留成本：wasm 实例化瞬间仍有短暂主线程冻结，若需零冻结再评估 Web Worker。Mat 释放与特性检测约定见 `AGENTS.local.md`。

## 提交前自查

- `pnpm lint` 0 错误、`pnpm build` 成功。
- Mat 全释放、存储 key 带前缀、无裸调试输出残留。
- 新增 / 改文档需同步 README 导引表；决策与里程碑写入 `CHANGELOG.md`，待办进其 `[Unreleased]`。
