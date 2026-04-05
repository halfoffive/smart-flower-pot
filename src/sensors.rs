//! 土壤湿度传感器模块
//! 
//! 使用 ADC 读取电阻式土壤湿度传感器

use anyhow::Result;
use esp_idf_svc::hal::adc::oneshot::{AdcChannelDriver, AdcDriver};
use esp_idf_svc::hal::adc::{Attenuation, Resolution};
use esp_idf_svc::hal::gpio::AnyIOPin;
use esp_idf_svc::hal::peripherals::ADC1;

/// 土壤湿度传感器
pub struct SoilMoistureSensor {
    /// ADC 通道
    channel: AdcChannelDriver<AnyIOPin>,
}

impl SoilMoistureSensor {
    /// 初始化传感器
    pub fn new(pin: AnyIOPin) -> Result<Self> {
        // 配置 ADC 通道 (12 位分辨率, 0-4095)
        let channel_config = esp_idf_svc::hal::adc::AdcChannelConfig {
            attenuation: Attenuation::DB11,
            resolution: Resolution::Resolution12,
            ..Default::default()
        };
        
        let channel = AdcChannelDriver::new(pin, &channel_config)
            .map_err(|e| anyhow::anyhow!("ADC 通道初始化失败: {:?}", e))?;
        
        log::info!("土壤湿度传感器初始化完成 (GPIO4)");
        
        Ok(Self { channel })
    }
    
    /// 读取土壤湿度值 (0-4095)
    /// 
    /// 返回值越高表示土壤越干燥
    pub fn read_moisture(&mut self) -> Result<u16> {
        // 多次读取取平均值以提高准确性
        let mut sum = 0u32;
        let samples = 8;
        
        for _ in 0..samples {
            let value: u16 = embedded_hal::adc::OneShot::<_, u16, _>::read(&mut self.channel)
                .map_err(|e| anyhow::anyhow!("ADC 读取失败: {:?}", e))?;
            sum += value as u32;
        }
        
        let average = (sum / samples as u32) as u16;
        Ok(average)
    }
}
