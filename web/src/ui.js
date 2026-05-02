/**
 * 主页 UI 渲染模块（函数式编程风格）
 * 负责：连接面板、传感器仪表盘（局部更新）、设置表单（文本框输入）
 *
 * 更新策略：
 * - 连接状态变化 → 全量重建
 * - 传感器数据变化 → 仅更新仪表盘卡片内容
 * - 设置输入变化 → 不重绘（输入框自身已显示新值）
 */

// ═══════════════════════════════════════════
//  主渲染函数（仅连接状态变化时调用）
// ═══════════════════════════════════════════

/**
 * 全量渲染主页（连接/断开时）
 */
export function render(container, state) {
  container.innerHTML = ''

  container.appendChild(buildHeader(state))
  container.appendChild(buildBody(state))

  bindEvents(container, state)
}

/**
 * 局部更新传感器仪表盘（传感器数据变化时调用）
 * 不重建 DOM，仅更新卡片内的文本内容
 */
export function updateDashboard(sensor) {
  if (!sensor) return

  const labelPump = ['停止', '正转', '反转'][sensor.pump] ?? '未知'
  const isActive = sensor.pump !== 0

  setTextIf('val-temp', sensor.temp.toFixed(1))
  setTextIf('val-temp-unit', '°C')
  setTextIf('val-hum', sensor.hum)
  setTextIf('val-hum-unit', '%')
  setTextIf('val-soil', sensor.soil)
  setTextIf('val-pump', labelPump)

  // 水泵状态指示点
  const pumpDot = document.getElementById('pump-dot')
  if (pumpDot) {
    pumpDot.className = isActive
      ? 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse-dot'
      : 'w-2.5 h-2.5 rounded-full bg-gray-600'
  }
  const pumpCard = document.getElementById('pump-card')
  if (pumpCard) {
    pumpCard.className = isActive
      ? 'bg-gray-800/70 backdrop-blur rounded-2xl p-4 border-l-4 border-emerald-400 shadow-lg animate-card-in'
      : 'bg-gray-800/70 backdrop-blur rounded-2xl p-4 border-l-4 border-gray-700 shadow-lg'
  }
}

// ═══════════════════════════════════════════
//  子组件构建函数
// ═══════════════════════════════════════════

