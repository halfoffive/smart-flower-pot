/**
 * Web Bluetooth API 封装模块
 * 职责：BLE 连接管理、特征读写、通知订阅、自动重连
 */

// ── BLE UUID 常量（与 ESP32 固件完全一致） ──
const SERVICE_UUID       = '12345678-1234-1234-1234-123456789abc'
const SETTINGS_CHAR_UUID = '12345678-1234-1234-1234-123456789abd'
const SENSOR_CHAR_UUID   = '12345678-1234-1234-1234-123456789abe'
const DEVICE_INFO_UUID   = '12345678-1234-1234-1234-123456789abf'

// ── 重连配置 ──
const MAX_RECONNECT     = 5     // 最大重连次数
const RECONNECT_DELAY   = 2000  // 重连间隔（毫秒）

// ── 内部状态 ──
let device         = null  // BLE 设备对象
let server         = null  // GATT 服务器
let settingsChar   = null  // 设置特征
let sensorChar     = null  // 传感器特征
let deviceInfoChar = null  // 设备信息特征

let onDisconnectCb  = null  // 断开回调
let onSensorDataCb  = null  // 传感器数据回调
let reconnectAttempts = 0   // 当前重连尝试次数
let reconnectTimer    = null // 重连定时器

/**
 * 连接到智能花盆 BLE 设备
 * @param {function} onSensorData - 传感器数据回调 (buffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connect(onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect

  try {
    console.log('[BLE] 正在搜索设备...')

    // 请求用户选择 BLE 设备
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: '智能花盆' }],
      optionalServices: [SERVICE_UUID],
    })

    // 监听断开事件
    device.addEventListener('gattserverdisconnected', handleDisconnect)

    console.log('[BLE] 正在连接 GATT 服务器...')
    server = await device.gatt.connect()

    console.log('[BLE] 正在获取服务与特征...')
    const service = await server.getPrimaryService(SERVICE_UUID)

    settingsChar   = await service.getCharacteristic(SETTINGS_CHAR_UUID)
    sensorChar     = await service.getCharacteristic(SENSOR_CHAR_UUID)
    deviceInfoChar = await service.getCharacteristic(DEVICE_INFO_UUID)

    // 订阅传感器数据通知
    await sensorChar.startNotifications()
    sensorChar.addEventListener('characteristicvaluechanged', (event) => {
      const value = event.target.value.buffer
      onSensorDataCb?.(value)
    })

    // 读取设备信息
    const infoValue = await deviceInfoChar.readValue()
    const infoText  = new TextDecoder().decode(infoValue)
    console.log('[BLE] 设备信息:', infoText)

    // 重连计数归零
    reconnectAttempts = 0
    console.log('[BLE] ✅ 连接成功')
    return true

  } catch (error) {
    console.error('[BLE] 连接失败:', error)
    cleanup()
    throw error
  }
}

/**
 * 断开 BLE 连接
 */
export function disconnect() {
  clearReconnectTimer()
  if (device && device.gatt.connected) {
    device.gatt.disconnect()
  }
  cleanup()
}

/**
 * 读取设备设置（11 字节 ArrayBuffer）
 * @returns {Promise<ArrayBuffer>}
 */
export async function readSettings() {
  if (!settingsChar) throw new Error('未连接到设备')
  const value = await settingsChar.readValue()
  console.log('[BLE] 已读取设置:', new Uint8Array(value.buffer))
  return value.buffer
}

/**
 * 写入设备设置（11 字节 ArrayBuffer）
 * @param {ArrayBuffer} buffer
 */
export async function writeSettings(buffer) {
  if (!settingsChar) throw new Error('未连接到设备')
  await settingsChar.writeValue(buffer)
  console.log('[BLE] 已写入设置:', new Uint8Array(buffer))
}

/**
 * 读取设备信息字符串
 * @returns {Promise<string>}
 */
export async function readDeviceInfo() {
  if (!deviceInfoChar) throw new Error('未连接到设备')
  const value = await deviceInfoChar.readValue()
  return new TextDecoder().decode(value)
}

/**
 * 获取当前 BLE 连接状态
 * @returns {boolean}
 */
export function isConnected() {
  return device?.gatt?.connected ?? false
}

// ═══════════════════════════════════════════
//  内部函数
// ═══════════════════════════════════════════

// 处理设备断开事件
function handleDisconnect() {
  console.warn('[BLE] ⚠ 设备已断开')
  cleanup()
  onDisconnectCb?.()
  attemptReconnect()
}

// 清理 BLE 资源
function cleanup() {
  if (sensorChar) {
    try { sensorChar.removeEventListener('characteristicvaluechanged', () => {}) } catch (_) { /* 忽略 */ }
  }
  settingsChar   = null
  sensorChar     = null
  deviceInfoChar = null
  server         = null
  device         = null
}

// 尝试自动重连
function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) {
    console.warn(`[BLE] 已达最大重连次数 (${MAX_RECONNECT})，停止重连`)
    return
  }
  reconnectAttempts++
  console.log(`[BLE] 尝试重连 ${reconnectAttempts} / ${MAX_RECONNECT}...`)
  reconnectTimer = setTimeout(async () => {
    try {
      await connect(onSensorDataCb, onDisconnectCb)
    } catch (_) {
      attemptReconnect()
    }
  }, RECONNECT_DELAY)
}

// 清除重连定时器
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}
