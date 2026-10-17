import { exportPhotoUrl } from './exportPhoto'
import { downloadText, pageTitle, repairMobileChecklist, safeFilename } from './html'

export type ExportDevice = 'phone' | 'desktop'

// 预览 iframe 故意不带 allow-same-origin，父页面读 contentWindow.document 会抛跨域错误。
// 导出另开一个同源 iframe。如果传入的是已经渲染好完整 DOM 的页面，直接剥离非安全脚本；
// 如果传入的是原始模板 HTML（带 #trip-data 但 #timeline-container 尚未渲染），需要保留渲染脚本使其先在 DOM 中生成卡片和图片。
function stripExportBlockers(parsed: Document) {
  // 导出长图会隐藏地图；Leaflet CDN（unpkg）在国内常卡住，会阻塞后续内联渲染脚本和 iframe load。
  parsed.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
    const href = (el.getAttribute('href') || '').toLowerCase()
    if (href.includes('leaflet') || href.includes('unpkg.com') || href.includes('cdnjs.cloudflare.com')) el.remove()
  })
  parsed.querySelectorAll('script[src]').forEach((el) => {
    const src = (el.getAttribute('src') || '').toLowerCase()
    if (src.includes('leaflet') || src.includes('unpkg.com') || src.includes('cdnjs.cloudflare.com')) el.remove()
  })
}

function captureMarkup(html: string) {
  const fullHtml = repairMobileChecklist(html)
  const parsed = new DOMParser().parseFromString(fullHtml, 'text/html')
  const timeline = parsed.getElementById('timeline-container')
  const hasRenderedTimeline = Boolean(timeline && timeline.children.length > 0)

  if (hasRenderedTimeline) {
    parsed.querySelectorAll('script, iframe').forEach((el) => el.remove())
    parsed.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const urlAttr = attr.name === 'href' || attr.name === 'src' || attr.name === 'action'
        if (/^on/i.test(attr.name) || (urlAttr && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name)
      }
    })
    return `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`
  }

  // 尚未渲染 timeline：保留内联脚本，但去掉会挡住解析的外链 Leaflet/CDN。
  stripExportBlockers(parsed)
  return `<!DOCTYPE html>\n${parsed.documentElement.outerHTML}`
}

export function needsMobileImageSheet() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const android = /Android/i.test(ua)
  const coarse = window.matchMedia?.('(pointer: coarse)').matches
  const narrow = window.matchMedia?.('(max-width: 900px)').matches
  return iOS || android || Boolean(coarse && narrow)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function shareJpegFile(
  file: File,
  extras: { title?: string; text?: string } = {},
): Promise<'shared' | 'aborted' | 'unavailable'> {
  if (typeof navigator.share !== 'function') return 'unavailable'
  const title = extras.title || file.name
  const text = String(extras.text || '').trim()
  const withText: ShareData = { files: [file], title, ...(text ? { text } : {}) }
  const fileOnly: ShareData = { files: [file], title }
  const attempts = text ? [withText, fileOnly] : [fileOnly]
  for (const payload of attempts) {
    if (typeof navigator.canShare === 'function') {
      try {
        if (!navigator.canShare(payload)) continue
      } catch {
        continue
      }
    }
    try {
      await navigator.share(payload)
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    }
  }
  return 'unavailable'
}

