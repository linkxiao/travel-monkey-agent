export type H5Card = {
  title?: string
  url: string
}

/**
 * 系统分享只带这条 H5 链接。
 * 塞进长文案或图片文件时，微信会按文字或图片发出去，不会生成带封面的卡片。
 * Android 的分享面板会丢掉 url 字段，所以把链接放进 text。
 */
export function h5ShareData(card: H5Card, ua = ''): ShareData {
  const title = String(card.title || '').trim() || '行程'
  const url = String(card.url || '').trim()
  if (/Android/i.test(ua)) return { title, text: url }
  return { title, url }
}

export async function shareH5Card(card: H5Card): Promise<'shared' | 'aborted' | 'unavailable'> {
  const url = String(card.url || '').trim()
  if (!url || typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unavailable'
  try {
    await navigator.share(h5ShareData(card, navigator.userAgent))
    return 'shared'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    return 'unavailable'
  }
}
