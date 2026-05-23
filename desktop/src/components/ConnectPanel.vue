<script setup>
/**
 * 连接方式选择面板 — Tauri 客户端版
 *
 * 与 Web 端差异：
 * - BLE 连接：先扫描设备 → 显示设备列表 → 用户选择后连接
 * - 串口连接：先列出可用串口 → 显示串口列表 → 用户选择后连接
 * - 不依赖浏览器原生的 requestDevice / requestPort 弹窗
 */
import { inject, ref } from 'vue'
import { scanDevices } from '../lib/tauri-ble.js'
import { listPorts } from '../lib/tauri-serial.js'

const { connectBle, connectSerial, connecting } = inject('connection')

/** 扫描到的 BLE 设备列表 */
const bleDevices = ref([])
/** 可用串口列表 */
const serialPorts = ref([])
/** 是否正在扫描 BLE */
const scanning = ref(false)
/** 是否正在加载串口列表 */
const loadingPorts = ref(false)
/** 当前选择模式：null | 'ble' | 'serial' */
const selectMode = ref(null)

/** 扫描 BLE 设备 */
async function startBleScan() {
  scanning.value = true
  bleDevices.value = []
  try {
    bleDevices.value = await scanDevices(5000)
    if (bleDevices.value.length === 0) {
      console.warn('[连接] 未扫描到 BLE 设备')
    }
  } catch (e) {
    console.error('[连接] BLE 扫描失败:', e)
  } finally {
    scanning.value = false
  }
}

/** 选择 BLE 设备并连接 */
async function selectBleDevice(device) {
  selectMode.value = null
  bleDevices.value = []
  await connectBle(device.address)
}

/** 加载串口列表 */
async function loadSerialPorts() {
  loadingPorts.value = true
  serialPorts.value = []
  try {
    serialPorts.value = await listPorts()
    if (serialPorts.value.length === 0) {
      console.warn('[连接] 未找到可用串口')
    }
  } catch (e) {
    console.error('[连接] 串口列表加载失败:', e)
  } finally {
    loadingPorts.value = false
  }
}

/** 选择串口并连接 */
async function selectSerialPort(portInfo) {
  selectMode.value = null
  serialPorts.value = []
  await connectSerial(portInfo.path)
}

/** 返回选择模式 */
function goBack() {
  selectMode.value = null
  bleDevices.value = []
  serialPorts.value = []
}
</script>

<template>
  <div class="flex flex-col items-center justify-center sfp-card rounded-2xl p-8 text-center shadow-lg animate-card-in" style="animation-delay: 100ms">
    <div class="text-4xl mb-4">🌱</div>
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

    <!-- 主选择界面 -->
    <div v-else-if="!selectMode" class="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
      <button
        class="flex-1 px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5"
        @click="selectMode = 'ble'"
      >
        🔵 蓝牙连接
      </button>
      <button
        class="flex-1 px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5"
        style="background: linear-gradient(to right, rgb(var(--sfp-info)), rgb(96 165 250));"
        @click="selectMode = 'serial'; loadSerialPorts()"
      >
        🔌 串口连接
      </button>
    </div>

    <!-- BLE 设备选择 -->
    <div v-else-if="selectMode === 'ble'" class="w-full max-w-xs space-y-3">
      <div class="flex items-center justify-between mb-2">
        <button @click="goBack" class="text-sm text-[rgb(var(--sfp-text-muted))] hover:text-[rgb(var(--sfp-text-primary))] transition-colors">← 返回</button>
        <span class="text-sm font-medium text-[rgb(var(--sfp-text-secondary))]">选择蓝牙设备</span>
      </div>

      <button
        @click="startBleScan"
        :disabled="scanning"
        class="w-full px-4 py-2.5 sfp-btn-primary rounded-xl font-medium text-sm transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5"
      >
        <span v-if="scanning" class="sfp-spinner" style="border-color: rgb(var(--sfp-text-on-accent) / 0.3); border-top-color: rgb(var(--sfp-text-on-accent));"></span>
        {{ scanning ? '扫描中...' : '🔍 扫描设备' }}
      </button>

      <div v-if="bleDevices.length > 0" class="space-y-2 max-h-60 overflow-y-auto">
        <button
          v-for="device in bleDevices"
          :key="device.address"
          @click="selectBleDevice(device)"
          class="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 hover:scale-[1.02]"
          style="background: rgb(var(--sfp-bg-input)); border: 1px solid rgb(var(--sfp-border));"
        >
          <div class="text-sm font-medium text-[rgb(var(--sfp-text-primary))]">{{ device.name || '未知设备' }}</div>
          <div class="text-xs text-[rgb(var(--sfp-text-muted))] mt-0.5">{{ device.address }}</div>
        </button>
      </div>

      <p v-else-if="!scanning" class="text-xs text-[rgb(var(--sfp-text-muted))]">点击上方按钮扫描附近的蓝牙设备</p>
    </div>

    <!-- 串口选择 -->
    <div v-else-if="selectMode === 'serial'" class="w-full max-w-xs space-y-3">
      <div class="flex items-center justify-between mb-2">
        <button @click="goBack" class="text-sm text-[rgb(var(--sfp-text-muted))] hover:text-[rgb(var(--sfp-text-primary))] transition-colors">← 返回</button>
        <span class="text-sm font-medium text-[rgb(var(--sfp-text-secondary))]">选择串口</span>
      </div>

      <div v-if="loadingPorts" class="flex items-center justify-center gap-2 text-sm text-[rgb(var(--sfp-text-secondary))]">
        <span class="sfp-spinner" style="border-color: rgb(var(--sfp-accent) / 0.3); border-top-color: rgb(var(--sfp-accent));"></span>
        <span>加载串口列表...</span>
      </div>

      <div v-else-if="serialPorts.length > 0" class="space-y-2 max-h-60 overflow-y-auto">
        <button
          v-for="portInfo in serialPorts"
          :key="portInfo.path"
          @click="selectSerialPort(portInfo)"
          class="w-full text-left px-4 py-3 rounded-xl transition-all duration-200 hover:scale-[1.02]"
          style="background: rgb(var(--sfp-bg-input)); border: 1px solid rgb(var(--sfp-border));"
        >
          <div class="text-sm font-medium text-[rgb(var(--sfp-text-primary))]">{{ portInfo.path }}</div>
          <div v-if="portInfo.manufacturer" class="text-xs text-[rgb(var(--sfp-text-muted))] mt-0.5">{{ portInfo.manufacturer }}</div>
        </button>
      </div>

      <div v-else class="space-y-2">
        <p class="text-xs text-[rgb(var(--sfp-text-muted))]">未找到可用串口</p>
        <button
          @click="loadSerialPorts"
          class="text-xs text-[rgb(var(--sfp-accent))] hover:underline"
        >
          🔄 重新扫描
        </button>
      </div>
    </div>

    <p class="text-xs text-[rgb(var(--sfp-text-muted))] mt-4">蓝牙无需数据线 · 串口更稳定快速</p>
  </div>
</template>
