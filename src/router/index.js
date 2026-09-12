import { createRouter, createWebHashHistory } from 'vue-router'

// 路由表 = 菜单 / 四象限的单一数据源（§4），菜单与路由不重复维护
export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { title: '首页', icon: 'i-carbon:home', quadrant: true },
  },
  {
    path: '/recognition',
    name: 'recognition',
    component: () => import('@/views/RecognitionView.vue'),
    meta: { title: '识别', icon: 'i-carbon:image-search', quadrant: true },
  },
  {
    path: '/calibration',
    name: 'calibration',
    component: () => import('@/views/CalibrationView.vue'),
    // 标定不进首页四象限（§4 四象限只含识别/历史/数据/导出），但仍进侧栏菜单
    meta: { title: '像素标定', icon: 'i-carbon:ruler', quadrant: false },
  },
  {
    path: '/history',
    name: 'history',
    component: () => import('@/views/HistoryView.vue'),
    meta: { title: '历史记录', icon: 'i-carbon:time', quadrant: true },
  },
  {
    path: '/data',
    name: 'data',
    component: () => import('@/views/DataView.vue'),
    meta: { title: '数据展示', icon: 'i-carbon:chart-bar', quadrant: true },
  },
  {
    path: '/export',
    name: 'export',
    component: () => import('@/views/ExportView.vue'),
    meta: { title: '导出', icon: 'i-carbon:download', quadrant: true },
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
