/*
 * 智能花盆 — ESP32-C6 固件
 * 功能：土壤湿度检测 + DHT11 温湿度 + 水泵自动灌溉 + BLE 远程设置
 * 引脚：土壤 ADC=GPIO0, DHT11=GPIO4, 水泵正转=GPIO5, 反转=GPIO6, PWM=GPIO7
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
// NimBLE 自动管理 CCCD，无需手动包含 BLE2902
#include <Preferences.h>
#include <DHT.h>

/* ===================== 引脚定义 ===================== */
#define SOIL_ADC_PIN   0    // 土壤湿度传感器（ADC1_CH0）
#define DHT_PIN        4    // DHT11 数据引脚
#define DHT_TYPE       DHT11
#define PUMP_POS_PIN   5    // 水泵正转（H桥方向A）
#define PUMP_NEG_PIN   6    // 水泵反转（H桥方向B）
#define PUMP_PWM_PIN   7    // 水泵 PWM 调速

/* ===================== PWM 配置 ===================== */
#define PWM_FREQ       5000 // PWM 频率 5kHz
#define PWM_RESOLUTION 8    // 8位分辨率（0-255）
// PWM_CHANNEL 在 Arduino-ESP32 3.x 中已废弃，通过引脚直接控制

/* ===================== 定时参数 ===================== */
#define IDLE_INTERVAL_MS     2000   // 空闲态检测周期 2秒
#define WATERING_INTERVAL_MS 200    // 灌溉态检测周期 200毫秒
#define BLE_NOTIFY_INTERVAL_MS 500  // BLE 通知推送周期 0.5秒
#define MAX_WATERING_MS      5000  // 最长灌溉时间 5秒

/* ===================== BLE UUID ===================== */
#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define SETTINGS_CHAR_UUID  "12345678-1234-1234-1234-123456789abd"
#define SENSOR_CHAR_UUID    "12345678-1234-1234-1234-123456789abe"
#define DEVICE_INFO_UUID    "12345678-1234-1234-1234-123456789abf"

/* ===================== 设置默认值 ===================== */
#define DEFAULT_TEMP_MIN      150   // 15.0°C
#define DEFAULT_TEMP_MAX      350   // 35.0°C
#define DEFAULT_HUM_MIN       30    // 30%
#define DEFAULT_HUM_MAX       80    // 80%
#define DEFAULT_SOIL_THR      2000  // ADC 阈值
#define DEFAULT_COMPARE_MODE  0     // 0=低于启动
#define DEFAULT_PUMP_SPEED    128   // PWM 50%
#define DEFAULT_WATER_DIR     0     // 0=正转

/* ===================== NVS 键名 ===================== */
#define NVS_NS "flowerpot"
#define KEY_TEMP_MIN    "tempMin"
#define KEY_TEMP_MAX    "tempMax"
#define KEY_HUM_MIN     "humMin"
#define KEY_HUM_MAX     "humMax"
#define KEY_SOIL_THR    "soilThr"
#define KEY_CMP_MODE    "cmpMode"
#define KEY_PUMP_SPEED  "pumpSpd"
#define KEY_WATER_DIR   "watDir"

/* ===================== 枚举定义 ===================== */
enum PumpState : uint8_t {
  PUMP_OFF     = 0,  // 水泵停止
  PUMP_FORWARD = 1,  // 正转浇水
  PUMP_REVERSE = 2   // 反转浇水
};

enum SystemState : uint8_t {
  STATE_IDLE,      // 空闲态：长周期检测，水泵停止
  STATE_WATERING   // 灌溉态：高频检测，水泵运行
};

enum CompareMode : uint8_t {
  MODE_BELOW = 0,  // 低于阈值时启动灌溉
  MODE_ABOVE = 1   // 高于阈值时启动灌溉
};

/* 浇水方向特殊值：0xFF = 仅保存设置，不触发水泵 */
#define WATER_DIR_SAVE_ONLY 0xFF

/* ===================== 全局对象与变量 ===================== */
DHT dht(DHT_PIN, DHT_TYPE);     // DHT11 温湿度传感器
Preferences prefs;               // NVS 闪存存储

// ── BLE 特征指针 ──
BLECharacteristic *pSettingsChar   = nullptr;  // 设置特征（可读写）
BLECharacteristic *pSensorChar     = nullptr;  // 传感器特征（可读+通知）
BLECharacteristic *pDeviceInfoChar = nullptr;  // 设备信息特征（只读）

// ── 连接状态 ──
bool deviceConnected    = false;  // 当前是否有 BLE 客户端连接
bool oldDeviceConnected = false;  // 上一轮连接状态（用于检测变化）

