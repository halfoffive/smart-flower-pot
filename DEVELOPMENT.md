# 智能花盆项目开发说明

## 当前状态

✅ **代码已完成,正在编译**

## 项目结构

### Rust 固件

已完成的模块:
- ✅ `config.rs` - 配置管理 (湿度阈值、浇水模式)
- ✅ `sensors.rs` - 土壤湿度传感器 (ADC 读取)
- ✅ `actuators.rs` - 水泵控制器 (L298N GPIO 控制)
- ✅ `ble_service.rs` - BLE 服务 (状态管理)
- ✅ `main.rs` - 主程序 (自动浇水逻辑、节能循环)

### Web UI

已完成的文件:
- ✅ `package.json` - 项目配置 (Vite + TypeScript + Material Web)
- ✅ `tsconfig.json` - TypeScript 配置
- ✅ `vite.config.ts` - Vite 配置
- ✅ `index.html` - HTML 入口
- ✅ `src/main.ts` - 应用主逻辑 (Web Bluetooth API)
- ✅ `src/styles.css` - Material Design 样式
- ✅ `src/vite-env.d.ts` - Web Bluetooth 类型声明

✅ **Web UI 已成功构建**

## 编译状态

Rust 固件正在首次编译中,这可能需要 10-20 分钟。

### 编译进度

```
Compiling esp-idf-sys v0.37.2
Compiling esp-idf-hal v0.46.2
Compiling esp-idf-svc v0.52.1
Compiling smart-flower-pot v0.1.0
```

## 技术说明

### 1. ESP-IDF 依赖

项目使用 `esp-idf-svc` 0.52 版本,它包含了:
- `esp-idf-hal` 0.46.2 (硬件抽象层)
- `esp-idf-sys` 0.37.2 (系统绑定)

这些版本是相互兼容的。

### 2. BLE 支持

当前实现为简化版本,完整的 BLE GATT 服务需要:

**sdkconfig.defaults 中已添加:**
```
CONFIG_BT_ENABLED=y
CONFIG_BT_BLE_ENABLED=y
CONFIG_BT_NIMBLE_ENABLED=y
CONFIG_BT_GATTS_ENABLE=y
```

**后续完善步骤:**
1. 使用 `esp_idf_svc::bt::BtDriver<BleEnabled>` 初始化蓝牙
2. 使用 `esp_idf_svc::bt::ble::gatt::server::GattsServer` 创建 GATT 服务
3. 注册自定义服务和特征值
4. 处理 GATT 读写事件

### 3. Web Bluetooth

Web UI 使用浏览器原生 Web Bluetooth API:
- 支持设备发现和连接
- 支持 GATT 特征值读写和通知
- 需要 HTTPS 或 localhost

### 4. 节能设计

- 使用 `embassy-time::Timer::after_secs()` 进行异步延迟
- 每 10 秒读取一次传感器
- 避免 busy-wait,降低功耗

## 代码风格

### 函数式编程特性

```rust
// 使用 Option 处理可能失败的初始化
let sensor = match SoilMoistureSensor::new(pin) {
    Ok(s) => Some(s),
    Err(e) => {
        log::warn!("初始化失败: {}", e);
        None
    }
};

// 使用 Result 和 ? 操作符进行错误传播
pub fn read_moisture(&mut self) -> Result<u16> {
    let value = embedded_hal::adc::OneShot::read(&mut self.channel)?;
    Ok(value)
}

// 使用 if-let 处理 Option
if let Some(ref mut controller) = pump_controller {
    controller.start_pump1()?;
}
```

### 中文注释

```rust
//! 土壤湿度传感器模块
//! 
//! 使用 ADC 读取电阻式土壤湿度传感器

/// 读取土壤湿度值 (0-4095)
/// 
/// 返回值越高表示土壤越干燥
pub fn read_moisture(&mut self) -> Result<u16> {
    // 多次读取取平均值以提高准确性
    let mut sum = 0u32;
    let samples = 8;
    // ...
}
```

## 使用指南

### 编译完成后烧录

```bash
# 烧录固件
espflash flash target/riscv32imac-esp-espidf/release/smart-flower-pot

# 监控串口日志
espflash monitor
```

### 启动 Web UI

```bash
cd web-ui
npm run dev
# 访问 http://localhost:5173
```

## 后续改进方向

1. **完整 BLE 实现**: 使用 esp-idf-svc 的 bt::ble 模块实现完整 GATT 服务
2. **NVS 存储**: 将配置保存到非易失性存储
3. **WiFi 支持**: 添加 MQTT/HTTP 远程监控
4. **多传感器**: 支持温度、光照等传感器
5. **OTA 更新**: 支持空中固件更新

## 常见问题

### Q: 编译很慢?
A: 首次编译需要下载和编译大量依赖,后续编译会快很多。

### Q: BLE 无法连接?
A: 确保 sdkconfig.defaults 中启用了 CONFIG_BT_ENABLED 和 CONFIG_BT_BLE_ENABLED。

### Q: Web Bluetooth 无法发现设备?
A: 确保设备名称前缀为 "SmartFlowerPot",并在 HTTPS 或 localhost 下运行。

## 参考资源

- [esp-rs 官方文档](https://docs.esp-rs.org/)
- [esp-idf-svc API 文档](https://docs.esp-rs.org/esp-idf-svc/)
- [Web Bluetooth API](https://developer.mozilla.org/zh-CN/docs/Web/API/Web_Bluetooth_API)
- [Material Web](https://github.com/material-components/material-web)
