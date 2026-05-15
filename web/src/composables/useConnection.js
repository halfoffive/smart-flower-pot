/**
 * 连接管理组合式函数
 *
 * 统一管理 BLE / Serial 双模连接、传感器数据流、设置读写、设备信息
 * 通过 provide/inject 在组件树中共享
 *
 * 修复：
 * - 连接与数据读取分离：连接失败才弹错误，读取失败仅 warn 不阻断
 * - saveSettings 发送实际方向值，不再替换为 0xFF（方向保存与水泵触发解耦）
 * - 串口自动连接使用 connectWithPort() 直连已授权端口（无需用户手势）
 * - BLE 自动连接增加可用性前置检查
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

/**
 * 连接管理组合式函数
 * @param {function} showAlert - 显示错误对话框
 * @param {function} showToast - 显示轻量通知
 * @returns {object}
 */
export function useConnection(showAlert, showToast) {

  /** 传感器数据回调（两种连接模式共用） */
  function onSensorData(buffer) {
    sensor.value = deserializeSensor(buffer)
  }

  /** 断开回调（设备异常断开时触发） */
  function onDisconnect() {
    connected.value = false
    connectionMode.value = null
    sensor.value = null
    deviceInfo.value = null
  }

  /**
   * 连接后读取设备数据（设置 + 设备信息）
   * 读取失败仅 console.warn，不阻断连接状态
   */
  async function readDeviceData(conn) {
    try {
      const settingsBuf = await conn.readSettings()
      settings.value = deserializeSettings(settingsBuf)
    } catch (e) {
      console.warn('[连接] 读取设置失败:', e)
    }

    try {
      const infoStr = await conn.readDeviceInfo()
      deviceInfo.value = parseDeviceInfo(infoStr)
    } catch (e) {
      console.warn('[连接] 读取设备信息失败:', e)
    }
  }

  /** BLE 连接 */
  async function connectBle() {
    try {
      await ble.connect(onSensorData, onDisconnect)

      connected.value = true
      connectionMode.value = 'ble'
      updateUrlQuery()

      await readDeviceData(ble)
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
      updateUrlQuery()

      await readDeviceData(serial)
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

  /**
   * 保存设置到设备
   * 发送实际方向值（0 或 1），不再使用 0xFF 标志
   * 固件仅在速度从 0 变为非 0 时才触发水泵，保存设置不会误触发
   */
  async function saveSettings() {
    const conn = connectionMode.value === 'ble' ? ble : serial
    if (!conn.isConnected()) {
      showAlert('请先连接设备', '提示')
      return
    }
    try {
      const buf = serializeSettings(settings.value)
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
        if (!('serial' in navigator)) return

        const ports = await navigator.serial.getPorts()
        if (ports.length === 0) {
          console.warn('[自动连接] 无已授权的串口设备')
          return
        }

        // 使用 connectWithPort 直连已授权端口，跳过 requestPort（无需用户手势）
        await serial.connectWithPort(ports[0], onSensorData, onDisconnect)

        connected.value = true
        connectionMode.value = 'serial'
        updateUrlQuery()

        await readDeviceData(serial)
        console.log('[自动连接] 串口自动连接成功')
      } catch (e) {
        console.warn('[自动连接] 串口自动连接失败:', e)
      }
    } else if (mode === 'ble') {
      try {
        if (!('bluetooth' in navigator)) {
          console.warn('[自动连接] 浏览器不支持 Web Bluetooth')
          return
        }
        if (!('getDevices' in navigator.bluetooth)) {
          console.warn('[自动连接] 浏览器不支持 Bluetooth.getDevices()')
          return
        }

        const devices = await navigator.bluetooth.getDevices()
        if (devices.length === 0) {
          console.warn('[自动连接] 无已配对的蓝牙设备')
          return
        }

        for (const d of devices) {
          try {
            // 使用 connectWithDevice 直连，跳过 requestDevice（无需用户手势）
            await ble.connectWithDevice(d, onSensorData, onDisconnect)

            connected.value = true
            connectionMode.value = 'ble'
            updateUrlQuery()

            await readDeviceData(ble)
            console.log('[自动连接] BLE 自动连接成功')
            return
          } catch (_) {
            // 此设备不可用，尝试下一个
          }
        }

        console.warn('[自动连接] 所有已配对设备均无法连接')
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