// ── 系统状态 ──
SystemState   systemState       = STATE_IDLE;     // 当前系统状态
PumpState     pumpState         = PUMP_OFF;       // 当前水泵状态
bool          manualOverride    = false;          // 手动控制模式（来自网页测试页）
unsigned long lastReadTime      = 0;              // 上次读取传感器的时间戳
unsigned long lastBleNotifyTime = 0;              // 上次 BLE 通知推送的时间戳
unsigned long wateringStartTime = 0;              // 本次灌溉开始时间戳

// ── 用户可调设置 ──
uint16_t tempMin        = DEFAULT_TEMP_MIN;     // 温度下限（×10）
uint16_t tempMax        = DEFAULT_TEMP_MAX;     // 温度上限（×10）
uint8_t  humMin         = DEFAULT_HUM_MIN;      // 湿度下限（%）
uint8_t  humMax         = DEFAULT_HUM_MAX;      // 湿度上限（%）
uint16_t soilThreshold  = DEFAULT_SOIL_THR;     // 土壤湿度 ADC 阈值
uint8_t  compareMode    = DEFAULT_COMPARE_MODE; // 比较模式
uint8_t  pumpSpeed      = DEFAULT_PUMP_SPEED;   // 水泵 PWM 转速
uint8_t  waterDirection = DEFAULT_WATER_DIR;    // 浇水方向

// ── 当前传感器读数 ──
uint16_t currentSoil = 0;   // 土壤湿度 ADC 值
uint16_t currentTemp = 0;   // 温度（×10）
uint8_t  currentHum  = 0;   // 空气湿度（%）

/* ===================== 串口帧协议常量 ===================== */
#define SERIAL_FRAME_HEAD1  0xAA
#define SERIAL_FRAME_HEAD2  0x55
#define SERIAL_TYPE_SENSOR  0x01
#define SERIAL_TYPE_SETTINGS 0x02
#define SERIAL_TYPE_DEVICE_INFO 0x03
#define SERIAL_TYPE_READ_SETTINGS 0x04

/* ===================== 函数声明 ===================== */
// ── 设置管理 ──
void loadSettings();                        // 从 NVS 加载设置
void saveSettings();                        // 保存设置到 NVS
void serializeSettings(uint8_t *buffer);    // 设置编码为 11 字节
void deserializeSettings(uint8_t *buffer);  // 从 11 字节解码设置
void serializeSensorData(uint8_t *buffer);  // 传感器数据编码为 6 字节

// ── 传感器 ──
void readSensors();        // 读取所有传感器
void printSensorData();    // 串口打印传感器数据

// ── 水泵控制 ──
void startPump(PumpState direction);  // 启动水泵（指定方向）
void stopPump();                      // 停止水泵

// ── 灌溉决策 ──
bool shouldStartWatering();  // 是否满足灌溉启动条件
bool shouldStopWatering();   // 是否满足灌溉停止条件
void checkWatering();        // 灌溉状态机

// ── 串口通信 ──
void handleSerialCommand();              // 处理串口命令
void sendSerialFrame(uint8_t type, uint8_t *data, uint8_t len);  // 发送串口帧
void sendSensorDataSerial();             // 通过串口发送传感器数据
void sendSettingsSerial();               // 通过串口发送设置数据
void sendDeviceInfoSerial();             // 通过串口发送设备信息
uint8_t calcXOR(uint8_t *data, uint8_t len);  // 计算 XOR 校验

/* ===================== BLE 回调类实现 ===================== */

// 设置特征回调：处理网页端的读写请求
class SettingsCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) override {
    uint8_t *data = pCharacteristic->getData();
    size_t   len  = pCharacteristic->getValue().length();

    Serial.println("[BLE] 收到设置写入请求");
    Serial.printf("[BLE] 数据长度: %d 字节\n", len);

