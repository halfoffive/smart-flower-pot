/**
 * 自定义提示框模块（函数式编程风格）
 *
 * 替代浏览器默认 alert，统一使用 Tailwind CSS 暗色主题样式
 * - showAlert(msg, title)  → 模态对话框，需手动关闭
 * - showToast(msg, type)   → 底部轻量通知，自动消失
 */

// ═══════════════════════════════════════════
//  showAlert — 模态对话框（替代 alert）
// ═══════════════════════════════════════════

/**
 * 弹出自定义模态提示对话框，替代浏览器默认 alert
 * 支持：点击遮罩关闭 / 按 Escape 关闭 / 确定按钮关闭
 *
 * @param {string} msg   — 消息内容，支持 \n 换行
 * @param {string} [title='提示'] — 对话框标题
 */
export function showAlert(msg, title = '提示') {
  // 保存原始状态，防止背景页面滚动
  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  // ── 遮罩层（半透明背景 + 毛玻璃效果） ──
  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4'
  overlay.style.opacity = '0'
  overlay.style.transition = 'opacity 200ms ease'

  // ── 对话框卡片 ──
  const dialog = document.createElement('div')
  dialog.className = 'bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl'
  dialog.style.transform = 'scale(0.95)'
  dialog.style.transition = 'transform 200ms ease'

  // 标题行（图标 + 标题文字）
  const header = document.createElement('div')
  header.className = 'flex items-center gap-2 mb-3'
  header.innerHTML = '<span class="text-xl">⚠️</span><h3 class="text-lg font-bold text-white"></h3>'
  header.querySelector('h3').textContent = title
  dialog.appendChild(header)

  // 消息正文（textContent 防 XSS，CSS whitespace-pre-wrap 渲染 \n 换行）
  const msgEl = document.createElement('p')
  msgEl.className = 'text-sm text-gray-300 whitespace-pre-wrap leading-relaxed'
  msgEl.textContent = msg
  dialog.appendChild(msgEl)

  // 确认按钮
  const btn = document.createElement('button')
  btn.className = 'mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm transition-colors'
  btn.textContent = '确定'
  dialog.appendChild(btn)

  overlay.appendChild(dialog)
  document.body.appendChild(overlay)

  // ── 关闭逻辑（带动画出场） ──
  const close = () => {
    overlay.style.opacity = '0'
    dialog.style.transform = 'scale(0.95)'
    // 恢复背景滚动
    document.body.style.overflow = prevOverflow
    setTimeout(() => overlay.remove(), 200)
  }

  // ── 事件绑定 ──
  btn.addEventListener('click', close)

  // 点击遮罩层（非卡片区域）关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  // 按 Escape 键关闭
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', onEsc)
    }
  })

  // ── 入场动画（下一帧触发 CSS 过渡） ──
  requestAnimationFrame(() => {
    overlay.style.opacity = '1'
    dialog.style.transform = 'scale(1)'
  })
}

// ═══════════════════════════════════════════
//  showToast — 底部轻量通知（自动消失）
// ═══════════════════════════════════════════

/**
 * 底部 Toast 轻量通知，2 秒后自动消失
 *
 * @param {string} msg  — 消息文本（调用方可自行加入 emoji 前缀）
 * @param {'success'|'error'|'info'} [type='success'] — 通知类型，决定底色
 */
export function showToast(msg, type = 'success') {
  // 颜色映射
  const colorMap = {
    success: 'bg-emerald-600',
    error:   'bg-red-600',
    info:    'bg-blue-600',
  }

  const toast = document.createElement('div')
  toast.className = [
    'fixed bottom-6 left-1/2 z-40 px-5 py-3 rounded-xl shadow-lg',
    'text-sm font-medium text-white pointer-events-none',
    'transition-all duration-300',
    colorMap[type] || colorMap.success,
  ].join(' ')

  // 初始位置（略微下移，用于入场动画）
  toast.style.transform = 'translateX(-50%) translateY(0.5rem)'
  toast.style.opacity = '0'
  toast.textContent = msg

  document.body.appendChild(toast)

  // 入场动画（上滑 + 淡入）
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)'
    toast.style.opacity = '1'
  })

  // 2 秒后出场动画（下移 + 淡出）
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(0.5rem)'
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}
