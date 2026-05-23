/**
 * 设置数据模型 & 二进制序列化（纯函数库）
 *
 * 本模块所有函数均为纯函数：
 * - 无副作用：输入相同数据始终返回相同结果
 * - 无状态依赖：不读写任何外部变量
 * - 可独立测试：传入 buffer 即可验证序列化/反序列化正确性
 *
 * 与 ESP32 固件 11 字节结构一一对应：
 *   [0-1]  温度下限 uint16 LE (×10)
 *   [2-3]  温度上限 uint16 LE (×10)
 *   [4]    湿度下限 uint8
 *   [5]    湿度上限 uint8
 *   [6-7]  土壤阈值 uint16 LE (ADC)
 *   [8]    比较模式 uint8 (0=低于启动, 1=高于启动)
 *   [9]    水泵转速 uint8 (0-255 PWM)
 *   [10]   浇水方向 uint8 (0=正转, 1=反转)
 *
 * 传感器数据 6 字节结构：
 *   [0-1]  土壤 ADC 值 uint16 LE
 *   [2-3]  温度 uint16 LE (×10)
 *   [4]    湿度 uint8 (%)
 *   [5]    水泵状态 uint8 (0=停止, 1=正转, 2=反转)
 */

/** 默认设置（与 ESP32 固件保持一致） */
export const DEFAULT_SETTINGS = Object.freeze({
  tempMin:        150,
  tempMax:        350,
  humMin:         30,
  humMax:         80,
  soilThreshold:  2000,
  compareMode:    0,
  pumpSpeed:      128,
  waterDirection: 0,
})

/** 默认传感器初始值（连接建立后等待首次推送时使用） */
export const DEFAULT_SENSOR = Object.freeze({
  soil: 0,
  temp: 0,
  hum:  0,
  pump: 0,
})

/** 仅保存设置标志：固件看到 0xFF 不触发水泵 */
export const WATER_DIR_SAVE_ONLY = 0xFF

/** 各字段数值范围约束 */
const SETTINGS_BOUNDS = Object.freeze({
  tempMin:        { min: 0,   max: 600  },  // 0.0°C ~ 60.0°C（×10）
  tempMax:        { min: 0,   max: 600  },
  humMin:         { min: 0,   max: 100  },  // 0% ~ 100%
  humMax:         { min: 0,   max: 100  },
  soilThreshold:  { min: 0,   max: 4095 },  // 12-bit ADC
  compareMode:    { min: 0,   max: 1    },  // 0=低于启动, 1=高于启动
  pumpSpeed:      { min: 0,   max: 255  },  // 8-bit PWM
  waterDirection: { min: 0,   max: 1    },  // 0=正转, 1=反转
})

/**
 * 校验设置对象各字段是否在合法范围内
 * 纯函数：不修改输入，返回校验结果
 * @param {object} s - 待校验的设置对象
 * @returns {{ valid: boolean, errors: string[] }}
 */
export const validateSettings = (s) => {
  const errors = []

  for (const [key, bounds] of Object.entries(SETTINGS_BOUNDS)) {
    const value = s[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${key}: 必须为有效数字，收到 ${JSON.stringify(value)}`)
    } else if (value < bounds.min || value > bounds.max) {
      errors.push(`${key}: ${value} 超出范围 [${bounds.min}, ${bounds.max}]`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 将设置对象序列化为 11 字节 ArrayBuffer
 * 字节布局与 ESP32 固件严格对齐，通讯双方使用 Little-Endian
 * @param {object} s - 设置对象（含 tempMin/tempMax/humMin/humMax/soilThreshold/compareMode/pumpSpeed/waterDirection）
 * @returns {ArrayBuffer} 11 字节的二进制缓冲区，可直接通过 BLE/Serial 写入设备
 */
export const serializeSettings = (s) => {
  const buf = new ArrayBuffer(11)
  const dv  = new DataView(buf)

  dv.setUint16(0,  s.tempMin,        true)
  dv.setUint16(2,  s.tempMax,        true)
  dv.setUint8(4,   s.humMin)
  dv.setUint8(5,   s.humMax)
  dv.setUint16(6,  s.soilThreshold,  true)
  dv.setUint8(8,   s.compareMode)
  dv.setUint8(9,   s.pumpSpeed)
  dv.setUint8(10,  s.waterDirection)

  return buf
}

/**
 * 将 11 字节 ArrayBuffer 反序列化为设置对象
 * 修复：waterDirection=0xFF（仅保存标志）映射为 0（正转），
 * 因为 0xFF 是协议控制标志而非实际方向值
 *
 * @param {ArrayBuffer} buffer - 从设备读取的 11 字节二进制数据
 * @returns {object} 设置对象（键名与 DEFAULT_SETTINGS 一致）
 */
export const deserializeSettings = (buffer) => {
  const dv = new DataView(buffer)
  const rawDir = dv.getUint8(10)

  return {
    tempMin:        dv.getUint16(0, true),
    tempMax:        dv.getUint16(2, true),
    humMin:         dv.getUint8(4),
    humMax:         dv.getUint8(5),
    soilThreshold:  dv.getUint16(6, true),
    compareMode:    dv.getUint8(8),
    pumpSpeed:      dv.getUint8(9),
    waterDirection: rawDir === WATER_DIR_SAVE_ONLY ? 0 : rawDir,
  }
}

/**
 * 将 6 字节 ArrayBuffer 反序列化为传感器数据对象
 * @param {ArrayBuffer} buffer - 从设备接收的 6 字节传感器数据
 * @returns {{ soil: number, temp: number, hum: number, pump: number }}
 *   - soil: 土壤 ADC 原始值（0-4095, 12-bit）
 *   - temp: 温度（°C，已除以 10）
 *   - hum:  空气湿度（%）
 *   - pump: 水泵状态（0=停止, 1=正转, 2=反转）
 */
export const deserializeSensor = (buffer) => {
  const dv = new DataView(buffer)

  return {
    soil: dv.getUint16(0, true),
    temp: dv.getUint16(2, true) / 10.0,
    hum:  dv.getUint8(4),
    pump: dv.getUint8(5),
  }
}

/**
 * 水泵状态标签映射
 * @param {number} pump - 水泵状态值 (0=停止, 1=正转, 2=反转)
 * @returns {string}
 */
export const pumpLabel = (pump) =>
  ['停止', '正转', '反转'][pump] ?? '未知'

/**
 * 解析设备信息 JSON 字符串
 * @param {string} jsonStr - 设备信息 JSON
 * @returns {object} { fw, mac, chip, rev, flash, heap }
 */
export function parseDeviceInfo(jsonStr) {
  try {
    return JSON.parse(jsonStr)
  } catch {
    return { fw: jsonStr, mac: '', chip: '', rev: 0, flash: 0, heap: 0 }
  }
}
