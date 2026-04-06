//! 智能花盆固件 - ESP32-C6
//! 
//! 功能:
//! - 土壤湿度检测 (ADC)
//! - 双水泵控制 (L298N)
//! - BLE 蓝牙服务 (Web Bluetooth)
//! - 节能模式

use anyhow::Result;
use esp_idf_svc::hal::peripherals::Peripherals;
use esp_idf_svc::hal::task::block_on;

// 引入子模块
mod sensors;
mod actuators;
mod ble_service;
mod config;

use sensors::SoilMoistureSensor;
use actuators::WaterPumpController;
use ble_service::SmartFlowerPotBLE;
use config::FlowerPotConfig;

/// 系统主状态
#[derive(Debug, Clone)]
struct SystemState {
    /// 当前土壤湿度 (0-4095)
    moisture_level: u16,
    /// 水泵 1 状态
    pump1_active: bool,
    /// 水泵 2 状态
    pump2_active: bool,
}

/// 主异步函数
async fn run() -> Result<()> {
    // 必须调用此函数以链接 ESP-IDF 补丁
    esp_idf_svc::sys::link_patches();
    
    // 绑定日志系统
    esp_idf_svc::log::EspLogger::initialize_default();
    
    log::info!("🌱 智能花盆系统启动中...");
    
    // 初始化默认配置
    let mut config = FlowerPotConfig::default();
    let mut state = SystemState {
        moisture_level: 0,
        pump1_active: false,
        pump2_active: false,
    };
    
    // 初始化硬件
    log::info!("初始化硬件...");
    
    // 安全地获取外设实例
    let mut peripherals = Peripherals::take()
        .map_err(|_| anyhow::anyhow!("无法获取外设"))?;
    
    // 初始化土壤湿度传感器 (ADC - GPIO4)
    // 注意: 如果初始化失败,使用模拟值继续运行
    let mut sensor = match SoilMoistureSensor::new(&mut peripherals, peripherals.pins.gpio4.into()) {
        Ok(s) => Some(s),
        Err(e) => {
            log::warn!("土壤湿度传感器初始化失败: {}, 使用模拟值", e);
            None
        }
    };
    
    // 初始化水泵控制器 (GPIO5, GPIO6 控制 L298N)
    let mut pump_controller = match WaterPumpController::new(&mut peripherals) {
        Ok(p) => Some(p),
        Err(e) => {
            log::warn!("水泵控制器初始化失败: {}, 跳过水泵控制", e);
            None
        }
    };
    
    log::info!("硬件初始化完成");
    
    // 启动 BLE 服务
    let mut ble = SmartFlowerPotBLE::new()?;
    log::info!("BLE 服务已启动, 等待连接...");
    
    // 主循环 - 使用 embassy-time 进行节能延迟
    loop {
        // 读取土壤湿度
        let moisture = if let Some(ref mut s) = sensor {
            s.read_moisture().unwrap_or(0)
        } else {
            // 模拟值 (用于测试)
            1500
        };
        
        state.moisture_level = moisture;
        log::debug!("土壤湿度: {} (阈值: {}, 模式: {})", 
                   moisture, config.threshold, 
                   if config.water_when_below { "低于阈值浇水" } else { "高于阈值浇水" });
        
        // 自动浇水逻辑
        let should_water = if config.water_when_below {
            moisture < config.threshold
        } else {
            moisture > config.threshold
        };
        
        if should_water && !state.pump1_active {
            log::info!("土壤干燥, 启动水泵浇水");
            if let Some(ref mut controller) = pump_controller {
                if controller.start_pump1().is_ok() {
                    state.pump1_active = true;
                }
            }
        } else if !should_water && state.pump1_active {
            log::info!("湿度充足, 关闭水泵");
            if let Some(ref mut controller) = pump_controller {
                if controller.stop_all().is_ok() {
                    state.pump1_active = false;
                }
            }
        }
        
        // 更新 BLE 状态
        ble.update_moisture(moisture);
        ble.update_pump_state(state.pump1_active, state.pump2_active);
        
        // 检查配置更新 (来自 BLE)
        if let Some(new_config) = ble.take_pending_config() {
            log::info!("配置已更新: {:?}", new_config);
            config = new_config;
        }
        
        // 节能延迟 (10 秒)
        embassy_time::Timer::after_secs(10).await;
    }
}

/// 入口函数 (ESP-IDF 标准的 app_main)
#[no_mangle]
pub extern "C" fn app_main() {
    // 运行异步主函数
    block_on(run()).unwrap();
}
