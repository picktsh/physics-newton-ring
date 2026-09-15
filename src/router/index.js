import { createRouter, createWebHashHistory } from 'vue-router'

// 路由表 = 菜单 / 首页入口 / 内容页头部的单一数据源（§4），不重复维护
// meta.description：一句话功能说明，同时用于首页卡片文案与内容区大标题下的副标题
export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: {
      title: '首页',
      icon: 'i-carbon:home',
      description: '基于逐差法与不确定度评定的牛顿环曲率半径测量 · 选择一个功能开始',
    },
  },
  {
    path: '/formula',
    name: 'formula',
    component: () => import('@/views/FormulaView.vue'),
    // 静态公式原理速查页：仅进侧栏菜单，首页卡片按路由表顺序一并渲染
    meta: {
      title: '公式原理',
      icon: 'i-carbon:education',
      description: '等厚干涉原理、逐差法公式与不确定度评定步骤的静态速查',
    },
  },
  {
    path: '/recognition',
    name: 'recognition',
    component: () => import('@/views/RecognitionView.vue'),
    meta: {
      title: '识别',
      icon: 'i-carbon:image-search',
      description: '上传牛顿环图像，自动识别圆心与暗环，人工核对后计算曲率半径',
    },
  },
  {
    path: '/calibration',
    name: 'calibration',
    component: () => import('@/views/CalibrationView.vue'),
    // 标定不属于主流程四步，但同样进菜单与首页入口
    meta: {
      title: '像素标定',
      icon: 'i-carbon:ruler',
      description: '标定像素与毫米的换算比例，为环半径测量提供长度基准',
    },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
    meta: {
      title: '历史记录',
      icon: 'i-carbon:time',
      description: '查看、恢复、删除历史测量记录（本地留存，最多 20 条）',
    },
  },
  {
    path: '/data',
    name: 'data',
    component: () => import('@/views/DataView.vue'),
    meta: {
      title: '数据展示',
      icon: 'i-carbon:chart-bar',
      description: '导入测量结果 JSON，回显表1/表2 与不确定度评定明细',
    },
  },
  {
    path: '/export',
    name: 'export',
    component: () => import('@/views/ExportView.vue'),
    meta: {
      title: '导出',
      icon: 'i-carbon:download',
      description: '将当前测量结果导出为图片 / JSON / 表格 / 网页 / CSV',
    },
  },
  {
    path: '/docs',
    name: 'docs',
    component: () => import('@/views/DocsView.vue'),
    // 文档中心：内置 3 篇用户向手册 + 本地 md/zip 拖入预览 + 4 种导出（md/doc/png/print）
    meta: {
      title: '文档中心',
      icon: 'i-carbon:documentation',
      description: '内置手册与通用 Markdown 查看器 · 支持拖入 md/zip、导出 md/doc/png/打印 PDF',
    },
  },
]

const router = createRouter({
  // 不传 base：由 vue-router 按当前 location 推导，放哪台服务器都对（配合 base:'./'，见文档 §11.2）
  history: createWebHashHistory(),
  routes,
})

// 标题联动（§9）
router.afterEach((to) => {
  const base = '牛顿环测量工具'
  document.title = to.meta?.title ? `${to.meta.title} · ${base}` : base
})

export default router
