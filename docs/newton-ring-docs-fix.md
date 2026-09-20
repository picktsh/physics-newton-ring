# physics-newton-ring 文档中心修复交接单

> 供 physics-newton-ring 项目的 AI 工具执行。
> 背景：physics-rlc 的「文档中心」是从本项目移植而来，rlc 侧后续发现并修复了两个问题、增强了两项能力；本项目存在**完全相同的缺陷**，且有一项功能属于原设计应有、当时验收遗漏。以下按本项目的实际目录结构给出方案，共 4 项，**均为必做**。
> 前提核实：本项目实装 naive-ui **2.45.3**（package.json 写 ^2.39.0，实际安装已到 2.45.3）。

## 本项目关键文件路径

| 作用 | 路径 |
| --- | --- |
| 文档中心视图 | `src/views/DocsView.vue` |
| 文档 store | `src/stores/docs.js` |
| 文档常量（DOCS_BUILTIN / DOCS_TABS_KEY 等） | `src/utils/constants.js` |
| 内置 md 静态目录 | `public/docs/` |
| 存储前缀 | `STORAGE_PREFIX = 'physics-newton-ring:'`（constants.js） |

---

## 修复 1（必做）：tab 上的 × 点了没反应

**根因**：naive-ui 2.45.3 把 `n-tabs` 的关闭事件从 `@remove` **改名为 `@close`**（源码 props 只剩 `onClose`，`onRemove` 已删除）。`DocsView.vue` 写的是老事件名 `@remove`，Vue 对不存在的事件静默忽略，故点 × 无效。

**改法** — `src/views/DocsView.vue`（约 245 行）：
```diff
-      @remove="onTabRemove"
+      @close="onTabRemove"
```

**注意**：同文件里 `n-alert` 上也有一处 `@close="dismissImgAlert"`，那是 alert 的关闭事件，**与本修复无关，绝对不要动**。只改 `n-tabs` 上的那一个。`@add` 在该版本未改名，保持不动。

---

## 修复 2（必做）：把仓库根 CHANGELOG.md 挂进文档中心

**目的**：内置文档篇目偏少，用 Vite 原生 `?raw` 把根目录 `CHANGELOG.md` 作为一篇内置文档展示，**不移动文件、单一数据源、构建期切成独立异步 chunk、dev 改文件热更新**。

### 2a. `src/utils/constants.js` — DOCS_BUILTIN 增加一条

保留原有条目，追加一行。`?raw` 的相对路径以 constants.js 所在位置（`src/utils/`）为基准，到项目根是 `../../`：
```js
export const DOCS_BUILTIN = [
  { file: '操作流程与建议.md', title: '操作流程与建议' },
  { file: '重构项目需求说明.md', title: '重构需求说明' },
  { file: 'CHANGELOG.md', title: '更新日志', getRaw: () => import('../../CHANGELOG.md?raw').then((m) => m.default) },
]
```

### 2b. `src/stores/docs.js` — fetchOne 支持 getRaw 分支

原 `fetchOne` 是纯 fetch。把「取文本」一步改成条件分支，其余（存 content、异常处理）保持不变。存 content 时对文本做 `String(text).replace(/^\uFEFF/, '')` 兜底：
```js
async function fetchOne(b) {
  builtinState.value = {
    ...builtinState.value,
    [b.file]: { loading: true, error: null, content: '' },
  }
  try {
    let text
    if (b.getRaw) {
      // 带 getRaw 的条目走 ?raw 构建期内联（适合仓库根文件，不必拷进 public）
      text = await b.getRaw()
    } else {
      const url = `${import.meta.env.BASE_URL}docs/${encodeURIComponent(b.file)}`
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      text = await res.text()
    }
    builtinState.value = {
      ...builtinState.value,
      [b.file]: { loading: false, error: null, content: String(text).replace(/^\uFEFF/, '') },
    }
  } catch (e) {
    builtinState.value = {
      ...builtinState.value,
      [b.file]: { loading: false, error: e.message || String(e), content: '' },
    }
  }
}
```

