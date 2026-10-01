import { downloadText, pageTitle, safeFilename } from './html'

type HtmlToImage = {
  toJpeg: (node: HTMLElement, opts: Record<string, unknown>) => Promise<string>
}

export type ExportDevice = 'phone' | 'desktop'

function iframeDoc(iframe: HTMLIFrameElement | null) {
  return iframe?.contentDocument || iframe?.contentWindow?.document || null
}

export function exportH5(html: string) {
  downloadText(`${safeFilename(pageTitle(html))}.html`, html)
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

export async function exportImage(iframe: HTMLIFrameElement | null, html: string, device: ExportDevice = 'phone') {
  const doc = iframeDoc(iframe)
  const win = iframe?.contentWindow
  if (!iframe || !doc?.body || !win) throw new Error('预览尚未就绪，请等右侧页面出来后再导出')

  await waitImages(doc)
  const width = device === 'desktop' ? 800 : 390
  const restore = lockPreview(iframe, doc, width)
  try {
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
  }
}

export async function sharePage(html: string) {
  const title = pageTitle(html)
  const file = new File([html], `${safeFilename(title)}.html`, { type: 'text/html' })
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title, text: title, files: [file] })
    return 'shared'
  }
  if (navigator.share) {
    await navigator.share({ title, text: `${title}\n已在本机生成行程 H5，可发给同伴。` })
    return 'shared-text'
  }
  await navigator.clipboard.writeText(html)
  return 'copied'
}

export async function copyHtml(html: string) {
  await navigator.clipboard.writeText(html)
}
