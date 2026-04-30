# 智能花盆 🌱

基于 ESP32-C6 的智能花盆系统，具备自动灌溉、Web 蓝牙远程监控与设置功能。

## 硬件清单

| 组件 | 型号 | 引脚 |
|------|------|------|
| 主控 | ESP32-C6 | — |
| 土壤湿度传感器 | 电阻式 | GPIO0 (ADC1_CH0) |
| 温湿度传感器 | DHT11 | GPIO4 |
| 水泵驱动 (H桥) | 正转 | GPIO5 |
| | 反转 | GPIO6 |
| | PWM 调速 | GPIO7 |

## 功能特性

- **自动灌溉**：土壤湿度低于（或高于）阈值时自动浇水，温湿度越界自动停止
- **BLE 远程控制**：通过 Web 蓝牙连接，实时查看传感器数据、调整灌溉参数
- **PWA 离线支持**：可安装到桌面独立运行，断网时缓存已访问页面（Network-First 策略）
- **自定义 UI 提示**：Tailwind 暗色风格模态对话框 + Toast 通知，替代浏览器原生弹窗
- **手动测试页**：独立页面，可手动控制水泵正反转和转速
- **持久化存储**：设置保存在 ESP32 NVS 闪存中，断电不丢失
- **能效优化**：空闲时长周期检测（5秒），灌溉/手动时高频检测（200毫秒）
- **安全保护**：最长灌溉 5 秒超时，防止水泵空转；H桥方向切换带死区保护
- **自动重连**：Web 端断开后自动尝试重连（最多 5 次）

## 目录结构

```
smart-flower-pot/
├── esp32-c6/
│   └── smart_flower_pot/            # Arduino IDE 目录（必须与 .ino 同名）
│       └── smart_flower_pot.ino     # ESP32-C6 固件
├── web/
│   ├── index.html                   # 主页（仪表盘 + 设置 + 历史）
│   ├── test.html                    # 测试页（手动水泵控制）
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   ├── manifest.json            # PWA 清单
│   │   ├── sw.js                    # Service Worker（离线缓存）
│   │   └── icon.svg                 # PWA / Favicon 图标
│   └── src/
│       ├── style.css                # Tailwind CSS 入口
│       ├── main.js                  # 主页入口
│       ├── test.js                  # 测试页入口
│       ├── ble.js                   # Web Bluetooth 封装
│       ├── settings.js              # 设置序列化/反序列化
│       ├── ui.js                    # 主页 UI 组件
│       ├── toast.js                 # 自定义提示框（showAlert / showToast）
│       ├── sw-register.js           # Service Worker 注册
│       └── history.js               # 传感器历史缓存
├── README.md
└── CHANGELOG.md
```

## 快速开始

### 1. 烧录 ESP32 固件

1. 使用 **Arduino IDE** 打开 `esp32-c6/smart_flower_pot/smart_flower_pot.ino`
2. 安装依赖库：
   - `DHT sensor library` by Adafruit（库管理器搜索 "DHT sensor library"）
   - ESP32 BLE 库（Arduino-ESP32 核心自带）
3. 选择开发板：`ESP32C6 Dev Module`
4. 设置参数：Flash Size ≥ 4MB, Partition Scheme = Default
5. 编译并上传
6. 打开**串口监视器**（115200 波特率）观察日志输出

### 2. 启动 Web 前端

```bash
cd web
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`，点击「连接」按钮配对智能花盆。

> **注意**：Web Bluetooth 仅支持 Chrome / Edge 等 Chromium 内核浏览器。

### 3. 使用说明

#### 主页 (`/`)
- **传感器仪表盘**：实时显示温度、空气湿度、土壤 ADC 值、水泵状态
- **灌溉设置**：调整温度区间、湿度区间、土壤阈值、比较模式、水泵转速、浇水方向
- **保存按钮**：将设置写入 ESP32 并持久化存储
- **历史记录**：BLE 连接期间缓存最近 50 条数据

#### 测试页 (`/test.html`)
- **手动水泵控制**：正转 / 反转切换，PWM 转速实时调节
- **实时传感器读数**：温度、湿度、土壤 ADC 同步更新
- ⚠ 手动模式会暂时覆盖自动灌溉逻辑

#### PWA（可安装到桌面）
生产构建后，通过 `npm run preview` 预览。Chrome/Edge 地址栏会出现「安装」按钮，或通过菜单 → "安装此站点"将应用添加到桌面。安装后：
- 独立窗口运行（无浏览器地址栏/标签页）
- 离线缓存已访问页面，断网仍可打开
- 桌面图标 / 启动画面使用 SVG 图标

> 开发模式（`npm run dev`）下 Service Worker 不会注册，避免干扰 HMR 热更新。

## BLE 协议

| 特征 | UUID (后缀) | 属性 | 长度 | 说明 |
|------|-------------|------|------|------|
| 设置 | ...abd | Read / Write | 11 字节 | 灌溉参数 |
| 传感器 | ...abe | Read / Notify | 6 字节 | 实时数据 |
| 设备信息 | ...abf | Read | 字符串 | 设备名+版本 |

完整 Service UUID：`12345678-1234-1234-1234-123456789abc`

### 设置数据结构（11 字节，Little-Endian）

| 偏移 | 长度 | 类型 | 字段 | 说明 |
|------|------|------|------|------|
| 0 | 2 | uint16 | 温度下限 | ×10，如 150 = 15.0°C |
| 2 | 2 | uint16 | 温度上限 | ×10，如 350 = 35.0°C |
| 4 | 1 | uint8 | 湿度下限 | 0-100 % |
| 5 | 1 | uint8 | 湿度上限 | 0-100 % |
| 6 | 2 | uint16 | 土壤阈值 | ADC 原始值 0-4095 |
| 8 | 1 | uint8 | 比较模式 | 0=低于启动, 1=高于启动 |
| 9 | 1 | uint8 | 水泵转速 | 0-255 PWM 占空比 |
| 10 | 1 | uint8 | 浇水方向 | 0=正转, 1=反转 |

### 传感器数据结构（6 字节，Little-Endian）

| 偏移 | 长度 | 类型 | 字段 | 说明 |
|------|------|------|------|------|
| 0 | 2 | uint16 | 土壤 ADC | 0-4095 |
| 2 | 2 | uint16 | 温度 | ×10 |
| 4 | 1 | uint8 | 湿度 | 0-100 % |
| 5 | 1 | uint8 | 水泵状态 | 0=停止, 1=正转, 2=反转 |

## 灌溉逻辑

```
灌溉启动条件（全部满足）：
  1. 土壤湿度满足比较模式（低于/高于阈值）
  2. 温度在 [下限, 上限] 区间内
  3. 空气湿度在 [下限, 上限] 区间内

灌溉停止条件（任一触发）：
  1. 土壤湿度达到目标值
  2. 温度超出区间
  3. 空气湿度超出区间
  4. 最长灌溉 5 秒超时
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 固件 | Arduino (ESP32-C6), BLE, Preferences/NVS, DHT |
| 通信 | Bluetooth Low Energy 5.0 (128-bit UUID) |
| 前端框架 | Vite 8.0 |
| UI 库 | Tailwind CSS 4.2 |
| PWA | Manifest + Service Worker（离线缓存） |
| 浏览器 API | Web Bluetooth API |

## AI 开发

本项目使用 AI 开发，相关信息：

| 模型 | Tokens | 消费金额 |
|------|------|------|
| deepseek-v4-pro | 7356991 | 2.1447948 |


## 许可证

MIT
