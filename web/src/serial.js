/**
 * Web Serial API 封装模块
 * 职责：串口连接管理、二进制帧读写、传感器数据接收
 *
 * 设计原则：
 * - 纯函数风格：数据处理函数（buildFrame、verifyFrame、findFrameHeader 等）均为无副作用纯函数
 * - 不可变更新：缓冲区操作使用 Uint8Array 切片而非原地修改
 * - 最小可变状态：仅 port/reader/writer/connected 等必要连接资源使用可变状态
 *
 * 帧格式（与 ESP32 固件一致）：
 *   [0-1] 帧头: 0xAA 0x55
 *   [2]   类型: 0x01=传感器, 0x02=设置, 0x03=设备信息, 0x04=读取设置请求
 *   [3]   长度: 数据载荷长度
 *   [4..N] 数据载荷
 *   [N+1] XOR 校验（帧头到载荷的异或和）
 *
 * API 与 ble.js 完全对齐，使 main.js 可透明切换连接模式。
 */

// ═══════════════════════════════════════════
//  常量定义
// ═══════════════════════════════════════════

/** 双字节帧头标识 */
const FRAME_HEADER_1 = 0xAA
const FRAME_HEADER_2 = 0x55

/** 帧类型枚举 */
const TYPE_SENSOR = 0x01        // 传感器数据（上行：ESP32 → Web）
const TYPE_SETTINGS = 0x02      // 设置数据（下行：Web → ESP32）
const TYPE_DEVICE_INFO = 0x03   // 设备信息（上行：ESP32 → Web）
const TYPE_READ_SETTINGS = 0x04 // 读取设置请求（下行：Web → ESP32）

/** 串口通信参数 */
const BAUD_RATE = 115200        // 波特率

/** 帧字段偏移常量 */
const FRAME_HEADER_LEN = 2      // 帧头长度
const FRAME_TYPE_OFFSET = 2     // 类型字节偏移
const FRAME_LEN_OFFSET = 3      // 长度字节偏移
const FRAME_PAYLOAD_OFFSET = 4  // 载荷起始偏移
const FRAME_CHECKSUM_BYTES = 1  // 校验码长度

// ═══════════════════════════════════════════
//  模块级可变状态（连接资源）
// ═══════════════════════════════════════════

let port = null               // SerialPort 实例
let reader = null             // ReadableStreamDefaultReader
let writer = null             // WritableStreamDefaultWriter（持久化持有）
let readLoopDone = null       // 读取循环 Promise，用于有序关闭
let onDisconnectCb = null     // 断开连接回调函数
let onSensorDataCb = null     // 传感器数据回调函数
let connected = false         // 连接状态标志

// 接收缓冲区（不可变风格：每次操作返回新 Uint8Array）
let rxBuffer = new Uint8Array(0)

// 请求-响应模式：等待特定类型帧的 Promise 解析器
let pendingResponse = null

// ═══════════════════════════════════════════
//  公开 API（与 ble.js 对齐）
// ═══════════════════════════════════════════

/**
 * 连接到智能花盆串口设备
 * 流程：请求用户选择串口 → 打开串口 → 获取 writer → 启动读取循环 → 请求设备信息
 *
 * @param {function} onSensorData - 传感器数据回调，接收 ArrayBuffer 参数
 * @param {function} onDisconnect - 断开连接回调，无参数
 * @returns {Promise<boolean>} 连接成功返回 true
 */
