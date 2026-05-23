/**
 * Vite 构建配置 — Tauri 桌面/移动客户端
 *
 * 适配 Tauri 开发模式：
 * - 固定端口 1420，与 tauri.conf.json 中的 devUrl 对应
 * - 忽略 src-tauri 目录变更，避免触发前端 HMR
 * - 支持 TAURI_DEV_HOST 环境变量（移动端开发时通过 USB 连接）
 */

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig(async () => ({
  plugins: [
    vue(),
    tailwindcss(),
  ],

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}))
