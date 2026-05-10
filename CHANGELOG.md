# 更新日志

## [1.5.0] — 2026-05-10

### 新增
- **Web Serial 串口连接模式**：在原有 BLE 基础上增加 USB 串口连接方式，通过 Web Serial API 与 ESP32-C6 通信
  - 前端新增 `web/src/serial.js` — Web Serial API 封装，API 与 `ble.js` 完全对齐（`connect`/`disconnect`/`readSettings`/`writeSettings`/`readDeviceInfo`/`isConnected`）
  - 串口二进制帧协议：帧头 `0xAA 0x55` + 类型 + 长度 + 载荷 + XOR 校验，支持传感器数据、设置读写、设备信息查询
  - 波特率 115200，支持 CP210x / CH340 等常见 USB 转串口芯片
- **双连接方式 UI**：空状态页新增「🔵 蓝牙连接」和「🔌 串口连接」两个按钮，头部状态栏显示当前连接模式（已连接 · 蓝牙 / 串口）
- **双模数据推送**：ESP32 固件每次传感器读取后同时向 BLE 和串口推送数据，两种连接互不干扰

### 变更
- **`web/src/main.js`**：引入 `serial.js`，增加 `connectionMode` 状态（`'ble' | 'serial' | null`），连接/断开/保存设置逻辑根据当前模式自动路由到对应模块
- **`web/src/ui.js`**：
  - `buildHeader` 增加 `connectionMode` 参数，状态文本显示「已连接 · 蓝牙」或「已连接 · 串口」
  - `buildEmpty` 重写为双按钮布局，蓝牙按钮使用 emerald 渐变，串口按钮使用 blue 渐变
  - `bindEvents` 绑定 `connect-ble` 和 `connect-serial` 两个按钮事件
- **`esp32-c6/smart_flower_pot.ino`**：
  - 新增串口帧协议常量（`SERIAL_FRAME_HEAD1/HEAD2`、`SERIAL_TYPE_*`）
  - 新增 `handleSerialCommand()` — 串口命令解析（设置写入、读取设置请求、设备信息请求）
  - 新增 `sendSerialFrame()` / `sendSensorDataSerial()` / `sendSettingsSerial()` / `sendDeviceInfoSerial()` — 串口数据发送
  - 新增 `calcXOR()` — 帧校验计算
  - `loop()` 中每次循环调用 `handleSerialCommand()`，传感器读取后调用 `sendSensorDataSerial()`

### 文档
- `README.md` — 更新功能特性、目录结构、快速开始（增加串口连接步骤）、技术栈、新增「串口通信协议」章节
- `AGENTS.md` — 更新模块依赖图（增加 `serial.js`）、新增 Serial protocol 说明、更新 Gotchas

### 修改文件
- `web/src/serial.js` — **新增**
- `web/src/main.js` — 引入 serial.js，增加连接模式切换逻辑
- `web/src/ui.js` — 双连接按钮 UI、头部显示连接模式
- `esp32-c6/smart_flower_pot/smart_flower_pot.ino` — 串口帧协议解析与发送
- `README.md` — 增加 Web Serial 使用说明和协议文档
- `AGENTS.md` — 更新架构说明
- `CHANGELOG.md` — 本文档

## [1.4.0] — 2026-05-05

### 删除
- **移除测试页**：删除 `web/test.html` 和 `web/src/test.js`，项目简化为单页应用

### 新增
- **全卡片入场动画**：所有卡片（头部、空状态、仪表盘、设置面板、断开操作）均使用 `animate-card-in` + staggered `animation-delay`，依次滑入
  - 头部 0ms → 仪表盘 100/175/250/325ms → 设置面板 400ms → 断开操作 500ms
- **主题按钮文字**：头部主题切换按钮新增文字标签（☀️ 浅色 / 🌙 深色 / 🖥️ 自动），移动端仅显示图标

### 变更
- **移除头部连接按钮**：连接按钮仅保留空状态卡片中的 CTA 按钮，断开按钮移至页面底部的独立操作卡片
- **设置面板参与入场动画**：从 `sfp-card-static`（静止）改为 `sfp-card` + `animate-card-in`（带入场动画 + hover 效果）
- **模板文案更新**：空状态提示文字从「上方按钮」改为「下方按钮」