export async function connect(onSensorData, onDisconnect) {
  onSensorDataCb = onSensorData
  onDisconnectCb = onDisconnect

  try {
    console.log('[Serial] 正在请求串口权限...')

    // 弹出浏览器串口选择对话框（需用户交互触发）
    port = await navigator.serial.requestPort({
      filters: [
        { usbVendorId: 0x10c4 },  // CP210x USB 转串口芯片
        { usbVendorId: 0x1a86 },  // CH340 USB 转串口芯片
      ],
    })

    // 打开串口：8 数据位、1 停止位、无校验
    await port.open({
      baudRate: BAUD_RATE,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
    })

    console.log('[Serial] 串口已打开，波特率:', BAUD_RATE)
    connected = true

    // 获取持久化 writer（整个连接生命周期持有，避免重复获取/释放）
    writer = port.writable.getWriter()

    // 启动后台读取循环（异步执行，不阻塞连接流程）
    readLoopDone = readLoop()

    // 请求设备信息（验证通信链路是否正常）
    const info = await readDeviceInfo()
    console.log('[Serial] 设备信息:', info)

    console.log('[Serial] ✅ 连接成功')
    return true
  } catch (error) {
    console.error('[Serial] 连接失败:', error)
    // 连接失败时有序清理资源
    await cleanup()
    throw error
  }
}

/**
 * 断开串口连接
 * 设置 connected 标志后调用 cleanup 有序释放资源
 */
export async function disconnect() {
  connected = false
  await cleanup()
}

/**
 * 读取设备当前设置
 * 发送读取设置请求帧（0x04），等待 ESP32 回传设置帧（0x02，11 字节）
 *
 * @returns {Promise<ArrayBuffer>} 11 字节设置数据
 */
export async function readSettings() {
  if (!connected) throw new Error('未连接到设备')

  // 构建并发送读取设置请求帧（空载荷）
  const frame = buildFrame(TYPE_READ_SETTINGS, new Uint8Array(0))
  await writeFrame(frame)

  // 等待对应类型的响应帧，超时 5 秒
  return waitForResponse(TYPE_SETTINGS, 5000)
}

/**
 * 写入设备设置
 * 将 11 字节设置数据封装为设置帧（0x02）发送
 *
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
 * 发送设备信息请求帧（0x03），等待 ESP32 回传文本信息
 *
 * @returns {Promise<string>} 设备信息字符串
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
 *
 * @returns {boolean} 是否已连接且可读
 */
export function isConnected() {
  return connected && port?.readable != null
}

// ═══════════════════════════════════════════
//  内部函数 — 数据流处理
// ═══════════════════════════════════════════

/**
 * 串口读取循环
 * 持续从 ReadableStream 读取数据，追加到缓冲区并解析帧
 * 循环结束（done）或出错时自动触发 cleanup
 */
