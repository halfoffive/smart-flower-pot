# AGENTS.md

## Project overview

Three independent packages — no shared build, no monorepo tooling:

- **`web/`** — Vue 3.5.34 + Vite 8 + Tailwind CSS 4 frontend (single-page SPA)
- **`desktop/`** — Tauri 2 + Vue 3 + Vite 8 desktop/mobile client (Windows/macOS/Linux/Android/iOS)
- **`esp32/`** — Arduino IDE firmware for ESP32 series (ESP32 / ESP32-C3 / ESP32-C6 / ESP32-S2 / ESP32-S3, C++, BLE, NVS)

## Commands

```bash
# Web dev server (Chromium only — Web Bluetooth API)
cd web && bun install && bun run dev

# Web production build
bun run build
bun run preview

# 注：Cloudflare Pages 使用默认 base=/，GitHub Pages 使用 --base=/repo-name/
# GitHub Pages 构建（测试用）：
bun run build -- --base=/smart-flower-pot/

# Tauri 客户端开发
cd desktop && bun install && bun run tauri dev

# Tauri 客户端构建
bun run tauri build

# 生成 Tauri 应用图标（从源 PNG 生成全平台图标）
cd desktop && bun tauri icon public/potted_plant_3d.png
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
- `public/sw.js` — Service Worker with **Cache-First** caching strategy, cache version `flowerpot-v11`
  - 所有 HTTP GET 请求缓存优先，15 天有效期
  - 缓存响应注入 `x-sfp-cached-at` 时间戳精确控制 TTL
  - 纯函数 `isCacheFresh()` / `createCacheEntry()` 分离缓存判断逻辑
  - 网络不可用时返回过期缓存（离线降级）
  - 安装时预缓存根页面（`self.registration.scope`），确保离线刷新可用
  - 导航请求使用 `ignoreVary: true` 匹配缓存，不受 Accept/Vary 头差异影响
  - 离线导航完全无缓存时降级返回根页面（SPA Fallback）
  - 新版本发布时递增 `CACHE_NAME`（当前 `flowerpot-v11`），激活阶段自动清理旧缓存
- `public/icon.svg` — SVG icon used as both favicon and PWA app icon
- `public/potted_plant_3d.png` — 主应用图标源文件（1024×1024 PNG），也用作 favicon 和 Web 端图标；桌面端通过 `bun tauri icon` 从此文件生成全平台图标
- `src/sw-register.js` — SW registration module, only activates in production (`import.meta.env.PROD`) to avoid interfering with Vite HMR in dev

### Caching strategy

The entire web frontend is a fully static SPA (no server-side rendering). Three mechanisms combine for maximal caching:

1. **Content-hashed filenames (Vite build)**: All build artifacts in `assets/` include a content hash (e.g. `index.a1b2c3.js`). Content changes → filename changes → cache auto-invalidates. No manual cache-busting needed.
   - `vite.config.js` uses `assetsInlineLimit: 0` to emit every asset as a separate file (no base64 inlining), ensuring each URL can be individually cached by the SW.

2. **Service Worker Cache-First (15-day TTL)**:
   - First visit: SW installs → pre-caches root HTML → activates → controls page.
   - During browsing: every fetched response (HTML/JS/CSS/images/fonts) is cached with `x-sfp-cached-at` timestamp.
   - Subsequent visits within 15 days: SW returns cached copy — zero network requests.
   - After 15 days: SW fetches fresh copy from network, updates cache.
   - Offline refresh: SW returns cached HTML via `ignoreVary: true` matching. If the exact URL isn't cached, falls back to the root page (SPA Fallback).

3. **Cache versioning**: `CACHE_NAME` (`flowerpot-v11`) acts as a deployment-level cache key. Bumping it on deploy causes the SW `activate` event to delete all other caches, ensuring a clean slate without manual clearing.

### ESP32 firmware

- **Arduino IDE convention**: `.ino` file **must** live in a folder with the **same base name** (`smart_flower_pot/smart_flower_pot.ino`). Never rename these independently.
- **Multi-chip support**: Firmware uses conditional compilation (`CONFIG_IDF_TARGET_*` macros) to auto-detect chip model and adapt pin assignments. Supported chips: ESP32, ESP32-C3, ESP32-C6, ESP32-S2, ESP32-S3.
- **ESP32-S2 has no BLE**: When `CONFIG_IDF_TARGET_ESP32S2` is defined, `NO_BLE` macro is set, disabling all BLE-related code. ESP32-S2 only supports Serial communication.
- Uses **NimBLE** (Arduino-ESP32 built-in), not the legacy Bluedroid BLE stack. CCCD descriptors are auto-managed — never add `BLE2902` includes.
- Pin assignments are defined per-chip at the top of the `.ino` file via conditional compilation. Changing them requires matching changes in the README table and BLE protocol docs.
- `Preferences.h` (NVS) is used for persistent storage. The namespace is `flowerpot`.
- **Sensor polling intervals**: `IDLE_INTERVAL_MS = 2000` (2s), `WATERING_INTERVAL_MS = 200` (200ms).
- **BLE notification interval**: `BLE_NOTIFY_INTERVAL_MS = 500` (0.5s) — independent from sensor polling, provides smoother data updates for BLE clients.
- **Immediate push on connect**: When a BLE client connects, the firmware immediately reads sensors and pushes a notification.
- **Serial startup delay**: After opening the serial port, the client waits 2 seconds for the ESP32 to finish resetting before sending commands. This avoids communication timeouts during ESP32 reset. There is no ready signal mechanism — the firmware no longer sends a special ready frame.

### BLE protocol

Binary, Little-Endian, fixed-length buffers. Settings = 11 bytes, sensor data = 6 bytes. Full byte layout is in the README — the firmware and `web/src/lib/settings.js` must agree exactly on offsets and types.

**Save-only flag (legacy)**: Byte [10] (`waterDirection`) = `0xFF` tells firmware to save settings without triggering pump. The firmware restores the previous `waterDirection` value before saving to NVS. **Note**: The current Web UI no longer uses this flag — it sends the actual direction value (0 or 1). The firmware only triggers the pump when speed changes from 0 to non-zero, so saving settings with actual direction values won't accidentally start the pump. The 0xFF flag is retained for backward compatibility with older Web UI versions.

**Device info**: JSON format `{"fw":"4.3.0","mac":"XX:XX:XX:XX:XX:XX","chip":"ESP32-C6","rev":1,"flash":4096,"heap":12345}`. Parsed on the web side by `parseDeviceInfo()`.

### Serial protocol

Binary framed protocol over USB Serial (115200 baud). Frame format: `0xAA 0x55` header + type byte + length byte + payload + XOR checksum. Types: `0x01` sensor data, `0x02` settings, `0x03` device info, `0x04` read-settings request. The firmware parses frames in `loop()` via `handleSerialCommand()` and sends sensor data after each read. Settings/sensor payloads use the exact same 11/6 byte layouts as BLE.

- `web/src/lib/serial.js` — Web Serial API wrapper. Exports `connect()`, `connectWithPort()`, `disconnect()`, `readSettings()`, `writeSettings()`, `readDeviceInfo()`, `isConnected()`, `getPortInfo()`. API surface mirrors `ble.js` so `useConnection.js` can switch between them transparently. `connect()` requires user gesture (calls `requestPort()`); `connectWithPort()` accepts an already-granted port for URL auto-connect. Both share `openAndStartReadLoop()` internal function. `getPortInfo()` returns `SerialPortInfo` (USB VID/PID) for URL query and DeviceInfo display. All data-processing functions are pure functions with no side effects. Buffer operations use immutable updates. **Serial startup delay**: `openAndStartReadLoop()` waits 2 seconds after opening the port for the ESP32 to finish resetting, then proceeds without any ready signal mechanism. USB VID filter list includes CP210x (0x10c4), CH340 (0x1a86), Espressif native USB (0x303a), and FTDI (0x0403).
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
- **Cache version MUST be bumped on EVERY deploy that changes any file**: `web/public/sw.js`'s `CACHE_NAME` (currently `flowerpot-v11`) must be incremented every time anything changes (HTML/JS/CSS/images/SW logic), or existing users will be served stale cached files until the 15-day TTL expires. The SW `activate` event only deletes caches whose name differs from the current `CACHE_NAME`. Forgetting this is the #1 cause of "my fix didn't take effect" bugs.
- `assetsInlineLimit: 0` in `vite.config.js` means **no base64 inlining** — every asset is a separate file. This is intentional for SW cache granularity. If performance testing shows excessive HTTP requests, consider raising the limit, but always test SW caching behavior after the change.
- **Tauri 图标从源 PNG 生成**：`desktop/public/potted_plant_3d.png` 是图标源文件（1024×1024 PNG），每次构建前通过 `bun tauri icon public/potted_plant_3d.png --ci` 重新生成所有平台图标。如需更换应用图标，替换此 PNG 文件后重新生成即可。
- There is no CI, no pre-commit hooks, and no automated testing of any kind.
- **waterDirection = 0xFF** is a legacy protocol control flag, not an actual direction. The current Web UI sends actual direction values (0 or 1). The firmware only triggers the pump when speed changes from 0 to non-zero, so saving direction changes won't accidentally start the pump. The 0xFF flag is retained for backward compatibility.
- **Connection vs data reading are separated**: `useConnection.js` sets `connected = true` and `connecting = false` immediately after the transport-level connection succeeds. `readDeviceData()` runs asynchronously in the background — `readSettings()` and `readDeviceInfo()` failures are non-fatal, they log warnings but don't tear down the connection or show error alerts. The UI enters the main dashboard immediately upon connection, without waiting for data reads to complete.
- **Serial startup delay**: When opening a serial connection, the client waits 2 seconds for the ESP32 to finish resetting. No ready signal or frame caching is used — `readDeviceInfo()` always sends an explicit request.
- **BLE auto-reconnect requires scanning**: btleplug requires devices to be discovered via scanning before connecting. `autoReconnect()`, `tryQuickBleConnect()`, and `autoConnectFromUrl()` all use `scanAndConnect()` which scans first, then connects. Direct `connect(address)` without prior scanning will fail.
- **BLE scan is stream-based**: `startScan` from `@mnlphlp/plugin-blec` returns immediately — the Rust backend spawns a tokio task that scans in 200ms intervals and pushes devices via Tauri Channel. The `scanDevices()` function uses a callback pattern (`onDevice`) rather than returning an array, because the array would always be empty at the time `startScan` resolves.

### Desktop (Tauri 2 Client)

**Entry flow**: `index.html` → `src/main.js` (createApp) → `src/App.vue` (根组件)

**Module architecture**:
- `src/lib/` — 纯函数库 + Tauri 插件适配层
  - `tauri-ble.js` — tauri-plugin-blec 适配（流式扫描/设备过滤/scanAndConnect 自动重连/连接/读写/订阅，number[] ↔ ArrayBuffer 互转）
  - `tauri-serial.js` — tauri-plugin-serialplugin 适配（串口列表/连接/帧协议，hex 编解码）
  - `settings.js` — 设置序列化/反序列化（与 Web 端共享，纯函数）
- `src/composables/` — Vue 组合式函数
  - `useConnection.js` — 连接管理（Tauri 插件 + Store 持久化 + BLE scanAndConnect 自动重连 + Deep Link 自动连接 + 快速重连）
  - `useTheme.js` — 主题管理（与 Web 端共享）
  - `useToast.js` — 提示框（与 Web 端共享）
- `src/components/` — Vue 组件
  - `ConnectPanel.vue` — 连接方式选择（BLE 快速重连优先 + 应用内设备/串口列表选择 UI + 实时扫描流式显示）
  - 其余组件与 Web 端共享

**Tauri plugins** (registered in `src-tauri/src/lib.rs`):
- `tauri-plugin-blec` — BLE 蓝牙客户端（基于 btleplug，全平台）
- `tauri-plugin-serialplugin` — 串口通信（跨平台）
- `tauri-plugin-deep-link` — 深度链接（URL Scheme 启动应用）
- `tauri-plugin-store` — 持久化键值存储（保存上次连接信息）
- `tauri-plugin-opener` — 外部链接打开

**Deep Link**:
- 桌面 URL Scheme: `smart-flower-pot://connect?mode=ble&mac=XX:XX:XX:XX:XX:XX`
- 移动端: Universal Links (iOS) / App Links (Android)，需配置 `.well-known/` 服务器文件
- 前端通过 `getCurrent()` 获取冷启动 URL（应用未运行时点击链接启动），`onOpenUrl()` 监听热启动（应用运行中收到链接）
- 冷启动 URL 存在时跳过 `autoReconnect()`，避免同时触发两个连接