### 修改文件
- `web/test.html` — **删除**
- `web/src/test.js` — **删除**
- `web/vite.config.js` — 移除 test.html 入口，简化为单页构建
- `web/src/ui.js` — 重写头部（移除连接按钮）、全卡片入场动画、设置面板动画、新增断开操作卡片
- `web/src/style.css` — 移除 `sfp-card-static`，主题按钮支持文字布局
- `README.md` — 移除测试页章节，更新使用说明
- `AGENTS.md` — 更新架构说明为单页应用
- `CHANGELOG.md` — 本文档

## [1.3.0] — 2026-05-05

### 新增
- **浅色/深色主题切换**：三态切换按钮（☀️ 浅色 / 🌙 深色 / 🖥️ 跟随系统），localStorage 持久化用户偏好
- **主题预加载防闪烁**：`<head>` 内联脚本在首帧渲染前读取主题设置，避免深色模式用户看到白色闪烁
- **卡片 hover 动画**：所有卡片悬停时微放大（`scale(1.01)`）+ 阴影加深 + 边框高亮过渡
- **主题管理模块**：`web/src/theme.js` — 函数式风格，支持系统 `prefers-color-scheme` 媒体查询监听
- **传感器仪表盘卡片 hover**：2×2 传感器卡片悬停微上移（`translateY(-2px)`）+ 阴影增强，触屏设备自动禁用

### 变更
- **CSS 架构重构**：所有颜色从硬编码 Tailwind 类改为 CSS 自定义属性（`--sfp-*`），定义在 `style.css` 顶层
  - 浅色主题：白底 + 浅灰卡片 + 深色文字
  - 深色主题：保持原有暗色风格（gray-800/900/950 系列）
- **HTML 模板**：`body` 背景色从 Tailwind 类改为 CSS 变量驱动的 `linear-gradient`，跟随主题切换
- **UI 组件全面变量化**：`ui.js`、`test.js`、`toast.js` 中所有颜色引用改为 `rgb(var(--sfp-*))` 格式
- **按钮样式抽离**：`.sfp-btn-primary`（emerald 渐变）/ `.sfp-btn-danger`（red 渐变）/ `.theme-toggle-btn` CSS 类
- **卡片样式抽离**：`.sfp-card`（hover 动画）/ `.sfp-card-static`（无 hover）/ `.sfp-sensor-card`（仪表盘卡片）
- **输入框样式抽离**：`.sfp-input` / `.sfp-select`（focus 边框高亮 + 阴影 ring）
- **Toast 组件**：渐变改为动态计算（`linear-gradient` + CSS 变量），跟随主题切换

### 性能优化
- **RAF 节流传感器更新**：`main.js` 高频 Notify（~200ms 间隔）通过 `requestAnimationFrame` 合并帧，确保每秒最多 60 次 DOM 更新
- **测试页同步优化**：`test.js` 传感器更新同样使用 RAF 节流，避免手动操作时卡顿
- **动画声明 will-change**：`.animate-card-in` / `.animate-pulse-dot` 预声明 `will-change: transform, opacity`，让浏览器提前提升到合成层
- **触屏设备优化**：`@media (hover: none)` 禁用 hover 动画，避免触屏误触

### 修改文件
- `web/src/style.css` — CSS 变量主题 + 卡片动画 + 性能优化 + 组件样式类
- `web/src/theme.js` — **新增** 主题管理模块
- `web/src/ui.js` — 主题切换按钮 + 颜色变量化 + RAF 节流 + 卡片 hover
- `web/src/main.js` — 主题初始化 + RAF 节流传感器更新
- `web/src/test.js` — 主题切换 + 颜色变量化 + RAF 节流
- `web/src/toast.js` — 主题感知渐变 + CSS 变量引用
- `web/index.html` — 主题预加载脚本 + body 简化
- `web/test.html` — 主题预加载脚本 + body 简化

## [1.2.0] — 2026-05-01

