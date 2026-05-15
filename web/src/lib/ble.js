/**
 * Web Bluetooth API 封装模块
 * 职责：BLE 连接管理、特征读写、通知订阅、自动重连
 *
 * 修复：
 * - 传感器通知回调使用正确的 buffer 切片（byteOffset 处理）
 * - 增加 userInitiatedDisconnect 标志防止主动断开时 onDisconnectCb 重复触发
 * - 新增 connectWithDevice() 支持 URL 自动连接（无需用户手势）
 */

const SERVICE_UUID       = '12345678-1234-1234-1234-123456789abc'
const SETTINGS_CHAR_UUID = '12345678-1234-1234-1234-123456789abd'
const SENSOR_CHAR_UUID   = '12345678-1234-1234-1234-123456789abe'
const DEVICE_INFO_UUID   = '12345678-1234-1234-1234-123456789abf'

const MAX_RECONNECT     = 5
const RECONNECT_DELAY   = 2000

let device         = null
let server         = null
let settingsChar   = null
let sensorChar     = null
let deviceInfoChar = null

let onDisconnectCb       = null
let onSensorDataCb       = null
let reconnectAttempts    = 0
let reconnectTimer       = null
let userInitiatedDisconnect = false

/**
 * 内部：从 GATT 服务器获取服务与特征，启动通知订阅
 * 由 connect() 和 connectWithDevice() 共用
 * @param {BluetoothRemoteGATTServer} gattServer
 */
async function setupGattConnection(gattServer) {
  console.log('[BLE] 正在获取服务与特征...')
  const service = await gattServer.getPrimaryService(SERVICE_UUID)

  settingsChar   = await service.getCharacteristic(SETTINGS_CHAR_UUID)
  sensorChar     = await service.getCharacteristic(SENSOR_CHAR_UUID)
  deviceInfoChar = await service.getCharacteristic(DEVICE_INFO_UUID)

  await sensorChar.startNotifications()
  sensorChar.addEventListener('characteristicvaluechanged', (event) => {
    const dv = event.target.value
    const ab = dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength)
    onSensorDataCb?.(ab)
  })

  reconnectAttempts = 0
}

/**
 * 用户手动连接：弹出设备选择器（需要用户手势）
 * @param {function} onSensorData - 传感器数据回调 (buffer: ArrayBuffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connect(onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect
  userInitiatedDisconnect = false

  try {
    console.log('[BLE] 正在搜索设备...')

    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: '智能花盆' }],
      optionalServices: [SERVICE_UUID],
    })

    device.addEventListener('gattserverdisconnected', handleDisconnect)

    console.log('[BLE] 正在连接 GATT 服务器...')
    server = await device.gatt.connect()

    await setupGattConnection(server)

    console.log('[BLE] ✅ 连接成功')
    return true

  } catch (error) {
    console.error('[BLE] 连接失败:', error)
    cleanup()
    throw error
  }
}

/**
 * URL 自动连接：使用已配对的设备对象直连（无需用户手势）
 * 配合 navigator.bluetooth.getDevices() 使用，跳过 requestDevice() 步骤
 * @param {BluetoothDevice} btDevice - 已通过 getDevices() 获取的设备
 * @param {function} onSensorData - 传感器数据回调 (buffer: ArrayBuffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connectWithDevice(btDevice, onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect
  userInitiatedDisconnect = false

  try {
    device = btDevice
    device.addEventListener('gattserverdisconnected', handleDisconnect)

    console.log('[BLE] 自动连接：使用已有设备对象...')
    server = await device.gatt.connect()

    await setupGattConnection(server)

    console.log('[BLE] ✅ 自动连接成功')
    return true

  } catch (error) {
    console.error('[BLE] 自动连接失败:', error)
    cleanup()
    throw error
  }
}

/**
 * 断开 BLE 连接
 */
export function disconnect() {
  userInitiatedDisconnect = true
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
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
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

function handleDisconnect() {
  console.warn('[BLE] ⚠ 设备已断开')
  cleanup()
  if (!userInitiatedDisconnect) {
    onDisconnectCb?.()
    attemptReconnect()
  }
}

function cleanup() {
  settingsChar   = null
  sensorChar     = null
  deviceInfoChar = null
  server         = null
  device         = null
}

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

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}
