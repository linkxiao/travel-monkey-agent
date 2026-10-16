/** 每日配图都是 /travel-photo?u=不同地址。必须保留查询参数，否则会被当成同一张图。 */
export function exportPhotoUrl(raw: string, pageHref: string) {
  const value = String(raw || '').trim()
  if (!value || value.startsWith('data:')) return value
  const path = value.replace(/^about:srcdoc/i, '')
  try {
    const parsed = new URL(path, pageHref)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href
  } catch {
    return ''
  }
  return ''
}
