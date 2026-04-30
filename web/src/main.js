/**
 * 智能花盆 — 主页入口
 * 协调 BLE 连接、设置管理、UI 渲染、传感器数据流
 *
 * 更新策略（避免输入卡顿）：
 * - 连接/断开 → 全量渲染
 * - 传感器数据 → 局部更新仪表盘（updateDashboard）
 * - 设置输入 → 仅更新内存状态，不重绘
 */

import { connect, disconnect, readSettings, writeSettings, isConnected } from './ble.js'
import { serializeSettings, deserializeSettings, deserializeSensor, DEFAULT_SETTINGS } from './settings.js'
import { render, updateDashboard } from './ui.js'

// ── 应用状态 ──
let currentSettings = { ...DEFAULT_SETTINGS }  // 当前设置（本地副本）
let currentSensor   = null                      // 最新传感器数据
let connected       = false                     // BLE 连接状态

const app = document.getElementById('app')      // 挂载容器

// ── 全量渲染（仅连接/断开时） ──
function fullRender() {
  render(app, {
    settings: currentSettings,
    sensor: currentSensor,
    connected,
    onConnect:        handleConnect,
    onDisconnect:     handleDisconnect,
    onSaveSettings:   handleSaveSettings,
    onSettingChange:  handleSettingChange,
  })
}

// ── 连接处理 ──
async function handleConnect() {
  try {
    await connect(
      // 传感器数据回调：仅局部更新仪表盘，不重建整个 DOM
      (buffer) => {
        const data = deserializeSensor(buffer)
        currentSensor = data
        updateDashboard(data)  // 仅更新仪表盘卡片内容
      },
      // 断开回调 → 需要全量渲染
      () => {
        connected = false
        currentSensor = null
        fullRender()
      }
    )

    connected = true

    // 连接成功后同步设备设置
    const settingsBuf = await readSettings()
    currentSettings = deserializeSettings(settingsBuf)

    fullRender()
  } catch (error) {
    console.error('连接失败:', error)
    alert(
      '连接失败，请确保：\n' +
      '1. ESP32-C6 已上电且运行\n' +
      '2. 电脑蓝牙已开启\n' +
      '3. 设备未被其他页面占用\n' +
      '4. 浏览器支持 Web Bluetooth (Chrome/Edge)'
    )
  }
}

// ── 断开处理 ──
function handleDisconnect() {
  disconnect()
  connected = false
  currentSensor = null
  fullRender()
}

// ── 保存设置 ──
async function handleSaveSettings() {
  if (!isConnected()) {
    alert('请先连接设备')
    return
  }
  try {
    const buf = serializeSettings(currentSettings)
    await writeSettings(buf)
    showToast('✅ 设置已保存到设备')
  } catch (error) {
    console.error('保存设置失败:', error)
    alert('保存失败: ' + error.message)
  }
}

// ── 设置值变化（仅更新内存状态，不重绘） ──
function handleSettingChange(key, value) {
  currentSettings = { ...currentSettings, [key]: value }
  // 不调用 fullRender() —— 文本框自身已显示用户输入的值
}

// ── 轻量 Toast 提示 ──
function showToast(msg) {
  const toast = document.createElement('div')
  toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 transition-opacity'
  toast.textContent = msg
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 1500)
}

// ── 首次渲染 ──
fullRender()
