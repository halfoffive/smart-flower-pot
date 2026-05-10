# AGENTS.md

## Project overview

Two independent packages — no shared build, no monorepo tooling:

- **`web/`** — Vite 8 + Tailwind CSS 4 frontend (single-page: `index.html`)
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

### Web (Vite single-page)

The build produces one HTML entrypoint via `vite.config.js` (`rollupOptions.input`). Do **not** add new pages without registering them there.

- `index.html` → `src/main.js` → `src/ui.js`, `src/ble.js`, `src/serial.js`, `src/settings.js`, `src/history.js`, `src/toast.js`, `src/theme.js`, `src/sw-register.js`

Tailwind CSS 4 uses the `@tailwindcss/vite` plugin — the entry is `@import "tailwindcss"` plus a `@theme` block for custom keyframe animations (`animate-pulse-dot`, `animate-slide-up`, `animate-fade-in`, `animate-card-in`) in `src/style.css`. Do not install PostCSS or autoprefixer separately.

### Theme system

- **`src/theme.js`** — Theme management module. Exports `initTheme()`, `getTheme()`, `setTheme(mode)`, `toggleTheme()`. Three modes: `light`, `dark`, `auto` (follows `prefers-color-scheme` media query). User preference persisted to `localStorage` key `sfp-theme`.
- All colors use CSS custom properties (`--sfp-*`) defined in `:root` (light) and `[data-theme="dark"]` selectors in `style.css`. Components reference colors via `rgb(var(--sfp-*))` syntax.
- Anti-flash: Inline `<script>` in `<head>` sets `data-theme` attribute before first paint.
- Never hardcode color values (gray-800, gray-900, etc.) in component JS — always use CSS variable references.
- The theme toggle button is self-contained (in `ui.js`) — it calls `toggleTheme()` then updates its own icon/text without triggering a full re-render.

### PWA

- `public/manifest.json` — installable web app manifest (standalone display, emerald theme)
- `public/sw.js` — Service Worker with Network-First caching strategy (offline fallback)
- `public/icon.svg` — SVG icon used as both favicon and PWA app icon
- `src/sw-register.js` — SW registration module, only activates in production (`import.meta.env.PROD`) to avoid interfering with Vite HMR in dev

### ESP32 firmware

- **Arduino IDE convention**: `.ino` file **must** live in a folder with the **same base name** (`smart_flower_pot/smart_flower_pot.ino`). Never rename these independently.
- Uses **NimBLE** (Arduino-ESP32 built-in), not the legacy Bluedroid BLE stack. CCCD descriptors are auto-managed — never add `BLE2902` includes.
- Pin assignments are hardcoded at the top of the `.ino` file. Changing them requires matching changes in the README table and BLE protocol docs.
- `Preferences.h` (NVS) is used for persistent storage. The namespace is `flowerpot`.
- **Sensor polling intervals**: `IDLE_INTERVAL_MS = 2000` (2s), `WATERING_INTERVAL_MS = 200` (200ms). Idle interval was reduced from 5s for better web responsiveness.
- **Immediate push on connect**: When a BLE client connects, the firmware immediately reads sensors and pushes a notification. This eliminates the web-side delay of waiting for the next polling cycle.

### BLE protocol

Binary, Little-Endian, fixed-length buffers. Settings = 11 bytes, sensor data = 6 bytes. Full byte layout is in the README — the firmware and `web/src/settings.js` must agree exactly on offsets and types.

**Save-only flag**: Byte [10] (`waterDirection`) = `0xFF` tells firmware to save settings without triggering pump. This prevents unintended auto-watering when user just saves config.

### Serial protocol

Binary framed protocol over USB Serial (115200 baud). Frame format: `0xAA 0x55` header + type byte + length byte + payload + XOR checksum. Types: `0x01` sensor data, `0x02` settings, `0x03` device info, `0x04` read-settings request. The firmware parses frames in `loop()` via `handleSerialCommand()` and sends sensor data after each read. Settings/sensor payloads use the exact same 11/6 byte layouts as BLE.

- `web/src/serial.js` — Web Serial API wrapper. Exports `connect()`, `disconnect()`, `readSettings()`, `writeSettings()`, `readDeviceInfo()`, `isConnected()`. API surface mirrors `ble.js` so `main.js` can switch between them transparently.
- Serial and BLE can operate simultaneously; the firmware pushes sensor data to both channels after each sensor read.

### Code conventions

- All comments are in Chinese.
- Functional style in JS — avoid class-heavy patterns. Pure functions preferred, immutable state updates via spread operator.
- The web UI uses a "local-only state update" pattern: sensor updates call `updateDashboard()` (partial DOM patch), settings inputs update memory only without re-rendering.
- **First sensor notification**: Triggers `fullRender()` (not `updateDashboard()`) to transition from the "waiting" empty state to the dashboard view. Subsequent notifications use partial `updateDashboard()`.
- Sensor updates are RAF-throttled (`requestAnimationFrame`) to prevent jank during high-frequency BLE notifications (~200ms intervals).
- Theme changes are self-contained: the toggle button calls `toggleTheme()` and updates its own DOM without triggering full re-renders.

## Gotchas

- **Web Bluetooth and Web Serial only work in Chromium browsers** (Chrome, Edge). Firefox/Safari will silently fail.
- When using Serial mode, close Arduino IDE's Serial Monitor first to avoid port conflicts.
- The firmware's `MAX_WATERING_MS` is **5000 (5 seconds)**, not 60 seconds. The README has a stale mention of 60s in one section — trust the code.
- `vite.config.js` uses CommonJS `path` module via `import` — Vite handles this, but do not convert to `import.meta.url` without verifying the multi-page build still resolves paths correctly.
- There is no CI, no pre-commit hooks, and no automated testing of any kind.