function openExportFrame(html: string, width: number) {
  const iframe = document.createElement('iframe')
  iframe.title = '导出'
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  // iOS Safari 不绘制 left:-12000 的 iframe，html-to-image 会得到空白图。
  // 留在视口内、几乎透明，才能算出真实布局。
  iframe.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:100vh;border:0;opacity:0.01;pointer-events:none;z-index:0`
  const markup = captureMarkup(html)
  return new Promise<{ iframe: HTMLIFrameElement, doc: Document, win: Window }>((resolve, reject) => {
    let settled = false
    let poll = 0
    const fail = (message: string) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      window.clearTimeout(poll)
      iframe.removeEventListener('load', finish)
      iframe.remove()
      reject(new Error(message))
    }
    const timer = window.setTimeout(() => fail('预览尚未就绪，请等右侧页面出来后再导出'), 15000)
    const finish = () => {
      if (settled) return
      try {
        const win = iframe.contentWindow
        const doc = iframe.contentDocument
        if (!win || !doc?.body) {
          poll = window.setTimeout(finish, 50)
          return
        }
        // srcdoc 就绪后可能是 about:srcdoc；仅在仍是空白页时继续等
        if (win.location.href === 'about:blank' && !doc.getElementById('timeline-container') && !doc.getElementById('trip-data')) {
          poll = window.setTimeout(finish, 50)
          return
        }

        const timeline = doc.getElementById('timeline-container')
        const tripData = doc.getElementById('trip-data')
        // 有 trip-data 时必须等渲染脚本把卡片写入 timeline；不要等 iframe load（CDN 资源会拖死 load）
        if (tripData && timeline && timeline.children.length === 0) {
          poll = window.setTimeout(finish, 50)
          return
        }

        settled = true
        window.clearTimeout(timer)
        window.clearTimeout(poll)
        iframe.removeEventListener('load', finish)
        resolve({ iframe, doc, win })
      } catch {
        poll = window.setTimeout(finish, 50)
      }
    }
    iframe.addEventListener('load', finish)
    iframe.srcdoc = markup
    document.body.appendChild(iframe)
    // 立即轮询：timeline 往往在 Leaflet 下载完成前就已渲染，不必卡在 load
    poll = window.setTimeout(finish, 0)
  })
}

export function exportH5(html: string) {
  downloadText(`${safeFilename(pageTitle(html))}.html`, repairMobileChecklist(html))
}

function skipCapture(node: HTMLElement) {
  const tag = (node.tagName || '').toLowerCase()
  if (tag === 'script' || tag === 'link' || tag === 'iframe') return false
  const id = node.id || ''
  const cls = typeof node.className === 'string' ? node.className : ''
  if (id === 'map' || cls.includes('leaflet') || cls.includes('hero-petals') || cls.includes('carousel-dots')) return false
  return true
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string) {
  let timer = 0
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(label)), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    window.clearTimeout(timer)
  }
}

const IMAGE_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

function readBlob(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('read'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

function loadDataImage(data: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = data
  })
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  if (!items.length) return
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index])
    }
  })
  await Promise.all(runners)
}

const inlineCache = new Map<string, string>()

/** 在父页面把图片取成 JPEG。不从导出 iframe 里的 img 画布取值，避免跨域污染后整张被换成空白。 */
async function inlineImageUrl(url: string, maxEdge: number) {
  const abs = exportPhotoUrl(url, window.location.href)
  if (!abs) return ''
  if (abs.startsWith('data:')) return abs
  const cacheKey = `${maxEdge}|${abs}`
  const hit = inlineCache.get(cacheKey)
  if (hit) return hit

  let blob: Blob | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(abs, { cache: attempt ? 'reload' : 'force-cache' })
      if (!res.ok) continue
      const buf = await res.arrayBuffer()
      if (buf.byteLength < 32) continue
      blob = new Blob([buf], { type: res.headers.get('content-type') || 'image/jpeg' })
      break
    } catch {
      /* retry */
    }
  }
  if (!blob || !String(blob.type || 'image/').startsWith('image/')) return ''

  const data = await readBlob(blob)
  try {
    const img = await loadDataImage(data)
    const edge = Math.max(img.naturalWidth, img.naturalHeight)
    if (!edge) {
      inlineCache.set(cacheKey, data)
      return data
    }
    const scale = edge > maxEdge ? maxEdge / edge : 1
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      inlineCache.set(cacheKey, data)
      return data
    }
    ctx.drawImage(img, 0, 0, w, h)
    const jpeg = canvas.toDataURL('image/jpeg', 0.74)
    inlineCache.set(cacheKey, jpeg)
    return jpeg
  } catch {
    inlineCache.set(cacheKey, data)
    return data
  }
}

function collectBackgroundUrls(doc: Document) {
  const view = doc.defaultView
  if (!view) return [] as { el: HTMLElement, urls: string[] }[]
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>([
    '.hero',
    '.slot-img-wrap',
    '.hotel-option',
    '.gallery-item',
    '.dining-photos',
    '[style*="background"]',
  ].join(',')))
  return nodes.map((el) => {
    const bg = view.getComputedStyle(el).backgroundImage
    if (!bg || bg === 'none') return { el, urls: [] as string[] }
    const urls = [...bg.matchAll(/url\((['"]?)(.*?)\1\)/g)]
      .map((m) => m[2])
      .filter((u) => u && !u.startsWith('data:'))
    return { el, urls }
  }).filter((item) => item.urls.length)
}

/**
 * 导出前准备实景图：
 * 1. 立刻拆掉 onerror，避免加载慢时被换成 emoji 占位
 * 2. 父页经 /travel-photo 拉取并压成小 JPEG（并发受限，手机更稳）
 * 3. 背景图一并内联
 */
async function prepareExportMedia(doc: Document, maxEdge: number, concurrency: number) {
  inlineCache.clear()

  doc.querySelectorAll('.img-fallback').forEach((el) => {
    el.classList.remove('img-fallback')
    el.removeAttribute('data-emoji')
    el.querySelectorAll('.fallback-text').forEach((node) => node.remove())
  })

  const images = Array.from(doc.images || [])
  for (const img of images) {
    img.removeAttribute('onerror')
    img.onerror = null
    img.loading = 'eager'
    img.removeAttribute('loading')
    img.removeAttribute('srcset')
    img.style.display = ''
    img.style.visibility = 'visible'
    img.style.opacity = '1'
    const raw = img.getAttribute('src') || img.currentSrc || img.src || ''
    if (raw && !raw.startsWith('data:')) {
      img.setAttribute('data-export-src', raw)
      img.removeAttribute('src')
    }
  }

  await mapPool(images, concurrency, async (img) => {
    const raw = img.getAttribute('data-export-src') || ''
    if (!raw) return
    const data = await inlineImageUrl(raw, maxEdge).catch(() => '')
    if (data) {
      img.src = data
      img.style.display = 'block'
    } else {
      const abs = exportPhotoUrl(raw, window.location.href)
      if (abs) img.src = abs
    }
    img.removeAttribute('data-export-src')
  })

  const backgrounds = collectBackgroundUrls(doc)
  await mapPool(backgrounds, Math.min(2, concurrency), async ({ el, urls }) => {
    let bg = el.style.backgroundImage || doc.defaultView?.getComputedStyle(el).backgroundImage || ''
    if (!bg || bg === 'none') return
    let next = bg
    for (const url of urls) {
      const data = await inlineImageUrl(url, Math.max(maxEdge, 900)).catch(() => '')
      if (data) next = next.split(url).join(data)
    }
    if (next !== bg) {
      el.style.backgroundImage = next
      el.style.backgroundSize = el.style.backgroundSize || 'cover'
      el.style.backgroundPosition = el.style.backgroundPosition || 'center'
    }
  })
}

function outputSize(width: number, height: number, mobile: boolean) {
  const maxEdge = mobile ? 4096 : 8192
  const maxArea = mobile ? 6_000_000 : 14_000_000
  let scale = Math.min(1, maxEdge / Math.max(width, 1), maxEdge / Math.max(height, 1))
  if (width * scale * height * scale > maxArea) scale = Math.sqrt(maxArea / Math.max(width * height, 1))
  return {
    canvasWidth: Math.max(1, Math.round(width * scale)),
    canvasHeight: Math.max(1, Math.round(height * scale)),
  }
}

function nextFrame(win: Window) {
  return new Promise<void>((resolve) => {
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => resolve()))
  })
}

function lockPreview(iframe: HTMLIFrameElement, doc: Document, width: number) {
  const prevFrame = iframe.style.cssText
  iframe.style.width = `${width}px`
  iframe.style.maxWidth = `${width}px`
  iframe.style.minWidth = `${width}px`
  iframe.style.flex = '0 0 auto'
  iframe.style.overflow = 'hidden'

  const style = doc.createElement('style')
  style.setAttribute('data-ct-export', '1')
  style.textContent = `
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${width}px !important;
      max-width: ${width}px !important;
      overflow: hidden !important;
      overflow-y: hidden !important;
      scrollbar-width: none !important;
      scrollbar-gutter: auto !important;
      background: #f4efe6 !important;
    }
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    .page-wrap {
      margin: 0 auto !important;
      width: min(760px, 100%) !important;
      max-width: 100% !important;
      transform: none !important;
      left: auto !important;
      right: auto !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
    }
    #map, .map-section, .leaflet-container, .hero-petals, .carousel-dots { display: none !important; }
    .carousel-track { transform: none !important; transition: none !important; height: 200px !important; }
    /* 出图引擎不认 aspect-ratio。绝对定位的图会跟着父级高度变成 0，每日实景就消失。 */
    .hero { min-height: 280px !important; background-size: cover !important; background-position: center !important; }
    .slot-img-wrap,
    .hotel-option .photo-carousel,
    .slot-img-wrap .photo-carousel,
    .gallery-item,
    .hike-route-map {
      position: relative !important;
      display: block !important;
      height: 200px !important;
      min-height: 200px !important;
      aspect-ratio: auto !important;
      inset: auto !important;
      overflow: hidden !important;
    }
    .slot-img-wrap > img,
    .hotel-thumb,
    .carousel-slide,
    .carousel-slide img,
    .dining-photos img,
    .dish-photo,
    .gallery-item img,
    .hike-route-map img,
    figure img {
      position: relative !important;
      inset: auto !important;
      display: block !important;
      width: 100% !important;
      height: 200px !important;
      min-height: 200px !important;
      max-height: none !important;
      object-fit: cover !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
    .dining-photos { display: block !important; overflow: visible !important; }
    .dining-photos img,
    .dish-photo { width: 100% !important; height: 160px !important; min-height: 160px !important; margin: 8px 0 !important; }
    .img-fallback::after { display: none !important; content: none !important; }
    .fallback-text { display: none !important; }
  `
  doc.head.appendChild(style)
  const tracks = Array.from(doc.querySelectorAll<HTMLElement>('.carousel-track'))
  const trackPrev = tracks.map((el) => el.style.transform)
  tracks.forEach((el) => { el.style.transform = 'none' })
  doc.defaultView?.scrollTo(0, 0)

  return () => {
    iframe.style.cssText = prevFrame
    style.remove()
    tracks.forEach((el, i) => { el.style.transform = trackPrev[i] || '' })
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size < 800) reject(new Error('导出结果是空的，请先生成行程再试'))
      else resolve(blob)
    }, 'image/jpeg', quality)
  })
}

export async function exportImage(html: string, device: ExportDevice = 'phone') {
  if (!html.trim()) throw new Error('导出结果是空的，请先生成行程再试')
  const mobile = needsMobileImageSheet()
  const width = device === 'desktop' ? 800 : 390
  const { iframe, doc, win } = await openExportFrame(html, width)
  let restore = () => {}
  try {
    // 先锁布局并拆掉失败占位，再拉实景；避免 onerror 抢先把图藏掉
    restore = lockPreview(iframe, doc, width)
    await prepareExportMedia(doc, mobile ? 640 : 1100, mobile ? 3 : 5)
    await nextFrame(win)
    let height = Math.min(Math.max(doc.documentElement.scrollHeight || doc.body.scrollHeight || 800, 800), 14000)
    // 手机画布高度大约到 4096 就会失败。先缩小整页再截，比截完再压更稳。
    if (mobile && height > 3600) {
      const zoom = 3600 / height
      doc.documentElement.style.setProperty('zoom', String(zoom))
      await nextFrame(win)
      height = Math.min(Math.max(doc.documentElement.scrollHeight || doc.body.scrollHeight || 800, 800), 4096)
    }
    const fitted = outputSize(width, height, mobile)
    const lib = await import('html-to-image')
    const canvas = await withTimeout(
      lib.toCanvas(doc.body, {
        backgroundColor: '#f4efe6',
        width,
        height,
        canvasWidth: fitted.canvasWidth,
        canvasHeight: fitted.canvasHeight,
        pixelRatio: 1,
        cacheBust: false,
        // 每日图的差别只在 ?u= 上。默认缓存会丢掉查询参数，整页行程图变成同一张或空白。
        includeQueryParams: true,
        skipFonts: true,
        filter: skipCapture,
        style: {
          margin: '0',
          padding: '0',
          transform: 'none',
          width: `${width}px`,
          maxWidth: `${width}px`,
          boxSizing: 'border-box',
        },
        imagePlaceholder: IMAGE_PLACEHOLDER,
        onImageErrorHandler: () => undefined,
      }),
      mobile ? 45000 : 60000,
      '导出超时：页面太长或图片未加载完，请等预览出图后再试',
    )
    const blob = await canvasToJpeg(canvas, mobile ? 0.82 : 0.88)
    return {
      blob,
      filename: `${safeFilename(pageTitle(html))}.jpg`,
    }
  } finally {
    restore()
    iframe.remove()
    inlineCache.clear()
  }
}

export type ShareCard = {
  url: string
  title: string
  description: string
  image: string
}

async function fetchShareImage(src: string, title: string) {
  try {
    const res = await fetch(src)
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/') || blob.size < 800) return null
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
    const name = (title || '行程').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 40) || '行程'
    return new File([blob], `${name}.${ext}`, { type: blob.type })
  } catch {
    return null
  }
}

/** 发给好友：能带图就带第一张，文字里留摘要和链接。平台不收图时退回带摘要的链接。 */
export async function shareTripLink(card: ShareCard): Promise<'shared' | 'aborted' | 'unavailable'> {
  if (typeof navigator.share !== 'function') return 'unavailable'
  const title = card.title || '行程'
  const description = card.description && card.description !== title ? card.description : ''
  const file = card.image ? await fetchShareImage(card.image, title) : null
  if (file) {
    const payload: ShareData = {
      files: [file],
      title,
      text: [description || title, card.url].filter(Boolean).join('\n'),
    }
    try {
      if (typeof navigator.canShare !== 'function' || navigator.canShare(payload)) {
        await navigator.share(payload)
        return 'shared'
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    }
  }
  try {
    await navigator.share({ title, text: description, url: card.url })
    return 'shared'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    return 'unavailable'
  }
}

export async function publishShare(html: string, token: string): Promise<ShareCard> {
  const res = await fetch('/api/share', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
    },
    body: JSON.stringify({ html: repairMobileChecklist(html) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) throw new Error(data.error || '链接生成失败')
  return {
    url: String(data.url),
    title: String(data.title || ''),
    description: String(data.description || ''),
    image: String(data.image || ''),
  }
}

export function shareReach(url: string) {
  try {
    const host = new URL(url).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'local'
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host) || host.endsWith('.local')) return 'lan'
    return 'public'
  } catch {
    return 'local'
  }
}
