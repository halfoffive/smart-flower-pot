<script setup>
/**
 * 设备信息面板 — 显示 MAC、芯片型号、固件版本等
 */
import { inject, computed } from 'vue'

const { deviceInfo, connectionMode } = inject('connection')

const hasInfo = computed(() => deviceInfo.value && deviceInfo.value.mac)

const infoItems = computed(() => {
  const info = deviceInfo.value
  if (!info) return []
  return [
    { label: '连接方式', value: connectionMode.value === 'ble' ? '蓝牙' : '串口' },
    { label: 'MAC 地址', value: info.mac || '—' },
    { label: '芯片型号', value: info.chip || '—' },
    { label: '芯片修订', value: info.rev ? `v${info.rev}` : '—' },
    { label: 'Flash 大小', value: info.flash ? `${info.flash} KB` : '—' },
    { label: '固件版本', value: info.fw || '—' },
  ]
})
</script>

<template>
  <div v-if="hasInfo" class="sfp-card rounded-2xl p-4 shadow-lg animate-card-in" style="animation-delay: 450ms">
    <div class="flex items-center gap-2 mb-3">
      <span class="text-sm">📋</span>
      <h3 class="text-sm font-bold text-[rgb(var(--sfp-text-primary))]">设备信息</h3>
    </div>
    <div class="space-y-1.5">
      <div
        v-for="item in infoItems"
        :key="item.label"
        class="flex items-center justify-between text-xs"
      >
        <span class="text-[rgb(var(--sfp-text-muted))]">{{ item.label }}</span>
        <span class="font-mono text-[rgb(var(--sfp-text-secondary))]">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>
