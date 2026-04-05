// 智能花盆 Web UI 主入口
import '@material/web/all.js'
import { MdSlider } from '@material/web/slider/slider.js'
import { MdSwitch } from '@material/web/switch/switch.js'
import { MdFilledButton } from '@material/web/button/filled-button.js'
import { MdCircularProgress } from '@material/web/progress/circular-progress.js'
import './styles.css'

// BLE 服务和特征值 UUID (与 ESP32-C6 固件匹配)
const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0'
const MOISTURE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1'
const CONFIG_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2'
const PUMP_STATE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef3'

// 设备名称过滤器
const DEVICE_NAME_PREFIX = 'SmartFlowerPot'

/** 应用状态 */
interface AppState {
  /** 是否已连接 */
  connected: boolean
  /** 当前土壤湿度 (0-4095) */
  moisture: number
  /** 湿度阈值 (0-4095) */
  threshold: number
  /** 浇水模式: true=低于阈值浇水, false=高于阈值浇水 */
  waterWhenBelow: boolean
  /** 水泵 1 是否运行 */
  pump1Active: boolean
  /** 水泵 2 是否运行 */
  pump2Active: boolean
}

/** BLE 连接管理 */
class BLEConnection {
  private device: BluetoothDevice | null = null
  private service: BluetoothRemoteGATTService | null = null
  private moistureChar: BluetoothRemoteGATTCharacteristic | null = null
  private configChar: BluetoothRemoteGATTCharacteristic | null = null
  private pumpStateChar: BluetoothRemoteGATTCharacteristic | null = null

  /** 请求并连接 BLE 设备 */
  async connect(onUpdate: (state: Partial<AppState>) => void): Promise<boolean> {
    try {
      // 请求用户选择 BLE 设备
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
        optionalServices: [SERVICE_UUID],
      })

      log('正在连接设备...')
      this.device.addEventListener('gattserverdisconnected', this.onDisconnected)

      // 连接 GATT 服务器
      const server = await this.device.gatt!.connect()
      log('已连接 GATT 服务器, 获取服务...')

      // 获取自定义服务
      this.service = await server.getPrimaryService(SERVICE_UUID)

      // 获取特征值
      this.moistureChar = await this.service.getCharacteristic(MOISTURE_CHAR_UUID)
      this.configChar = await this.service.getCharacteristic(CONFIG_CHAR_UUID)
      this.pumpStateChar = await this.service.getCharacteristic(PUMP_STATE_CHAR_UUID)

      // 设置通知监听
      await this.setupNotifications(onUpdate)

      log('设备连接成功!')
      return true
    } catch (error) {
      log(`连接失败: ${error}`)
      return false
    }
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect()
      log('已断开连接')
    }
  }

  /** 设置特征值通知 */
  private async setupNotifications(onUpdate: (state: Partial<AppState>) => void): Promise<void> {
    // 监听湿度变化
    if (this.moistureChar) {
      await this.moistureChar.startNotifications()
      this.moistureChar.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value!
        const moisture = value.getUint16(0, true) // 小端序
        onUpdate({ moisture })
        log(`湿度更新: ${moisture}`)
      })
    }

    // 监听泵状态变化
    if (this.pumpStateChar) {
      await this.pumpStateChar.startNotifications()
      this.pumpStateChar.addEventListener('characteristicvaluechanged', (event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value!
        const pump1Active = value.getUint8(0) !== 0
        const pump2Active = value.getUint8(1) !== 0
        onUpdate({ pump1Active, pump2Active })
        log(`泵状态更新: 泵1=${pump1Active}, 泵2=${pump2Active}`)
      })
    }
  }

  /** 发送配置到设备 */
  async sendConfig(threshold: number, waterWhenBelow: boolean): Promise<void> {
    if (!this.configChar) {
      throw new Error('配置特征值不可用')
    }

    // 构建配置数据: [threshold(2字节), waterWhenBelow(1字节)]
    const data = new ArrayBuffer(3)
    const view = new DataView(data)
    view.setUint16(0, threshold, true) // 小端序
    view.setUint8(2, waterWhenBelow ? 1 : 0)

    await this.configChar.writeValue(data)
    log('配置已发送到设备')
  }

  /** 设备断开回调 */
  private onDisconnected = (): void => {
    log('设备已断开连接')
  }
}

/** 日志输出 */
function log(message: string): void {
  const timestamp = new Date().toLocaleTimeString('zh-CN')
  console.log(`[${timestamp}] ${message}`)
}

/** 主应用 */
class SmartFlowerPotApp {
  private ble: BLEConnection
  private state: AppState

  constructor() {
    this.ble = new BLEConnection()
    this.state = {
      connected: false,
      moisture: 0,
      threshold: 2000,
      waterWhenBelow: true,
      pump1Active: false,
      pump2Active: false,
    }

    this.initUI()
  }

