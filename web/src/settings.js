/**
 * 设置数据模型 & 二进制序列化
 * 与 ESP32 固件 11 字节结构一一对应：
 *   [0-1]  温度下限 uint16 LE (×10)
 *   [2-3]  温度上限 uint16 LE (×10)
 *   [4]    湿度下限 uint8
 *   [5]    湿度上限 uint8
 *   [6-7]  土壤阈值 uint16 LE (ADC)
 *   [8]    比较模式 uint8 (0=低于启动, 1=高于启动)
 *   [9]    水泵转速 uint8 (0-255 PWM)
 *   [10]   浇水方向 uint8 (0=正转, 1=反转)
 */

// 默认设置（与 ESP32 固件保持一致）
export const DEFAULT_SETTINGS = Object.freeze({
  tempMin:        150,   // 15.0°C
  tempMax:        350,   // 35.0°C
  humMin:         30,    // 30%
  humMax:         80,    // 80%
  soilThreshold:  2000,  // ADC 阈值
  compareMode:    0,     // 0=低于启动, 1=高于启动
  pumpSpeed:      128,   // PWM 占空比 (0-255)
  waterDirection: 0,     // 0=正转, 1=反转
})

/**
 * 将设置对象序列化为 11 字节 ArrayBuffer
 * @param {object} s - 设置对象
 * @returns {ArrayBuffer}
 */
export function serializeSettings(s) {
  const buf = new ArrayBuffer(11)
  const dv  = new DataView(buf)

  dv.setUint16(0,  s.tempMin,        true)  // little-endian
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
 * @param {ArrayBuffer} buffer
 * @returns {object}
 */
export function deserializeSettings(buffer) {
  const dv = new DataView(buffer)

  return {
    tempMin:        dv.getUint16(0, true),
    tempMax:        dv.getUint16(2, true),
    humMin:         dv.getUint8(4),
    humMax:         dv.getUint8(5),
    soilThreshold:  dv.getUint16(6, true),
    compareMode:    dv.getUint8(8),
    pumpSpeed:      dv.getUint8(9),
    waterDirection: dv.getUint8(10),
  }
}

// ── 传感器数据解析（6 字节） ──
//   [0-1]  土壤 ADC 值 uint16 LE
//   [2-3]  温度 uint16 LE (×10)
//   [4]    湿度 uint8 (%)
//   [5]    水泵状态 uint8 (0=停止, 1=正转, 2=反转)

/**
 * 将 6 字节 ArrayBuffer 反序列化为传感器数据对象
 * @param {ArrayBuffer} buffer
 * @returns {{ soil: number, temp: number, hum: number, pump: number }}
 */
export function deserializeSensor(buffer) {
  const dv = new DataView(buffer)

  return {
    soil: dv.getUint16(0, true),          // ADC 原始值
    temp: dv.getUint16(2, true) / 10.0,   // 温度 °C（保留小数）
    hum:  dv.getUint8(4),                  // 湿度 %
    pump: dv.getUint8(5),                  // 水泵状态
  }
}
