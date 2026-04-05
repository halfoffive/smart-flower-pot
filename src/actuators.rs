//! 水泵控制模块
//! 
//! 控制 L298N 驱动的两个水泵

use anyhow::Result;
use esp_idf_svc::hal::gpio::Output;
use esp_idf_svc::hal::peripheral::Peripheral;

/// 水泵控制器 (L298N)
pub struct WaterPumpController {
    /// 水泵 1 控制引脚
    pump1_pin: Output,
    /// 水泵 2 控制引脚  
    pump2_pin: Output,
}

impl WaterPumpController {
    /// 初始化水泵控制器
    /// 
    /// # 参数
    /// * `pump1_pin` - 水泵 1 控制引脚 (GPIO5)
    /// * `pump2_pin` - 水泵 2 控制引脚 (GPIO6)
    pub fn new<P1, P2>(pump1_pin: P1, pump2_pin: P2) -> Result<Self>
    where
        P1: Peripheral<P = impl Output>,
        P2: Peripheral<P = impl Output>,
    {
        // 默认输出低电平 (水泵关闭)
        let pump1_pin = Output::new(pump1_pin, true)
            .map_err(|e| anyhow::anyhow!("水泵 1 引脚初始化失败: {:?}", e))?;
        let pump2_pin = Output::new(pump2_pin, true)
            .map_err(|e| anyhow::anyhow!("水泵 2 引脚初始化失败: {:?}", e))?;
        
        log::info!("水泵控制器初始化完成 (GPIO5, GPIO6)");
        
        Ok(Self {
            pump1_pin,
            pump2_pin,
        })
    }
    
    /// 启动水泵 1
    pub fn start_pump1(&mut self) -> Result<()> {
        self.pump1_pin.set_high()
            .map_err(|e| anyhow::anyhow!("启动水泵 1 失败: {:?}", e))?;
        log::debug!("水泵 1 启动");
        Ok(())
    }
    
    /// 启动水泵 2
    pub fn start_pump2(&mut self) -> Result<()> {
        self.pump2_pin.set_high()
            .map_err(|e| anyhow::anyhow!("启动水泵 2 失败: {:?}", e))?;
        log::debug!("水泵 2 启动");
        Ok(())
    }
    
    /// 停止所有水泵
    pub fn stop_all(&mut self) -> Result<()> {
        self.pump1_pin.set_low()
            .map_err(|e| anyhow::anyhow!("停止水泵 1 失败: {:?}", e))?;
        self.pump2_pin.set_low()
            .map_err(|e| anyhow::anyhow!("停止水泵 2 失败: {:?}", e))?;
        log::debug!("所有水泵已停止");
        Ok(())
    }
}
