/**
 * Tauri 串口适配层
 *
 * 基于 tauri-plugin-serialplugin 封装，API 与 web/src/lib/serial.js 对齐
 * 供 useConnection.js 透明切换，无需修改上层逻辑
 *
 * 核心流程：
 * 1. listPorts() → 列出可用串口
 * 2. connect(path, onSensorData, onDisconnect) → 打开串口并启动读取
 * 3. readSettings() / writeSettings() / readDeviceInfo() → 收发帧协议
 * 4. disconnect() → 关闭串口
 *
 * 帧协议与 Web 端完全一致（纯函数复用）：
 *   [0-1] 帧头: 0xAA 0x55
 *   [2]   类型: 0x01=传感器, 0x02=设置, 0x03=设备信息, 0x04=读取设置请求
 *   [3]   长度: 数据载荷长度
 *   [4..N] 数据载荷
 *   [N+1] XOR 校验
 */

import { SerialPort } from 'tauri-plugin-serialplugin-api'

const FRAME_HEADER_1 = 0xAA
const FRAME_HEADER_2 = 0x55
const TYPE_SENSOR = 0x01
const TYPE_SETTINGS = 0x02
const TYPE_DEVICE_INFO = 0x03
const TYPE_READ_SETTINGS = 0x04
const BAUD_RATE = 115200
const FRAME_PAYLOAD_OFFSET = 4
const FRAME_CHECKSUM_BYTES = 1

let port = null
let connected = false
let onDisconnectCb = null
let onSensorDataCb = null
let userInitiatedDisconnect = false
let listenUnsubscribe = null

let rxBuffer = new Uint8Array(0)
let pendingResponse = null

/**
 * 列出可用串口
 * @returns {Promise<Array<{path: string, ...}>>}
 */
export async function listPorts() {
  const ports = await SerialPort.available_ports()
  return Object.entries(ports).map(([path, info]) => ({
    path,
    ...info,
  }))
}

/**
 * 连接串口（用户选择后调用）
 * @param {string} path - 串口路径（如 COM3 或 /dev/ttyUSB0）
 * @param {function} onSensorData - 传感器数据回调 (buffer: ArrayBuffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connect(path, onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect
  userInitiatedDisconnect = false

  try {
    console.log('[Serial/Tauri] 正在打开串口:', path)

    port = new SerialPort({ path, baudRate: BAUD_RATE })
    await port.open()

    connected = true
    console.log('[Serial/Tauri] 串口已打开，波特率:', BAUD_RATE)

    await port.startListening()

    listenUnsubscribe = await port.listen((data) => {
      let bytes
      if (data instanceof Uint8Array) {
        bytes = data
      } else if (typeof data === 'string') {
        bytes = hexStringToUint8Array(data)
      } else {
        return
      }
      rxBuffer = appendRxBuffer(rxBuffer, bytes)
      processRxBuffer()
    })

    console.log('[Serial/Tauri] ✅ 连接成功')
    return true
  } catch (error) {
    console.error('[Serial/Tauri] 连接失败:', error)
    await cleanup()
    throw error
  }
}

/**
 * 使用指定路径自动连接（无需用户操作）
 * @param {string} path - 串口路径
 * @param {function} onSensorData - 传感器数据回调
 * @param {function} onDisconnect - 断开连接回调
 * @returns {Promise<boolean>}
 */
export async function connectWithPort(path, onSensorData, onDisconnect) {
  return connect(path, onSensorData, onDisconnect)
}

/**
 * 断开串口连接
 */
export async function disconnect() {
  userInitiatedDisconnect = true
  connected = false
  await cleanup()
}

/**
 * 读取设备当前设置
 * @returns {Promise<ArrayBuffer>}
 */
export async function readSettings() {
  if (!connected) throw new Error('未连接到设备')

  const frame = buildFrame(TYPE_READ_SETTINGS, new Uint8Array(0))
  await writeFrame(frame)
  return waitForResponse(TYPE_SETTINGS, 5000)
}

/**
 * 写入设备设置
 * @param {ArrayBuffer} buffer - 11 字节设置数据
 */
export async function writeSettings(buffer) {
  if (!connected) throw new Error('未连接到设备')

  const frame = buildFrame(TYPE_SETTINGS, new Uint8Array(buffer))
  await writeFrame(frame)
  console.log('[Serial/Tauri] 已写入设置:', new Uint8Array(buffer))
}

/**
 * 读取设备信息字符串
 * @returns {Promise<string>}
 */
export async function readDeviceInfo() {
  if (!connected) throw new Error('未连接到设备')

  const frame = buildFrame(TYPE_DEVICE_INFO, new Uint8Array(0))
  await writeFrame(frame)

  const buffer = await waitForResponse(TYPE_DEVICE_INFO, 5000)
  return new TextDecoder().decode(buffer)
}

/**
 * 查询当前串口连接状态
 * @returns {boolean}
 */
export function isConnected() {
  return connected && port != null
}

