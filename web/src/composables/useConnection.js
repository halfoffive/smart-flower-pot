/**
 * 连接管理组合式函数
 *
 * 统一管理 BLE / Serial 双模连接、传感器数据流、设置读写、设备信息
 * 通过 provide/inject 在组件树中共享
 */

import { ref, readonly } from 'vue'
import * as ble from '../lib/ble.js'
import * as serial from '../lib/serial.js'
import {
  serializeSettings,
  deserializeSettings,
  deserializeSensor,
  parseDeviceInfo,
  DEFAULT_SETTINGS,
  WATER_DIR_SAVE_ONLY,
} from '../lib/settings.js'

/** 连接状态 */
const connected = ref(false)
const connectionMode = ref(null)

/** 传感器数据 */
const sensor = ref(null)

/** 设置数据 */
const settings = ref({ ...DEFAULT_SETTINGS })

/** 设备信息 */
const deviceInfo = ref(null)

/** RAF 节流锁 */
let rafPending = false

/**
 * 连接管理组合式函数
 * @param {function} showAlert - 显示错误对话框
 * @param {function} showToast - 显示轻量通知
 * @returns {object}
 */
export function useConnection(showAlert, showToast) {

  /** 传感器数据回调（两种连接模式共用） */
  function onSensorData(buffer) {
    const data = deserializeSensor(buffer)
    const wasNull = sensor.value === null
    sensor.value = data

    if (wasNull && connected.value) {
      // 首次数据：Vue 响应式自动触发渲染
    }
  }

  /** 断开回调（设备异常断开时触发） */
  function onDisconnect() {
    connected.value = false
    connectionMode.value = null
    sensor.value = null
    deviceInfo.value = null
  }

  /** BLE 连接 */
  async function connectBle() {
    try {
      await ble.connect(onSensorData, onDisconnect)

      connected.value = true
      connectionMode.value = 'ble'

      const settingsBuf = await ble.readSettings()
      settings.value = deserializeSettings(settingsBuf)

      const infoStr = await ble.readDeviceInfo()
      deviceInfo.value = parseDeviceInfo(infoStr)

      updateUrlQuery()
    } catch (error) {
      console.error('BLE 连接失败:', error)
      showAlert(
        '1. ESP32-C6 已上电且运行\n' +
        '2. 电脑蓝牙已开启\n' +
        '3. 设备未被其他页面占用\n' +
        '4. 浏览器支持 Web Bluetooth (Chrome/Edge)',
        '蓝牙连接失败'
      )
    }
  }

  /** 串口连接 */
  async function connectSerial() {
    try {
      await serial.connect(onSensorData, onDisconnect)

      connected.value = true
      connectionMode.value = 'serial'

      const settingsBuf = await serial.readSettings()
      settings.value = deserializeSettings(settingsBuf)

      const infoStr = await serial.readDeviceInfo()
      deviceInfo.value = parseDeviceInfo(infoStr)

      updateUrlQuery()
    } catch (error) {
      console.error('Serial 连接失败:', error)
      showAlert(
        '1. ESP32-C6 已通过 USB 连接到电脑\n' +
        '2. 未占用串口的其他程序（如 Arduino IDE 串口监视器）\n' +
        '3. 浏览器支持 Web Serial (Chrome/Edge)',
        '串口连接失败'
      )
    }
  }

  /** 断开连接 */
  async function disconnect() {
    if (connectionMode.value === 'ble') {
      ble.disconnect()
    } else if (connectionMode.value === 'serial') {
      await serial.disconnect()
    }
    connected.value = false
    connectionMode.value = null
    sensor.value = null
    deviceInfo.value = null
    clearUrlQuery()
  }

  /** 保存设置到设备 */
  async function saveSettings() {
    const conn = connectionMode.value === 'ble' ? ble : serial
    if (!conn.isConnected()) {
      showAlert('请先连接设备', '提示')
      return
    }
    try {
      const settingsToSave = { ...settings.value, waterDirection: WATER_DIR_SAVE_ONLY }
      const buf = serializeSettings(settingsToSave)
      await conn.writeSettings(buf)
      showToast('✅ 设置已保存到设备')
    } catch (error) {
      console.error('保存设置失败:', error)
      showAlert('保存失败: ' + error.message, '错误')
    }
  }

  /** 更新单个设置值（仅内存，不重绘） */
  function updateSetting(key, value) {
    settings.value = { ...settings.value, [key]: value }
  }

  /** 更新 URL 查询字符串 */
  function updateUrlQuery() {
    const params = new URLSearchParams()
    params.set('mode', connectionMode.value)
    if (connectionMode.value === 'ble' && deviceInfo.value?.mac) {
      params.set('mac', deviceInfo.value.mac)
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', newUrl)
  }

  /** 清除 URL 查询字符串 */
  function clearUrlQuery() {
    window.history.replaceState(null, '', window.location.pathname)
  }

  /** 从 URL 查询字符串自动连接 */
  async function autoConnectFromUrl() {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode')
    if (!mode) return

    if (mode === 'serial') {
      try {
        const ports = await navigator.serial.getPorts()
        if (ports.length > 0) {
          await connectSerial()
        }
      } catch (e) {
        console.warn('[自动连接] 串口自动连接失败:', e)
      }
    } else if (mode === 'ble') {
      const targetMac = params.get('mac')
      try {
        if ('getDevices' in navigator.bluetooth) {
          const devices = await navigator.bluetooth.getDevices()
          for (const d of devices) {
            try {
              await d.gatt.connect()
              // 连接成功后走正常流程
              connected.value = true
              connectionMode.value = 'ble'
              // 重新走完整连接流程
              ble.disconnect()
              await connectBle()
              return
            } catch (_) {
              // 此设备不可用，尝试下一个
            }
          }
        }
      } catch (e) {
        console.warn('[自动连接] BLE 自动连接失败:', e)
      }
    }
  }

  return {
    connected: readonly(connected),
    connectionMode: readonly(connectionMode),
    sensor: readonly(sensor),
    settings: readonly(settings),
    deviceInfo: readonly(deviceInfo),

    connectBle,
    connectSerial,
    disconnect,
    saveSettings,
    updateSetting,
    autoConnectFromUrl,
  }
}