    if (len == 11) {
      uint8_t newSpeed = data[9];       // 新的水泵转速
      uint8_t newDir   = data[10];      // 新的浇水方向

      // 保存旧值，用于水泵控制决策
      uint8_t prevPumpSpeed = pumpSpeed;
      uint8_t prevWaterDir  = waterDirection;

      deserializeSettings(data);

      // ── "仅保存设置"模式（向后兼容旧版 Web 端） ──
      // waterDirection = 0xFF 表示旧版网页端仅保存其他设置，不改变方向也不触发水泵
      // 恢复旧方向值，防止 0xFF 被写入 NVS 导致自动灌溉始终反转
      if (newDir == WATER_DIR_SAVE_ONLY) {
        waterDirection = prevWaterDir;
      }

      saveSettings();  // 立即持久化到 NVS

      // ── 水泵控制逻辑（解耦：方向保存与水泵触发分离） ──
      // 新版 Web 端发送实际方向值（0 或 1），不再使用 0xFF 标志
      // 水泵仅在速度从 0 变为非 0 时启动，避免保存设置时误触发水泵
      if (newDir == WATER_DIR_SAVE_ONLY) {
        // 旧版兼容：仅保存设置，不触发水泵
        Serial.println("[设置] ✓ 仅保存设置（不触发水泵）");
      }
      // 速度从 0 变为非 0：启动水泵（手动模式）
      else if (newSpeed > 0 && prevPumpSpeed == 0 && systemState == STATE_IDLE && !shouldStartWatering()) {
        manualOverride = true;
        Serial.println("[手动控制] ▶ 网页端启动水泵（手动模式）");
        startPump(newDir == 0 ? PUMP_FORWARD : PUMP_REVERSE);
      }
      // 速度从非 0 变为 0：停止水泵（退出手动模式）
      else if (newSpeed == 0 && prevPumpSpeed > 0 && manualOverride) {
        manualOverride = false;
        stopPump();
        Serial.println("[手动控制] ■ 网页端停止水泵，退出手动模式");
      }
      // 手动模式中方向变更：重启水泵
      else if (manualOverride && newDir != prevWaterDir && newSpeed > 0) {
        Serial.println("[手动控制] ↻ 方向变更，重启水泵");
        startPump(newDir == 0 ? PUMP_FORWARD : PUMP_REVERSE);
      }
      // 自动灌溉中收到设置变更：仅更新转速（PWM 实时生效）
      else if (systemState == STATE_WATERING && pumpState != PUMP_OFF) {
        ledcWrite(PUMP_PWM_PIN, pumpSpeed);
        Serial.printf("[自动灌溉] 转速已更新为 %d / 255\n", pumpSpeed);
      }

      Serial.println("[BLE] 设置已更新并保存到闪存");
    } else {
      Serial.printf("[BLE] ⚠ 设置数据长度异常: 期望 11 字节, 实际 %d 字节\n", len);
    }
  }

  void onRead(BLECharacteristic *pCharacteristic) override {
    uint8_t buffer[11];
    serializeSettings(buffer);
    pCharacteristic->setValue(buffer, 11);
    Serial.println("[BLE] 设置已被客户端读取");
  }
};

// 服务器回调：监听 BLE 连接与断开事件
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    deviceConnected = true;
    Serial.println("[BLE] ✓ 客户端已连接");
  }

  void onDisconnect(BLEServer *pServer) override {
    deviceConnected = false;
    Serial.println("[BLE] ✗ 客户端已断开，重新开始广播");
  }
};

/* ===================== 设置序列化 / 反序列化 ===================== */

// 将当前设置编码为 11 字节，发送给网页端
// 字节布局:
//   [0-1]  温度下限 uint16 (little-endian, ×10)
//   [2-3]  温度上限 uint16 (×10)
//   [4]    湿度下限 uint8
//   [5]    湿度上限 uint8
//   [6-7]  土壤阈值 uint16
//   [8]    比较模式 uint8 (0=低于, 1=高于)
//   [9]    水泵转速 uint8 (0-255)
//   [10]   浇水方向 uint8 (0=正转, 1=反转)
void serializeSettings(uint8_t *buffer) {
  buffer[0]  = tempMin & 0xFF;
  buffer[1]  = (tempMin >> 8) & 0xFF;
  buffer[2]  = tempMax & 0xFF;
  buffer[3]  = (tempMax >> 8) & 0xFF;
  buffer[4]  = humMin;
  buffer[5]  = humMax;
  buffer[6]  = soilThreshold & 0xFF;
  buffer[7]  = (soilThreshold >> 8) & 0xFF;
  buffer[8]  = compareMode;
  buffer[9]  = pumpSpeed;
  buffer[10] = waterDirection;
}

