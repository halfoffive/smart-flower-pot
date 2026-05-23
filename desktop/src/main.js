/**
 * 智能花盆 — Tauri 客户端 Vue 3 应用入口
 *
 * 与 Web 端差异：
 * - 移除 Service Worker 注册（Tauri 不需要）
 */

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
