# AGENTS.md

## Project overview

Two independent packages — no shared build, no monorepo tooling:

- **`web/`** — Vite 8 + Tailwind CSS 4 frontend (multi-page: `index.html` + `test.html`)
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

### Web (Vite multi-page)

The build produces two HTML entrypoints via `vite.config.js` (`rollupOptions.input`). Do **not** add new pages without registering them there.

- `index.html` → `src/main.js` → `src/ui.js`, `src/ble.js`, `src/settings.js`, `src/history.js`, `src/toast.js`, `src/sw-register.js`
- `test.html` → `src/test.js` (standalone manual pump control)

Tailwind CSS 4 uses the `@tailwindcss/vite` plugin — the entry is `@import "tailwindcss"` plus a `@theme` block for custom keyframe animations (`animate-pulse-dot`, `animate-slide-up`, `animate-fade-in`, `animate-card-in`) in `src/style.css`. Do not install PostCSS or autoprefixer separately.

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

### BLE protocol

Binary, Little-Endian, fixed-length buffers. Settings = 11 bytes, sensor data = 6 bytes. Full byte layout is in the README — the firmware and `web/src/settings.js` must agree exactly on offsets and types.

### Code conventions

- All comments are in Chinese.
- Functional style in JS — avoid class-heavy patterns.
- The web UI uses a "local-only state update" pattern: sensor updates call `updateDashboard()` (partial DOM patch), settings inputs update memory only without re-rendering.

## Gotchas

- **Web Bluetooth only works in Chromium browsers** (Chrome, Edge). Firefox/Safari will silently fail.
- The firmware's `MAX_WATERING_MS` is **5000 (5 seconds)**, not 60 seconds. The README has a stale mention of 60s in one section — trust the code.
- `vite.config.js` uses CommonJS `path` module via `import` — Vite handles this, but do not convert to `import.meta.url` without verifying the multi-page build still resolves paths correctly.
- There is no CI, no pre-commit hooks, and no automated testing of any kind.

## Build Plan (当前任务)
- Implement UI improvements in web/:
  - 给所有卡片添加统一入场动画（确保无障碍友好、可观测性好）
  - 新增深色/浅色模式切换，主题状态持久化，优先 OS 主题偏好
  - 尽量采用函数式编程风格，提取纯函数、减少副作用
  - 增加中文注释，关键逻辑处提供简短解释
- 文档更新：更新 README、CHANGELOG、AGENTS.md，描述改动与使用方法
- 提交策略：分阶段提交，确保每次提交都可回滚，逐步验收
- 验证点：两入口页 index.html/test.html 的一致性、主题在不同场景的可用性、动画在不同浏览器的表现