  /** 初始化 UI */
  private initUI(): void {
    const app = document.querySelector<HTMLDivElement>('#app')!
    app.innerHTML = `
      <div class="container">
        <h1>🌱 智能花盆控制面板</h1>
        
        <div class="card">
          <h2>连接状态</h2>
          <div class="status">
            <md-circular-progress id="connection-indicator" indeterminate></md-circular-progress>
            <span id="connection-status">未连接</span>
          </div>
          <md-filled-button id="connect-btn">连接设备</md-filled-button>
        </div>

        <div class="card">
          <h2>土壤湿度</h2>
          <div class="moisture-display">
            <div class="moisture-value" id="moisture-value">0</div>
            <div class="moisture-label">/ 4095</div>
            <div class="moisture-bar">
              <div class="moisture-bar-fill" id="moisture-bar"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>水泵状态</h2>
          <div class="pump-status">
            <div class="pump-item">
              <md-icon id="pump1-icon">water_drop</md-icon>
              <span>水泵 1</span>
              <span class="pump-state" id="pump1-state">停止</span>
            </div>
            <div class="pump-item">
              <md-icon id="pump2-icon">water_drop</md-icon>
              <span>水泵 2</span>
              <span class="pump-state" id="pump2-state">停止</span>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>浇水配置</h2>
          <div class="config-section">
            <label for="threshold-slider">
              湿度阈值: <span id="threshold-value">2000</span>
            </label>
            <md-slider
              id="threshold-slider"
              min="0"
              max="4095"
              value="2000"
              ticks
            ></md-slider>
            
            <div class="mode-switch">
              <span>低于阈值时浇水</span>
              <md-switch id="mode-switch" selected></md-switch>
              <span>高于阈值时浇水</span>
            </div>
            
            <md-outlined-button id="apply-config-btn">应用配置</md-outlined-button>
          </div>
        </div>
      </div>
    `

    this.bindEvents()
  }

  /** 绑定事件 */
  private bindEvents(): void {
    // 连接按钮
    const connectBtn = document.querySelector('#connect-btn')
    connectBtn?.addEventListener('click', () => this.handleConnect())

    // 阈值滑块
    const thresholdSlider = document.querySelector('#threshold-slider') as MdSlider
    thresholdSlider?.addEventListener('input', () => {
      const value = thresholdSlider.value
      if (value !== undefined) {
        document.querySelector('#threshold-value')!.textContent = value.toString()
        this.state.threshold = value
      }
    })

    // 模式开关
    const modeSwitch = document.querySelector('#mode-switch') as MdSwitch
    modeSwitch?.addEventListener('change', () => {
      this.state.waterWhenBelow = modeSwitch.selected
    })

    // 应用配置按钮
    const applyConfigBtn = document.querySelector('#apply-config-btn')
    applyConfigBtn?.addEventListener('click', () => this.handleApplyConfig())
  }

  /** 处理连接 */
  private async handleConnect(): Promise<void> {
    const connectBtn = document.querySelector('#connect-btn') as MdFilledButton
    const statusEl = document.querySelector('#connection-status')!
    const indicator = document.querySelector('#connection-indicator') as MdCircularProgress

    if (this.state.connected) {
      // 断开连接
      this.ble.disconnect()
      this.updateState({ connected: false })
      connectBtn.textContent = '连接设备'
      statusEl.textContent = '未连接'
      indicator.indeterminate = false
      return
    }

    connectBtn.disabled = true
    indicator.indeterminate = true
    statusEl.textContent = '连接中...'

    const success = await this.ble.connect((update) => this.updateState(update))

    if (success) {
      this.updateState({ connected: true })
      connectBtn.textContent = '断开连接'
      statusEl.textContent = '已连接'
      indicator.indeterminate = false
    } else {
      statusEl.textContent = '连接失败'
      indicator.indeterminate = false
    }

    connectBtn.disabled = false
  }

  /** 处理应用配置 */
  private async handleApplyConfig(): Promise<void> {
    if (!this.state.connected) {
      log('设备未连接, 无法应用配置')
      return
    }

    try {
      await this.ble.sendConfig(this.state.threshold, this.state.waterWhenBelow)
      log('配置已应用')
    } catch (error) {
      log(`应用配置失败: ${error}`)
    }
  }

  /** 更新应用状态 */
  private updateState(update: Partial<AppState>): void {
    this.state = { ...this.state, ...update }

    // 更新 UI
    if ('moisture' in update) {
      document.querySelector('#moisture-value')!.textContent = this.state.moisture.toString()
      const percentage = (this.state.moisture / 4095) * 100
      document.querySelector('#moisture-bar')!.setAttribute('style', `width: ${percentage}%`)
    }

    if ('pump1Active' in update) {
      const pump1State = document.querySelector('#pump1-state')!
      const pump1Icon = document.querySelector('#pump1-icon')!
      pump1State.textContent = this.state.pump1Active ? '运行' : '停止'
      pump1Icon.setAttribute('style', this.state.pump1Active ? 'color: #2196F3' : '')
    }

    if ('pump2Active' in update) {
      const pump2State = document.querySelector('#pump2-state')!
      const pump2Icon = document.querySelector('#pump2-icon')!
      pump2State.textContent = this.state.pump2Active ? '运行' : '停止'
      pump2Icon.setAttribute('style', this.state.pump2Active ? 'color: #2196F3' : '')
    }
  }
}

// 启动应用
void new SmartFlowerPotApp()