/**
 * 获取当前串口路径
 * @returns {string|null}
 */
export function getPortPath() {
  return port?._path ?? null
}

/**
 * 获取当前串口设备信息（兼容 Web 端 getPortInfo 接口）
 * Tauri 串口插件不直接暴露 USB VID/PID，返回路径信息
 * @returns {{ portPath: string } | null}
 */
export function getPortInfo() {
  if (!port) return null
  return { portPath: port._path ?? null }
}

// ═══════════════════════════════════════════
// 帧协议纯函数（与 Web 端 serial.js 完全一致）
// ═══════════════════════════════════════════

function appendRxBuffer(buffer, chunk) {
  const combined = new Uint8Array(buffer.length + chunk.length)
  combined.set(buffer)
  combined.set(chunk, buffer.length)
  return combined
}

function processRxBuffer() {
  while (rxBuffer.length >= 5) {
    const headerIdx = findFrameHeader(rxBuffer)

    if (headerIdx === -1) {
      rxBuffer = rxBuffer.length > 0 ? rxBuffer.slice(-1) : new Uint8Array(0)
      return
    }

    if (headerIdx > 0) {
      rxBuffer = rxBuffer.slice(headerIdx)
    }

    if (rxBuffer.length < FRAME_PAYLOAD_OFFSET) return

    const type = rxBuffer[2]
    const payloadLen = rxBuffer[3]
    const totalLen = FRAME_PAYLOAD_OFFSET + payloadLen + FRAME_CHECKSUM_BYTES

    if (rxBuffer.length < totalLen) return

    const frame = rxBuffer.slice(0, totalLen)
    rxBuffer = rxBuffer.slice(totalLen)

    if (!verifyFrame(frame)) {
      console.warn('[Serial/Tauri] 帧校验失败，丢弃')
      continue
    }

    const payload = frame.slice(FRAME_PAYLOAD_OFFSET, FRAME_PAYLOAD_OFFSET + payloadLen)
    handleFrame(type, payload)
  }
}

function findFrameHeader(buffer) {
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === FRAME_HEADER_1 && buffer[i + 1] === FRAME_HEADER_2) {
      return i
    }
  }
  return -1
}

function verifyFrame(frame) {
  let xor = 0
  for (let i = 0; i < frame.length - 1; i++) {
    xor ^= frame[i]
  }
  return xor === frame[frame.length - 1]
}

function handleFrame(type, payload) {
  switch (type) {
    case TYPE_SENSOR:
      if (payload.length === 6) {
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
        onSensorDataCb?.(ab)
      }
      break

    case TYPE_SETTINGS:
      if (pendingResponse) {
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
        pendingResponse.resolve(ab)
        pendingResponse = null
      }
      break

    case TYPE_DEVICE_INFO:
      if (pendingResponse) {
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
        pendingResponse.resolve(ab)
        pendingResponse = null
      }
      break

    default:
      console.warn('[Serial/Tauri] 未知帧类型:', type)
  }
}

function buildFrame(type, payload) {
  const frameLen = FRAME_PAYLOAD_OFFSET + payload.length + FRAME_CHECKSUM_BYTES
  const frame = new Uint8Array(frameLen)

  frame[0] = FRAME_HEADER_1
  frame[1] = FRAME_HEADER_2
  frame[2] = type
  frame[3] = payload.length
  frame.set(payload, FRAME_PAYLOAD_OFFSET)
  frame[frameLen - 1] = calculateXOR(frame, frameLen - 1)

  return frame
}

function calculateXOR(data, length) {
  let xor = 0
  for (let i = 0; i < length; i++) {
    xor ^= data[i]
  }
  return xor
}

async function writeFrame(frame) {
  await port.writeBinary(frame)
}

function waitForResponse(expectedType, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingResponse = null
      reject(new Error('串口响应超时'))
    }, timeoutMs)

    pendingResponse = {
      resolve: (buffer) => {
        clearTimeout(timer)
        resolve(buffer)
      },
    }
  })
}

// ═══════════════════════════════════════════
// 数据格式转换工具
// ═══════════════════════════════════════════

/**
 * 十六进制字符串 → Uint8Array
 * tauri-plugin-serialplugin 的 listen 回调返回十六进制字符串
 * @param {string} hex - 十六进制字符串（如 "AA550106..."）
 * @returns {Uint8Array}
 */
const hexStringToUint8Array = (hex) => {
  const clean = hex.replace(/\s/g, '')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16)
  }
  return bytes
}

async function cleanup() {
  connected = false

  if (listenUnsubscribe) {
    try { await listenUnsubscribe() } catch (_) { /* 忽略 */ }
    listenUnsubscribe = null
  }

  if (port) {
    try { await port.cancelListen() } catch (_) { /* 忽略 */ }
    try { await port.close() } catch (_) { /* 忽略 */ }
    port = null
  }

  rxBuffer = new Uint8Array(0)
  pendingResponse = null
}
