/** 每日配图都是 /travel-photo?u=不同地址。必须保留查询参数，否则会被当成同一张图。 */

/** 把导出 iframe 里的图片地址变成父页面可 fetch 的同源 URL。 */
export function exportPhotoUrl(raw: string, pageHref: string) {
  const value = String(raw || '').trim()
  if (!value || value.startsWith('data:')) return value
  // srcdoc 里偶发拼出 about:srcdoc/travel-photo?...
  let path = value.replace(/^about:srcdoc/i, '')
  if (path.startsWith('about:blank')) path = path.slice('about:blank'.length)
  try {
    const base = pageHref || (typeof location !== 'undefined' ? location.href : 'http://127.0.0.1/')
    const parsed = new URL(path, base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    // 已是本站代理或静态资源，直接用
    if (parsed.pathname === '/travel-photo' || parsed.pathname.startsWith('/travel-assets/')) {
      return parsed.href
    }
    // 外链没有 CORS，父页 fetch / html-to-image 都会失败 → 强制走图片代理
    try {
      const origin = new URL(base).origin
      if (parsed.origin !== origin) {
        return `${origin}/travel-photo?u=${encodeURIComponent(parsed.href)}`
      }
    } catch {
      /* keep absolute */
    }
    return parsed.href
  } catch {
    return ''
  }
}
