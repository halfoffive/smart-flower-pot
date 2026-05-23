<script setup>
/**
 * 根组件 — Tauri 客户端版
 *
 * 与 Web 端差异：
 * - onMounted 中调用 autoReconnect()（从 Store 读取上次连接信息自动重连）
 * - 注册 deep-link 监听器（应用运行中收到深度链接时自动连接）
 * - 移除 Service Worker 相关逻辑
 */

import { provide, onMounted } from 'vue'
import { useConnection } from './composables/useConnection.js'
import { useTheme } from './composables/useTheme.js'
import { useToast } from './composables/useToast.js'
import AppHeader from './components/AppHeader.vue'
import ConnectPanel from './components/ConnectPanel.vue'
import Dashboard from './components/Dashboard.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import DisconnectAction from './components/DisconnectAction.vue'
import DeviceInfo from './components/DeviceInfo.vue'

const { showAlert, showToast } = useToast()
const connection = useConnection(showAlert, showToast)
const theme = useTheme()

provide('connection', connection)
provide('theme', theme)

onMounted(async () => {
  theme.initTheme()

  await connection.setupDeepLink().then((hasDeepLink) => {
    if (!hasDeepLink) {
      connection.autoReconnect()
    }
  })

  const splash = document.getElementById('splash')
  if (splash) {
    splash.classList.add('splash-exit')
    splash.addEventListener('transitionend', () => splash.remove(), { once: true })
  }
})
</script>

<template>
  <div class="max-w-lg mx-auto p-4 space-y-4">
    <AppHeader />

    <ConnectPanel v-if="!connection.connected.value" />

    <template v-if="connection.connected.value">
      <Dashboard />
      <SettingsPanel />
      <DisconnectAction />
      <DeviceInfo />
    </template>

    <template v-else-if="!connection.connected.value">
      <SettingsPanel />
    </template>
  </div>
</template>
