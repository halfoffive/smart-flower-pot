/**
 * 智能花盆 — 测试页入口
 * 功能：手动控制水泵（正转/反转/停止 + 调速）+ 传感器实时读数 + 主题切换
 *
 * 设计原则：
 * - 函数式编程：所有组件为纯函数，状态不可变更新
 * - 主题感知：颜色通过 CSS 自定义属性引用，支持浅色/深色/自动三态
 * - 性能优化：传感器更新通过 RAF 节流，避免高频写入导致卡顿
 */

import './sw-register.js'
import { connect, disconnect, readSettings, writeSettings, isConnected } from './ble.js'
import { serializeSettings, deserializeSettings, deserializeSensor, DEFAULT_SETTINGS } from './settings.js'
import { showAlert } from './toast.js'
import { initTheme, getTheme, toggleTheme } from './theme.js'

// ── 状态（不可变更新风格） ──
let currentSettings = { ...DEFAULT_SETTINGS }  // 当前设置
let currentSensor   = null                      // 最新传感器数据
let connected       = false                     // 连接状态
let rafPending      = false                     // RAF 节流锁

const app = document.getElementById('test-app')

// ── 初始化主题 ──
initTheme()

// ═══════════════════════════════════════════
//  主题图标映射（纯函数）
// ═══════════════════════════════════════════

/**
 * 根据主题模式返回按钮图标和提示文本
 *
 * @param {'light'|'dark'|'auto'} mode
 * @returns {{ emoji: string, label: string }}
 */
const getThemeIcon = (mode) => {
  const map = {
    light: { emoji: '☀️', label: '浅色模式' },
    dark:  { emoji: '🌙', label: '深色模式' },
    auto:  { emoji: '🖥️', label: '跟随系统' },
  }
  return map[mode] || map.auto
}

// ═══════════════════════════════════════════
//  UI 刷新
// ═══════════════════════════════════════════

/**
 * 全量刷新 UI（连接/断开/设置变更时调用）
 */
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
  updateSensorReadout()
}

// ═══════════════════════════════════════════
//  子组件构建（纯函数，无副作用）
// ═══════════════════════════════════════════

/**
 * 顶部栏 — 标题 + 返回链接 + 主题切换 + 连接按钮
 */
