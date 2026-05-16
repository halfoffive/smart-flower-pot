/**
 * 智能花盆 — Service Worker（激进缓存策略）
 *
 * 策略：缓存优先（Cache First），15 天有效期
 * ──────────────────────────────────────
 * 本应用构建产物为纯静态文件（Vite 构建，带内容哈希），
 * 无需每次请求都回源校验。缓存优先策略可大幅减少网络请求，
 * 提升二次访问加载速度与离线可用性。
 *
 * 缓存流程：
 *   1. 请求到达 → 查询缓存
 *   2. 缓存命中且未过期（15 天内） → 直接返回缓存
 *   3. 缓存过期或未命中 → 发起网络请求
 *   4. 网络成功 → 返回响应并异步更新缓存（写入新时间戳）
 *   5. 网络失败 → 返回过期缓存（离线降级）
 *
 * 缓存失效：
 *   - 部署新版本时递增 CACHE_NAME，激活阶段自动清理旧缓存
 *   - 单次部署后，同一文件的缓存有效期为 15 天
 *   - 带内容哈希的文件（assets/xxx.hash.js）天然免缓存冲突
 */

const CACHE_NAME = 'flowerpot-v4'
const CACHE_TTL_MS = 15 * 24 * 60 * 60 * 1000 // 15 天（毫秒）

/**
 * 判断缓存响应是否仍在有效期内
 * @param {Response} response - 缓存的响应对象
 * @returns {boolean} true = 未过期，可安全使用
 */
const isCacheFresh = (response) => {
  const cachedAt = response.headers.get('x-sfp-cached-at')
  if (!cachedAt) return false // 旧版缓存不含时间戳 → 视为过期
  return Date.now() - Number(cachedAt) < CACHE_TTL_MS
}

/**
 * 创建带时间戳的缓存条目
 * 在响应头中注入 x-sfp-cached-at 标记缓存时刻
 * @param {Response} response - 原始网络响应
 * @returns {Response} 带缓存时间戳的新响应对象
 */
const createCacheEntry = (response) => {
  const headers = new Headers(response.headers)
  headers.set('x-sfp-cached-at', String(Date.now()))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// ── 安装事件：跳过等待，立即激活 ──
self.addEventListener('install', () => {
  self.skipWaiting()
})

// ── 激活事件：清理旧版本缓存 + 接管所有客户端 ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
      await self.clients.claim()
    })()
  )
})

// ── 请求拦截：缓存优先（Cache First）策略 ──
self.addEventListener('fetch', (event) => {
  const { request } = event

  // 仅拦截 HTTP/HTTPS GET 请求
  if (request.method !== 'GET') return
  if (!request.url.startsWith('http')) return

  event.respondWith(
    (async () => {
      // 1. 查询缓存
      const cachedResponse = await caches.match(request)

      // 2. 缓存命中且未过期 → 直接返回（零网络开销）
      if (cachedResponse && isCacheFresh(cachedResponse)) {
        return cachedResponse
      }

      // 3. 缓存过期或未命中 → 发起网络请求
      try {
        const networkResponse = await fetch(request)

        // 成功响应 → 异步写入缓存（不阻塞主流程）
        if (networkResponse.ok) {
          const cacheEntry = createCacheEntry(networkResponse.clone())
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheEntry))
        }

        return networkResponse
      } catch (error) {
        // 4. 网络不可用 → 返回过期缓存（离线降级）
        if (cachedResponse) {
          console.warn('[SW] 网络不可用，返回过期缓存:', request.url)
          return cachedResponse
        }

        // 完全无缓存 → 放行错误（浏览器显示网络错误页面）
        throw error
      }
    })()
  )
})
