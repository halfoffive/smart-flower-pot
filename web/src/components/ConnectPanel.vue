<script setup>
/**
 * 连接方式选择面板 — 蓝牙/串口双按钮
 */
import { inject } from 'vue'
import { publicPath } from '../lib/publicPath.js'

const { connectBle, connectSerial, connecting } = inject('connection')

/** 静态资源路径前缀（兼容域名根目录和子目录部署） */
const imgPlant = publicPath + 'potted_plant_3d.png'
</script>

<template>
  <div class="flex flex-col items-center justify-center sfp-card rounded-2xl p-8 text-center shadow-lg animate-card-in" style="animation-delay: 100ms">
    <img :src="imgPlant" alt="智能花盆" class="w-16 h-16 mb-4" />
    <h3 class="text-lg font-semibold text-[rgb(var(--sfp-text-primary))] mb-1">欢迎使用智能花盆</h3>
    <p class="text-sm text-[rgb(var(--sfp-text-muted))] mb-5">选择连接方式以开始监控您的智能花盆</p>

    <!-- 连接中状态 -->
    <div v-if="connecting" class="w-full max-w-xs space-y-3">
      <div class="flex items-center justify-center gap-2 text-sm text-[rgb(var(--sfp-text-secondary))]">
        <span class="sfp-spinner" style="border-color: rgb(var(--sfp-accent) / 0.3); border-top-color: rgb(var(--sfp-accent));"></span>
        <span>正在连接设备...</span>
      </div>
      <div class="sfp-progress"></div>
    </div>

    <!-- 连接按钮 -->
    <div v-else class="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button
        class="flex-1 px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5"
        @click="connectBle"
      >
        🔵 蓝牙连接
      </button>
      <button
        class="flex-1 px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5"
        style="background: linear-gradient(to right, rgb(var(--sfp-info)), rgb(96 165 250));"
        @click="connectSerial"
      >
        🔌 串口连接
      </button>
    </div>

    <p class="text-xs text-[rgb(var(--sfp-text-muted))] mt-4">蓝牙无需数据线 · 串口更稳定快速</p>
  </div>
</template>
