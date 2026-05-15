/**
 * Web Serial API 封装模块
 * 职责：串口连接管理、二进制帧读写、传感器数据接收
 *
 * 修复：
 * - 增加 userInitiatedDisconnect 标志，防止主动断开时 readLoop 触发 onDisconnectCb
 * - cleanup 前先设 connected=false，避免 readLoop 末尾重复触发回调
 * - 移除 connect() 内的 readDeviceInfo() 调用，职责分离：连接只负责建立连接
 * - 新增 connectWithPort() 支持 URL 自动连接（无需用户手势）
 *
 * 设计原则：
 * - 纯函数风格：数据处理函数均为无副作用纯函数
 * - 不可变更新：缓冲区操作使用 Uint8Array 切片
 * - 最小可变状态：仅连接资源使用可变状态
 *
 * 帧格式（与 ESP32 固件一致）：
 *   [0-1] 帧头: 0xAA 0x55
 *   [2]   类型: 0x01=传感器, 0x02=设置, 0x03=设备信息, 0x04=读取设置请求
 *   [3]   长度: 数据载荷长度
 *   [4..N] 数据载荷
 *   [N+1] XOR 校验（帧头到载荷的异或和）
 */

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
let reader = null
let writer = null
let readLoopDone = null
let onDisconnectCb = null
let onSensorDataCb = null
let connected = false
let userInitiatedDisconnect = false

let rxBuffer = new Uint8Array(0)
let pendingResponse = null

/**
 * 用户手动连接：弹出串口选择器（需要用户手势）
 * @param {function} onSensorData - 传感器数据回调 (buffer: ArrayBuffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connect(onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect
  userInitiatedDisconnect = false

  try {
    console.log('[Serial] 正在请求串口权限...')

    port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x10c4 },
        { usbVendorId: 0x1a86 },
      ],
    })

    await openAndStartReadLoop()

    console.log('[Serial] ✅ 连接成功')
    return true
  } catch (error) {
    console.error('[Serial] 连接失败:', error)
    await cleanup()
    throw error
  }
}

/**
 * URL 自动连接：使用已授权的串口对象直连（无需用户手势）
 * 配合 navigator.serial.getPorts() 使用，跳过 requestPort() 步骤
 * @param {SerialPort} serialPort - 已通过 getPorts() 获取的串口对象
 * @param {function} onSensorData - 传感器数据回调 (buffer: ArrayBuffer) => void
 * @param {function} onDisconnect - 断开连接回调 () => void
 * @returns {Promise<boolean>}
 */
export async function connectWithPort(serialPort, onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect
  userInitiatedDisconnect = false

  try {
    port = serialPort
    console.log('[Serial] 自动连接：使用已有串口对象...')

    await openAndStartReadLoop()

    console.log('[Serial] ✅ 自动连接成功')
    return true
  } catch (error) {
    console.error('[Serial] 自动连接失败:', error)
    await cleanup()
    throw error
  }
}

/**
 * 内部：打开串口并启动读取循环
 * 由 connect() 和 connectWithPort() 共用
 */
async function openAndStartReadLoop() {
  await port.open({
    baudRate: BAUD_RATE,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
  })

  console.log('[Serial] 串口已打开，波特率:', BAUD_RATE)
  connected = true

  writer = port.writable.getWriter()
  readLoopDone = readLoop()
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
  console.log('[Serial] 已写入设置:', new Uint8Array(buffer))
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
  return connected && port?.readable != null
}

async function readLoop() {
  if (!port || !port.readable) return

  reader = port.readable.getReader()

  try {
    while (connected) {
      const { value, done } = await reader.read()
      if (done) break

      if (value) {
        rxBuffer = appendRxBuffer(rxBuffer, value)
        processRxBuffer()
      }
    }
  } catch (error) {
    if (connected) {
      console.warn('[Serial] 读取错误:', error)
    }
  } finally {
    try { reader.releaseLock() } catch (_) { /* 忽略 */ }
    reader = null
  }

  if (connected && !userInitiatedDisconnect) {
    connected = false
    onDisconnectCb?.()
    await cleanup()
  }
}

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
      console.warn('[Serial] 帧校验失败，丢弃')
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
      console.warn('[Serial] 未知帧类型:', type)
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
  await writer.write(frame)
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

async function cleanup() {
  connected = false

  if (reader) {
    try { reader.cancel() } catch (_) { /* 忽略 */ }
  }

  if (readLoopDone) {
    try { await readLoopDone } catch (_) { /* 忽略 */ }
    readLoopDone = null
  }

  if (writer) {
    try { writer.releaseLock() } catch (_) { /* 忽略 */ }
    writer = null
  }

  if (port) {
    try { await port.close() } catch (_) { /* 忽略 */ }
    port = null
  }

  rxBuffer = new Uint8Array(0)
  pendingResponse = null
}
