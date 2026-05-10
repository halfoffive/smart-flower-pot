/**
 * Web Serial API 封装模块
 * 职责：串口连接管理、二进制帧读写、传感器数据接收
 *
 * 帧格式（与 ESP32 固件一致）：
 *   [0-1] 帧头: 0xAA 0x55
 *   [2]   类型: 0x01=传感器, 0x02=设置, 0x03=设备信息, 0x04=读取设置请求
 *   [3]   长度: 数据载荷长度
 *   [4..N] 数据载荷
 *   [N+1] XOR 校验（帧头到载荷的异或和）
 */

// ── 帧类型常量 ──
const FRAME_HEADER = [0xAA, 0x55]
const TYPE_SENSOR = 0x01
const TYPE_SETTINGS = 0x02
const TYPE_DEVICE_INFO = 0x03
const TYPE_READ_SETTINGS = 0x04

// ── 串口配置 ──
const BAUD_RATE = 115200

// ── 内部状态 ──
let port = null
let reader = null
let writer = null
let readLoopPromise = null
let onDisconnectCb = null
let onSensorDataCb = null
let connected = false

// 读取循环缓冲区
let rxBuffer = new Uint8Array(0)

// 等待响应的 Promise 解析器
let pendingResponse = null

/**
 * 连接到智能花盆串口设备
 * @param {function} onSensorData - 传感器数据回调 (buffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connect(onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect

  try {
    console.log('[Serial] 正在请求串口权限...')

    // 请求用户选择串口
    port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: 0x10c4 }, { usbVendorId: 0x1a86 }], // CP210x / CH340 常见芯片
    })

    await port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: 'none' })

    console.log('[Serial] 串口已打开，波特率:', BAUD_RATE)

    connected = true

    // 启动读取循环
    readLoopPromise = readLoop()

    // 请求设备信息
    const info = await readDeviceInfo()
    console.log('[Serial] 设备信息:', info)

    console.log('[Serial] ✅ 连接成功')
    return true
  } catch (error) {
    console.error('[Serial] 连接失败:', error)
    cleanup()
    throw error
  }
}

/**
 * 断开串口连接
 */
export function disconnect() {
  connected = false
  cleanup()
}

/**
 * 读取设备设置（11 字节 ArrayBuffer）
 * @returns {Promise<ArrayBuffer>}
 */
export async function readSettings() {
  if (!connected || !writer) throw new Error('未连接到设备')

  // 发送读取设置请求帧
  const frame = buildFrame(TYPE_READ_SETTINGS, new Uint8Array(0))
  await writeFrame(frame)

  // 等待响应
  return waitForResponse(TYPE_SETTINGS, 5000)
}

/**
 * 写入设备设置（11 字节 ArrayBuffer）
 * @param {ArrayBuffer} buffer
 */
export async function writeSettings(buffer) {
  if (!connected || !writer) throw new Error('未连接到设备')
  const frame = buildFrame(TYPE_SETTINGS, new Uint8Array(buffer))
  await writeFrame(frame)
  console.log('[Serial] 已写入设置:', new Uint8Array(buffer))
}

/**
 * 读取设备信息字符串
 * @returns {Promise<string>}
 */
export async function readDeviceInfo() {
  if (!connected || !writer) throw new Error('未连接到设备')

  const frame = buildFrame(TYPE_DEVICE_INFO, new Uint8Array(0))
  await writeFrame(frame)

  const buffer = await waitForResponse(TYPE_DEVICE_INFO, 5000)
  return new TextDecoder().decode(buffer)
}

/**
 * 获取当前串口连接状态
 * @returns {boolean}
 */
export function isConnected() {
  return connected && port?.readable != null
}

// ═══════════════════════════════════════════
//  内部函数
// ═══════════════════════════════════════════

// 串口读取循环
async function readLoop() {
  if (!port || !port.readable) return

  reader = port.readable.getReader()

  try {
    while (connected) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        appendRxBuffer(value)
        processRxBuffer()
      }
    }
  } catch (error) {
    if (connected) {
      console.warn('[Serial] 读取错误:', error)
    }
  } finally {
    reader.releaseLock()
    reader = null
  }

  // 如果还在连接状态，说明异常断开
  if (connected) {
    connected = false
    onDisconnectCb?.()
    cleanup()
  }
}

