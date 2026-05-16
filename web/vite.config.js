/**
 * Vite 构建配置
 *
 * 构建产物策略：
 * - assetsInlineLimit: 0 — 所有资源以独立文件输出，不内联为 base64
 *   （便于 Service Worker 按 URL 缓存，提升缓存粒度和复用率）
 * - 输出文件名自动包含内容哈希（Vite 默认行为），
 *   内容变更 → 文件名变更 → CDN/浏览器缓存自动失效
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  build: {
    // 所有资源以独立文件输出，不内联 base64
    // 配合 Service Worker Cache-First 策略，确保每个文件可单独缓存
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