// 从网页端发来的 11 字节解码设置并应用
void deserializeSettings(uint8_t *buffer) {
  tempMin        = buffer[0] | (buffer[1] << 8);
  tempMax        = buffer[2] | (buffer[3] << 8);
  humMin         = buffer[4];
  humMax         = buffer[5];
  soilThreshold  = buffer[6] | (buffer[7] << 8);
  compareMode    = buffer[8];
  pumpSpeed      = buffer[9];
  waterDirection = buffer[10];

  Serial.println("[设置] ─── 已更新 ───");
  Serial.printf("  温度区间: %.1f°C ~ %.1f°C\n", tempMin / 10.0, tempMax / 10.0);
  Serial.printf("  湿度区间: %d%% ~ %d%%\n", humMin, humMax);
  Serial.printf("  土壤阈值: %d (模式: %s)\n", soilThreshold,
                compareMode == MODE_BELOW ? "低于阈值启动" : "高于阈值启动");
  Serial.printf("  水泵转速: %d / 255\n", pumpSpeed);
  Serial.printf("  浇水方向: %s\n", waterDirection == 0 ? "正转" : "反转");
}

// 将传感器数据编码为 6 字节，推送给网页端
// 字节布局:
//   [0-1]  土壤 ADC 值 uint16
//   [2-3]  温度 uint16 (×10)
//   [4]    湿度 uint8 (%)
//   [5]    水泵状态 uint8 (0=停止, 1=正转, 2=反转)
void serializeSensorData(uint8_t *buffer) {
  buffer[0] = currentSoil & 0xFF;
  buffer[1] = (currentSoil >> 8) & 0xFF;
  buffer[2] = currentTemp & 0xFF;
  buffer[3] = (currentTemp >> 8) & 0xFF;
  buffer[4] = currentHum;
  buffer[5] = (uint8_t)pumpState;
}

/* ===================== 设置持久化（NVS 闪存） ===================== */

// 上电时从 NVS 加载设置，若无则使用默认值
void loadSettings() {
  prefs.begin(NVS_NS, false);

  tempMin        = prefs.getUShort(KEY_TEMP_MIN,  DEFAULT_TEMP_MIN);
  tempMax        = prefs.getUShort(KEY_TEMP_MAX,  DEFAULT_TEMP_MAX);
  humMin         = prefs.getUChar(KEY_HUM_MIN,    DEFAULT_HUM_MIN);
  humMax         = prefs.getUChar(KEY_HUM_MAX,    DEFAULT_HUM_MAX);
  soilThreshold  = prefs.getUShort(KEY_SOIL_THR,  DEFAULT_SOIL_THR);
  compareMode    = prefs.getUChar(KEY_CMP_MODE,   DEFAULT_COMPARE_MODE);
  pumpSpeed      = prefs.getUChar(KEY_PUMP_SPEED, DEFAULT_PUMP_SPEED);
  waterDirection = prefs.getUChar(KEY_WATER_DIR,  DEFAULT_WATER_DIR);

  // 校验浇水方向：仅允许 0(正转) 或 1(反转)
  // 旧固件可能将 0xFF（仅保存标志）写入 NVS，导致水泵始终反转
  if (waterDirection > 1) {
    Serial.printf("[NVS] ⚠ 浇水方向值异常: %d，已重置为正转(0)\n", waterDirection);
    waterDirection = DEFAULT_WATER_DIR;
  }

  prefs.end();

  Serial.println("[NVS] 设置已从闪存加载:");
  Serial.printf("  温度: %.1f ~ %.1f°C\n", tempMin / 10.0, tempMax / 10.0);
  Serial.printf("  湿度: %d ~ %d%%\n", humMin, humMax);
  Serial.printf("  土壤阈值: %d (模式: %s)\n", soilThreshold,
                compareMode == MODE_BELOW ? "低于启动" : "高于启动");
  Serial.printf("  水泵转速: %d\n", pumpSpeed);
  Serial.printf("  浇水方向: %s\n", waterDirection == 0 ? "正转" : "反转");
}

// 设置变更后保存到 NVS
void saveSettings() {
  prefs.begin(NVS_NS, false);

  prefs.putUShort(KEY_TEMP_MIN,  tempMin);
  prefs.putUShort(KEY_TEMP_MAX,  tempMax);
  prefs.putUChar(KEY_HUM_MIN,    humMin);
  prefs.putUChar(KEY_HUM_MAX,    humMax);
  prefs.putUShort(KEY_SOIL_THR,  soilThreshold);
  prefs.putUChar(KEY_CMP_MODE,   compareMode);
  prefs.putUChar(KEY_PUMP_SPEED, pumpSpeed);
  prefs.putUChar(KEY_WATER_DIR,  waterDirection);

  prefs.end();
  Serial.println("[NVS] 设置已保存到闪存");
}

/* ===================== 传感器读取 ===================== */

