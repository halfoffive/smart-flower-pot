# AGENTS.md

## Project overview

Two independent packages — no shared build, no monorepo tooling:

- **`web/`** — Vue 3.5.34 + Vite 8 + Tailwind CSS 4 frontend (single-page SPA)
- **`esp32-c6/`** — Arduino IDE firmware for ESP32-C6 (C++, BLE, NVS)

## Commands

```bash
# Web dev server (Chromium only — Web Bluetooth API)
cd web && npm install && npm run dev

# Web production build
npm run build
npm run preview
```

No test, lint, or typecheck scripts exist.

## Architecture notes

### Web (Vue 3 SPA)

The build produces one HTML entrypoint via `vite.config.js` (`rollupOptions.input`). Do **not** add new pages without registering them there.

**Entry flow**: `index.html` → `src/main.js` (createApp) → `src/App.vue` (根组件)

**Module architecture**:
- `src/lib/` — 纯函数库（无 Vue 依赖，可独立测试）
  - `ble.js` — Web Bluetooth 封装
  - `serial.js` — Web Serial API 封装
  - `settings.js` — 设置序列化/反序列化 + 设备信息解析
- `src/composables/` — Vue 组合式函数
  - `useConnection.js` — 连接管理（BLE/Serial 切换、传感器数据、设置读写、URL 自动连接）
  - `useTheme.js` — 主题管理（浅色/深色/自动三态）
  - `useToast.js` — 提示框（showAlert / showToast）
- `src/components/` — Vue 组件
  - `AppHeader.vue` — 顶部栏
  - `ConnectPanel.vue` — 连接方式选择
  - `Dashboard.vue` — 传感器仪表盘
  - `SensorCard.vue` — 可复用传感器卡片
  - `SettingsPanel.vue` — 灌溉设置表单
  - `DisconnectAction.vue` — 断开连接操作
  - `DeviceInfo.vue` — 设备信息面板

**State management**: `provide/inject` 模式 — `App.vue` 创建 composable 实例并通过 provide 注入，子组件通过 inject 获取。

Tailwind CSS 4 uses the `@tailwindcss/vite` plugin — the entry is `@import "tailwindcss"` plus a `@theme` block for custom keyframe animations (`animate-pulse-dot`, `animate-slide-up`, `animate-fade-in`, `animate-card-in`) in `src/style.css`. Do not install PostCSS or autoprefixer separately.

### Theme system

- **`composables/useTheme.js`** — Vue 3 组合式函数。导出 `initTheme()`, `toggleTheme()`, `themeIcon` (computed)。三态模式：`light`, `dark`, `auto`（跟随 `prefers-color-scheme`）。用户偏好持久化到 `localStorage` key `sfp-theme`。
- All colors use CSS custom properties (`--sfp-*`) defined in `:root` (light) and `[data-theme="dark"]` selectors in `style.css`. Components reference colors via `rgb(var(--sfp-*))` syntax.
- Anti-flash: Inline `<script>` in `<head>` sets `data-theme` attribute before first paint.
- Never hardcode color values in component templates — always use CSS variable references.

### URL auto-connect

- URL query string format: `?mode=ble&mac=XX:XX:XX:XX:XX:XX` or `?mode=ble&mac=XX:XX:XX:XX:XX:XX&pick=1` or `?mode=serial&vid=0x10c4&pid=0xea60`
- On page load, `useConnection.autoConnectFromUrl()` checks URL params and attempts to connect
- For BLE: uses `navigator.bluetooth.getDevices()` to find previously paired devices and tries each one. If the API is unavailable, no devices are paired, or all devices fail to connect, it falls back to `connectBle()` which triggers the browser's manual device picker (requires user gesture). The `mac` parameter in the URL is for identification/bookmarking only — it does not participate in device matching since `BluetoothDevice.id` is a browser-internal identifier that differs from the real BLE MAC address reported by the firmware. The `pick=1` parameter skips auto-connect and directly opens the browser's Bluetooth device picker
- For Serial: uses `navigator.serial.getPorts()` to find previously granted ports. If URL contains `vid`/`pid`, ports are matched by USB vendor/product ID via `matchSerialPort()`. Then `serial.connectWithPort()` connects without user gesture
- After successful connection, URL is updated via `history.replaceState` (MAC/VID/PID are written after `readDeviceData()` completes so the values are available)
- Auto-connect includes availability checks and detailed console.warn logging for troubleshooting

### PWA

- `public/manifest.json` — installable web app manifest (standalone display, emerald theme)
- `public/sw.js` — Service Worker with Network-First caching strategy (offline fallback), cache version `flowerpot-v2`
- `public/icon.svg` — SVG icon used as both favicon and PWA app icon
- `src/sw-register.js` — SW registration module, only activates in production (`import.meta.env.PROD`) to avoid interfering with Vite HMR in dev

