/**
 * Service Worker 注册模块
 * 仅在生产环境注册，避免开发时 HMR 受缓存干扰
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => console.log('[SW] 已注册, scope:', reg.scope))
    .catch((err) => console.error('[SW] 注册失败:', err))
}
