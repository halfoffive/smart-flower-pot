/**
 * 智能花盆 — 主页入口
 * 协调 BLE 连接、设置管理、UI 渲染、传感器数据流
 *
 * 更新策略（避免输入卡顿）：
 * - 连接/断开 → 全量渲染
 * - 传感器数据 → 局部更新仪表盘（updateDashboard）
 * - 设置输入 → 仅更新内存状态，不重绘
 */

import './sw-register.js'
import { connect, disconnect, readSettings, writeSettings, isConnected } from './ble.js'
import { serializeSettings, deserializeSettings, deserializeSensor, DEFAULT_SETTINGS } from './settings.js'
import { render, updateDashboard } from './ui.js'
import { showToast, showAlert } from './toast.js'

// ── 应用状态 ──
let currentSettings = { ...DEFAULT_SETTINGS }  // 当前设置（本地副本）
let currentSensor   = null                      // 最新传感器数据
let connected       = false                     // BLE 连接状态

// ── 主题（暗黑/浅色）初始化与切换 ──
// 使用 Tailwind dark 模式，通过在根元素上添加/移除 .dark 来切换主题。
function applyTheme(isDark) {
  const root = document.documentElement
  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  try {
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  } catch (e) {
    // 本地存储可能不可用，忽略
  }
}

function isSystemDark() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

// 初始主题：优先本地存储，其次操作系统偏好
function initTheme() {
  let isDark = false
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') isDark = true
    else if (saved === 'light') isDark = false
    else isDark = isSystemDark()
  } catch {
    isDark = isSystemDark()
  }
  applyTheme(isDark)
}

// 主题切换回调（供 UI 使用）
function toggleTheme() {
  const currentlyDark = document.documentElement.classList.contains('dark')
  applyTheme(!currentlyDark)
}

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
    onToggleTheme:      toggleTheme,
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
    showAlert(
      '1. ESP32-C6 已上电且运行\n' +
      '2. 电脑蓝牙已开启\n' +
      '3. 设备未被其他页面占用\n' +
      '4. 浏览器支持 Web Bluetooth (Chrome/Edge)',
      '连接失败'
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
    showAlert('请先连接设备', '提示')
    return
  }
  try {
    const buf = serializeSettings(currentSettings)
    await writeSettings(buf)
    showToast('✅ 设置已保存到设备')
  } catch (error) {
    console.error('保存设置失败:', error)
    showAlert('保存失败: ' + error.message, '错误')
  }
}

// ── 设置值变化（仅更新内存状态，不重绘） ──
function handleSettingChange(key, value) {
  currentSettings = { ...currentSettings, [key]: value }
  // 不调用 fullRender() —— 文本框自身已显示用户输入的值
}

// ── 首次渲染 ──
initTheme()
fullRender()