// 顶部连接栏
function buildHeader({ connected }) {
  // header 也作为一个卡片元素，加入进入动画
  const header = el('div', 'flex items-center justify-between bg-gray-800/70 backdrop-blur rounded-2xl p-4 shadow-lg border border-gray-700/50 animate-card-in')

  const dotColor = connected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]' : 'bg-gray-500'
  const dotAnim = connected ? 'animate-pulse-dot' : ''

  header.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">🌱</span>
      <div>
        <h1 class="text-lg font-bold bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">智能花盆</h1>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="w-2 h-2 rounded-full ${dotColor} ${dotAnim}"></span>
          <span class="text-xs text-gray-400">${connected ? '已连接' : '未连接'}</span>
        </div>
      </div>
    </div>
    <button data-action="${connected ? 'disconnect' : 'connect'}"
            class="px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-lg ${
              connected
                ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-red-900/20'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-900/20'
            }">
      ${connected ? '断开' : '连接设备'}
    </button>
    <button data-action="toggle-theme" class="ml-2 px-3 py-2 rounded-xl text-sm bg-gray-700 hover:bg-gray-600 text-white shadow-lg">🌗</button>
  `

  return header
}

// 页面主体
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

// 未连接空状态
function buildEmpty(connected) {
  const card = el('div', 'flex flex-col items-center justify-center bg-gray-800/70 backdrop-blur rounded-2xl p-8 text-center border border-gray-700/50 shadow-lg animate-card-in')

  card.innerHTML = connected
    ? `
      <span class="text-5xl mb-4">📡</span>
      <h3 class="text-lg font-semibold text-gray-300 mb-2">等待传感器数据...</h3>
      <p class="text-sm text-gray-500">设备已连接，正在获取传感器读数</p>
    `
    : `
      <span class="text-5xl mb-4">🪴</span>
      <h3 class="text-lg font-semibold text-gray-300 mb-1">欢迎使用智能花盆</h3>
      <p class="text-sm text-gray-500 mb-5">点击上方按钮连接您的智能花盆设备</p>
      <button data-action="connect" class="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 shadow-lg shadow-emerald-900/20">连接设备</button>
    `

  return card
}

// 传感器仪表盘（2x2 卡片，带 id 供局部更新）
function buildDashboard(sensor) {
  const isActive = sensor.pump !== 0
  const pumpBorder = isActive ? 'border-emerald-400' : 'border-gray-700'

  const card = el('div', 'grid grid-cols-2 gap-3 animate-card-in')

  card.innerHTML = `
    <div class="bg-gray-800/70 backdrop-blur rounded-2xl p-4 border-l-4 border-orange-400 shadow-lg animate-card-in" style="animation-delay:0ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">🌡️</span>
        <span class="text-xs text-gray-500">温度</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-bold text-orange-300" id="val-temp">${sensor.temp.toFixed(1)}</span>
        <span class="text-sm text-gray-500" id="val-temp-unit">°C</span>
      </div>
    </div>

    <div class="bg-gray-800/70 backdrop-blur rounded-2xl p-4 border-l-4 border-blue-400 shadow-lg animate-card-in" style="animation-delay:75ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">💧</span>
        <span class="text-xs text-gray-500">空气湿度</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-bold text-blue-300" id="val-hum">${sensor.hum}</span>
        <span class="text-sm text-gray-500" id="val-hum-unit">%</span>
      </div>
    </div>

    <div class="bg-gray-800/70 backdrop-blur rounded-2xl p-4 border-l-4 border-amber-400 shadow-lg animate-card-in" style="animation-delay:150ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">🌿</span>
        <span class="text-xs text-gray-500">土壤 ADC</span>
      </div>
      <div class="flex items-baseline gap-1">
        <span class="text-3xl font-bold text-amber-300" id="val-soil">${sensor.soil}</span>
        <span class="text-sm text-gray-500">raw</span>
      </div>
    </div>

    <div id="pump-card" class="bg-gray-800/70 backdrop-blur rounded-2xl p-4 border-l-4 ${pumpBorder} shadow-lg animate-card-in" style="animation-delay:225ms">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="text-xs">⚡</span>
        <span class="text-xs text-gray-500">水泵</span>
      </div>
      <div class="flex items-center gap-2">
        <span id="pump-dot" class="w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] animate-pulse-dot' : 'bg-gray-600'}"></span>
        <span class="text-xl font-bold ${isActive ? 'text-emerald-400' : 'text-gray-500'}" id="val-pump">${['停止', '正转', '反转'][sensor.pump] ?? '未知'}</span>
      </div>
    </div>
  `

  return card
}

// 设置表单（分组输入）
function buildSettings(s) {
  const panel = el('div', 'bg-gray-800/70 backdrop-blur rounded-2xl p-5 space-y-5 border border-gray-700/50 shadow-lg animate-card-in')

  panel.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-lg">⚙️</span>
      <h2 class="text-base font-bold text-gray-200">灌溉设置</h2>
    </div>

    <!-- 温度区间 -->
    <div>
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🌡️ 温度区间</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('下限 (°C)', 'tempMin', s.tempMin / 10)}
        ${rowInputCol('上限 (°C)', 'tempMax', s.tempMax / 10)}
      </div>
    </div>

    <!-- 湿度区间 -->
    <div>
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">💧 湿度区间</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('下限 (%)', 'humMin', s.humMin)}
        ${rowInputCol('上限 (%)', 'humMax', s.humMax)}
      </div>
    </div>

    <!-- 土壤与比较模式 -->
    <div>
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">🌿 土壤阈值</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('阈值 (ADC)', 'soilThreshold', s.soilThreshold)}
        <div>
          <label class="block text-xs text-gray-500 mb-1">比较模式</label>
          <select data-key="compareMode" class="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-colors">
            <option value="0" ${s.compareMode === 0 ? 'selected' : ''}>低于阈值启动</option>
            <option value="1" ${s.compareMode === 1 ? 'selected' : ''}>高于阈值启动</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 水泵设置 -->
    <div>
      <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">⚡ 水泵控制</h3>
      <div class="grid grid-cols-2 gap-3">
        ${rowInputCol('转速 (0-255)', 'pumpSpeed', s.pumpSpeed)}
        <div>
          <label class="block text-xs text-gray-500 mb-1">浇水方向</label>
          <select data-key="waterDirection" class="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-colors">
            <option value="0" ${s.waterDirection === 0 ? 'selected' : ''}>正转</option>
            <option value="1" ${s.waterDirection === 1 ? 'selected' : ''}>反转</option>
          </select>
        </div>
      </div>
    </div>

    <button data-action="save"
            class="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-xl font-bold text-base transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-900/20">
      保存设置到设备
    </button>
  `

  return panel
}

// 单行文本框组件（col 版：label 在上，input 在下）
function rowInputCol(label, key, value) {
  const display = Number.isInteger(value) || isNaN(value) ? value : value.toFixed(1)
  return `
    <div>
      <label class="block text-xs text-gray-500 mb-1">${label}</label>
      <input type="number" data-key="${key}" value="${display}"
             class="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none transition-colors" />
    </div>
  `
}

// ═══════════════════════════════════════════
//  事件绑定
// ═══════════════════════════════════════════

function bindEvents(container, state) {
  // 连接/断开按钮（可能有多个，如头部+空状态各一个）
  container.querySelectorAll('[data-action="connect"]').forEach(btn => {
    btn.onclick = state.onConnect
  })
  container.querySelectorAll('[data-action="disconnect"]').forEach(btn => {
    btn.onclick = state.onDisconnect
  })

  // 保存按钮
  const btnSave = container.querySelector('[data-action="save"]')
  if (btnSave) btnSave.onclick = state.onSaveSettings

  // 文本框输入 → 仅更新本地状态，不重绘 DOM
  container.querySelectorAll('input[type="number"][data-key]').forEach(input => {
    input.oninput = () => {
      const key = input.dataset.key
      const raw = parseFloat(input.value)
      if (isNaN(raw)) return

      let value
      if (key === 'tempMin' || key === 'tempMax') {
        value = Math.round(raw * 10)
      } else {
        value = Math.round(raw)
      }
      state.onSettingChange(key, value)
    }
  })

  // 主题切换按钮
  const btnTheme = container.querySelector('[data-action="toggle-theme"]')
  if (btnTheme) btnTheme.onclick = state.onToggleTheme

  // 下拉选择
  container.querySelectorAll('select[data-key]').forEach(select => {
    select.onchange = () => {
      state.onSettingChange(select.dataset.key, parseInt(select.value))
    }
  })
}

// ═══════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════

function el(tag, className) {
  const e = document.createElement(tag)
  if (className) e.className = className
  return e
}

// 安全设置文本内容（仅当元素存在时）
function setTextIf(id, text) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}