void readSensors() {
  // 读取 DHT11 温湿度
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  // 校验数据有效性
  if (isnan(t) || isnan(h)) {
    Serial.println("[传感器] ⚠ DHT11 读取失败，保持上次有效值");
    return;
  }

  currentTemp = (uint16_t)(t * 10.0);  // 温度 ×10 存储，保留 1 位小数精度
  currentHum  = (uint8_t)h;

  // 读取土壤湿度 ADC
  currentSoil = analogRead(SOIL_ADC_PIN);

  printSensorData();
}

void printSensorData() {
  Serial.print("[传感器] ");
  Serial.printf("土壤 ADC=%d / 4095  |  温度=%.1f°C  |  湿度=%d%%\n",
                currentSoil, currentTemp / 10.0, currentHum);
}

/* ===================== 串口通信实现 ===================== */

// 计算 XOR 校验
uint8_t calcXOR(uint8_t *data, uint8_t len) {
  uint8_t xorVal = 0;
  for (uint8_t i = 0; i < len; i++) {
    xorVal ^= data[i];
  }
  return xorVal;
}

// 发送串口帧：帧头 + 类型 + 长度 + 数据 + XOR 校验
void sendSerialFrame(uint8_t type, uint8_t *data, uint8_t len) {
  uint8_t frame[64];  // 足够容纳最大帧
  uint8_t idx = 0;
  frame[idx++] = SERIAL_FRAME_HEAD1;
  frame[idx++] = SERIAL_FRAME_HEAD2;
  frame[idx++] = type;
  frame[idx++] = len;
  for (uint8_t i = 0; i < len; i++) {
    frame[idx++] = data[i];
  }
  frame[idx++] = calcXOR(frame, idx);
  Serial.write(frame, idx);
}

// 通过串口发送传感器数据（6 字节）
void sendSensorDataSerial() {
  uint8_t buffer[6];
  serializeSensorData(buffer);
  sendSerialFrame(SERIAL_TYPE_SENSOR, buffer, 6);
}

// 通过串口发送设置数据（11 字节）
void sendSettingsSerial() {
  uint8_t buffer[11];
  serializeSettings(buffer);
  sendSerialFrame(SERIAL_TYPE_SETTINGS, buffer, 11);
}

// 通过串口发送设备信息（JSON 格式，包含 MAC、芯片型号等）
void sendDeviceInfoSerial() {
  String info = buildDeviceInfoJson();
  sendSerialFrame(SERIAL_TYPE_DEVICE_INFO, (uint8_t *)info.c_str(), info.length());
}

// 构建设备信息 JSON 字符串
// 包含：固件版本、MAC 地址、芯片型号、芯片修订版、Flash 大小、空闲堆内存
String buildDeviceInfoJson() {
  uint64_t mac = ESP.getEfuseMac();
  char macStr[18];
  snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
           (uint8_t)(mac >> 40), (uint8_t)(mac >> 32),
           (uint8_t)(mac >> 24), (uint8_t)(mac >> 16),
           (uint8_t)(mac >> 8),  (uint8_t)(mac));

  String json = "{";
  json += "\"fw\":\"2.0.0\"";
  json += ",\"mac\":\"";
  json += macStr;
  json += "\"";
  json += ",\"chip\":\"";
  json += ESP.getChipModel();
  json += "\"";
  json += ",\"rev\":";
  json += ESP.getChipRevision();
  json += ",\"flash\":";
  json += ESP.getFlashChipSize() / 1024;
  json += ",\"heap\":";
  json += ESP.getFreeHeap();
  json += "}";
  return json;
}

