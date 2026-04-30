/**
 * 智能花盆 — Service Worker（PWA 离线缓存）
 * 
 * 策略：网络优先，响应缓存（Network First + Cache Fallback）
 * - 在线时：请求网络，成功后缓存响应副本
 * - 离线时：从缓存中提供已访问过的资源
 * - 仅缓存 GET 请求，跳过 BLE / chrome-extension 等非 HTTP 请求
 */

// ── 缓存版本（部署时递增即可清除旧缓存） ──
const CACHE_NAME = 'flowerpot-v1'

// ── 安装事件：立即激活 ──
self.addEventListener('install', () => {
  self.skipWaiting()
})

// ── 激活事件：清理旧版本缓存 ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  )
  // 接管所有客户端（无需刷新即可生效）
  self.clients.claim()
})

// ── 请求拦截 ──
self.addEventListener('fetch', (event) => {
  // 仅处理 HTTP/HTTPS GET 请求
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith('http')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 成功响应 → 存入缓存
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() =>
        // 网络失败 → 尝试从缓存提供
        caches.match(event.request)
      )
  )
})
