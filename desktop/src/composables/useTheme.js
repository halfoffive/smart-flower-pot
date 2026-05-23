/**
 * 主题管理组合式函数
 *
 * 三态主题切换：浅色 ☀️ / 深色 🌙 / 跟随系统 🖥️（自动）
 * 状态持久化到 localStorage，页面加载时通过内联脚本预读取防闪烁
 *
 * 设计原则：
 * - 纯函数分离：状态读写逻辑提取为独立纯函数
 * - 最小响应式状态：仅 currentMode 为响应式，其余为普通函数
 * - 副作用集中：DOM 操作和 localStorage 写入集中在 applyTheme / setTheme 中
 */

import { ref, computed, readonly } from 'vue'

const STORAGE_KEY = 'sfp-theme'
const ATTR_NAME   = 'data-theme'
const MODES       = ['light', 'dark', 'auto']

const currentMode = ref('auto')
let mediaQuery = null

/** 主题图标映射表（纯数据，无逻辑） */
const THEME_ICONS = Object.freeze({
  light: { emoji: '☀️', label: '浅色' },
  dark:  { emoji: '🌙', label: '深色' },
  auto:  { emoji: '🖥️', label: '自动' },
})

/** 当前主题图标（计算属性） */
const themeIcon = computed(() => THEME_ICONS[currentMode.value] ?? THEME_ICONS.auto)

// ═══════════════════════════════════════════
// 纯函数工具（无副作用，可独立测试）
// ═══════════════════════════════════════════

/**
 * 从 localStorage 读取用户保存的主题模式
 * @returns {string|null} 'light' | 'dark' | 'auto' | null（无保存值）
 */
const getSavedThemeMode = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved && MODES.includes(saved) ? saved : null
}

/**
 * 获取系统偏好主题（跟随操作系统配色方案）
 * @returns {'light' | 'dark'}
 */
const getSystemThemeMode = () => {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

/**
 * 将主题名应用到 DOM（设置 data-theme 属性）
 * @param {'light' | 'dark'} theme - 要应用的主题
 */
const applyTheme = (theme) => {
  document.documentElement.setAttribute(ATTR_NAME, theme)
}

// ═══════════════════════════════════════════
// 副作用模块（系统偏好监听）
// ═══════════════════════════════════════════

/** 监听系统配色方案变化（自动模式时跟随切换） */
const watchSystemTheme = () => {
  if (mediaQuery) return
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', (e) => {
    if (currentMode.value === 'auto') {
      applyTheme(e.matches ? 'dark' : 'light')
    }
  })
}

/** 移除系统主题监听 */
const unwatchSystemTheme = () => {
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', () => {})
    mediaQuery = null
  }
}

// ═══════════════════════════════════════════
// 组合式函数入口（提供响应式状态与方法）
// ═══════════════════════════════════════════

/**
 * 主题管理组合式函数
 * @returns {{
 *   mode: import('vue').Ref<string>,
 *   themeIcon: import('vue').ComputedRef<{ emoji: string, label: string }>,
 *   initTheme: () => void,
 *   setTheme: (mode: string) => void,
 *   toggleTheme: () => void,
 * }}
 */
export function useTheme() {

  /**
   * 初始化主题系统
   * 读取 localStorage → 无保存值则跟随系统 → 设置 DOM + 启动监听
   */
  const initTheme = () => {
    const saved = getSavedThemeMode()
    currentMode.value = saved ?? 'auto'

    if (currentMode.value === 'auto') {
      applyTheme(getSystemThemeMode())
      watchSystemTheme()
    } else {
      applyTheme(currentMode.value)
    }
  }

  /**
   * 设置指定主题模式
   * @param {'light' | 'dark' | 'auto'} mode - 目标模式
   */
  const setTheme = (mode) => {
    if (!MODES.includes(mode)) return

    currentMode.value = mode
    localStorage.setItem(STORAGE_KEY, mode)

    if (mode === 'auto') {
      applyTheme(getSystemThemeMode())
      watchSystemTheme()
    } else {
      unwatchSystemTheme()
      applyTheme(mode)
    }
  }

  /**
   * 三态循环切换：light → dark → auto → light …
   */
  const toggleTheme = () => {
    const idx = MODES.indexOf(currentMode.value)
    const next = MODES[(idx + 1) % MODES.length]
    setTheme(next)
  }

  return {
    mode: readonly(currentMode),
    themeIcon,
    initTheme,
    setTheme,
    toggleTheme,
  }
}
