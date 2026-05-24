/**
 * Tauri BLE 适配层
 *
 * 基于 tauri-plugin-blec（btleplug）封装，API 与 web/src/lib/ble.js 对齐
 * 供 useConnection.js 透明切换，无需修改上层逻辑
 *
 * 核心流程：
 * 1. scanDevices() → 扫描附近 BLE 设备
 * 2. connect(address, onSensorData, onDisconnect) → 连接指定设备
 * 3. subscribe(charUuid, service, handler) → 订阅传感器通知
 * 4. read(charUuid) / send(charUuid, data) → 读写特征值
 * 5. disconnect() → 断开连接
 *
 * 数据格式：
 * - blec 插件使用 number[] 传输二进制数据
 * - 本模块负责 number[] ↔ ArrayBuffer 互转
 */

import {
  startScan,
  stopScan,
  checkPermissions,
  getAdapterState,
  connect as blecConnect,
  disconnect as blecDisconnect,
  read as blecRead,
  readString as blecReadString,
  send as blecSend,
  subscribe as blecSubscribe,
} from '@mnlphlp/plugin-blec'

const SERVICE_UUID       = '12345678-1234-1234-1234-123456789abc'
const SETTINGS_CHAR_UUID = '12345678-1234-1234-1234-123456789abd'
const SENSOR_CHAR_UUID   = '12345678-1234-1234-1234-123456789abe'
const DEVICE_INFO_UUID   = '12345678-1234-1234-1234-123456789abf'

const DEVICE_NAME_KEYWORDS = ['智能花盆', 'SmartFlowerPot', 'SFP']
const SERVICE_UUID_LOWER = SERVICE_UUID.toLowerCase()

const MAX_RECONNECT     = 5
const RECONNECT_DELAY   = 2000

let connectedAddress    = null
let onDisconnectCb      = null
let onSensorDataCb      = null
let reconnectAttempts   = 0
let reconnectTimer      = null
let userInitiatedDisconnect = false

/**
 * number[] → ArrayBuffer
 * @param {number[]} numbers
 * @returns {ArrayBuffer}
 */
const numbersToArrayBuffer = (numbers) => {
  const bytes = new Uint8Array(numbers)
  return bytes.buffer
}

/**
 * ArrayBuffer → number[]
 * @param {ArrayBuffer} buffer
 * @returns {number[]}
 */
const arrayBufferToNumbers = (buffer) => {
  return Array.from(new Uint8Array(buffer))
}

/**
 * 判断设备是否为本项目智能花盆
 * 匹配规则（满足任一即可）：
 * 1. 设备的 services 列表包含本项目的 Service UUID
 * 2. 设备名称包含关键词（智能花盆 / SmartFlowerPot / SFP）
 *
 * @param {{ name: string, services: string[], address: string }} device
 * @returns {boolean}
 */
const isFlowerPotDevice = (device) => {
  if (device.services && device.services.length > 0) {
    const hasService = device.services.some(
      (s) => s.toLowerCase() === SERVICE_UUID_LOWER
    )
    if (hasService) return true
  }

  if (device.name) {
    const nameLower = device.name.toLowerCase()
    if (DEVICE_NAME_KEYWORDS.some((kw) => nameLower.includes(kw.toLowerCase()))) {
      return true
    }
  }

  return false
}

/**
 * 开始扫描 BLE 设备（流式回调，仅返回智能花盆设备）
 *
 * 关键：startScan 的 invoke 立即返回，扫描在 Rust 后台持续 timeoutMs 毫秒
 * 设备通过 Channel 异步推送，onDevice 回调在扫描过程中实时触发
 * 调用方无需等待扫描结束，设备发现后立即可见
 *
 * @param {function} onDevice - 发现新设备时的回调 (device: BleDevice) => void
 * @param {number} [timeoutMs=10000] - 扫描持续时间
 */
