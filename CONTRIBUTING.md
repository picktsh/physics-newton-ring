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

- `/`：首页（路由表卡片网格）。
- `/recognition`：上传（压缩）→ 两步识别 → 环列表编辑 / Zoom 补环 → 计算链实时预览 → 写 session + 入历史。
- `/calibration`：双图对齐 / 圆形截取 / 取点 → 标定值写入测量 store（持久化）。
- `/history`：历史记录（2×2 方格）。
- `/data`：导入结果 JSON 回显（与导出互逆）。
- `/export`：构建结果载荷 → 图片 / JSON / CSV / 表格 / 网页。
- session 快照结构约定以 `useMeasureStore.js` 头部注释为唯一来源。

## 提交前自查

- `pnpm lint` 0 错误、`pnpm build` 成功。
- Mat 全释放、存储 key 带前缀、无裸调试输出残留。
- 新增 / 改文档需同步 README 导引表；决策与里程碑写入 `CHANGELOG.md`，待办进其 `[Unreleased]`。
