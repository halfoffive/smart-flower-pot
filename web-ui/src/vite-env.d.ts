/// <reference types="vite/client" />

// Web Bluetooth API 类型声明
interface Navigator {
  bluetooth: Bluetooth
}

interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>
}

interface RequestDeviceOptions {
  filters?: BluetoothDeviceFilter[]
  optionalServices?: string[]
}

interface BluetoothDeviceFilter {
  namePrefix?: string
  services?: string[]
}

interface BluetoothDevice extends EventTarget {
  name?: string
  gatt?: BluetoothRemoteGATTServer
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void
  removeEventListener(type: 'gattserverdisconnected', listener: () => void): void
}

interface BluetoothRemoteGATTServer {
  connected: boolean
  connect(): Promise<BluetoothRemoteGATTServer>
  disconnect(): void
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>
}

interface BluetoothRemoteGATTService extends EventTarget {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  readValue(): Promise<DataView>
  writeValue(value: BufferSource): Promise<void>
  addEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void
  removeEventListener(type: 'characteristicvaluechanged', listener: (event: Event) => void): void
}
