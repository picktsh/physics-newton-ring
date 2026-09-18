import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  // 相对 base：配合 hash 路由，可放在任意服务器 / GitHub Pages 项目子路径下（勿改回 history 模式，见文档 §11.2）
  base: './',
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 7777,
    open: true,
  },
})
