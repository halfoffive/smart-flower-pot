/**
 * 传感器历史数据缓存（环形队列）
 * 在 BLE 连接期间缓存最近 N 条传感器读数，供主页图表展示
 */

const MAX_HISTORY = 50  // 最大缓存条数

let history = []            // 环形队列（旧→新）
const listeners = []        // 数据更新监听者

/**
 * 添加一条传感器记录
 * @param {{ soil: number, temp: number, hum: number, pump: number }} data
 */
export function addRecord(data) {
  const record = {
    time: new Date(),
    soil: data.soil,
    temp: data.temp,
    hum:  data.hum,
    pump: data.pump,
  }

  history.push(record)
  if (history.length > MAX_HISTORY) {
    history.shift()  // 移除最旧的记录
  }

  // 通知所有监听者
  listeners.forEach(fn => fn([...history].reverse()))
}

/**
 * 获取所有历史记录（最新在前）
 * @returns {Array}
 */
export function getRecords() {
  return [...history].reverse()
}

/**
 * 订阅历史数据更新
 * @param {function} fn - 回调函数 (records) => void
 */
export function onUpdate(fn) {
  listeners.push(fn)
}

/**
 * 清空所有历史记录
 */
export function clear() {
  history.length = 0
  listeners.forEach(fn => fn([]))
}