### 新增
- **毛玻璃卡片设计**：所有面板采用 `backdrop-blur` + 半透明背景 + 边框发光，层次感更强
- **脉冲动画**：连接状态指示点 + 水泵运转时呼吸灯效果
- **卡片入场动画**：仪表盘卡片加载时依次滑入（staggered `card-in` 动画）
- **渐变配色**：按钮采用渐变底色 + 柔和阴影，active 状态下微缩放反馈
- **设置分组**：灌溉设置按「温度区间」「湿度区间」「土壤阈值」「水泵控制」分块，视觉层次更清晰

### 变更
- **背景**：从纯 `bg-gray-950` 改为 `bg-gradient-to-b from-gray-900 to-gray-950`
- **连接按钮**：更突出的「连接设备」文案 + 渐变底色
- **空状态页**：未连接时展示大幅图标 + 引导文案 + 嵌入式 CTA 按钮
- **仪表盘卡片**：左侧彩色边框 + 图标标签 + 数值/单位分离排版
- **toast/alert**：渐变底色 + 更柔和的入场出场动画
- **测试页**：同步以上所有设计语言（毛玻璃、渐变、动画、分组）

### 修改文件
- `web/src/ui.js` — 全面重设计（头部、仪表盘、设置、空状态）
- `web/src/test.js` — 匹配新版设计语言
- `web/src/toast.js` — 渐变配色、动画优化
- `web/src/style.css` — 新增 `@theme` 自定义关键帧动画
- `web/index.html` / `web/test.html` — 背景渐变

## [1.1.0] — 2026-04-30

### 新增
- **PWA 支持**：manifest.json + Service Worker（Network-First 离线缓存），可安装到桌面/主屏幕独立运行
- **自定义提示框**：替代浏览器默认 `alert()`，基于 Tailwind CSS 暗色主题的模态对话框 `showAlert` + 轻量通知 `showToast`
- **SVG 图标**：emerald 色圆角方形背景 + 白色幼苗图案，同时用作 favicon 和 PWA 图标

### 变更
- 升级 `@tailwindcss/vite` 和 `tailwindcss` 至 `^4.2.4`
- `web/src/main.js` / `web/src/test.js` 中所有 `alert()` 调用替换为 `showAlert()`
- `showToast` 从 `main.js` 内联函数抽取为共享模块 `web/src/toast.js`

### 架构
- `web/src/toast.js` — 函数式自定义提示框模块（`showAlert` / `showToast`）
- `web/src/sw-register.js` — Service Worker 注册（仅生产环境生效）
- `web/public/` — 静态资源目录（`manifest.json`、`sw.js`、`icon.svg`）

## [1.0.0] — 2026-04-30

### 新增
- ESP32-C6 固件：传感器读取（土壤 ADC + DHT11）、水泵控制（H桥 + PWM）、自动灌溉决策
- BLE 通信服务：3 个特征（设置/传感器/设备信息），128-bit 自定义 UUID
- 持久化存储：基于 NVS 闪存，断电不丢失，上电自动恢复
- 自动灌溉逻辑：土壤阈值比较 + 温湿度区间校验 + 5 秒安全超时保护
- 手动控制模式：网页测试页可临时接管水泵控制，退出手动后恢复自动灌溉
- 能效策略：空闲态 5 秒长周期 + 灌溉态 200 毫秒高频检测
- H桥保护：方向切换时 50ms 死区延时，防止上下桥臂直通
- 串口详细日志：所有传感器读数、状态变化、BLE 读写事件均输出

### Web 前端
- Vite 8 + Tailwind CSS 4.2 脚手架，多页面构建（主页 + 测试页）
- 主页：传感器仪表盘、灌溉设置面板、最近 50 条历史数据表
- 测试页：手动水泵正反转切换 + PWM 转速滑块 + 实时传感器读数
- Web Bluetooth 封装：连接/断开/读写/通知，自动重连（最多 5 次）
- 设置序列化：JS ArrayBuffer ↔ ESP32 二进制结构对齐
- Toast 提示、连接状态指示

### 开发约定
- 函数式编程风格，避免副作用全局状态
- 全中文注释，详细说明每个函数和数据结构的用途
- Arduino IDE 规范：.ino 文件与父级文件夹同名
