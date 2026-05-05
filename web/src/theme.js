/**
 * 主题管理模块（函数式编程风格）
 *
 * 三态主题切换：浅色 / 深色 / 跟随系统（自动）
 * 状态持久化到 localStorage，页面加载时预读取防止闪烁
 *
 * 工作原理：
 *   - <html data-theme="light|dark"> 控制 CSS 变量切换
 *   - 自动模式下监听 prefers-color-scheme 媒体查询变化
 *   - 导出纯函数供 UI 层调用
 */

// ── 常量 ──
const STORAGE_KEY = 'sfp-theme'          // localStorage 键名
const ATTR_NAME   = 'data-theme'         // <html> 属性名
const MODES       = ['light', 'dark', 'auto']  // 有效模式

// ── 内部状态 ──
let currentMode = 'auto'                 // 当前模式
let mediaQuery  = null                   // 系统主题媒体查询监听器

// ═══════════════════════════════════════════
//  初始化（页面加载时调用）
// ═══════════════════════════════════════════

/**
 * 初始化主题系统
 * 优先级：localStorage 用户选择 > 系统偏好 > 默认浅色
 *
 * @returns {'light'|'dark'|'auto'} 当前生效的模式
 */
export function initTheme() {
  // 读取持久化的用户选择
  const saved = localStorage.getItem(STORAGE_KEY)

  if (saved && MODES.includes(saved)) {
    currentMode = saved
  } else {
    currentMode = 'auto'
  }

  // 根据模式应用主题
  if (currentMode === 'auto') {
    applySystemTheme()     // 跟随系统
    watchSystemTheme()     // 监听系统主题变化
  } else {
    applyTheme(currentMode)  // 用户手动选择
  }

  return currentMode
}

// ═══════════════════════════════════════════
//  公开 API
// ═══════════════════════════════════════════

/**
 * 设置主题模式并持久化
 *
 * @param {'light'|'dark'|'auto'} mode - 目标模式
 * @returns {'light'|'dark'|'auto'} 实际生效的模式
 */
export function setTheme(mode) {
  if (!MODES.includes(mode)) return currentMode

  currentMode = mode
  localStorage.setItem(STORAGE_KEY, mode)

  if (mode === 'auto') {
    applySystemTheme()
    watchSystemTheme()
  } else {
    unwatchSystemTheme()     // 停止监听系统主题
    applyTheme(mode)
  }

  return currentMode
}

/**
 * 获取当前主题模式
 *
 * @returns {'light'|'dark'|'auto'}
 */
export function getTheme() {
  return currentMode
}

/**
 * 三态循环切换：light → dark → auto → light ...
 *
 * @returns {'light'|'dark'|'auto'} 切换后的模式
 */
export function toggleTheme() {
  const idx = MODES.indexOf(currentMode)
  const next = MODES[(idx + 1) % MODES.length]
  return setTheme(next)
}

// ═══════════════════════════════════════════
//  内部函数
// ═══════════════════════════════════════════

/**
 * 应用指定主题到 <html> 的 data-theme 属性
 *
 * @param {'light'|'dark'} theme - 目标主题名
 */
function applyTheme(theme) {
  document.documentElement.setAttribute(ATTR_NAME, theme)
}

/**
 * 根据系统 prefers-color-scheme 媒体查询应用主题
 */
function applySystemTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}

/**
 * 监听系统主题变化（仅在 auto 模式下生效）
 * 当用户在操作系统切换深浅色时自动跟随
 */
function watchSystemTheme() {
  if (mediaQuery) return  // 避免重复监听

  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

  // 使用 addEventListener 而非废弃的 addListener
  mediaQuery.addEventListener('change', (e) => {
    // 仅在 auto 模式下响应系统变化
    if (currentMode === 'auto') {
      applyTheme(e.matches ? 'dark' : 'light')
    }
  })
}

/**
 * 移除系统主题监听器
 */
function unwatchSystemTheme() {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', () => {})
    mediaQuery = null
  }
}
