/**
 * 智能花盆 — Service Worker（激进缓存策略 + 离线导航降级）
 *
 * 策略：缓存优先（Cache First），15 天有效期
 * ──────────────────────────────────────
 * 本应用构建产物为纯静态文件（Vite 构建，带内容哈希），
 * 无需每次请求都回源校验。缓存优先策略可大幅减少网络请求，
 * 提升二次访问加载速度与离线可用性。
 *
 * 缓存流程：
 *   1. 请求到达 → 查询缓存（忽略 Vary 头，兼容导航请求）
 *   2. 缓存命中且未过期（15 天内） → 直接返回缓存
 *   3. 缓存过期或未命中 → 发起网络请求
 *   4. 网络成功 → 返回响应并异步更新缓存（写入新时间戳）
 *   5. 网络失败 → 返回过期缓存（离线降级）
 *   6. 导航请求完全无缓存 → 返回根页面缓存（SPA Fallback）
 *
 * 离线保障：
 *   - 安装时预缓存根页面（self.registration.scope），确保离线刷新有内容可返回
 *   - 导航请求使用 ignoreVary: true 匹配缓存，不受请求头差异影响
 *   - 离线刷新时即使具体 URL 无缓存，也能降级到根页面 HTML
 *
 * 缓存失效：
 *   - 部署新版本时递增 CACHE_NAME，激活阶段自动清理旧缓存
 *   - 单次部署后，同一文件的缓存有效期为 15 天
 *   - 带内容哈希的文件（assets/xxx.hash.js）天然免缓存冲突
 */

const CACHE_NAME = 'flowerpot-v5'
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

// ── 安装事件：跳过等待 + 预缓存根页面 ──
self.addEventListener('install', (event) => {
  self.skipWaiting()

  // 预缓存根页面 HTML，确保离线刷新有内容可返回
  // 使用 self.registration.scope 自动适配子目录部署
  // 预缓存失败不阻塞安装（离线时正常跳过）
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME)
        await cache.add(self.registration.scope)
        console.log('[SW] ✅ 根页面已预缓存:', self.registration.scope)
      } catch (e) {
        console.warn('[SW] ⚠ 根页面预缓存跳过（可能已离线）:', e.message)
      }
    })()
  )
})

// ── 激活事件：清理旧版本缓存 + 接管所有客户端 ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 删除所有非当前版本的缓存
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
      // 立即接管所有已打开的页面（无需刷新）
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
      // 1. 查询缓存（忽略 Vary 头，确保导航请求能匹配到缓存的 HTML）
      //    浏览器导航请求带 Accept: text/html，而缓存时可能是普通 fetch，
      //    Vary 头可能导致 key 不匹配，ignoreVary 绕过此限制
      const cachedResponse = await caches.match(request, { ignoreVary: true })

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

        // 5. 导航请求完全无缓存 → 返回根页面缓存（SPA Fallback）
        //    用户可能在离线时刷新了深层 URL，没有该 URL 的缓存，
        //    此时返回根页面 HTML，SPA 会自动处理路由
        if (request.mode === 'navigate') {
          const rootPage = await caches.match(self.registration.scope, { ignoreVary: true })
          if (rootPage) {
            console.warn('[SW] 离线导航降级：返回根页面缓存')
            return rootPage
          }
        }

        // 完全无缓存 → 放行错误（浏览器显示网络错误页面）
        throw error
      }
    })()
  )
})
