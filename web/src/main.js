/**
 * 智能花盆 — Vue 3 应用入口
 * 创建 Vue 应用实例并挂载到 DOM
 */

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './sw-register.js'

createApp(App).mount('#app')
