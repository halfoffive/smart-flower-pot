/**
 * 主页 UI 渲染模块（函数式编程风格）
 * 负责：连接面板、传感器仪表盘（局部更新）、设置表单（文本框输入）、主题切换
 *
 * 更新策略（性能优化）：
 * - 连接状态变化 → 全量重建
 * - 传感器数据变化 → 仅更新仪表盘卡片内容（requestAnimationFrame 节流）
 * - 设置输入变化 → 不重绘（输入框自身已显示新值）
 *
 * 主题系统：
 * - 所有颜色通过 CSS 自定义属性引用（--sfp-*），实现浅色/深色一键切换
 * - 主题切换按钮位于头部右侧，三态循环：☀️ → 🌙 → 🖥️
 */

import { initTheme, getTheme, toggleTheme } from './theme.js'

// ═══════════════════════════════════════════
//  主题图标映射（纯函数，无副作用）
// ═══════════════════════════════════════════

/**
 * 根据主题模式返回按钮图标
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
//  RAF 节流的传感器更新（性能优化）
// ═══════════════════════════════════════════

/** RAF 节流锁 — 防止短时间内重复触发 DOM 更新 */
let rafPending = false

/**
 * 通过 requestAnimationFrame 节流的传感器仪表盘更新
 * 在高频 Notify（~200ms 间隔）场景下，确保每帧最多更新一次 DOM
 *
 * @param {{ soil: number, temp: number, hum: number, pump: number }} sensor
 */
export function updateDashboard(sensor) {
  if (!sensor) return

  // 如果已有一个待处理的 RAF，跳过本次调用（合并更新）
  if (rafPending) return
  rafPending = true

  requestAnimationFrame(() => {
    rafPending = false
    applySensorUpdate(sensor)
  })
}

/**
 * 实际执行 DOM 更新的纯函数
 * 不重建 DOM，仅通过 ID 查找并更新文本内容
 */
function applySensorUpdate(sensor) {
  const labelPump = ['停止', '正转', '反转'][sensor.pump] ?? '未知'
  const isActive = sensor.pump !== 0

  // 安全设置文本（元素可能尚未挂载）
  setTextIf('val-temp', sensor.temp.toFixed(1))
  setTextIf('val-temp-unit', '°C')
  setTextIf('val-hum', sensor.hum)
  setTextIf('val-hum-unit', '%')
  setTextIf('val-soil', sensor.soil)
  setTextIf('val-pump', labelPump)

  // 更新水泵状态指示点样式
  const pumpDot = document.getElementById('pump-dot')
  if (pumpDot) {
    pumpDot.className = isActive
      ? 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse-dot'
      : 'w-2.5 h-2.5 rounded-full bg-[rgb(var(--sfp-dot-inactive))]'
  }

  // 更新水泵卡片边框和文字颜色
  const pumpCard = document.getElementById('pump-card')
  if (pumpCard) {
    pumpCard.className = isActive
      ? 'sfp-sensor-card rounded-2xl p-4 sfp-border-l-pump shadow-lg animate-card-in'
      : 'sfp-sensor-card rounded-2xl p-4 sfp-border-l-pump-idle shadow-lg'
  }

  // 更新水泵状态文字颜色
  const pumpVal = document.getElementById('val-pump')
  if (pumpVal) {
    pumpVal.className = isActive
      ? 'text-xl font-bold sfp-val-pump-active'
      : 'text-xl font-bold sfp-val-pump-idle'
  }
}

// ═══════════════════════════════════════════
//  主渲染函数（仅连接状态变化时调用）
// ═══════════════════════════════════════════

/**
 * 全量渲染主页（连接/断开时）
 * 首次调用时初始化主题系统
 *
 * @param {HTMLElement} container - 挂载容器
 * @param {object} state - 应用状态
 * @param {object} state.settings - 当前设置
 * @param {object|null} state.sensor - 最新传感器数据
 * @param {boolean} state.connected - BLE 连接状态
 * @param {function} state.onConnect - 连接回调
 * @param {function} state.onDisconnect - 断开回调
 * @param {function} state.onSaveSettings - 保存回调
 * @param {function} state.onSettingChange - 设置变更回调
 */