> 若本项目 fetchOne 的变量名 / 结构与上面略有出入，按「有 getRaw 就 await 拿文本、否则走原 fetch」的思路对齐即可，不要整段覆盖导致丢失本项目自己的差异逻辑。

---

## 修复 3（必做）：刷新后记住当前激活 tab

此项属于原设计应有能力，此前验收不到位遗漏了（× 失效同源，当时本地 tab 关不掉，刷新记忆也没被真正检查）。

- `src/utils/constants.js` 新增：
```js
// 当前激活 tab key 的会话记忆：刷新后停在原阅读位置；指向已消失的 local tab 时回退首篇内置
export const DOCS_ACTIVE_KEY = `${STORAGE_PREFIX}docs-active`
```
- `src/stores/docs.js`：`const activeKey = ref(...)` 改为 useSessionStorage（从 `@vueuse/core` 引入，本项目已有该依赖）：
```js
const activeKey = useSessionStorage(DOCS_ACTIVE_KEY, `builtin:${DOCS_BUILTIN[0].file}`)
```
- store 初始化 `hydrate()` 之后加校验：持久化的 key 若是 `local:` 前缀但已不在 `localTabs` 中（transient/zip 类不落盘、或已被关闭），回退首篇内置，避免停在幽灵 tab 白屏：
```js
hydrate()
if (
  activeKey.value.startsWith('local:') &&
  !localTabs.value.some((t) => t.key === activeKey.value)
) {
  activeKey.value = `builtin:${DOCS_BUILTIN[0].file}`
}
```

---

## 修复 4（必做）：CHANGELOG.md 顶部提示统一化

两个姊妹项目已约定统一的头部门楣（合并双方旧版优点与 Keep a Changelog 社区实践：规范分类、最新在上、「提交即发布」口径、面向人类的条目纪律、与其他文档的职责分工）。请把 `CHANGELOG.md` 顶部从 `#` 标题到第一个章节标题前的整段说明替换为：

```markdown
# Changelog

> 本项目所有值得关注的改动记录于此，按 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/) 规范分类，最新在上。
> 站点提交即发布，不编语义化版本号：条目按发布日期（YYYY-MM-DD）归组，未发布的改动置于顶部 `[Unreleased]`。
> 写给人看，不是机器 diff：每条只回答「改了什么、为什么、还差什么」，不展开文件路径与代码细节（存量条目不追溯改写）。运行方式与现行架构见 README 及相关文档。
```

只替换头部说明区，**不要动既有条目内容**。

---

## 验收（改完务必自证）

1. `pnpm build` 通过；产物应出现独立的 `CHANGELOG-*.js` 异步 chunk（说明 ?raw 生效）。
2. 浏览器打开文档中心：
   - 拖入一个 .md → 生成 tab → 点 × → **tab 消失、激活态回退**（修复 1）。
   - 「更新日志」tab 能渲染 CHANGELOG 内容、右侧 TOC 正常（修复 2）。
   - 切到某 tab 后刷新 → 仍停在该 tab；新开标签页 → 回到首篇（修复 3）。
   - 关闭全部本地 tab 后刷新 → 停在内置文档、无白屏（修复 3 的回退校验）。
3. `CHANGELOG.md` 头部为统一门楣、既有条目原样（修复 4）。
4. 无控制台报错。

## 通用教训（供本项目 AI 参考）

跨仓库移植组件库代码时，事件名 / props 以**本地 node_modules 实际产物**为准，不要照搬参照项目。可用
`grep -nE "on[A-Z][a-zA-Z]+:" node_modules/naive-ui/es/<组件>/src/*.mjs` 核对当前版本真实签名。本项目若还有其他从旧版 naive-ui 移植的组件，建议一并排查同类 API 漂移。