async function readLoop() {
  if (!port || !port.readable) return

  // 获取 reader 独占读取权
  reader = port.readable.getReader()

  try {
    while (connected) {
      const { value, done } = await reader.read()
      if (done) break

      // 有效数据块：追加到缓冲区并尝试解析
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
    // 确保 reader 锁被释放（cleanup 前必须完成）
    try { reader.releaseLock() } catch (_) { /* 忽略 */ }
    reader = null
  }

  // 正常连接状态下不应到达此处，说明异常断开
  if (connected) {
    connected = false
    onDisconnectCb?.()
    await cleanup()
  }
}

/**
 * 将新数据块追加到接收缓冲区
 * 纯函数：返回新 Uint8Array，不修改原始缓冲区
 *
 * @param {Uint8Array} buffer - 当前缓冲区
 * @param {Uint8Array} chunk - 新数据块
 * @returns {Uint8Array} 合并后的新缓冲区
 */
function appendRxBuffer(buffer, chunk) {
  const combined = new Uint8Array(buffer.length + chunk.length)
  combined.set(buffer)
  combined.set(chunk, buffer.length)
  return combined
}

/**
 * 解析接收缓冲区中的完整帧
 * 纯函数风格：从缓冲区中消费完整帧，残留数据通过 rxBuffer 赋值更新
 *
 * 解析流程：
 * 1. 查找帧头（0xAA 0x55）
 * 2. 读取类型和长度字段
 * 3. 等待足够数据后提取完整帧
 * 4. XOR 校验验证
 * 5. 分发到 handleFrame 处理
 */
function processRxBuffer() {
  // 最小帧长度：帧头(2) + 类型(1) + 长度(1) + 校验(1) = 5 字节
  while (rxBuffer.length >= FRAME_HEADER_LEN + FRAME_TYPE_OFFSET + FRAME_LEN_OFFSET + FRAME_CHECKSUM_BYTES) {
    // 步骤 1：定位帧头
    const headerIdx = findFrameHeader(rxBuffer)

    // 无有效帧头：清空缓冲区（保留最后 1 字节防止跨边界帧头被丢弃）
    if (headerIdx === -1) {
      rxBuffer = rxBuffer.length > 0 ? rxBuffer.slice(-1) : new Uint8Array(0)
      return
    }

    // 丢弃帧头之前的垃圾数据
    if (headerIdx > 0) {
      rxBuffer = rxBuffer.slice(headerIdx)
    }

    // 步骤 2：检查是否可读取类型和长度字段
    if (rxBuffer.length < FRAME_PAYLOAD_OFFSET) return

    const type = rxBuffer[FRAME_TYPE_OFFSET]
    const payloadLen = rxBuffer[FRAME_LEN_OFFSET]

    // 步骤 3：计算完整帧长度并检查数据是否就绪
    const totalLen = FRAME_PAYLOAD_OFFSET + payloadLen + FRAME_CHECKSUM_BYTES
    if (rxBuffer.length < totalLen) return // 等待更多数据到达

    // 提取完整帧
    const frame = rxBuffer.slice(0, totalLen)
    rxBuffer = rxBuffer.slice(totalLen) // 消费已解析帧

    // 步骤 4：XOR 校验
    if (!verifyFrame(frame)) {
      console.warn('[Serial] 帧校验失败，丢弃')
      continue
    }

    // 步骤 5：提取载荷并分发处理
    const payload = frame.slice(FRAME_PAYLOAD_OFFSET, FRAME_PAYLOAD_OFFSET + payloadLen)
    handleFrame(type, payload)
  }
}

// ═══════════════════════════════════════════
//  内部函数 — 帧操作（纯函数）
// ═══════════════════════════════════════════

/**
 * 在缓冲区中查找帧头位置
 * 纯函数：无副作用，返回值仅依赖输入
 *
 * @param {Uint8Array} buffer - 待搜索缓冲区
 * @returns {number} 帧头起始索引，未找到返回 -1
 */
function findFrameHeader(buffer) {
  for (let i = 0; i < buffer.length - 1; i++) {
    if (buffer[i] === FRAME_HEADER_1 && buffer[i + 1] === FRAME_HEADER_2) {
      return i
    }
  }
  return -1
}

/**
 * 验证帧 XOR 校验码
 * 纯函数：计算帧头到载荷的异或和，与最后一字节比对
 *
 * @param {Uint8Array} frame - 完整帧数据
 * @returns {boolean} 校验是否通过
 */
function verifyFrame(frame) {
  let xor = 0
  // 计算除校验码外所有字节的异或和
  for (let i = 0; i < frame.length - 1; i++) {
    xor ^= frame[i]
  }
  return xor === frame[frame.length - 1]
}

/**
 * 处理解析后的帧（根据类型分发到不同逻辑）
 * 副作用函数：触发回调或解析 pending Promise
 *
 * @param {number} type - 帧类型
 * @param {Uint8Array} payload - 数据载荷
 */
function handleFrame(type, payload) {
  switch (type) {
    // 传感器数据帧（6 字节）→ 回调通知
    case TYPE_SENSOR:
      if (payload.length === 6) {
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
        onSensorDataCb?.(ab)
      }
      break

    // 设置数据帧 → 解析等待中的 readSettings Promise
    case TYPE_SETTINGS:
      if (pendingResponse) {
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength)
        pendingResponse.resolve(ab)
        pendingResponse = null
      }
      break

    // 设备信息帧 → 解析等待中的 readDeviceInfo Promise
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

/**
 * 构建发送帧
 * 纯函数：输入类型和载荷，输出完整帧（含帧头、长度、校验）
 *
 * @param {number} type - 帧类型
 * @param {Uint8Array} payload - 数据载荷
 * @returns {Uint8Array} 完整帧数据
 */
function buildFrame(type, payload) {
  const frameLen = FRAME_PAYLOAD_OFFSET + payload.length + FRAME_CHECKSUM_BYTES
  const frame = new Uint8Array(frameLen)

  // 填充帧头
  frame[0] = FRAME_HEADER_1
  frame[1] = FRAME_HEADER_2

  // 填充类型和长度
  frame[FRAME_TYPE_OFFSET] = type
  frame[FRAME_LEN_OFFSET] = payload.length

  // 填充载荷
  frame.set(payload, FRAME_PAYLOAD_OFFSET)

  // 计算并填充 XOR 校验（帧头到载荷的异或和）
  frame[frameLen - 1] = calculateXOR(frame, frameLen - 1)

  return frame
}

/**
 * 计算数据范围的 XOR 校验
 * 纯函数：给定数据和长度，返回异或和
 *
 * @param {Uint8Array} data - 数据
 * @param {number} length - 计算范围（不包含 length 本身）
 * @returns {number} XOR 校验值
 */
function calculateXOR(data, length) {
  let xor = 0
  for (let i = 0; i < length; i++) {
    xor ^= data[i]
  }
  return xor
}

/**
 * 写入帧到串口
 * 使用持久化 writer，避免重复获取/释放锁
 *
 * @param {Uint8Array} frame - 待发送的完整帧
 */
async function writeFrame(frame) {
  await writer.write(frame)
}

// ═══════════════════════════════════════════
//  内部函数 — 请求-响应模式
// ═══════════════════════════════════════════

/**
 * 等待特定类型的响应帧
 * 创建 Promise 并注册到 pendingResponse，由 handleFrame 在收到对应帧时 resolve
 *
 * @param {number} expectedType - 期望的帧类型
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @returns {Promise<ArrayBuffer>} 响应载荷
 */
function waitForResponse(expectedType, timeoutMs) {
  return new Promise((resolve, reject) => {
    // 超时保护：避免 Promise 永远挂起
    const timer = setTimeout(() => {
      pendingResponse = null
      reject(new Error('串口响应超时'))
    }, timeoutMs)

    // 注册解析器（handleFrame 收到对应帧时调用 resolve）
    pendingResponse = {
      resolve: (buffer) => {
        clearTimeout(timer)
        resolve(buffer)
      },
    }
  })
}

// ═══════════════════════════════════════════
//  内部函数 — 资源管理
// ═══════════════════════════════════════════

/**
 * 有序清理串口资源
 * 严格按顺序执行，避免 Web Serial API 的锁冲突：
 * 1. 取消 reader（触发 readLoop 的 finally 块）
 * 2. 等待 readLoop 结束（确保 reader 锁已释放）
 * 3. 释放 writer 锁
 * 4. 关闭串口
 */
async function cleanup() {
  connected = false

  // 步骤 1：取消 reader 读取
  if (reader) {
    try { reader.cancel() } catch (_) { /* 忽略 */ }
  }

  // 步骤 2：等待读取循环完全结束（reader.releaseLock 在 readLoop finally 中执行）
  if (readLoopDone) {
    try { await readLoopDone } catch (_) { /* 忽略 */ }
    readLoopDone = null
  }

  // 步骤 3：释放 writer 锁（必须在 readLoop 结束后执行）
  if (writer) {
    try { writer.releaseLock() } catch (_) { /* 忽略 */ }
    writer = null
  }

  // 步骤 4：关闭串口（必须在 reader 和 writer 都释放后执行）
  if (port) {
    try { await port.close() } catch (_) { /* 忽略 */ }
    port = null
  }

  // 重置模块状态
  rxBuffer = new Uint8Array(0)
  pendingResponse = null
}
