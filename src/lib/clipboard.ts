/** 复制到剪贴板。http 公网下 Clipboard API 不可用，需 execCommand 回退。 */
export async function copyText(text: string, input?: HTMLInputElement | null): Promise<boolean> {
  const value = String(text || '')
  if (!value) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      /* fall through */
    }
  }

  try {
    // 输入框里可能只有网址，摘要更长时不能拿它的选区当复制结果
    if (input && input.value === value) {
      input.focus()
      input.select()
      input.setSelectionRange(0, value.length)
      if (document.execCommand('copy')) return true
    }
  } catch {
    /* fall through */
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = value
    ta.setAttribute('readonly', '')
    ta.setAttribute('aria-hidden', 'true')
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, value.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