**Auto-reconnect**:
- 使用 `tauri-plugin-store` 持久化 `{ mode, address/path }` 到 `connection-store.json`
- 应用启动时 `autoReconnect()` 从 Store 读取上次连接信息并尝试自动连接
- BLE 自动重连使用 `scanAndConnect()`：先扫描发现目标设备再连接（btleplug 要求先扫描后连接，直接 connect 必定失败）
- 串口自动重连直接调用 `connect()`（串口不需要扫描）
- 连接成功后调用 `saveLastConnection()` 保存当前连接信息
- 点击蓝牙连接按钮时 `tryQuickBleConnect()` 优先尝试快速重连上次 BLE 设备，失败后回退到扫描模式

**BLE scanning and filtering**:
- `scanDevices(onDevice, timeoutMs)` — 流式回调模式，设备发现后立即推送到 UI（`startScan` 的 invoke 立即返回，扫描在 Rust 后台持续运行）
- `scanAndConnect(address, onSensorData, onDisconnect, timeoutMs)` — 扫描并自动连接指定地址设备，供自动重连使用
- `isFlowerPotDevice(device)` — 过滤无关蓝牙设备，匹配规则：设备 services 包含项目 Service UUID 或设备名称包含关键词（智能花盆/SmartFlowerPot/SFP）
- `stopScanDevices()` — 停止 BLE 扫描
- 扫描超时默认 10 秒，ConnectPanel 中 10.5 秒后自动设置 scanning=false

