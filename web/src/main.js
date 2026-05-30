/**
 * 智能花盆 — Vue 3 应用入口
 * 创建 Vue 应用实例并挂载到 DOM
 */

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import './sw-register.js'

const app = createApp(App)

// 全局错误兜底：捕获未被 onErrorCaptured 拦截的错误（如异步 Promise 拒绝、
// 定时器异常等），防止静默失败。生产环境下 console.error 输出到浏览器控制台
app.config.errorHandler = (err, instance, info) => {
  console.error('[全局错误]', err, info)
}

app.mount('#app')
