<script setup>
/**
 * 顶部栏组件 — 标题、连接状态指示、主题切换按钮
 */
import { inject } from 'vue'
import { publicPath } from '../lib/publicPath.js'

const { connected, connectionMode } = inject('connection')

/** 静态资源路径前缀（兼容域名根目录和子目录部署） */
const imgPlant = publicPath + 'potted_plant_3d.png'
const { themeIcon, toggleTheme } = inject('theme')

const modeLabel = () => {
  if (connectionMode.value === 'ble') return '蓝牙'
  if (connectionMode.value === 'serial') return '串口'
  return ''
}
</script>

<template>
  <div class="flex items-center justify-between sfp-card rounded-2xl p-4 shadow-lg animate-card-in" style="animation-delay: 0ms">
    <div class="flex items-center gap-3">
      <img :src="imgPlant" alt="智能花盆" class="w-8 h-8" />
      <div>
        <h1 class="text-lg font-bold bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-transparent">
          智能花盆
        </h1>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span
            class="w-2 h-2 rounded-full"
            :class="connected
              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)] animate-pulse-dot'
              : 'bg-[rgb(var(--sfp-dot-inactive))]'"
          />
          <span class="text-xs text-[rgb(var(--sfp-text-secondary))]">
            {{ connected ? `已连接 · ${modeLabel()}` : '未连接' }}
          </span>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <a
        href="https://github.com/halfoffive/smart-flower-pot"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-[rgb(var(--sfp-text-secondary))] hover:opacity-60 transition-opacity"
        title="GitHub"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
      <button
        class="theme-toggle-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
        :title="`切换主题（当前：${themeIcon.label}）`"
        @click="toggleTheme"
      >
        {{ themeIcon.emoji }}<span class="hidden sm:inline">{{ themeIcon.label }}</span>
      </button>
    </div>
  </div>
</template>