**Capabilities** (`src-tauri/capabilities/default.json`):
- `core:default`, `core:event:default` — 核心权限
- `blec:default` — BLE 插件权限
- `serialplugin:default` — 串口插件权限
- `deep-link:default` — 深度链接权限
- `store:default` — 存储插件权限
- `opener:default` — 打开器权限

**GitHub Actions** (`.github/workflows/build-tauri.yml`):
- 手动触发 `workflow_dispatch`
- 构建矩阵：macOS (Arm + Intel)、Ubuntu、Windows、Android APK
- 使用 `tauri-apps/tauri-action@v0`
- 发布到 GitHub Release（预发布，非草稿）
- Android 签名需要 GitHub Secrets: `ANDROID_KEY_ALIAS`, `ANDROID_KEY_BASE64`, `ANDROID_KEY_PASSWORD`
- **图标自动生成**：构建前执行 `bun tauri icon public/potted_plant_3d.png --ci`，从源 PNG 生成全平台图标（含 Android mipmap），确保各平台图标一致性

**ESP32 Firmware Build** (`.github/workflows/build-esp32-firmware.yml`):
- 手动触发 `workflow_dispatch`
- 构建矩阵：ESP32、ESP32-C3、ESP32-C6、ESP32-S2、ESP32-S3（5 芯片并行）
- 使用 arduino-cli 编译固件（`esp32:esp32` 核心）
- 构建产物（.bin / .elf）按芯片名称上传为独立 artifact
