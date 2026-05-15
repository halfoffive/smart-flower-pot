/**
 * 主题管理组合式函数
 *
 * 三态主题切换：浅色 / 深色 / 跟随系统（自动）
 * 状态持久化到 localStorage，页面加载时预读取防止闪烁
 */

import { ref, computed, readonly } from 'vue'

const STORAGE_KEY = 'sfp-theme'
const ATTR_NAME   = 'data-theme'
const MODES       = ['light', 'dark', 'auto']

const currentMode = ref('auto')
let mediaQuery = null

/** 主题图标映射 */
const THEME_ICONS = {
  light: { emoji: '☀️', label: '浅色' },
  dark:  { emoji: '🌙', label: '深色' },
  auto:  { emoji: '🖥️', label: '自动' },
}

/** 当前主题图标（计算属性） */
const themeIcon = computed(() => THEME_ICONS[currentMode.value] || THEME_ICONS.auto)

/**
 * 主题管理组合式函数
 * @returns {object}
 */
export function useTheme() {

  /** 初始化主题系统 */
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY)

    if (saved && MODES.includes(saved)) {
      currentMode.value = saved
    } else {
      currentMode.value = 'auto'
    }

    if (currentMode.value === 'auto') {
      applySystemTheme()
      watchSystemTheme()
    } else {
      applyTheme(currentMode.value)
    }
  }

  /** 设置主题模式 */
  function setTheme(mode) {
    if (!MODES.includes(mode)) return

    currentMode.value = mode
    localStorage.setItem(STORAGE_KEY, mode)

    if (mode === 'auto') {
      applySystemTheme()
      watchSystemTheme()
    } else {
      unwatchSystemTheme()
      applyTheme(mode)
    }
  }

  /** 三态循环切换 */
  function toggleTheme() {
    const idx = MODES.indexOf(currentMode.value)
    const next = MODES[(idx + 1) % MODES.length]
    setTheme(next)
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute(ATTR_NAME, theme)
  }

  function applySystemTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(prefersDark ? 'dark' : 'light')
  }

  function watchSystemTheme() {
    if (mediaQuery) return

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      if (currentMode.value === 'auto') {
        applyTheme(e.matches ? 'dark' : 'light')
      }
    })
  }

  function unwatchSystemTheme() {
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', () => {})
      mediaQuery = null
    }
  }

  return {
    mode: readonly(currentMode),
    themeIcon,
    initTheme,
    setTheme,
    toggleTheme,
  }
}