### ESP32 firmware

- **Arduino IDE convention**: `.ino` file **must** live in a folder with the **same base name** (`smart_flower_pot/smart_flower_pot.ino`). Never rename these independently.
- Uses **NimBLE** (Arduino-ESP32 built-in), not the legacy Bluedroid BLE stack. CCCD descriptors are auto-managed — never add `BLE2902` includes.
- Pin assignments are hardcoded at the top of the `.ino` file. Changing them requires matching changes in the README table and BLE protocol docs.
- `Preferences.h` (NVS) is used for persistent storage. The namespace is `flowerpot`.
- **Sensor polling intervals**: `IDLE_INTERVAL_MS = 2000` (2s), `WATERING_INTERVAL_MS = 200` (200ms).
- **BLE notification interval**: `BLE_NOTIFY_INTERVAL_MS = 500` (0.5s) — independent from sensor polling, provides smoother data updates for BLE clients.
- **Immediate push on connect**: When a BLE client connects, the firmware immediately reads sensors and pushes a notification.

### BLE protocol

Binary, Little-Endian, fixed-length buffers. Settings = 11 bytes, sensor data = 6 bytes. Full byte layout is in the README — the firmware and `web/src/lib/settings.js` must agree exactly on offsets and types.

**Save-only flag (legacy)**: Byte [10] (`waterDirection`) = `0xFF` tells firmware to save settings without triggering pump. The firmware restores the previous `waterDirection` value before saving to NVS. **Note**: The current Web UI no longer uses this flag — it sends the actual direction value (0 or 1). The firmware only triggers the pump when speed changes from 0 to non-zero, so saving settings with actual direction values won't accidentally start the pump. The 0xFF flag is retained for backward compatibility with older Web UI versions.

**Device info**: JSON format `{"fw":"2.0.0","mac":"XX:XX:XX:XX:XX:XX","chip":"ESP32-C6","rev":1,"flash":4096,"heap":12345}`. Parsed on the web side by `parseDeviceInfo()`.

### Serial protocol

Binary framed protocol over USB Serial (115200 baud). Frame format: `0xAA 0x55` header + type byte + length byte + payload + XOR checksum. Types: `0x01` sensor data, `0x02` settings, `0x03` device info, `0x04` read-settings request. The firmware parses frames in `loop()` via `handleSerialCommand()` and sends sensor data after each read. Settings/sensor payloads use the exact same 11/6 byte layouts as BLE.

- `web/src/lib/serial.js` — Web Serial API wrapper. Exports `connect()`, `connectWithPort()`, `disconnect()`, `readSettings()`, `writeSettings()`, `readDeviceInfo()`, `isConnected()`, `getPortInfo()`. API surface mirrors `ble.js` so `useConnection.js` can switch between them transparently. `connect()` requires user gesture (calls `requestPort()`); `connectWithPort()` accepts an already-granted port for URL auto-connect. Both share `openAndStartReadLoop()` internal function. `getPortInfo()` returns `SerialPortInfo` (USB VID/PID) for URL query and DeviceInfo display. All data-processing functions are pure functions with no side effects. Buffer operations use immutable updates.
- Serial and BLE can operate simultaneously; the firmware pushes sensor data to both channels after each sensor read.

### Code conventions

- All comments are in Chinese.
- Functional style in JS — avoid class-heavy patterns. Pure functions preferred, immutable state updates via spread operator.
- Vue 3 Composition API with `<script setup>` — no Options API.
- Composables return reactive refs and methods; components consume via `inject()`.
- Settings inputs update memory only (via `updateSetting()`) without triggering re-renders.
- Theme changes are reactive: `toggleTheme()` updates the `currentMode` ref, Vue automatically re-renders the theme button.

## Gotchas

- **Web Bluetooth and Web Serial only work in Chromium browsers** (Chrome, Edge). Firefox/Safari will silently fail.
- When using Serial mode, close Arduino IDE's Serial Monitor first to avoid port conflicts.
- The firmware's `MAX_WATERING_MS` is **5000 (5 seconds)**, not 60 seconds. Trust the code.
- `vite.config.js` uses CommonJS `path` module via `import` — Vite handles this, but do not convert to `import.meta.url` without verifying the build still resolves paths correctly.
- There is no CI, no pre-commit hooks, and no automated testing of any kind.
- **waterDirection = 0xFF** is a legacy protocol control flag, not an actual direction. The current Web UI sends actual direction values (0 or 1). The firmware only triggers the pump when speed changes from 0 to non-zero, so saving direction changes won't accidentally start the pump. The 0xFF flag is retained for backward compatibility.
- **Connection vs data reading are separated**: `useConnection.js` sets `connected = true` immediately after the transport-level connection succeeds. `readSettings()` and `readDeviceInfo()` failures are non-fatal — they log warnings but don't tear down the connection or show error alerts.
