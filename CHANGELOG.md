# 更新日志

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