export function render(container, state) {
  container.innerHTML = ''

  // 首次渲染时初始化主题（幂等操作）
  initTheme()

  container.appendChild(buildHeader(state))
  container.appendChild(buildBody(state))

  bindEvents(container, state)
}

// ═══════════════════════════════════════════
//  子组件构建函数（纯函数 — 无副作用）
// ═══════════════════════════════════════════

/**
 * 顶部连接栏 — 包含标题、连接状态、连接/断开按钮、主题切换按钮
 */
function buildHeader({ connected }) {
  const header = el('div', 'flex items-center justify-between sfp-card rounded-2xl p-4 shadow-lg')

  const dotColor = connected
    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]'
    : 'bg-[rgb(var(--sfp-dot-inactive))]'
  const dotAnim = connected ? 'animate-pulse-dot' : ''

  // 获取当前主题图标
  const currentTheme = getTheme()
  const { emoji, label } = getThemeIcon(currentTheme)

  header.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">🌱</span>
      <div>
        <h1 class="text-lg font-bold bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">智能花盆</h1>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full ${dotColor} ${dotAnim}"></span>
          <span class="text-xs text-[rgb(var(--sfp-text-secondary))]">${connected ? '已连接' : '未连接'}</span>
        </div>
      </div>
    </div>
    <div class="flex gap-2">
      <!-- 主题切换按钮 -->
      <button data-action="toggle-theme"
              class="theme-toggle-btn w-10 h-10 flex items-center justify-center rounded-xl text-lg"
              title="${label}">${emoji}</button>
      <!-- 连接/断开按钮 -->
      <button data-action="${connected ? 'disconnect' : 'connect'}"
              class="px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-lg ${
                connected
                  ? 'sfp-btn-danger'
                  : 'sfp-btn-primary'
              }">
        ${connected ? '断开' : '连接设备'}
      </button>
    </div>
  `

  return header
}

/**
 * 页面主体 — 根据连接状态显示仪表盘或空状态
 */
function buildBody(state) {
  const body = el('div', 'space-y-4')

  if (state.connected && state.sensor) {
    body.appendChild(buildDashboard(state.sensor))
    body.appendChild(buildSettings(state.settings))
  } else {
    body.appendChild(buildEmpty(state.connected))
    body.appendChild(buildSettings(state.settings))
  }

  return body
}

/**
 * 未连接空状态页
 */
function buildEmpty(connected) {
  const card = el('div', 'flex flex-col items-center justify-center sfp-card rounded-2xl p-8 text-center shadow-lg animate-card-in')

  card.innerHTML = connected
    ? `
      <span class="text-5xl mb-4">📡</span>
      <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-2">等待传感器数据...</h3>
      <p class="text-sm text-[rgb(var(--sfp-text-muted))]">设备已连接，正在获取传感器读数</p>
    `
    : `
      <span class="text-5xl mb-4">🪴</span>
      <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-1">欢迎使用智能花盆</h3>
      <p class="text-sm text-[rgb(var(--sfp-text-muted))] mb-5">点击上方按钮连接您的智能花盆设备</p>
      <button data-action="connect" class="px-6 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95">连接设备</button>
    `

  return card
}

/**
 * 传感器仪表盘（2×2 卡片布局，含 staggered 入场动画）
 * 每个卡片带左侧彩色边框 + 图标标签 + 大号数值
 */
function buildDashboard(sensor) {
  const isActive = sensor.pump !== 0
  const pumpBorder = isActive ? 'sfp-border-l-pump' : 'sfp-border-l-pump-idle'

  const card = el('div', 'grid grid-cols-2 gap-3')

  card.innerHTML = `
    <!-- 温度卡片 -->
    <div class="sfp-sensor-card rounded-2xl p-4 sfp-border-l-temp shadow-lg animate-card-in" style="animation-delay:0ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">🌡️</span>
        <span class="text-xs text-[rgb(var(--sfp-text-muted))]">温度</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-bold sfp-val-temp" id="val-temp">${sensor.temp.toFixed(1)}</span>
        <span class="text-sm text-[rgb(var(--sfp-text-muted))]" id="val-temp-unit">°C</span>
      </div>
    </div>

    <!-- 空气湿度卡片 -->
    <div class="sfp-sensor-card rounded-2xl p-4 sfp-border-l-hum shadow-lg animate-card-in" style="animation-delay:75ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">💧</span>
        <span class="text-xs text-[rgb(var(--sfp-text-muted))]">空气湿度</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-bold sfp-val-hum" id="val-hum">${sensor.hum}</span>
        <span class="text-sm text-[rgb(var(--sfp-text-muted))]" id="val-hum-unit">%</span>
      </div>
    </div>

    <!-- 土壤 ADC 卡片 -->
    <div class="sfp-sensor-card rounded-2xl p-4 sfp-border-l-soil shadow-lg animate-card-in" style="animation-delay:150ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">🌿</span>
        <span class="text-xs text-[rgb(var(--sfp-text-muted))]">土壤 ADC</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-bold sfp-val-soil" id="val-soil">${sensor.soil}</span>
        <span class="text-sm text-[rgb(var(--sfp-text-muted))]">raw</span>
      </div>
    </div>

    <!-- 水泵状态卡片 -->
    <div id="pump-card" class="sfp-sensor-card rounded-2xl p-4 ${pumpBorder} shadow-lg animate-card-in" style="animation-delay:225ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">⚡</span>
        <span class="text-xs text-[rgb(var(--sfp-text-muted))]">水泵</span>
      </div>
      <div class="flex items-center gap-2">
        <span id="pump-dot" class="w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse-dot' : 'bg-[rgb(var(--sfp-dot-inactive))]'}"></span>
        <span class="text-xl font-bold ${isActive ? 'sfp-val-pump-active' : 'sfp-val-pump-idle'}" id="val-pump">${['停止', '正转', '反转'][sensor.pump] ?? '未知'}</span>
      </div>
    </div>
  `

  return card
}

/**
 * 灌溉设置表单（分组布局：温度 / 湿度 / 土壤 / 水泵）
 * 使用 sfp-card-static（无悬停放大，避免表单误触）
 */
function buildSettings(s) {
  const panel = el('div', 'sfp-card-static rounded-2xl p-5 space-y-5 shadow-lg')

  panel.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-lg">⚙️</span>
      <h2 class="text-base font-bold text-[rgb(var(--sfp-text-primary))]">灌溉设置</h2>
    </div>

    <!-- 温度区间 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">🌡️ 温度区间</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('下限 (°C)', 'tempMin', s.tempMin / 10)}
        ${rowInputCol('上限 (°C)', 'tempMax', s.tempMax / 10)}
      </div>
    </div>

    <!-- 湿度区间 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">💧 湿度区间</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('下限 (%)', 'humMin', s.humMin)}
        ${rowInputCol('上限 (%)', 'humMax', s.humMax)}
      </div>
    </div>

    <!-- 土壤与比较模式 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">🌿 土壤阈值</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('阈值 (ADC)', 'soilThreshold', s.soilThreshold)}
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">比较模式</label>
          <select data-key="compareMode" class="w-full sfp-select rounded-xl px-3 py-2.5 text-sm">
            <option value="0" ${s.compareMode === 0 ? 'selected' : ''}>低于阈值启动</option>
            <option value="1" ${s.compareMode === 1 ? 'selected' : ''}>高于阈值启动</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 水泵设置 -->
    <div>
      <h3 class="text-xs font-semibold text-[rgb(var(--sfp-text-muted))] uppercase tracking-wider mb-2">⚡ 水泵控制</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('转速 (0-255)', 'pumpSpeed', s.pumpSpeed)}
        <div>
          <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">浇水方向</label>
          <select data-key="waterDirection" class="w-full sfp-select rounded-xl px-3 py-2.5 text-sm">
            <option value="0" ${s.waterDirection === 0 ? 'selected' : ''}>正转</option>
            <option value="1" ${s.waterDirection === 1 ? 'selected' : ''}>反转</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 保存按钮 -->
    <button data-action="save"
            class="w-full py-3 sfp-btn-primary rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98]">
      保存设置到设备
    </button>
  `

  return panel
}