export async function scanDevices(onDevice, timeoutMs = 10000) {
  const seen = new Set()

  try {
    const adapterState = await getAdapterState()
    console.log('[BLE/Tauri] 蓝牙适配器状态:', adapterState)
    if (adapterState === 'Off') {
      console.warn('[BLE/Tauri] 蓝牙适配器已关闭')
      return
    }
  } catch (e) {
    console.warn('[BLE/Tauri] 获取适配器状态失败（Windows 上可忽略）:', e)
  }

  try {
    const granted = await checkPermissions(true)
    console.log('[BLE/Tauri] 权限检查结果:', granted)
  } catch (e) {
    console.warn('[BLE/Tauri] 权限检查失败（Windows 上可忽略）:', e)
  }

  try {
    console.log('[BLE/Tauri] 开始扫描，超时:', timeoutMs, 'ms')
    await startScan((devices) => {
      console.log('[BLE/Tauri] 扫描回调触发，收到设备:', devices.length, '个')
      for (const device of devices) {
        if (seen.has(device.address)) continue
        seen.add(device.address)

        if (!isFlowerPotDevice(device)) {
          console.log('[BLE/Tauri] 过滤无关设备:', device.name || '未知', device.address)
          continue
        }

        console.log('[BLE/Tauri] 发现花盆设备:', device.name || '未知', device.address)
        onDevice(device)
      }
    }, timeoutMs)
    console.log('[BLE/Tauri] startScan 已返回（扫描在后台继续）')
  } catch (e) {
    console.error('[BLE/Tauri] 扫描启动异常:', e)
    throw e
  }
}

/**
 * 停止 BLE 扫描
 */
export async function stopScanDevices() {
  try {
    await stopScan()
    console.log('[BLE/Tauri] 扫描已停止')
  } catch (e) {
    console.warn('[BLE/Tauri] 停止扫描失败:', e)
  }
}

/**
 * 扫描并自动连接指定地址的 BLE 设备
 *
 * btleplug 要求先扫描发现设备后才能连接，启动时直接 connect 必定失败
 * 本函数先扫描，发现目标地址后立即停止扫描并连接
 *
 * 关键：startScan 是流式 API，invoke 立即返回，设备通过 Channel 异步推送
 * 因此不能用 await startScan() 阻塞等待扫描结果
 * 改用 Promise + setTimeout 实现真正的等待逻辑
 *
 * @param {string} address - 目标设备地址
 * @param {function} onSensorData - 传感器数据回调
 * @param {function} onDisconnect - 断开连接回调
 * @param {number} [timeoutMs=10000] - 扫描超时
 * @returns {Promise<boolean>} 连接是否成功
 */
export async function scanAndConnect(address, onSensorData, onDisconnect, timeoutMs = 10000) {
  console.log('[BLE/Tauri] 扫描并连接:', address, '超时:', timeoutMs, 'ms')

  const addressLower = address.toLowerCase()

  const found = await new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        console.warn('[BLE/Tauri] 扫描超时，未发现目标设备:', address)
        stopScanDevices()
        resolve(false)
      }
    }, timeoutMs)

    scanDevices((device) => {
      if (settled) return
      if (device.address.toLowerCase() === addressLower) {
        console.log('[BLE/Tauri] 扫描到目标设备:', device.name || '未知', device.address)
        settled = true
        clearTimeout(timer)
        stopScanDevices()
        resolve(true)
      }
    }, timeoutMs).catch((e) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        console.error('[BLE/Tauri] 扫描异常:', e)
        resolve(false)
      }
    })
  })

  if (!found) return false

  try {
    await connect(address, onSensorData, onDisconnect)
    return true
  } catch (e) {
    console.error('[BLE/Tauri] 扫描到设备但连接失败:', e)
    return false
  }
}

