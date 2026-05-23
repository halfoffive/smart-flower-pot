<script setup>
/**
 * 设备信息面板 — 显示 MAC、芯片型号、固件版本、USB 标识等
 */
import { inject, computed } from 'vue'
import * as serial from '../lib/serial.js'
import { publicPath } from '../lib/publicPath.js'

/** 静态资源路径前缀（兼容域名根目录和子目录部署） */
const imgPlant = publicPath + 'potted_plant_3d.png'

const { deviceInfo, connectionMode } = inject('connection')

const hasInfo = computed(() => deviceInfo.value != null)

/** 串口 USB 标识信息 */
const serialUsbInfo = computed(() => {
  if (connectionMode.value !== 'serial') return null
  const info = serial.getPortInfo()
  if (!info) return null
  return {
    vid: info.usbVendorId ? `0x${info.usbVendorId.toString(16)}` : '—',
    pid: info.usbProductId ? `0x${info.usbProductId.toString(16)}` : '—',
  }
})

const infoItems = computed(() => {
  const info = deviceInfo.value
  const items = []

  items.push({
    label: '连接方式',
    value: connectionMode.value === 'ble' ? '蓝牙' : '串口',
  })

  if (info) {
    if (info.mac) items.push({ label: 'MAC 地址', value: info.mac })
    items.push({ label: '芯片型号', value: info.chip || '—' })
    if (info.rev) items.push({ label: '芯片修订', value: `v${info.rev}` })
    if (info.flash) items.push({ label: 'Flash 大小', value: `${info.flash} KB` })
    if (info.fw) items.push({ label: '固件版本', value: info.fw })
    if (info.heap) items.push({ label: '可用堆内存', value: `${info.heap} B` })
  }

  if (serialUsbInfo.value) {
    items.push({ label: 'USB VID', value: serialUsbInfo.value.vid })
    items.push({ label: 'USB PID', value: serialUsbInfo.value.pid })
  }

  return items
})
</script>

<template>
  <div v-if="hasInfo" class="sfp-card rounded-2xl p-4 shadow-lg animate-card-in" style="animation-delay: 550ms">
    <div class="flex items-center gap-2 mb-3">
      <img :src="imgPlant" alt="设备信息" class="w-5 h-5" />
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