/**
 * 单行文本框组件（label 在上，input 在下）
 *
 * @param {string} label - 字段标签
 * @param {string} key - 设置键名（data-key 属性）
 * @param {number|string} value - 当前值
 * @returns {string} HTML 字符串
 */
function rowInputCol(label, key, value) {
  // 整数值直接显示，浮点数保留一位小数
  const display = Number.isInteger(value) || isNaN(value) ? value : Number(value).toFixed(1)
  return `
    <div>
      <label class="block text-xs text-[rgb(var(--sfp-text-muted))] mb-1">${label}</label>
      <input type="number" data-key="${key}" value="${display}"
             class="w-full sfp-input rounded-xl px-3 py-2.5 text-sm placeholder:text-[rgb(var(--sfp-text-muted))]" />
    </div>
  `
}

// ═══════════════════════════════════════════
//  事件绑定（在容器上委托，避免内存泄漏）
// ═══════════════════════════════════════════

/**
 * 绑定所有交互事件
 *
 * @param {HTMLElement} container - 根容器
 * @param {object} state - 应用状态（含回调函数引用）
 */
function bindEvents(container, state) {
  // ── 连接/断开按钮（querySelectorAll 支持多个同 action 按钮） ──
  container.querySelectorAll('[data-action="connect"]').forEach(btn => {
    btn.onclick = state.onConnect
  })
  container.querySelectorAll('[data-action="disconnect"]').forEach(btn => {
    btn.onclick = state.onDisconnect
  })

  // ── 保存按钮 ──
  const btnSave = container.querySelector('[data-action="save"]')
  if (btnSave) btnSave.onclick = state.onSaveSettings

  // ── 主题切换按钮（自包含：直接更新自身图标，无需重渲染） ──
  const btnTheme = container.querySelector('[data-action="toggle-theme"]')
  if (btnTheme) {
    btnTheme.onclick = () => {
      const newMode = toggleTheme()        // 切换到下一模式
      const { emoji, label } = getThemeIcon(newMode)  // 获取新图标
      btnTheme.textContent = emoji         // 更新按钮图标
      btnTheme.title = label               // 更新悬停提示
    }
  }

  // ── 数字输入框 → 仅更新内存状态，不重绘 DOM ──
  container.querySelectorAll('input[type="number"][data-key]').forEach(input => {
    input.oninput = () => {
      const key = input.dataset.key
      const raw = parseFloat(input.value)
      if (isNaN(raw)) return

      // 温度值需 ×10 转换（与 ESP32 固件保持一致）
      let value
      if (key === 'tempMin' || key === 'tempMax') {
        value = Math.round(raw * 10)
      } else {
        value = Math.round(raw)
      }
      state.onSettingChange(key, value)
    }
  })

  // ── 下拉选择 ──
  container.querySelectorAll('select[data-key]').forEach(select => {
    select.onchange = () => {
      state.onSettingChange(select.dataset.key, parseInt(select.value))
    }
  })
}

// ═══════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════

/**
 * 创建 DOM 元素
 *
 * @param {string} tag - HTML 标签名
 * @param {string} [className] - CSS 类名
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const e = document.createElement(tag)
  if (className) e.className = className
  return e
}

/**
 * 安全设置文本内容（仅当元素存在时操作，避免 null 引用错误）
 *
 * @param {string} id - 元素 ID
 * @param {string|number} text - 要设置的文本
 */
function setTextIf(id, text) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}
