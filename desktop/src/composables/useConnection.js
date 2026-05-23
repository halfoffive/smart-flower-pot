/**
 * 连接管理组合式函数 — Tauri 客户端版
 *
 * ── 职责 ──
 * 统一管理 BLE / Serial 双模连接生命周期、传感器数据流、设置读写、设备信息
 * 通过 provide/inject 在组件树中共享状态与方法
 *
 * ── 与 Web 端差异 ──
 * - 使用 tauri-ble.js / tauri-serial.js 替代 Web Bluetooth / Web Serial API
 * - 使用 tauri-plugin-store 持久化上次连接信息（应用重启后自动重连）
 * - 使用 tauri-plugin-deep-link 解析 URL Scheme 启动参数
 * - 设备选择在应用内完成（扫描/列表），不再依赖浏览器原生弹窗
 *
 * ── 设计原则 ──
 * - 连接与数据读取分离：连接失败才弹错误，读取失败仅 warn 不阻断连接状态
 * - saveSettings 发送实际方向值，不再替换为 0xFF
 * - connecting/saving 状态供 UI 显示进度条与加载动画
 */

import { ref, readonly } from 'vue'
import * as ble from '../lib/tauri-ble.js'
import * as serial from '../lib/tauri-serial.js'
import { load, Store } from '@tauri-apps/plugin-store'
import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import {
  serializeSettings,
  deserializeSettings,
  deserializeSensor,
  parseDeviceInfo,
  DEFAULT_SETTINGS,
} from '../lib/settings.js'

const STORE_KEY = 'sfp-last-connection'
const STORE_FILE = 'connection-store.json'

// ═══════════════════════════════════════════
// 模块级响应式状态（跨组件共享）
// ═══════════════════════════════════════════

const connected = ref(false)
const connectionMode = ref(null)
const sensor = ref(null)
const settings = ref({ ...DEFAULT_SETTINGS })
const deviceInfo = ref(null)
const connecting = ref(false)
const saving = ref(false)
const lastConnection = ref(null)

let storeInstance = null

/**
 * 获取 Store 实例（懒加载）
 * @returns {Promise<Store>}
 */
const getStore = async () => {
  if (!storeInstance) {
    storeInstance = await load(STORE_FILE, { autoSave: false })
  }
  return storeInstance
}

/**
 * 连接管理组合式函数
 * @param {function} showAlert - 显示错误对话框
 * @param {function} showToast - 显示轻量通知
 * @returns {{
 *   connected, connectionMode, sensor, settings, deviceInfo,
 *   connecting, saving,
 *   connectBle, connectSerial, disconnect, saveSettings, updateSetting,
 *   autoReconnect, autoConnectFromUrl, setupDeepLink,
 * }}
 */
