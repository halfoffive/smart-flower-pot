/**
 * 智能花盆 — 主页入口
 * 协调 BLE 连接、设置管理、UI 渲染、传感器数据流、主题管理
 *
 * 更新策略（避免输入卡顿 & 性能优化）：
 * - 连接/断开 → 全量渲染
 * - 传感器数据 → RAF 节流局部更新仪表盘（updateDashboard）
 * - 设置输入 → 仅更新内存状态，不重绘
 * - 主题切换 → 仅更新头部按钮图标，不重建整个页面
 */

import './sw-register.js'
import * as ble from './ble.js'
import * as serial from './serial.js'
import { serializeSettings, deserializeSettings, deserializeSensor, DEFAULT_SETTINGS, WATER_DIR_SAVE_ONLY } from './settings.js'
import { render, updateDashboard } from './ui.js'
import { showToast, showAlert } from './toast.js'
import { initTheme } from './theme.js'

// ── 应用状态（不可变风格 — 通过展开运算符创建新对象） ──
let currentSettings = { ...DEFAULT_SETTINGS }  // 当前设置（本地副本）
let currentSensor   = null                      // 最新传感器数据
let connected       = false                     // 连接状态
let connectionMode  = null                      // 'ble' | 'serial' | null

const app = document.getElementById('app')      // 挂载容器

// ── 初始化主题（页面加载时立即执行，避免闪烁） ──
initTheme()

/**
 * 全量渲染（仅连接/断开时调用）
 * 纯编排函数：组装 state 对象后委托给 ui.render()
 */
const fullRender = () => {
  render(app, {
    settings: currentSettings,
    sensor: currentSensor,
    connected,
    connectionMode,
    onConnectBle:     handleConnectBle,
    onConnectSerial:  handleConnectSerial,
    onDisconnect:     handleDisconnect,
    onSaveSettings:   handleSaveSettings,
    onSettingChange:  handleSettingChange,
  })
}

// ── 传感器数据回调（两种连接模式共用） ──

function onSensorData(buffer) {
  const data = deserializeSensor(buffer)
  const wasNull = currentSensor === null
  currentSensor = data
  // 首次收到传感器数据：从等待状态切换到仪表盘（全量渲染）
  // 注意：仅当 connected 为 true 时才执行（避免在 connect 未完成时提前渲染）
  if (wasNull && connected) {
    fullRender()
  } else {
    updateDashboard(data)  // 内部已通过 RAF 节流
  }
}

function onDisconnect() {
  connected = false
  connectionMode = null
  currentSensor = null
  fullRender()
}

// ── BLE 连接处理 ──

/**
 * 发起 BLE 连接
 * 传感器数据通过 RAF 节流更新仪表盘
 */
async function handleConnectBle() {
  try {
    await ble.connect(onSensorData, onDisconnect)

    connected = true
    connectionMode = 'ble'

    // 连接成功后同步设备设置
    const settingsBuf = await ble.readSettings()
    currentSettings = deserializeSettings(settingsBuf)

    fullRender()
  } catch (error) {
    console.error('BLE 连接失败:', error)
    showAlert(
      '1. ESP32-C6 已上电且运行\n' +
      '2. 电脑蓝牙已开启\n' +
      '3. 设备未被其他页面占用\n' +
      '4. 浏览器支持 Web Bluetooth (Chrome/Edge)',
      '蓝牙连接失败'
    )
  }
}

// ── Serial 连接处理 ──

/**
 * 发起 Web Serial 连接
 */
async function handleConnectSerial() {
  try {
    await serial.connect(onSensorData, onDisconnect)

    connected = true
    connectionMode = 'serial'

    // 连接成功后同步设备设置
    const settingsBuf = await serial.readSettings()
    currentSettings = deserializeSettings(settingsBuf)

    fullRender()
  } catch (error) {
    console.error('Serial 连接失败:', error)
    showAlert(
      '1. ESP32-C6 已通过 USB 连接到电脑\n' +
      '2. 未占用串口的其他程序（如 Arduino IDE 串口监视器）\n' +
      '3. 浏览器支持 Web Serial (Chrome/Edge)',
      '串口连接失败'
    )
  }
}

// ── 断开处理 ──

/** 主动断开连接并重置 UI */
async function handleDisconnect() {
  if (connectionMode === 'ble') {
    ble.disconnect()
  } else if (connectionMode === 'serial') {
    await serial.disconnect()
  }
  connected = false
  connectionMode = null
  currentSensor = null
  fullRender()
}

// ── 保存设置 ──

/**
 * 将当前设置序列化并写入 ESP32 NVS 存储
 * 使用 WATER_DIR_SAVE_ONLY (0xFF) 标志告知固件"仅保存设置，不触发水泵"
 */
async function handleSaveSettings() {
  const conn = connectionMode === 'ble' ? ble : serial
  if (!conn.isConnected()) {
    showAlert('请先连接设备', '提示')
    return
  }
  try {
    // 使用保存设置专用标志（0xFF），固件不会自动启动水泵
    const settingsToSave = { ...currentSettings, waterDirection: WATER_DIR_SAVE_ONLY }
    const buf = serializeSettings(settingsToSave)
    await conn.writeSettings(buf)
    showToast('✅ 设置已保存到设备')
  } catch (error) {
    console.error('保存设置失败:', error)
    showAlert('保存失败: ' + error.message, '错误')
  }
}

// ── 设置值变化（仅更新内存状态，不重绘） ──

/**
 * 设置输入变更处理器（纯数据更新，不触发 DOM 重绘）
 *
 * @param {string} key - 设置字段名
 * @param {number} value - 新值
 */
function handleSettingChange(key, value) {
  // 不可变更新：创建新对象
  currentSettings = { ...currentSettings, [key]: value }
  // 不调用 fullRender() —— 文本框自身已显示用户输入的值
}

// ── 首次渲染 ──
fullRender()