function buildHeader() {
  const div = document.createElement('div')
  div.className = 'flex items-center justify-between sfp-card rounded-2xl p-4 shadow-lg'

  const dotColor = connected
    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]'
    : 'bg-[rgb(var(--sfp-dot-inactive))]'
  const dotAnim = connected ? 'animate-pulse-dot' : ''

  // 当前主题图标
  const currentTheme = getTheme()
  const { emoji, label } = getThemeIcon(currentTheme)

  div.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">🔧</span>
      <div>
        <h1 class="text-lg font-bold bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">手动控制测试</h1>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full ${dotColor} ${dotAnim}"></span>
          <span class="text-xs text-[rgb(var(--sfp-text-secondary))]">${connected ? '已连接' : '未连接'}</span>
        </div>
      </div>
    </div>
    <div class="flex gap-2">
      <!-- 返回主页 -->
      <a href="/" class="px-3 py-2 bg-[rgb(var(--sfp-bg-hover)/0.5)] hover:bg-[rgb(var(--sfp-bg-hover)/0.8)] rounded-xl text-sm no-underline text-[rgb(var(--sfp-text-secondary))] transition-colors border border-[rgb(var(--sfp-border)/0.3)]">← 主页</a>
      <!-- 主题切换 -->
      <button data-action="toggle-theme"
              class="theme-toggle-btn w-10 h-10 flex items-center justify-center rounded-xl text-lg"
              title="${label}">${emoji}</button>
      <!-- 连接/断开 -->
      <button data-action="${connected ? 'disconnect' : 'connect'}"
              class="px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-lg ${
                connected
                  ? 'sfp-btn-danger'
                  : 'sfp-btn-primary'
              }">
        ${connected ? '断开' : '连接'}
      </button>
    </div>
  `

  return div
}

/**
 * 未连接空状态
 */
function buildEmptyHint() {
  const div = document.createElement('div')
  div.className = 'flex flex-col items-center justify-center sfp-card rounded-2xl p-8 text-center shadow-lg animate-card-in'
  div.innerHTML = `
    <span class="text-5xl mb-4">🎮</span>
    <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-1">手动水泵控制</h3>
    <p class="text-sm text-[rgb(var(--sfp-text-muted))]">连接设备后可手动控制水泵正反转和转速</p>
  `
  return div
}

/**
 * 传感器实时读数面板（3 列布局）
 */
function buildSensorPanel() {
  const div = document.createElement('div')
  div.className = 'sfp-card rounded-2xl p-5 space-y-4 shadow-lg'

  div.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-lg">📡</span>
      <h2 class="text-base font-bold text-[rgb(var(--sfp-text-primary))]">实时读数</h2>
    </div>
    <div class="grid grid-cols-3 gap-3">
      <div class="bg-[rgb(var(--sfp-bg-input)/0.6)] rounded-xl p-3 text-center border border-[rgb(var(--sfp-border)/0.3)]">
        <div class="text-xs text-[rgb(var(--sfp-text-muted))] mb-1">🌡️ 温度</div>
        <div class="text-xl font-bold sfp-val-temp" id="val-temp">--</div>
        <div class="text-xs text-[rgb(var(--sfp-text-muted))]">°C</div>
      </div>
      <div class="bg-[rgb(var(--sfp-bg-input)/0.6)] rounded-xl p-3 text-center border border-[rgb(var(--sfp-border)/0.3)]">
        <div class="text-xs text-[rgb(var(--sfp-text-muted))] mb-1">💧 湿度</div>
        <div class="text-xl font-bold sfp-val-hum" id="val-hum">--</div>
        <div class="text-xs text-[rgb(var(--sfp-text-muted))]">%</div>
      </div>
      <div class="bg-[rgb(var(--sfp-bg-input)/0.6)] rounded-xl p-3 text-center border border-[rgb(var(--sfp-border)/0.3)]">
        <div class="text-xs text-[rgb(var(--sfp-text-muted))] mb-1">🌿 土壤</div>
        <div class="text-xl font-bold sfp-val-soil" id="val-soil">--</div>
        <div class="text-xs text-[rgb(var(--sfp-text-muted))]">ADC</div>
      </div>
    </div>
  `

  return div
}

/**
 * 水泵控制面板 — 方向选择 / 转速滑块 / 启停按钮
 */