export function useConnection(showAlert, showToast) {

  /**
   * 传感器数据回调
   * @param {ArrayBuffer} buffer - 6 字节传感器数据
   */
  const onSensorData = (buffer) => {
    sensor.value = deserializeSensor(buffer)
  }

  /**
   * 断开连接回调
   */
  const onDisconnect = () => {
    connected.value = false
    connectionMode.value = null
    sensor.value = null
    deviceInfo.value = null
    connecting.value = false
  }

  /**
   * 连接后读取设备数据（设置 + 设备信息）
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

  /**
   * BLE 连接（传入用户选择的设备地址）
   * @param {string} address - BLE 设备地址
   */
  async function connectBle(address) {
    connecting.value = true
    try {
      await ble.connect(address, onSensorData, onDisconnect)

      connected.value = true
      connectionMode.value = 'ble'
      connecting.value = false

      readDeviceData(ble).then(() => {
        saveLastConnection({ mode: 'ble', address })
        console.log('[连接] BLE 连接成功:', address)
      }).catch((e) => {
        console.warn('[连接] BLE 连接后读取数据失败:', e)
        saveLastConnection({ mode: 'ble', address })
      })
    } catch (error) {
      console.error('BLE 连接失败:', error)
      connecting.value = false
      showAlert(
        '1. ESP32-C6 已上电且运行\n' +
        '2. 设备蓝牙已开启\n' +
        '3. 设备未被其他程序占用',
        '蓝牙连接失败'
      )
    }
  }

  /**
   * 串口连接（传入用户选择的串口路径）
   * @param {string} path - 串口路径
   */
  async function connectSerial(path) {
    connecting.value = true
    try {
      await serial.connect(path, onSensorData, onDisconnect)

      connected.value = true
      connectionMode.value = 'serial'
      connecting.value = false

      readDeviceData(serial).then(() => {
        saveLastConnection({ mode: 'serial', path })
        console.log('[连接] 串口连接成功:', path)
      }).catch((e) => {
        console.warn('[连接] 串口连接后读取数据失败:', e)
        saveLastConnection({ mode: 'serial', path })
      })
    } catch (error) {
      console.error('Serial 连接失败:', error)
      connecting.value = false
      showAlert(
        '1. ESP32-C6 已通过 USB 连接\n' +
        '2. 未占用串口的其他程序（如 Arduino IDE 串口监视器）\n' +
        '3. 串口驱动已正确安装',
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
    connecting.value = false
    await clearLastConnection()
  }

  /** 保存设置到设备 */
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

  /** 更新单个设置值 */
  function updateSetting(key, value) {
    settings.value = { ...settings.value, [key]: value }
  }

  // ═══════════════════════════════════════════
  // 持久化：上次连接信息
  // ═══════════════════════════════════════════

  /**
   * 保存上次连接信息到 Store
   * @param {{ mode: string, address?: string, path?: string }} info
   */
  async function saveLastConnection(info) {
    try {
      const store = await getStore()
      await store.set(STORE_KEY, info)
      await store.save()
      console.log('[持久化] 已保存连接信息:', info)
    } catch (e) {
      console.warn('[持久化] 保存失败:', e)
    }
  }

  /** 清除上次连接信息 */
  async function clearLastConnection() {
    try {
      const store = await getStore()
      await store.delete(STORE_KEY)
      await store.save()
    } catch (e) {
      console.warn('[持久化] 清除失败:', e)
    }
  }

  /**
   * 读取上次连接信息
   * @returns {Promise<{ mode: string, address?: string, path?: string } | null>}
   */
  async function loadLastConnection() {
    try {
      const store = await getStore()
      return await store.get(STORE_KEY)
    } catch (e) {
      console.warn('[持久化] 读取失败:', e)
      return null
    }
  }

  // ═══════════════════════════════════════════
  // 自动重连（应用启动时）
  // ═══════════════════════════════════════════

  /**
   * 应用启动时自动重连上次设备
   * BLE：先扫描发现设备再连接（btleplug 要求先扫描）
   * Serial：直接连接（串口不需要扫描）
   */
  async function autoReconnect() {
    const last = await loadLastConnection()
    if (!last) return

    lastConnection.value = last
    console.log('[自动重连] 尝试重连上次设备:', last)

    connecting.value = true
    try {
      if (last.mode === 'ble' && last.address) {
        const ok = await ble.scanAndConnect(last.address, onSensorData, onDisconnect)
        if (ok) {
          connected.value = true
          connectionMode.value = 'ble'
          connecting.value = false
          readDeviceData(ble).then(() => {
            console.log('[自动重连] BLE 重连成功:', last.address)
          })
        } else {
          console.warn('[自动重连] BLE 自动重连失败（未扫描到设备）')
          connecting.value = false
        }
      } else if (last.mode === 'serial' && last.path) {
        await serial.connect(last.path, onSensorData, onDisconnect)
        connected.value = true
        connectionMode.value = 'serial'
        connecting.value = false
        readDeviceData(serial).then(() => {
          console.log('[自动重连] 串口重连成功:', last.path)
        })
      }
    } catch (e) {
      console.warn('[自动重连] 自动重连失败:', e)
      connected.value = false
      connectionMode.value = null
      connecting.value = false
    }
  }

  // ═══════════════════════════════════════════
  // Deep Link 自动连接
  // ═══════════════════════════════════════════

  /**
   * 从 URL 参数自动连接
   * 支持 deep-link 格式：smart-flower-pot://connect?mode=ble&mac=XX:XX:XX:XX:XX:XX
   * 也支持普通 URL 格式：?mode=ble&mac=XX:XX:XX:XX:XX:XX
   *
   * @param {string} url - 深度链接 URL
   */
  async function autoConnectFromUrl(url) {
    try {
      const urlObj = new URL(url)
      const params = urlObj.searchParams
      const mode = params.get('mode')
      if (!mode) return

      console.log('[Deep Link] 解析连接参数:', { mode, mac: params.get('mac'), path: params.get('path') })

      if (mode === 'ble') {
        const address = params.get('mac') || params.get('address')
        if (address) {
          await connectBle(address)
        }
      } else if (mode === 'serial') {
        const path = params.get('path')
        if (path) {
          await connectSerial(path)
        }
      }
    } catch (e) {
      console.warn('[Deep Link] 解析失败:', e)
    }
  }

  /**
   * 注册 Deep Link 监听器
   * 应用运行中收到深度链接时自动连接
   */
  async function setupDeepLink() {
    try {
      await onOpenUrl((urls) => {
        if (urls && urls.length > 0) {
          autoConnectFromUrl(urls[0])
        }
      })
      console.log('[Deep Link] 监听器已注册')
    } catch (e) {
      console.warn('[Deep Link] 监听器注册失败:', e)
    }
  }

  /**
   * 尝试快速重连上次 BLE 设备
   * 供 ConnectPanel 在用户点击"蓝牙连接"时优先调用
   * 使用 scanAndConnect 先扫描再连接，成功返回 true，失败返回 false
   *
   * @returns {Promise<boolean>}
   */
  async function tryQuickBleConnect() {
    const last = lastConnection.value || await loadLastConnection()
    if (!last || last.mode !== 'ble' || !last.address) return false

    console.log('[快速重连] 尝试连接上次 BLE 设备:', last.address)
    connecting.value = true

    const ok = await ble.scanAndConnect(last.address, onSensorData, onDisconnect)
    if (ok) {
      connected.value = true
      connectionMode.value = 'ble'
      connecting.value = false

      readDeviceData(ble).then(() => {
        saveLastConnection({ mode: 'ble', address: last.address })
        console.log('[快速重连] BLE 连接成功:', last.address)
      }).catch(() => {
        saveLastConnection({ mode: 'ble', address: last.address })
      })

      return true
    }

    console.warn('[快速重连] 快速重连失败，将回退到扫描模式')
    connecting.value = false
    return false
  }

  return {
    connected: readonly(connected),
    connectionMode: readonly(connectionMode),
    sensor: readonly(sensor),
    settings: readonly(settings),
    deviceInfo: readonly(deviceInfo),
    connecting: readonly(connecting),
    saving: readonly(saving),
    lastConnection: readonly(lastConnection),

    connectBle,
    connectSerial,
    disconnect,
    saveSettings,
    updateSetting,
    autoReconnect,
    autoConnectFromUrl,
    setupDeepLink,
    tryQuickBleConnect,
  }
}
