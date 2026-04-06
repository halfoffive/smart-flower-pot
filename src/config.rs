//! 配置管理模块
//!
//! 管理智能花盆的运行配置参数

/// 智能花盆配置
#[derive(Debug, Clone, Copy)]
pub struct FlowerPotConfig {
    /// 湿度阈值 (0-4095)
    pub threshold: u16,
    /// 浇水模式: true=低于阈值浇水, false=高于阈值浇水
    pub water_when_below: bool,
    /// 水泵运行最长时间 (秒)
    #[allow(dead_code)]
    pub max_pump_duration: u16,
}

impl Default for FlowerPotConfig {
    fn default() -> Self {
        Self {
            threshold: 2000,        // 默认阈值
            water_when_below: true, // 默认低于阈值时浇水
            max_pump_duration: 30,  // 最多运行 30 秒
        }
    }
}

impl FlowerPotConfig {
    /// 从字节数组解析配置 (用于 BLE 传输)
    #[allow(dead_code)]
    pub fn from_bytes(data: &[u8]) -> Option<Self> {
        if data.len() < 5 {
            return None;
        }

        let threshold = u16::from_le_bytes([data[0], data[1]]);
        let water_when_below = data[2] != 0;
        let max_pump_duration = u16::from_le_bytes([data[3], data[4]]);

        Some(Self {
            threshold,
            water_when_below,
            max_pump_duration,
        })
    }

    /// 将配置转换为字节数组 (用于 BLE 传输)
    #[allow(dead_code)]
    pub fn to_bytes(&self) -> [u8; 5] {
        let mut bytes = [0u8; 5];
        bytes[0..2].copy_from_slice(&self.threshold.to_le_bytes());
        bytes[2] = if self.water_when_below { 1 } else { 0 };
        bytes[3..5].copy_from_slice(&self.max_pump_duration.to_le_bytes());
        bytes
    }
}
