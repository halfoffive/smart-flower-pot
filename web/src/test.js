/**
 * 智能花盆 — 测试页入口
 * 功能：手动控制水泵（正转/反转/停止 + 调速）+ 传感器实时读数
 */

import './sw-register.js'
import { connect, disconnect, readSettings, writeSettings, isConnected } from './ble.js'
import { serializeSettings, deserializeSettings, deserializeSensor, DEFAULT_SETTINGS } from './settings.js'
import { showAlert } from './toast.js'

// ── 状态 ──
let currentSettings = { ...DEFAULT_SETTINGS }  // 当前设置
let currentSensor   = null                      // 最新传感器数据
let connected       = false                     // 连接状态

const app = document.getElementById('test-app')

// ── 刷新 UI ──
function refreshUI() {
  app.innerHTML = ''

  app.appendChild(buildHeader())
  if (connected) {
    app.appendChild(buildSensorPanel())
    app.appendChild(buildControlPanel())
  } else {
    app.appendChild(buildEmptyHint())
  }

  bindEvents()
  updateSensorValues()
}

// ═══════════════════════════════════════════
//  子组件
// ═══════════════════════════════════════════

function buildHeader() {
  const div = document.createElement('div')
  div.className = 'flex items-center justify-between bg-gray-900 rounded-xl p-4'

  div.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">🔧</span>
      <div>
        <h1 class="text-lg font-bold">手动控制测试</h1>
        <p class="text-sm text-gray-400">${connected ? '已连接' : '未连接'}</p>
      </div>
    </div>
    <div class="flex gap-2">
      <a href="/" class="px-3 py-2 bg-gray-800 rounded-lg text-sm hover:bg-gray-700 no-underline text-gray-300">← 主页</a>
      <button data-action="${connected ? 'disconnect' : 'connect'}"
              class="px-4 py-2 rounded-lg font-medium transition-colors ${
                connected
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }">
        ${connected ? '断开' : '连接'}
      </button>
    </div>
  `

  return div
}

function buildEmptyHint() {
  const div = document.createElement('div')
  div.className = 'bg-gray-900 rounded-xl p-6 text-center text-gray-500'
  div.innerHTML = `
    <p class="text-lg mb-2">🔌 点击「连接」按钮连接智能花盆</p>
    <p class="text-sm">连接后可手动控制水泵正反转和转速</p>
  `
  return div
}

function buildSensorPanel() {
  const div = document.createElement('div')
  div.className = 'bg-gray-900 rounded-xl p-4 space-y-3'

  div.innerHTML = `
    <h2 class="text-lg font-bold">📡 实时读数</h2>
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-gray-800 rounded-lg p-3 text-center">
        <div class="text-2xl font-mono text-orange-400" id="val-temp">--</div>
        <div class="text-xs text-gray-500">温度 °C</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 text-center">
        <div class="text-2xl font-mono text-blue-400" id="val-hum">--</div>
        <div class="text-xs text-gray-500">湿度 %</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-3 text-center">
        <div class="text-2xl font-mono text-amber-400" id="val-soil">--</div>
        <div class="text-xs text-gray-500">土壤 ADC</div>
      </div>
    </div>
  `

  return div
}

function buildControlPanel() {
  const dir = currentSettings.waterDirection
  const spd = currentSettings.pumpSpeed

  const div = document.createElement('div')
  div.className = 'bg-gray-900 rounded-xl p-4 space-y-4'

  div.innerHTML = `
    <h2 class="text-lg font-bold">🎮 水泵控制</h2>

    <!-- 方向选择 -->
    <div>
      <label class="text-sm text-gray-400">方向</label>
      <div class="flex gap-2 mt-1">
        <button data-dir="0" class="flex-1 py-3 rounded-lg font-bold transition-colors ${
          dir === 0 ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }">正转</button>
        <button data-dir="1" class="flex-1 py-3 rounded-lg font-bold transition-colors ${
          dir === 1 ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }">反转</button>
      </div>
    </div>

    <!-- 转速滑块 -->
    <div>
      <div class="flex justify-between text-sm">
        <span class="text-gray-400">转速</span>
        <span class="font-mono text-white" id="speed-label">${spd} / 255</span>
      </div>
      <input type="range" id="speed-slider" min="0" max="255" value="${spd}" step="1"
             class="w-full accent-emerald-500 mt-1" />
    </div>

    <!-- 启停按钮 -->
    <div class="flex gap-2">
      <button id="btn-start"
              class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-lg transition-colors">
        ▶ 启动
      </button>
      <button id="btn-stop"
              class="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold text-lg transition-colors">
        ■ 停止
      </button>
    </div>
    <p class="text-xs text-gray-500 text-center">⚠ 手动模式会暂时覆盖自动灌溉逻辑</p>
  `

  return div
}

// ═══════════════════════════════════════════
//  事件绑定
// ═══════════════════════════════════════════

function bindEvents() {
  // 连接/断开按钮
  const btnConnect = document.querySelector('[data-action="connect"]')
  const btnDisconnect = document.querySelector('[data-action="disconnect"]')
  if (btnConnect) btnConnect.onclick = handleConnect
  if (btnDisconnect) btnDisconnect.onclick = handleDisconnect

  if (!connected) return

  // 方向按钮
  document.querySelectorAll('[data-dir]').forEach(btn => {
    btn.onclick = () => {
      currentSettings.waterDirection = parseInt(btn.dataset.dir)
      refreshUI()
    }
  })

  // 转速滑块
  const speedSlider = document.getElementById('speed-slider')
  if (speedSlider) {
    speedSlider.oninput = () => {
      currentSettings.pumpSpeed = parseInt(speedSlider.value)
      const label = document.getElementById('speed-label')
      if (label) label.textContent = `${currentSettings.pumpSpeed} / 255`
    }
  }

  // 启动按钮
  const btnStart = document.getElementById('btn-start')
  if (btnStart) {
    btnStart.onclick = async () => {
      if (!isConnected()) return showAlert('设备已断开', '错误')
      try {
        // 写入 pumpSpeed > 0 使 ESP32 进入手动模式并启动水泵
        const startSettings = {
          ...currentSettings,
          pumpSpeed: Math.max(currentSettings.pumpSpeed, 10), // 至少 10，避免 0 被误判为停止
        }
        const buf = serializeSettings(startSettings)
        await writeSettings(buf)
        console.log('[手动控制] 启动水泵, 方向:', startSettings.waterDirection === 0 ? '正转' : '反转',
                    '转速:', startSettings.pumpSpeed)
      } catch (e) {
        showAlert('操作失败: ' + e.message, '错误')
      }
    }
  }

  // 停止按钮
  const btnStop = document.getElementById('btn-stop')
  if (btnStop) {
    btnStop.onclick = async () => {
      if (!isConnected()) return showAlert('设备已断开', '错误')
      try {
        // 写入 pumpSpeed = 0 使 ESP32 退出手动模式并停止水泵
        const stopSettings = { ...currentSettings, pumpSpeed: 0 }
        const buf = serializeSettings(stopSettings)
        await writeSettings(buf)
        console.log('[手动控制] 停止水泵')
      } catch (e) {
        showAlert('操作失败: ' + e.message, '错误')
      }
    }
  }
}

// ═══════════════════════════════════════════
//  传感器值更新
// ═══════════════════════════════════════════

function updateSensorValues() {
  if (currentSensor) {
    setText('val-temp', currentSensor.temp.toFixed(1))
    setText('val-hum',  currentSensor.hum)
    setText('val-soil', currentSensor.soil)
  }
}

function setText(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

// ═══════════════════════════════════════════
//  连接 / 断开处理
// ═══════════════════════════════════════════

async function handleConnect() {
  try {
    await connect(
      // 传感器数据回调
      (buffer) => {
        currentSensor = deserializeSensor(buffer)
        updateSensorValues()
      },
      // 断开回调
      () => {
        connected = false
        currentSensor = null
        refreshUI()
      }
    )

    connected = true

    // 同步设备当前设置
    const settingsBuf = await readSettings()
    currentSettings = deserializeSettings(settingsBuf)

    refreshUI()
  } catch (error) {
    console.error('连接失败:', error)
    showAlert(
      '1. ESP32-C6 已上电\n' +
      '2. 蓝牙已开启\n' +
      '3. 使用 Chrome/Edge 浏览器\n' +
      '4. 设备未被其他标签页占用',
      '连接失败'
    )
  }
}

function handleDisconnect() {
  disconnect()
  connected = false
  currentSensor = null
  refreshUI()
}

// ── 首次渲染 ──
refreshUI()
