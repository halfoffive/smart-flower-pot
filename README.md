# 🌱 智能花盆 (Smart Flower Pot)

基于 ESP32-C6 的智能花盆项目,使用 Rust (esp-rs) 开发,支持 Web Bluetooth 控制。

## 功能特性

- ✅ **土壤湿度检测**: 使用电阻式土壤湿度传感器 (ADC)
- ✅ **自动浇水**: L298N 控制两个水泵,根据湿度阈值自动浇水
- ✅ **Web Bluetooth 控制**: 通过浏览器直接连接设备,调整配置
- ✅ **Material Design UI**: 基于 Material Web 组件的现代化界面
- ✅ **节能设计**: 使用 embassy-time 实现低功耗延迟

## 硬件连接

### ESP32-C6 引脚分配

| 引脚 | 功能 | 说明 |
|------|------|------|
| GPIO4 | 土壤湿度传感器 (ADC) | 模拟输入 |
| GPIO5 | 水泵 1 控制 | 数字输出 (L298N IN1) |
| GPIO6 | 水泵 2 控制 | 数字输出 (L298N IN2) |

### L298N 接线

```
ESP32-C6 GPIO5 ──→ L298N IN1
ESP32-C6 GPIO6 ──→ L298N IN2
L298N OUT1/OUT2 ──→ 水泵 1/2
L298N 12V ──→ 外部电源
L298N GND ──→ 共地
```

### 土壤湿度传感器

```
传感器 AO ──→ ESP32-C6 GPIO4 (ADC)
传感器 VCC ──→ 3.3V
传感器 GND ──→ GND
```

## 软件架构

### Rust 固件 (ESP32-C6)

```
src/
├── main.rs           # 主程序入口和主循环
├── config.rs         # 配置管理 (阈值、浇水模式)
├── sensors.rs        # 传感器模块 (ADC 读取土壤湿度)
├── actuators.rs      # 执行器模块 (L298N 水泵控制)
└── ble_service.rs    # BLE 服务 (状态管理)
```

### Web UI

```
web-ui/
├── src/
│   ├── main.ts       # 应用主逻辑 (Web Bluetooth API)
│   ├── styles.css    # Material Design 样式
│   └── vite-env.d.ts # Web Bluetooth 类型声明
├── index.html
├── package.json
└── vite.config.ts
```

## 编译和烧录

### 环境准备

1. 安装 Rust: https://www.rust-lang.org/tools/install
2. 安装 ESP-IDF 工具链:

```bash
cargo install espup
espup install
source ~/export-esp.sh  # 或重启终端
```

### 编译固件

```bash
# 进入项目目录
cd smart-flower-pot

# 首次编译 (可能需要 10-20 分钟)
cargo build --release

# 或使用 espflash 直接烧录
cargo install espflash
espflash flash target/riscv32imac-esp-espidf/release/smart-flower-pot
```

### 构建 Web UI

```bash
cd web-ui

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

## 使用方法

### 1. 烧录固件

将 ESP32-C6 连接到电脑,烧录编译好的固件:

```bash
espflash flash target/riscv32imac-esp-espidf/release/smart-flower-pot
```

### 2. 启动 Web UI

```bash
cd web-ui
npm run dev
```

在浏览器中打开 `http://localhost:5173`

### 3. 连接设备

1. 点击 "连接设备" 按钮
2. 在弹出的蓝牙设备选择器中选择 "SmartFlowerPot" 设备
3. 连接成功后,可以:
   - 查看实时土壤湿度
   - 调整湿度阈值滑块 (0-4095)
   - 选择浇水模式 (低于/高于阈值)
   - 点击 "应用配置" 保存设置

## 配置参数

### 默认配置

- **湿度阈值**: 2000 (范围 0-4095)
- **浇水模式**: 低于阈值时浇水
- **水泵最大运行时间**: 30 秒
- **检测间隔**: 10 秒 (节能模式)

### BLE GATT 服务

**服务 UUID**: `12345678-1234-5678-1234-56789abcdef0`

| 特征值 | UUID | 权限 | 说明 |
|--------|------|------|------|
| 湿度 | ...abcdef1 | 通知 | 土壤湿度 (u16, 小端序) |
| 配置 | ...abcdef2 | 写入 | 配置参数 (3 字节) |
| 泵状态 | ...abcdef3 | 通知 | 水泵状态 (2 字节) |

## 节能设计

- **低功耗延迟**: 使用 `embassy-time::Timer` 代替 busy-wait
- **检测间隔**: 每 10 秒读取一次传感器
- **BLE 广播**: 使用较低的广播间隔 (20-40ms)
- **水泵保护**: 限制最大运行时间防止干烧

## 代码风格

- **函数式编程**: 使用不可变数据、Option/Result 错误处理、模式匹配
- **中文注释**: 关键逻辑包含中文注释
- **社区规范**: 遵循 Rust 官方社区规范和 esp-rs 最佳实践

## 依赖

### Rust

- `esp-idf-svc`: ESP-IDF 服务绑定 (包含 hal、bt 等)
- `embassy-time`: 异步时间库 (节能延迟)
- `anyhow`: 错误处理
- `heapless`: 无堆内存分配
- `log`: 日志系统

### Web UI

- `Vite`: 构建工具
- `TypeScript`: 类型安全
- `@material/web`: Material Design 组件
- Web Bluetooth API: 浏览器原生 BLE 支持

## 已知限制

1. **BLE 功能**: 当前为简化实现,完整的 GATT 服务需要:
   - 在 `sdkconfig.defaults` 中启用 `CONFIG_BT_ENABLED`
   - 在 `sdkconfig.defaults` 中启用 `CONFIG_BT_BLE_ENABLED`
   - 使用 `esp_idf_svc::bt::ble` 模块实现完整 GATT 服务器

2. **Web Bluetooth**: 需要 HTTPS 或 localhost (开发环境支持)

## 许可证

MIT License

## 作者

fang

## 贡献

欢迎提交 Issue 和 Pull Request!
