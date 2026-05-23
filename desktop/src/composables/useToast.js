/**
 * 提示框组合式函数
 *
 * 替代浏览器默认 alert，统一使用 CSS 变量配色
 * - showAlert(msg, title)  → 模态对话框
 * - showToast(msg, type)   → 底部轻量通知
 */

/**
 * 提示框组合式函数
 * @returns {{ showAlert: function, showToast: function }}
 */
export function useToast() {

  /** 弹出自定义模态提示对话框 */
  function showAlert(msg, title = '提示') {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const overlay = document.createElement('div')
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center px-4'
    overlay.style.backgroundColor = 'rgb(0 0 0 / 0.7)'
    overlay.style.backdropFilter = 'blur(4px)'
    overlay.style.opacity = '0'
    overlay.style.transition = 'opacity 200ms ease'

    const dialog = document.createElement('div')
    dialog.className = 'rounded-2xl p-6 w-full max-w-sm'
    dialog.style.backgroundColor = `rgb(var(--sfp-bg-card))`
    dialog.style.border = `1px solid rgb(var(--sfp-border) / 0.5)`
    dialog.style.boxShadow = `0 0 40px rgb(var(--sfp-shadow) / 0.5)`
    dialog.style.transform = 'scale(0.95) translateY(8px)'
    dialog.style.transition = 'transform 250ms ease'

    const header = document.createElement('div')
    header.className = 'flex items-center gap-2 mb-4'
    header.innerHTML = '<span class="text-xl">⚠️</span><h3 class="text-base font-bold"></h3>'
    header.querySelector('h3').textContent = title
    header.querySelector('h3').style.color = `rgb(var(--sfp-text-primary))`
    dialog.appendChild(header)

    const msgEl = document.createElement('p')
    msgEl.className = 'text-sm whitespace-pre-wrap leading-relaxed'
    msgEl.style.color = `rgb(var(--sfp-text-secondary))`
    msgEl.textContent = msg
    dialog.appendChild(msgEl)

    const btn = document.createElement('button')
    btn.className = 'mt-5 w-full py-2.5 rounded-xl font-medium text-sm transition-all duration-200 active:scale-[0.98] shadow-lg'
    btn.style.background = `linear-gradient(to right, rgb(var(--sfp-accent)), rgb(var(--sfp-accent-dark)))`
    btn.style.color = `rgb(var(--sfp-text-on-accent))`
    btn.style.boxShadow = `0 4px 15px rgb(var(--sfp-shadow-accent) / 0.2)`
    btn.textContent = '确定'
    dialog.appendChild(btn)

    overlay.appendChild(dialog)
    document.body.appendChild(overlay)

    const close = () => {
      overlay.style.opacity = '0'
      dialog.style.transform = 'scale(0.95) translateY(8px)'
      document.body.style.overflow = prevOverflow
      setTimeout(() => overlay.remove(), 250)
    }

    btn.addEventListener('click', close)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close()
    })
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') {
        close()
        document.removeEventListener('keydown', onEsc)
      }
    })

    requestAnimationFrame(() => {
      overlay.style.opacity = '1'
      dialog.style.transform = 'scale(1) translateY(0)'
    })
  }

  /** 底部 Toast 轻量通知 */
  function showToast(msg, type = 'success') {
    const colorConfig = {
      success: {
        gradient: `linear-gradient(to right, rgb(var(--sfp-accent)), rgb(var(--sfp-accent-dark)))`,
        shadow: 'rgb(var(--sfp-shadow-accent) / 0.3)',
      },
      error: {
        gradient: `linear-gradient(to right, rgb(var(--sfp-danger)), rgb(var(--sfp-danger-light)))`,
        shadow: 'rgb(var(--sfp-shadow-danger) / 0.3)',
      },
      info: {
        gradient: `linear-gradient(to right, rgb(var(--sfp-info)), rgb(96 165 250))`,
        shadow: 'rgb(59 130 246 / 0.3)',
      },
    }

    const cfg = colorConfig[type] || colorConfig.success

    const toast = document.createElement('div')
    toast.className = 'fixed bottom-6 left-1/2 z-40 px-5 py-3 rounded-xl shadow-lg text-sm font-medium pointer-events-none'
    toast.style.background = cfg.gradient
    toast.style.color = `rgb(var(--sfp-text-on-accent))`
    toast.style.boxShadow = `0 4px 15px ${cfg.shadow}`
    toast.style.transform = 'translateX(-50%) translateY(0.5rem)'
    toast.style.opacity = '0'
    toast.style.transition = 'all 300ms ease'
    toast.textContent = msg

    document.body.appendChild(toast)

    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)'
      toast.style.opacity = '1'
    })

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0.5rem)'
      toast.style.opacity = '0'
      setTimeout(() => toast.remove(), 300)
    }, 2000)
  }

  return { showAlert, showToast }
}
