import { encode } from 'uqr'

/** 画一张分享卡：标题 + 摘要 + 封面 + 扫码打开完整行程。 */

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const chars = Array.from(String(text || '').trim())
  if (!chars.length) return [] as string[]
  const lines: string[] = []
  let line = ''
  for (const ch of chars) {
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = ch
      if (lines.length >= maxLines) break
    } else {
      line = next
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length > maxLines) lines.length = maxLines
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]
    if (ctx.measureText(last).width > maxWidth - 8 || chars.length > last.length) {
      let clipped = last
      while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1)
      }
      lines[maxLines - 1] = `${clipped}…`
    }
  }
  return lines
}

async function loadCover(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null
  try {
    const res = await fetch(src, { cache: 'reload' })
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/') || blob.size < 200) return null
    const url = URL.createObjectURL(blob)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('cover'))
        el.src = url
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

function drawQr(ctx: CanvasRenderingContext2D, link: string, x: number, y: number, box: number) {
  const matrix = encode(link, { ecc: 'M' })
  const n = matrix.size
  const cell = box / n
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, box, box)
  ctx.fillStyle = '#0e1530'
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (matrix.data[row][col]) {
        ctx.fillRect(x + col * cell, y + row * cell, Math.ceil(cell), Math.ceil(cell))
      }
    }
  }
}

export type WechatCardInput = {
  title?: string
  description?: string
  image?: string
  url?: string
}

/** 附在分享文字里的完整行程链接说明。 */
export function wechatShareCaption(card: WechatCardInput) {
  const title = String(card.title || '').trim() || '行程'
  const url = String(card.url || '').trim()
  return url ? `${title}\n打开完整行程：\n${url}` : title
}

/** 输出 JPEG：上半是标题封面，下半是二维码，扫码即可打开完整 H5。 */
export async function buildWechatShareCard(card: WechatCardInput): Promise<File> {
  const title = String(card.title || '').trim() || '行程'
  const description = String(card.description || '').trim() || '打开查看每天的路线、三餐和住宿。'
  const link = String(card.url || '').trim()
  const cover = await loadCover(String(card.image || '').trim())

  const width = 600
  const height = link ? 420 : 240
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法绘制分享卡片')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const thumb = 132
  const pad = 28
  const textRight = width - pad - thumb - 20

  ctx.fillStyle = '#0e1530'
  ctx.font = '600 28px "Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
  const titleLines = wrapLines(ctx, title, textRight - pad, 2)
  let y = 52
  for (const line of titleLines) {
    ctx.fillText(line, pad, y)
    y += 36
  }

  ctx.fillStyle = '#5d6578'
  ctx.font = '400 20px "Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
  y += 8
  for (const line of wrapLines(ctx, description, textRight - pad, 3)) {
    ctx.fillText(line, pad, y)
    y += 28
  }

  const boxX = width - pad - thumb
  const boxY = 36
  ctx.fillStyle = '#eef1f6'
  ctx.fillRect(boxX, boxY, thumb, thumb)
  if (cover) {
    const scale = Math.max(thumb / cover.width, thumb / cover.height)
    const sw = thumb / scale
    const sh = thumb / scale
    const sx = (cover.width - sw) / 2
    const sy = (cover.height - sh) / 2
    ctx.drawImage(cover, sx, sy, sw, sh, boxX, boxY, thumb, thumb)
  } else {
    ctx.fillStyle = '#9aa3b5'
    ctx.font = '400 16px sans-serif'
    ctx.fillText('封面', boxX + 46, boxY + 72)
  }

  if (link) {
    ctx.strokeStyle = '#e6e8ef'
    ctx.beginPath()
    ctx.moveTo(pad, 200)
    ctx.lineTo(width - pad, 200)
    ctx.stroke()

    const qr = 150
    const qrX = pad
    const qrY = 224
    drawQr(ctx, link, qrX, qrY, qr)

    ctx.fillStyle = '#0e1530'
    ctx.font = '600 22px "Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
    ctx.fillText('扫码打开完整行程', qrX + qr + 20, qrY + 48)
    ctx.fillStyle = '#5d6578'
    ctx.font = '400 16px "Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'
    for (const line of wrapLines(ctx, '每日路线、景点、住宿和餐饮都在网页里', width - pad - (qrX + qr + 20), 2)) {
      ctx.fillText(line, qrX + qr + 20, qrY + 84)
      y = qrY + 84
    }
    ctx.fillStyle = '#8b93a7'
    ctx.font = '400 13px "DM Mono",Menlo,monospace'
    for (const line of wrapLines(ctx, link, width - pad - (qrX + qr + 20), 2)) {
      y += 22
      ctx.fillText(line, qrX + qr + 20, y)
    }
  }

  ctx.strokeStyle = '#e6e8ef'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('卡片导出失败'))), 'image/jpeg', 0.84)
  })
  const name = title.replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 28) || '行程'
  return new File([blob], `${name}-完整行程入口.jpg`, { type: 'image/jpeg' })
}
