/**
 * 连接管理组合式函数
 *
 * 统一管理 BLE / Serial 双模连接、传感器数据流、设置读写、设备信息
 * 通过 provide/inject 在组件树中共享
 *
 * 功能：
 * - 连接与数据读取分离：连接失败才弹错误，读取失败仅 warn 不阻断
 * - saveSettings 发送实际方向值，不再替换为 0xFF（方向保存与水泵触发解耦）
 * - 串口自动连接使用 connectWithPort() 直连已授权端口（无需用户手势）
 * - BLE 自动连接按 MAC 地址优先匹配
 * - 串口 URL 包含 USB VID/PID 标识
 * - connecting/saving 状态供 UI 显示进度
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

/** 进度状态 */
const connecting = ref(false)
const saving = ref(false)

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
    connecting.value = false
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
    connecting.value = true
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
    } finally {
      connecting.value = false
    }
  }

  /** 串口连接 */
  async function connectSerial() {
    connecting.value = true
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
    } finally {
      connecting.value = false
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
    connecting.value = false
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
    saving.value = true
    try {
      const buf = serializeSettings(settings.value)
      await conn.writeSettings(buf)
      showToast('✅ 设置已保存到设备')
    } catch (error) {
      console.error('保存设置失败:', error)
      showAlert('保存失败: ' + error.message, '错误')
    } finally {
      saving.value = false
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
    if (connectionMode.value === 'serial') {
      const info = serial.getPortInfo()
      if (info?.usbVendorId) {
        params.set('vid', `0x${info.usbVendorId.toString(16)}`)
      }
      if (info?.usbProductId) {
        params.set('pid', `0x${info.usbProductId.toString(16)}`)
      }
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', newUrl)
  }

  /** 清除 URL 查询字符串 */
  function clearUrlQuery() {
    window.history.replaceState(null, '', window.location.pathname)
  }

  /**
   * 根据 URL 中的 vid/pid 匹配已授权串口
   * @param {SerialPort[]} ports - 已授权端口列表
   * @param {string} vid - USB 厂商 ID（十六进制字符串，如 "0x10c4"）
   * @param {string} pid - USB 产品 ID（十六进制字符串，如 "0xea60"）
   * @returns {SerialPort|null}
   */
  function matchSerialPort(ports, vid, pid) {
    if (!vid && !pid) return ports[0] || null

    const vidNum = vid ? parseInt(vid, 16) : null
    const pidNum = pid ? parseInt(pid, 16) : null

    return ports.find((p) => {
      const info = p.getInfo()
      if (vidNum != null && info.usbVendorId !== vidNum) return false
      if (pidNum != null && info.usbProductId !== pidNum) return false
      return true
    }) || ports[0] || null
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

        const targetPort = matchSerialPort(
          ports,
          params.get('vid'),
          params.get('pid')
        )
        if (!targetPort) {
          console.warn('[自动连接] 未找到匹配的串口设备')
          return
        }

        connecting.value = true
        await serial.connectWithPort(targetPort, onSensorData, onDisconnect)

        connected.value = true
        connectionMode.value = 'serial'
        updateUrlQuery()

        await readDeviceData(serial)
        console.log('[自动连接] 串口自动连接成功')
      } catch (e) {
        console.warn('[自动连接] 串口自动连接失败:', e)
      } finally {
        connecting.value = false
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

        const targetMac = params.get('mac')

        // 按 MAC 优先排序：匹配的设备排在前面
        const sorted = targetMac
          ? [...devices].sort((a, b) => {
              if (a.id === targetMac) return -1
              if (b.id === targetMac) return 1
              return 0
            })
          : devices

        connecting.value = true
        for (const d of sorted) {
          try {
            await ble.connectWithDevice(d, onSensorData, onDisconnect)

            connected.value = true
            connectionMode.value = 'ble'
            updateUrlQuery()

            await readDeviceData(ble)
            console.log('[自动连接] BLE 自动连接成功', d.id)
            return
          } catch (_) {
            // 此设备不可用，尝试下一个
          }
        }

        console.warn('[自动连接] 所有已配对设备均无法连接')
      } catch (e) {
        console.warn('[自动连接] BLE 自动连接失败:', e)
      } finally {
        connecting.value = false
      }
    }
  }

  return {
    connected: readonly(connected),
    connectionMode: readonly(connectionMode),
    sensor: readonly(sensor),
    settings: readonly(settings),
    deviceInfo: readonly(deviceInfo),
    connecting: readonly(connecting),
    saving: readonly(saving),

    connectBle,
    connectSerial,
    disconnect,
    saveSettings,
    updateSetting,
    autoConnectFromUrl,
  }
}
