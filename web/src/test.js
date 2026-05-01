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
  div.className = 'flex items-center justify-between bg-gray-800/70 backdrop-blur rounded-2xl p-4 shadow-lg border border-gray-700/50'

  const dotColor = connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]' : 'bg-gray-500'
  const dotAnim = connected ? 'animate-pulse-dot' : ''

  div.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">🔧</span>
      <div>
        <h1 class="text-lg font-bold bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">手动控制测试</h1>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full ${dotColor} ${dotAnim}"></span>
          <span class="text-xs text-gray-400">${connected ? '已连接' : '未连接'}</span>
        </div>
      </div>
    </div>
    <div class="flex gap-2">
      <a href="/" class="px-3 py-2 bg-gray-700/70 hover:bg-gray-600/70 rounded-xl text-sm no-underline text-gray-300 transition-colors border border-gray-600/30">← 主页</a>
      <button data-action="${connected ? 'disconnect' : 'connect'}"
              class="px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-lg ${
                connected
                  ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-900/20'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-900/20'
              }">
        ${connected ? '断开' : '连接'}
      </button>
    </div>
  `

  return div
}

function buildEmptyHint() {
  const div = document.createElement('div')
  div.className = 'flex flex-col items-center justify-center bg-gray-800/70 backdrop-blur rounded-2xl p-8 text-center border border-gray-700/50 shadow-lg animate-card-in'
  div.innerHTML = `
    <span class="text-5xl mb-4">🎮</span>
    <h3 class="text-lg font-semibold text-gray-300 mb-1">手动水泵控制</h3>
    <p class="text-sm text-gray-500">连接设备后可手动控制水泵正反转和转速</p>
  `
  return div
}

function buildSensorPanel() {
  const div = document.createElement('div')
  div.className = 'bg-gray-800/70 backdrop-blur rounded-2xl p-5 space-y-4 border border-gray-700/50 shadow-lg'

  div.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-lg">📡</span>
      <h2 class="text-base font-bold text-gray-200">实时读数</h2>
    </div>
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-gray-900/60 rounded-xl p-3 text-center border border-gray-700/30">
        <div class="text-xs text-gray-500 mb-1">🌡️ 温度</div>
        <div class="text-xl font-bold text-orange-300" id="val-temp">--</div>
        <div class="text-xs text-gray-600">°C</div>
      </div>
      <div class="bg-gray-900/60 rounded-xl p-3 text-center border border-gray-700/30">
        <div class="text-xs text-gray-500 mb-1">💧 湿度</div>
        <div class="text-xl font-bold text-blue-300" id="val-hum">--</div>
        <div class="text-xs text-gray-600">%</div>
      </div>
      <div class="bg-gray-900/60 rounded-xl p-3 text-center border border-gray-700/30">
        <div class="text-xs text-gray-500 mb-1">🌿 土壤</div>
        <div class="text-xl font-bold text-amber-300" id="val-soil">--</div>
        <div class="text-xs text-gray-600">ADC</div>
      </div>
    </div>
  `

  return div
}

function buildControlPanel() {
  const dir = currentSettings.waterDirection
  const spd = currentSettings.pumpSpeed

  const div = document.createElement('div')
  div.className = 'bg-gray-800/70 backdrop-blur rounded-2xl p-5 space-y-5 border border-gray-700/50 shadow-lg'

  div.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-lg">🎮</span>
      <h2 class="text-base font-bold text-gray-200">水泵控制</h2>
    </div>

    <!-- 方向选择 -->
    <div>
      <label class="text-xs text-gray-500 mb-1.5 block">方向</label>
      <div class="flex gap-2">
        <button data-dir="0" class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 ${
          dir === 0
            ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-900/20'
            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 border border-gray-600/30'
        }"> 正转</button>
        <button data-dir="1" class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 ${
          dir === 1
            ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-900/20'
            : 'bg-gray-700/50 text-gray-400 hover:bg-gray-600/50 border border-gray-600/30'
        }"> 反转</button>
      </div>
    </div>

    <!-- 转速滑块 -->
    <div>
      <div class="flex justify-between items-center mb-1.5">
        <span class="text-xs text-gray-500">转速</span>
        <span class="text-xs font-mono font-semibold text-emerald-400 bg-emerald-950/30 px-2 py-0.5 rounded-lg" id="speed-label">${spd} / 255</span>
      </div>
      <input type="range" id="speed-slider" min="0" max="255" value="${spd}" step="1"
             class="w-full accent-emerald-500 h-2 rounded-lg cursor-pointer" />
    </div>

    <!-- 启停按钮 -->
    <div class="flex gap-3">
      <button id="btn-start"
              class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-1.5">
        <span>▶</span><span>启动</span>
      </button>
      <button id="btn-stop"
              class="flex-1 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98] shadow-lg shadow-red-900/20 flex items-center justify-center gap-1.5">
        <span>■</span><span>停止</span>
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
        const startSettings = {
          ...currentSettings,
          pumpSpeed: Math.max(currentSettings.pumpSpeed, 10),
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
