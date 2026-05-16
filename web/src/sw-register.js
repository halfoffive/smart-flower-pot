/**
 * Service Worker 注册模块
 * 仅在生产环境注册，避免开发时 HMR 受缓存干扰
 *
 * 使用 import.meta.env.BASE_URL 拼接 SW 路径：
 * - Cloudflare Pages（域名根目录）：/sw.js
 * - GitHub Pages（子目录）：        /smart-flower-pot/sw.js
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const swUrl = import.meta.env.BASE_URL + 'sw.js'
  navigator.serviceWorker
    .register(swUrl)
    .then((reg) => console.log('[SW] 已注册, scope:', reg.scope))
    .catch((err) => console.error('[SW] 注册失败:', err))
}
