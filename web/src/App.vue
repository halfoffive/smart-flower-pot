<script setup>
/**
 * 根组件 — 状态编排与组件组合
 *
 * 通过 provide/inject 向子组件注入：
 * - connection: 连接管理（BLE/Serial 切换、传感器数据、设置读写）
 * - theme: 主题管理（浅色/深色/自动三态）
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

onMounted(() => {
  theme.initTheme()
  connection.autoConnectFromUrl()

  // 启动页过渡：淡出旋转指示器，丝滑进入主界面
  const splash = document.getElementById('splash')
  if (splash) {
    splash.classList.add('splash-exit')
    // 动画结束后从 DOM 移除，不阻塞后续操作
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
