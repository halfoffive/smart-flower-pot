<script setup>
/**
 * 顶部栏组件 — 标题、连接状态指示、主题切换按钮
 */
import { inject } from 'vue'

const { connected, connectionMode } = inject('connection')
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
      <span class="text-2xl">🌱</span>
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
    <button
      class="theme-toggle-btn flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
      :title="`切换主题（当前：${themeIcon.label}）`"
      @click="toggleTheme"
    >
      {{ themeIcon.emoji }}<span class="hidden sm:inline">{{ themeIcon.label }}</span>
    </button>
  </div>
</template>
