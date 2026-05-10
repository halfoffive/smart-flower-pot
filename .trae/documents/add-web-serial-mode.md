# Plan: 增加 Web Serial 串口连接模式

## 目标
在现有 Web Bluetooth (BLE) 连接方式基础上，增加 **Web Serial API** 串口连接模式，让用户可以通过 USB 数据线连接 ESP32-C6 进行监控和设置。

## 需求分析

### 当前架构
- `web/src/ble.js` — BLE 连接封装（connect/disconnect/readSettings/writeSettings/isConnected）
- `web/src/ui.js` — UI 渲染（连接按钮、仪表盘、设置面板）
- `web/src/main.js` — 编排层，调用 BLE 模块，管理应用状态
- `web/src/settings.js` — 设置序列化/反序列化（11 字节设置，6 字节传感器）
- `esp32-c6/smart_flower_pot.ino` — ESP32 固件，通过 BLE 通信

### Web Serial 方案设计

Web Serial API 允许网页通过 USB 连接串口设备。ESP32-C6 的 USB 串口可用于：
- **下行**：网页发送设置数据（11 字节二进制帧）
- **上行**：ESP32 周期性发送传感器数据（6 字节二进制帧）

#### 串口通信协议（二进制帧）

采用简单帧格式，避免与现有 BLE 协议冲突：

```
帧头: 0xAA 0x55 (2 bytes)
类型: 0x01=传感器数据, 0x02=设置数据, 0x03=设备信息 (1 byte)
长度: 数据载荷长度 (1 byte)
数据: 载荷 (变长)
校验: 简单 XOR 校验 (1 byte)
```

- **传感器数据帧**（上行，ESP32 → Web）：`AA 55 01 06 [6字节传感器数据] [XOR]`
- **设置写入帧**（下行，Web → ESP32）：`AA 55 02 0B [11字节设置数据] [XOR]`
- **设置读取请求帧**（下行）：`AA 55 04 00 [XOR]` — 请求 ESP32 返回当前设置
- **设备信息帧**（上行）：`AA 55 03 0N [N字节字符串] [XOR]`

#### ESP32 固件修改

在 `loop()` 中增加串口数据读取逻辑：
1. 监听 `Serial.available()`，解析 Web Serial 帧
2. 收到设置写入帧时，调用 `deserializeSettings()` + `saveSettings()`
3. 收到设置读取请求时，通过串口回传当前设置
4. 原有的传感器定时推送同时通过 BLE Notify 和 Serial 发送（或仅 Serial，取决于连接状态）

**关键决策**：ESP32 同时支持 BLE 和 Serial 两种连接方式，但同一时间只处理一种。通过标志位判断当前活跃连接。

### 前端修改计划

#### 1. 新增 `web/src/serial.js` — Web Serial 封装模块

提供与 `ble.js` 完全一致的 API 接口：
- `connect(onSensorData, onDisconnect)` — 请求串口权限，打开串口，启动读取循环
- `disconnect()` — 关闭串口
- `readSettings()` — 发送读取请求，等待响应
- `writeSettings(buffer)` — 发送设置帧
- `readDeviceInfo()` — 发送设备信息请求，等待响应
- `isConnected()` — 返回串口连接状态

内部实现：
- 使用 `navigator.serial.requestPort()` 获取串口
- 设置波特率 115200，数据位 8，停止位 1，无校验
- 使用 `ReadableStream` 读取数据，维护一个循环缓冲区解析帧
- 使用 `WritableStream` 写入数据

#### 2. 修改 `web/src/main.js` — 连接模式切换

- 引入 `serial.js`
- 增加 `connectionMode` 状态：`'ble' | 'serial' | null`
- `handleConnect()` 改为根据用户选择的模式调用对应模块
- `handleDisconnect()` 根据当前模式断开对应连接
- `handleSaveSettings()` 根据当前模式写入设置
- 连接成功后同步设置逻辑保持一致

#### 3. 修改 `web/src/ui.js` — 连接模式选择 UI

- 空状态页增加连接方式选择：
  - 「🔵 蓝牙连接」按钮（原有功能）
  - 「🔌 串口连接」按钮（新增）
- 已连接状态头部显示当前连接模式（蓝牙 / 串口）
- 保持原有 UI 风格和动画

#### 4. 修改 `web/src/settings.js` — 序列化复用

现有 `serializeSettings` / `deserializeSettings` / `deserializeSensor` 可直接复用，无需修改。

#### 5. 修改 ESP32 固件 `smart_flower_pot.ino`

- 增加串口帧解析函数 `parseSerialFrame()`
- 增加串口数据发送函数 `sendSensorDataSerial()` / `sendSettingsSerial()` / `sendDeviceInfoSerial()`
- `loop()` 中增加 `handleSerialCommand()` 调用
- 传感器读取后同时通过 BLE Notify 和 Serial 发送（如果串口有连接）
- 增加串口连接状态检测（通过 DTR/RTS 或心跳机制）

### 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/src/serial.js` | 新增 | Web Serial API 封装，API 与 ble.js 对齐 |
| `web/src/main.js` | 修改 | 引入 serial.js，增加连接模式切换逻辑 |
| `web/src/ui.js` | 修改 | 空状态页增加串口连接按钮，头部显示连接模式 |
| `web/src/style.css` | 修改（可能） | 如有新增样式类则补充 |
| `esp32-c6/smart_flower_pot/smart_flower_pot.ino` | 修改 | 增加串口通信协议解析和发送 |
| `README.md` | 修改 | 增加 Web Serial 使用说明、协议文档 |
| `AGENTS.md` | 修改 | 更新架构说明，增加 serial.js 模块 |
| `CHANGELOG.md` | 修改 | 记录 v1.5.0 新增 Web Serial 功能 |

### 验证标准

1. **Web 端**：
   - 点击「串口连接」按钮弹出浏览器串口选择对话框
   - 选择 ESP32-C6 的 USB 串口后成功连接
   - 传感器数据正常显示在仪表盘
   - 设置修改后点击保存，ESP32 正确接收并响应
   - 断开连接后 UI 正确回到未连接状态

2. **ESP32 固件**：
   - 通过 USB 串口连接时，传感器数据正常发送
   - 收到设置帧后正确解析并保存到 NVS
   - BLE 和 Serial 互不干扰

3. **文档**：
   - README 包含 Web Serial 使用说明和协议定义
   - AGENTS.md 更新模块依赖图
   - CHANGELOG 记录本次变更

### 风险与注意事项

1. **Web Serial API 兼容性**：仅 Chrome/Edge 89+ 支持，与 Web Bluetooth 兼容的浏览器范围基本一致
2. **ESP32 串口占用**：Arduino IDE 的串口监视器会占用串口，使用时需关闭
3. **二进制帧同步**：串口数据流无边界，需要可靠的帧头 + 长度 + 校验机制防止丢包/粘包
4. **Simplicity First**：不引入额外的串口协议库，手动实现轻量级帧解析