// 处理串口接收到的命令帧
void handleSerialCommand() {
  static uint8_t rxBuffer[64];
  static uint8_t rxIndex = 0;

  while (Serial.available()) {
    uint8_t b = Serial.read();

    // 查找帧头
    if (rxIndex == 0 && b != SERIAL_FRAME_HEAD1) continue;
    if (rxIndex == 1 && b != SERIAL_FRAME_HEAD2) {
      rxIndex = 0;
      continue;
    }

    rxBuffer[rxIndex++] = b;

    // 至少收到 4 字节才能判断长度
    if (rxIndex >= 4) {
      uint8_t payloadLen = rxBuffer[3];
      uint8_t totalLen = 4 + payloadLen + 1;  // 帧头(2) + 类型(1) + 长度(1) + 数据 + 校验(1)

      if (rxIndex >= totalLen) {
        // 验证 XOR 校验
        uint8_t xorReceived = rxBuffer[totalLen - 1];
        uint8_t xorCalculated = calcXOR(rxBuffer, totalLen - 1);

        if (xorReceived == xorCalculated) {
          uint8_t type = rxBuffer[2];
          uint8_t *payload = &rxBuffer[4];

          switch (type) {
            case SERIAL_TYPE_SETTINGS: {
              // 收到设置写入帧（11 字节）
              if (payloadLen == 11) {
                uint8_t newSpeed = payload[9];
                uint8_t newDir   = payload[10];

                // 保存旧值，用于水泵控制决策
                uint8_t prevPumpSpeed = pumpSpeed;
                uint8_t prevWaterDir  = waterDirection;

                deserializeSettings(payload);

                // "仅保存设置"模式（向后兼容）：恢复旧方向值，防止 0xFF 写入 NVS
                if (newDir == WATER_DIR_SAVE_ONLY) {
                  waterDirection = prevWaterDir;
                }

                saveSettings();

                // ── 水泵控制逻辑（解耦：方向保存与水泵触发分离） ──
                if (newDir == WATER_DIR_SAVE_ONLY) {
                  Serial.println("[Serial] ✓ 仅保存设置（不触发水泵）");
                }
                // 速度从 0 变为非 0：启动水泵（手动模式）
                else if (newSpeed > 0 && prevPumpSpeed == 0 && systemState == STATE_IDLE && !shouldStartWatering()) {
                  manualOverride = true;
                  Serial.println("[Serial 手动控制] ▶ 启动水泵（手动模式）");
                  startPump(newDir == 0 ? PUMP_FORWARD : PUMP_REVERSE);
                }
                // 速度从非 0 变为 0：停止水泵（退出手动模式）
                else if (newSpeed == 0 && prevPumpSpeed > 0 && manualOverride) {
                  manualOverride = false;
                  stopPump();
                  Serial.println("[Serial 手动控制] ■ 停止水泵，退出手动模式");
                }
                // 手动模式中方向变更：重启水泵
                else if (manualOverride && newDir != prevWaterDir && newSpeed > 0) {
                  Serial.println("[Serial 手动控制] ↻ 方向变更，重启水泵");
                  startPump(newDir == 0 ? PUMP_FORWARD : PUMP_REVERSE);
                }
                // 自动灌溉中：仅更新转速（PWM 实时生效）
                else if (systemState == STATE_WATERING && pumpState != PUMP_OFF) {
                  ledcWrite(PUMP_PWM_PIN, pumpSpeed);
                  Serial.printf("[Serial 自动灌溉] 转速已更新为 %d / 255\n", pumpSpeed);
                }

                Serial.println("[Serial] 设置已更新并保存到闪存");
              }
              break;
            }

            case SERIAL_TYPE_READ_SETTINGS: {
              // 收到读取设置请求
              Serial.println("[Serial] 收到读取设置请求");
              sendSettingsSerial();
              break;
            }

            case SERIAL_TYPE_DEVICE_INFO: {
              // 收到读取设备信息请求
              Serial.println("[Serial] 收到读取设备信息请求");
              sendDeviceInfoSerial();
              break;
            }

            default:
              Serial.printf("[Serial] 未知帧类型: 0x%02X\n", type);
              break;
          }
        } else {
          Serial.println("[Serial] 帧校验失败，丢弃");
        }

        rxIndex = 0;  // 重置缓冲区
      }
    }

    // 防止缓冲区溢出
    if (rxIndex >= sizeof(rxBuffer)) {
      rxIndex = 0;
    }
  }
}

/* ===================== 水泵控制 ===================== */

// 启动水泵，指定旋转方向
void startPump(PumpState direction) {
  // 如果水泵已在运行，先停止再切换方向（保护 H桥）
  if (pumpState != PUMP_OFF) {
    stopPump();
    delay(50);  // 短暂延时，防止 H桥上下桥臂直通
  }

  pumpState = direction;

  if (direction == PUMP_FORWARD) {
    digitalWrite(PUMP_POS_PIN, HIGH);
    digitalWrite(PUMP_NEG_PIN, LOW);
    Serial.println("[水泵] ▶ 正转启动");
  } else if (direction == PUMP_REVERSE) {
    digitalWrite(PUMP_POS_PIN, LOW);
    digitalWrite(PUMP_NEG_PIN, HIGH);
    Serial.println("[水泵] ▶ 反转启动");
  }

  ledcWrite(PUMP_PWM_PIN, pumpSpeed);
  Serial.printf("[水泵]   PWM 占空比: %d / 255\n", pumpSpeed);
}

// 停止水泵
void stopPump() {
  ledcWrite(PUMP_PWM_PIN, 0);
  digitalWrite(PUMP_POS_PIN, LOW);
  digitalWrite(PUMP_NEG_PIN, LOW);
  pumpState = PUMP_OFF;
  Serial.println("[水泵] ■ 已停止");
}

