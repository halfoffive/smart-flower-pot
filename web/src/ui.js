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
  const pumpColor = sensor.pump === 0 ? 'text-gray-500' : 'text-green-400'

  setTextIf('val-temp',  sensor.temp.toFixed(1) + '°')
  setTextIf('val-hum',   sensor.hum + '%')
  setTextIf('val-soil',  sensor.soil)
  setTextIf('val-pump',  labelPump)

  const pumpEl = document.getElementById('val-pump')
  if (pumpEl) {
    pumpEl.className = 'text-3xl font-mono font-bold ' + pumpColor
  }
}

// ═══════════════════════════════════════════
//  子组件构建函数
// ═══════════════════════════════════════════

// 顶部连接栏
function buildHeader({ connected }) {
  const header = el('div', 'flex items-center justify-between bg-gray-900 rounded-xl p-4')

  header.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">🌱</span>
      <div>
        <h1 class="text-lg font-bold">智能花盆</h1>
        <p class="text-sm text-gray-400">${connected ? '已连接' : '未连接'}</p>
      </div>
    </div>
    <button data-action="${connected ? 'disconnect' : 'connect'}"
            class="px-4 py-2 rounded-lg font-medium transition-colors ${
              connected
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }">
      ${connected ? '断开' : '连接'}
    </button>
  `

  return header
}

// 页面主体
function buildBody(state) {
  const body = el('div', 'space-y-4')

  if (state.connected && state.sensor) {
    body.appendChild(buildDashboard(state.sensor))
  } else if (!state.connected) {
    const empty = el('div', 'bg-gray-900 rounded-xl p-6 text-center text-gray-500')
    empty.textContent = '点击「连接」按钮连接智能花盆设备'
    body.appendChild(empty)
  }

  body.appendChild(buildSettings(state.settings))

  return body
}

// 传感器仪表盘（4格卡片，带 id 供局部更新）
function buildDashboard(sensor) {
  const labelPump = ['停止', '正转', '反转'][sensor.pump] ?? '未知'
  const pumpColor = sensor.pump === 0 ? 'text-gray-500' : 'text-green-400'

  const card = el('div', 'grid grid-cols-2 gap-3')

  card.innerHTML = `
    <div class="bg-gray-900 rounded-xl p-4 text-center">
      <div class="text-3xl font-mono font-bold text-orange-400" id="val-temp">${sensor.temp.toFixed(1)}°</div>
      <div class="text-xs text-gray-500 mt-1">温度</div>
    </div>
    <div class="bg-gray-900 rounded-xl p-4 text-center">
      <div class="text-3xl font-mono font-bold text-blue-400" id="val-hum">${sensor.hum}%</div>
      <div class="text-xs text-gray-500 mt-1">空气湿度</div>
    </div>
    <div class="bg-gray-900 rounded-xl p-4 text-center">
      <div class="text-3xl font-mono font-bold text-amber-400" id="val-soil">${sensor.soil}</div>
      <div class="text-xs text-gray-500 mt-1">土壤 ADC</div>
    </div>
    <div class="bg-gray-900 rounded-xl p-4 text-center">
      <div class="text-3xl font-mono font-bold ${pumpColor}" id="val-pump">${labelPump}</div>
      <div class="text-xs text-gray-500 mt-1">水泵</div>
    </div>
  `

  return card
}

// 设置表单（文本框输入）
function buildSettings(s) {
  const panel = el('div', 'bg-gray-900 rounded-xl p-4 space-y-4')

  panel.innerHTML = `
    <h2 class="text-lg font-bold flex items-center gap-2">⚙️ 灌溉设置</h2>

    <div class="space-y-3">
      ${rowInput('温度下限 (°C)',  'tempMin',        s.tempMin / 10)}
      ${rowInput('温度上限 (°C)',  'tempMax',        s.tempMax / 10)}
      ${rowInput('湿度下限 (%)',   'humMin',         s.humMin)}
      ${rowInput('湿度上限 (%)',   'humMax',         s.humMax)}
      ${rowInput('土壤阈值 (ADC)', 'soilThreshold',  s.soilThreshold)}

      <div>
        <label class="block text-sm text-gray-400 mb-1">比较模式</label>
        <select data-key="compareMode" class="w-full bg-gray-800 rounded-lg px-3 py-2 text-white border border-gray-700">
          <option value="0" ${s.compareMode === 0 ? 'selected' : ''}>低于阈值时启动</option>
          <option value="1" ${s.compareMode === 1 ? 'selected' : ''}>高于阈值时启动</option>
        </select>
      </div>

      ${rowInput('水泵转速 (0-255)', 'pumpSpeed', s.pumpSpeed)}

      <div>
        <label class="block text-sm text-gray-400 mb-1">浇水方向</label>
        <select data-key="waterDirection" class="w-full bg-gray-800 rounded-lg px-3 py-2 text-white border border-gray-700">
          <option value="0" ${s.waterDirection === 0 ? 'selected' : ''}>正转</option>
          <option value="1" ${s.waterDirection === 1 ? 'selected' : ''}>反转</option>
        </select>
      </div>
    </div>

    <button data-action="save"
            class="w-full py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-lg transition-colors">
      保存设置到设备
    </button>
  `

  return panel
}

// 单行文本框组件
function rowInput(label, key, value) {
  const display = Number.isInteger(value) ? value : value.toFixed(1)
  return `
    <div>
      <label class="block text-sm text-gray-400 mb-1">${label}</label>
      <input type="number" data-key="${key}" value="${display}"
             class="w-full bg-gray-800 rounded-lg px-3 py-2 text-white border border-gray-700 focus:border-emerald-500 focus:outline-none" />
    </div>
  `
}

// ═══════════════════════════════════════════
//  事件绑定
// ═══════════════════════════════════════════

function bindEvents(container, state) {
  // 连接/断开按钮
  const btnConnect = container.querySelector('[data-action="connect"]')
  const btnDisconnect = container.querySelector('[data-action="disconnect"]')
  if (btnConnect) btnConnect.onclick = state.onConnect
  if (btnDisconnect) btnDisconnect.onclick = state.onDisconnect

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
      // 仅更新状态，不触发页面重绘
      state.onSettingChange(key, value)
    }
  })

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