// 将新数据追加到接收缓冲区
function appendRxBuffer(chunk) {
  const combined = new Uint8Array(rxBuffer.length + chunk.length)
  combined.set(rxBuffer)
  combined.set(chunk, rxBuffer.length)
  rxBuffer = combined
}

// 解析接收缓冲区中的完整帧
function processRxBuffer() {
  while (rxBuffer.length >= 5) {
    // 查找帧头
    const headerIdx = findFrameHeader(rxBuffer)
    if (headerIdx === -1) {
      // 没有找到帧头，清空缓冲区（保留最后1字节防止跨边界帧头）
      rxBuffer = rxBuffer.length > 0 ? rxBuffer.slice(-1) : new Uint8Array(0)
      return
    }

    // 丢弃帧头之前的垃圾数据
    if (headerIdx > 0) {
      rxBuffer = rxBuffer.slice(headerIdx)
    }

    // 检查是否有足够长度读取类型和长度字段
    if (rxBuffer.length < 4) return

    const type = rxBuffer[2]
    const len = rxBuffer[3]
    const totalLen = 4 + len + 1 // 帧头(2) + 类型(1) + 长度(1) + 数据 + 校验(1)

    if (rxBuffer.length < totalLen) return // 等待更多数据

    // 提取完整帧
    const frame = rxBuffer.slice(0, totalLen)
    rxBuffer = rxBuffer.slice(totalLen)

    // 验证校验
    if (!verifyFrame(frame)) {
      console.warn('[Serial] 帧校验失败，丢弃')
      continue
    }

    // 提取载荷
    const payload = frame.slice(4, 4 + len)

    // 处理帧
    handleFrame(type, payload)
  }
}

// 在缓冲区中查找帧头位置
function findFrameHeader(buffer) {
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === FRAME_HEADER[0] && buffer[i + 1] === FRAME_HEADER[1]) {
      return i
    }
  }
  return -1
}

// 验证帧校验（XOR）
function verifyFrame(frame) {
  let xor = 0
  for (let i = 0; i < frame.length - 1; i++) {
    xor ^= frame[i]
  }
  return xor === frame[frame.length - 1]
}

// 处理解析后的帧
function handleFrame(type, payload) {
  switch (type) {
    case TYPE_SENSOR:
      if (payload.length === 6) {
        onSensorDataCb?.(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
      }
      break
    case TYPE_SETTINGS:
      if (pendingResponse) {
        pendingResponse.resolve(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
        pendingResponse = null
      }
      break
    case TYPE_DEVICE_INFO:
      if (pendingResponse) {
        pendingResponse.resolve(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
        pendingResponse = null
      }
      break
    default:
      console.warn('[Serial] 未知帧类型:', type)
  }
}

// 构建发送帧
function buildFrame(type, payload) {
  const frame = new Uint8Array(4 + payload.length + 1)
  frame[0] = FRAME_HEADER[0]
  frame[1] = FRAME_HEADER[1]
  frame[2] = type
  frame[3] = payload.length
  frame.set(payload, 4)

  // 计算 XOR 校验
  let xor = 0
  for (let i = 0; i < frame.length - 1; i++) {
    xor ^= frame[i]
  }
  frame[frame.length - 1] = xor

  return frame
}

// 写入帧到串口
async function writeFrame(frame) {
  if (!writer) {
    writer = port.writable.getWriter()
  }
  await writer.write(frame)
  writer.releaseLock()
  writer = null
}

// 等待特定类型的响应
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

// 清理资源
function cleanup() {
  connected = false

  if (reader) {
    try { reader.cancel() } catch (_) { /* 忽略 */ }
    reader = null
  }

  if (writer) {
    try { writer.releaseLock() } catch (_) { /* 忽略 */ }
    writer = null
  }

  if (port) {
    try { port.close() } catch (_) { /* 忽略 */ }
    port = null
  }

  rxBuffer = new Uint8Array(0)
  pendingResponse = null
}