/* ===================== 灌溉决策逻辑（纯函数式） ===================== */

// 判断是否应该启动灌溉
// 三个条件全部满足时返回 true
bool shouldStartWatering() {
  // 条件 1：土壤湿度满足启动条件
  bool soilCondition;
  if (compareMode == MODE_BELOW) {
    soilCondition = (currentSoil < soilThreshold);  // 低于阈值 → 缺水
  } else {
    soilCondition = (currentSoil > soilThreshold);  // 高于阈值 → 过湿
  }

  // 条件 2：温度在允许区间内
  bool tempInRange = (currentTemp >= tempMin && currentTemp <= tempMax);

  // 条件 3：空气湿度在允许区间内
  bool humInRange = (currentHum >= humMin && currentHum <= humMax);

  return soilCondition && tempInRange && humInRange;
}

// 判断是否应该停止灌溉
// 任一条件触发即返回 true
bool shouldStopWatering() {
  // 条件 1：土壤湿度已达到目标
  bool soilReached;
  if (compareMode == MODE_BELOW) {
    soilReached = (currentSoil >= soilThreshold);  // 高于阈值 → 水已够
  } else {
    soilReached = (currentSoil <= soilThreshold);  // 低于阈值 → 已排干
  }

  // 条件 2：温度超出允许区间
  bool tempOutOfRange = (currentTemp < tempMin || currentTemp > tempMax);

  // 条件 3：空气湿度超出允许区间
  bool humOutOfRange = (currentHum < humMin || currentHum > humMax);

  return soilReached || tempOutOfRange || humOutOfRange;
}

// 灌溉状态机：由定时器触发，根据当前状态执行相应逻辑
void checkWatering() {
  switch (systemState) {

    case STATE_IDLE: {
      // 空闲态 → 检查是否应该启动灌溉
      if (shouldStartWatering()) {
        systemState       = STATE_WATERING;
        wateringStartTime = millis();

        Serial.println("═══════════════════════════════════");
        Serial.println("[系统] ▶ 进入灌溉状态");
        Serial.printf("  土壤 ADC=%d (阈值=%d, 模式=%s)\n",
                      currentSoil, soilThreshold,
                      compareMode == MODE_BELOW ? "低于启动" : "高于启动");
        Serial.printf("  温度=%.1f°C (区间 %.1f ~ %.1f)\n",
                      currentTemp / 10.0, tempMin / 10.0, tempMax / 10.0);
        Serial.printf("  湿度=%d%% (区间 %d ~ %d)\n",
                      currentHum, humMin, humMax);
        Serial.println("═══════════════════════════════════");

        // 按设定的方向启动水泵
        startPump(waterDirection == 0 ? PUMP_FORWARD : PUMP_REVERSE);
      }
      break;
    }

    case STATE_WATERING: {
      // 安全超时检查：防止传感器故障导致无限浇水
      if (millis() - wateringStartTime > MAX_WATERING_MS) {
        Serial.println("[系统] ⚠ 灌溉超时（5秒），强制停止！");
        stopPump();
        systemState = STATE_IDLE;
        break;
      }

      // 检查是否需要停止灌溉
      if (shouldStopWatering()) {
        Serial.println("═══════════════════════════════════");
        Serial.println("[系统] ◀ 退出灌溉状态");

        if (compareMode == MODE_BELOW) {
          Serial.printf("  土壤 ADC=%d 已达到阈值 %d\n", currentSoil, soilThreshold);
        } else {
          Serial.printf("  土壤 ADC=%d 已降至阈值 %d\n", currentSoil, soilThreshold);
        }
        Serial.println("═══════════════════════════════════");

        stopPump();
        systemState = STATE_IDLE;
      }
      break;
    }
  }
}

/* ===================== 初始化 setup() ===================== */