/**
 * 连接 BLE 设备（手动选择后调用）
 * @param {string} address - 设备地址
 * @param {function} onSensorData - 传感器数据回调 (buffer: ArrayBuffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connect(address, onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect
  userInitiatedDisconnect = false

  try {
    console.log('[BLE/Tauri] 正在连接设备:', address)

    await blecConnect(address, () => {
      console.warn('[BLE/Tauri] ⚠ 设备已断开')
      if (!userInitiatedDisconnect) {
        cleanup()
        onDisconnectCb?.()
        attemptReconnect()
      }
    })

    connectedAddress = address

    await subscribeSensor()

    reconnectAttempts = 0
    console.log('[BLE/Tauri] ✅ 连接成功')
    return true
  } catch (error) {
    console.error('[BLE/Tauri] 连接失败:', error)
    cleanup()
    throw error
  }
}

/**
 * 使用已保存的地址自动连接（无需用户操作）
 * @param {string} address - 设备地址
 * @param {function} onSensorData - 传感器数据回调
 * @param {function} onDisconnect - 断开连接回调
 * @returns {Promise<boolean>}
 */
export async function connectWithDevice(address, onSensorData, onDisconnect) {
  return connect(address, onSensorData, onDisconnect)
}

/**
 * 订阅传感器特征通知
 * blec subscribe 签名: subscribe(characteristic, service, handler)
 * handler 接收 number[]
 */
async function subscribeSensor() {
  try {
    await blecSubscribe(SENSOR_CHAR_UUID, (data) => {
      if (data && onSensorDataCb) {
        const buffer = numbersToArrayBuffer(data)
        onSensorDataCb(buffer)
      }
    })
    console.log('[BLE/Tauri] 传感器通知已订阅')
  } catch (e) {
    console.warn('[BLE/Tauri] 订阅传感器通知失败:', e)
  }
}

/**
 * 断开 BLE 连接
 */
export function disconnect() {
  userInitiatedDisconnect = true
  clearReconnectTimer()
  blecDisconnect()
  cleanup()
}

/**
 * 读取设备设置（11 字节 ArrayBuffer）
 * @returns {Promise<ArrayBuffer>}
 */
export async function readSettings() {
  if (!connectedAddress) throw new Error('未连接到设备')
  const numbers = await blecRead(SETTINGS_CHAR_UUID, SERVICE_UUID)
  return numbersToArrayBuffer(numbers)
}

/**
 * 写入设备设置（11 字节 ArrayBuffer）
 * @param {ArrayBuffer} buffer
 */
export async function writeSettings(buffer) {
  if (!connectedAddress) throw new Error('未连接到设备')
  const numbers = arrayBufferToNumbers(buffer)
  await blecSend(SETTINGS_CHAR_UUID, numbers, 'withResponse', SERVICE_UUID)
  console.log('[BLE/Tauri] 已写入设置:', new Uint8Array(buffer))
}

/**
 * 读取设备信息字符串
 * @returns {Promise<string>}
 */
export async function readDeviceInfo() {
  if (!connectedAddress) throw new Error('未连接到设备')
  return blecReadString(DEVICE_INFO_UUID, SERVICE_UUID)
}

/**
 * 查询当前 BLE 连接状态
 * @returns {boolean}
 */
export function isConnected() {
  return connectedAddress != null
}

/**
 * 获取当前连接的设备地址
 * @returns {string|null}
 */
export function getConnectedAddress() {
  return connectedAddress
}

function cleanup() {
  connectedAddress = null
}

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.warn(`[BLE/Tauri] 已达最大重连次数 (${MAX_RECONNECT})，停止重连`)
    return
  }
  if (!connectedAddress) return

  reconnectAttempts++
  console.log(`[BLE/Tauri] 尝试重连 ${reconnectAttempts} / ${MAX_RECONNECT}...`)

  reconnectTimer = setTimeout(async () => {
    try {
      await connect(connectedAddress, onSensorDataCb, onDisconnectCb)
    } catch (_) {
      attemptReconnect()
    }
  }, RECONNECT_DELAY)
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}