function buildControlPanel() {
  const dir = currentSettings.waterDirection
  const spd = currentSettings.pumpSpeed

  const div = document.createElement('div')
  div.className = 'sfp-card-static rounded-2xl p-5 space-y-5 shadow-lg'

  div.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-lg">🎮</span>
      <h2 class="text-base font-bold text-[rgb(var(--sfp-text-primary))]">水泵控制</h2>
    </div>

    <!-- 方向选择 — 正转 / 反转 -->
    <div>
      <label class="text-xs text-[rgb(var(--sfp-text-muted))] mb-1.5 block">方向</label>
      <div class="flex gap-2">
        <button data-dir="0" class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 ${
          dir === 0
            ? 'sfp-btn-primary'
            : 'bg-[rgb(var(--sfp-bg-hover)/0.5)] text-[rgb(var(--sfp-text-secondary))] hover:bg-[rgb(var(--sfp-bg-hover)/0.7)] border border-[rgb(var(--sfp-border)/0.3)]'
        }">正转</button>
        <button data-dir="1" class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 ${
          dir === 1
            ? 'sfp-btn-danger'
            : 'bg-[rgb(var(--sfp-bg-hover)/0.5)] text-[rgb(var(--sfp-text-secondary))] hover:bg-[rgb(var(--sfp-bg-hover)/0.7)] border border-[rgb(var(--sfp-border)/0.3)]'
        }">反转</button>
      </div>
    </div>

    <!-- 转速滑块 — 0~255 PWM -->
    <div>
      <div class="flex justify-between items-center mb-1.5">
        <span class="text-xs text-[rgb(var(--sfp-text-muted))]">转速</span>
        <span class="text-xs font-mono font-semibold text-emerald-400 bg-[rgb(var(--sfp-accent)/0.15)] px-2 py-0.5 rounded-lg" id="speed-label">${spd} / 255</span>
      </div>
      <input type="range" id="speed-slider" min="0" max="255" value="${spd}" step="1"
             class="w-full accent-emerald-500 h-2 rounded-lg cursor-pointer" />
    </div>

    <!-- 启停按钮 -->
    <div class="flex gap-3">
      <button id="btn-start"
              class="flex-1 py-3 sfp-btn-primary rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5">
        <span>▶</span><span>启动</span>
      </button>
      <button id="btn-stop"
              class="flex-1 py-3 sfp-btn-danger rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1.5">
        <span>■</span><span>停止</span>
      </button>
    </div>
    <p class="text-xs text-[rgb(var(--sfp-text-muted))] text-center">⚠ 手动模式会暂时覆盖自动灌溉逻辑</p>
  `

  return div
}

// ═══════════════════════════════════════════
//  事件绑定
// ═══════════════════════════════════════════

function bindEvents() {
  // ── 连接/断开 ──
  const btnConnect = document.querySelector('[data-action="connect"]')
  const btnDisconnect = document.querySelector('[data-action="disconnect"]')
  if (btnConnect) btnConnect.onclick = handleConnect
  if (btnDisconnect) btnDisconnect.onclick = handleDisconnect

  // ── 主题切换（自包含，不触发重渲染） ──
  const btnTheme = document.querySelector('[data-action="toggle-theme"]')
  if (btnTheme) {
    btnTheme.onclick = () => {
      const newMode = toggleTheme()
      const { emoji, label } = getThemeIcon(newMode)
      btnTheme.textContent = emoji
      btnTheme.title = label
    }
  }

  if (!connected) return

  // ── 方向按钮 ──
  document.querySelectorAll('[data-dir]').forEach(btn => {
    btn.onclick = () => {
      currentSettings = { ...currentSettings, waterDirection: parseInt(btn.dataset.dir) }
      refreshUI()
    }
  })

  // ── 转速滑块 ──
  const speedSlider = document.getElementById('speed-slider')
  if (speedSlider) {
    speedSlider.oninput = () => {
      currentSettings = { ...currentSettings, pumpSpeed: parseInt(speedSlider.value) }
      const label = document.getElementById('speed-label')
      if (label) label.textContent = `${currentSettings.pumpSpeed} / 255`
    }
  }

  // ── 启动按钮 ──
  const btnStart = document.getElementById('btn-start')
  if (btnStart) {
    btnStart.onclick = async () => {
      if (!isConnected()) return showAlert('设备已断开', '错误')
      try {
        // 启动时至少设置最低转速，防止水泵不转
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

  // ── 停止按钮 ──
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
//  传感器值更新（RAF 节流）
// ═══════════════════════════════════════════

/**
 * 更新传感器读数显示（仅更新 DOM 文本内容）
 */
function updateSensorReadout() {
  if (currentSensor) {
    setText('val-temp', currentSensor.temp.toFixed(1))
    setText('val-hum',  currentSensor.hum)
    setText('val-soil', currentSensor.soil)
  }
}

/**
 * RAF 节流的传感器更新（高频 Notify 场景下合并帧）
 *
 * @param {{ soil: number, temp: number, hum: number, pump: number }} sensor
 */
function throttledSensorUpdate(sensor) {
  currentSensor = sensor
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    updateSensorReadout()
  })
}

/**
 * 安全设置元素文本内容
 *
 * @param {string} id - DOM 元素 ID
 * @param {string|number} value - 文本内容
 */
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
      // 传感器数据回调 → RAF 节流更新
      (buffer) => {
        throttledSensorUpdate(deserializeSensor(buffer))
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
