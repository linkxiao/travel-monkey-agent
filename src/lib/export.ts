import { downloadText, pageTitle, repairMobileChecklist, safeFilename } from './html'

type HtmlToImage = {
  toJpeg: (node: HTMLElement, opts: Record<string, unknown>) => Promise<string>
}

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

function openExportFrame(html: string, width: number) {
  const iframe = document.createElement('iframe')
  iframe.title = '导出'
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  iframe.style.cssText = `position:fixed;left:-12000px;top:0;width:${width}px;height:100vh;border:0;opacity:0;pointer-events:none`
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

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
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

async function waitImages(doc: Document) {
  const images = Array.from(doc.images || [])
  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const done = () => resolve()
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
      window.setTimeout(done, 4000)
    })
  }))
}

function loadLib(win: Window, doc: Document): Promise<HtmlToImage> {
  const existing = (win as Window & { htmlToImage?: HtmlToImage }).htmlToImage
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script')
    script.src = `${window.location.origin}/export/html-to-image.js`
    script.onload = () => {
      const lib = (win as Window & { htmlToImage?: HtmlToImage }).htmlToImage
      if (!lib) reject(new Error('导出组件未就绪'))
      else resolve(lib)
    }
    script.onerror = () => reject(new Error('导出组件加载失败'))
    doc.head.appendChild(script)
  })
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
    .carousel-track { transform: none !important; transition: none !important; }
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

export async function exportImage(html: string, device: ExportDevice = 'phone') {
  if (!html.trim()) throw new Error('导出结果是空的，请先生成行程再试')
  const width = device === 'desktop' ? 800 : 390
  const { iframe, doc, win } = await openExportFrame(html, width)
  let restore = () => {}
  try {
    await waitImages(doc)
    restore = lockPreview(iframe, doc, width)
    await nextFrame(win)
    const height = Math.min(Math.max(doc.documentElement.scrollHeight || doc.body.scrollHeight || 800, 800), 14000)
    const lib = await loadLib(win, doc)
    const dataUrl = await withTimeout(
      lib.toJpeg(doc.body, {
        quality: 0.88,
        backgroundColor: '#f4efe6',
        width,
        height,
        pixelRatio: height * 2 > 16000 ? 1 : 2,
        cacheBust: false,
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
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        onImageErrorHandler: () => undefined,
      }),
      45000,
      '导出超时：页面太长或图片未加载完，请等预览出图后再试',
    )
    if (!dataUrl || dataUrl.length < 800) throw new Error('导出结果是空的，请先生成行程再试')
    downloadDataUrl(dataUrl, `${safeFilename(pageTitle(html))}.jpg`)
  } finally {
    restore()
    iframe.remove()
  }
}

export async function publishShare(html: string, token: string) {
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
  return String(data.url)
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
