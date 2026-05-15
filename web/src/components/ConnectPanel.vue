<script setup>
/**
 * 连接方式选择面板 — 蓝牙/串口双按钮
 */
import { inject } from 'vue'

const { connectBle, connectSerial } = inject('connection')
</script>

<template>
  <div class="flex flex-col items-center justify-center sfp-card rounded-2xl p-8 text-center shadow-lg animate-card-in" style="animation-delay: 100ms">
    <span class="text-5xl mb-4">🪴</span>
    <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-1">欢迎使用智能花盆</h3>
    <p class="text-sm text-[rgb(var(--sfp-text-muted))] mb-5">选择连接方式以开始监控您的智能花盆</p>
    <div class="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button
        class="flex-1 px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95"
        @click="connectBle"
      >
        🔵 蓝牙连接
      </button>
      <button
        class="flex-1 px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95"
        style="background: linear-gradient(to right, rgb(var(--sfp-info)), rgb(96 165 250));"
        @click="connectSerial"
      >
        🔌 串口连接
      </button>
    </div>
    <p class="text-xs text-[rgb(var(--sfp-text-muted))] mt-4">蓝牙无需数据线 · 串口更稳定快速</p>
  </div>
</template>