void setup() {
  // ── 串口初始化 ──
  Serial.begin(115200);
  delay(1000);  // 等待串口稳定
  Serial.println("\n");
  Serial.println("╔══════════════════════════════════════╗");
  Serial.println("║       智能花盆 ESP32-C6 固件         ║");
  Serial.println("║       版本: 2.0.0                    ║");
  Serial.println("╚══════════════════════════════════════╝");
  Serial.println();

  // ── GPIO 初始化 ──
  pinMode(PUMP_POS_PIN, OUTPUT);
  pinMode(PUMP_NEG_PIN, OUTPUT);
  digitalWrite(PUMP_POS_PIN, LOW);
  digitalWrite(PUMP_NEG_PIN, LOW);
  Serial.println("[初始化] GPIO 已就绪");

  // ── PWM 初始化（Arduino-ESP32 3.x API: pin直接关联） ──
  ledcAttach(PUMP_PWM_PIN, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(PUMP_PWM_PIN, 0);
  Serial.printf("[初始化] PWM 已就绪 (频率=%dHz, 分辨率=%d位)\n", PWM_FREQ, PWM_RESOLUTION);

  // ── DHT11 初始化 ──
  dht.begin();
  Serial.println("[初始化] DHT11 传感器已就绪");

  // ── 从 NVS 闪存加载设置 ──
  loadSettings();

  // ── BLE 初始化 ──
  BLEDevice::init("智能花盆");

  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  // 设置特征（可读可写）
  pSettingsChar = pService->createCharacteristic(
    SETTINGS_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  pSettingsChar->setCallbacks(new SettingsCallbacks());
  uint8_t initSettings[11];
  serializeSettings(initSettings);
  pSettingsChar->setValue(initSettings, 11);

  // 传感器数据特征（可读 + 通知）
  pSensorChar = pService->createCharacteristic(
    SENSOR_CHAR_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  // NimBLE 自动管理 CCCD，无需手动添加 BLE2902 描述符
  uint8_t initSensor[6] = {0};
  pSensorChar->setValue(initSensor, 6);

  // 设备信息特征（只读）— JSON 格式，包含 MAC、芯片型号等
  pDeviceInfoChar = pService->createCharacteristic(
    DEVICE_INFO_UUID,
    BLECharacteristic::PROPERTY_READ
  );
  {
    String info = buildDeviceInfoJson();
    pDeviceInfoChar->setValue(info.c_str());
  }

  // 启动服务
  pService->start();

  // 开始 BLE 广播
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);   // 最小连接间隔 ~7.5ms
  pAdvertising->setMinPreferred(0x12);   // 最大连接间隔 ~22.5ms
  BLEDevice::startAdvertising();

  Serial.println("[BLE] 广播已开启，等待客户端连接...");

  // 首次读取传感器，作为基线
  readSensors();
  lastReadTime = millis();
}

/* ===================== 主循环 loop() ===================== */

void loop() {
  unsigned long now = millis();

  // ── 处理串口命令（每次循环都检查，确保低延迟响应） ──
  handleSerialCommand();

  // ── 处理 BLE 连接/断开状态变化 ──
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
    Serial.println("[BLE] ✓ 客户端连接事件");
    // 连接后立即推送一次传感器数据，消除网页端首次数据等待
    readSensors();
    uint8_t sensorBuffer[6];
    serializeSensorData(sensorBuffer);
    pSensorChar->setValue(sensorBuffer, 6);
    pSensorChar->notify();
    lastReadTime = millis();       // 重置传感器计时器
    lastBleNotifyTime = millis();  // 重置 BLE 通知计时器
  }

  if (!deviceConnected && oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
    Serial.println("[BLE] ✗ 客户端断开事件");
    delay(500);  // 短暂延时
    BLEDevice::startAdvertising();  // 重新开始广播
    Serial.println("[BLE] 广播已恢复");
  }

  // ── 定时读取传感器 ──
  // 根据系统状态选择不同的检测间隔
  unsigned long interval;
  if (manualOverride) {
    interval = WATERING_INTERVAL_MS;  // 手动模式下 200ms 高频检测
  } else if (systemState == STATE_WATERING) {
    interval = WATERING_INTERVAL_MS;  // 灌溉态：200ms 高频检测
  } else {
    interval = IDLE_INTERVAL_MS;      // 空闲态：2s 低频检测
  }

  if (now - lastReadTime >= interval) {
    lastReadTime = now;

    readSensors();  // 读取传感器

    // 仅在非手动模式下执行自动灌溉逻辑
    if (!manualOverride) {
      checkWatering();
    }

    // ── 通过串口推送传感器数据 ──
    sendSensorDataSerial();
  }

  // ── BLE 通知推送（独立定时器，0.5 秒间隔） ──
  // 与传感器读取频率解耦，BLE 连接时提供更流畅的数据更新体验
  if (deviceConnected && (now - lastBleNotifyTime >= BLE_NOTIFY_INTERVAL_MS)) {
    lastBleNotifyTime = now;
    uint8_t sensorBuffer[6];
    serializeSensorData(sensorBuffer);
    pSensorChar->setValue(sensorBuffer, 6);
    pSensorChar->notify();
  }
}
