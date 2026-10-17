/** 画一张接近微信链接卡片的图：标题 + 摘要 + 封面。IP 链接不再被微信抓取时，用这张图发给好友。 */

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
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('cover'))
        el.src = url
      })
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

export type WechatCardInput = {
  title?: string
  description?: string
  image?: string
  url?: string
}

/** 输出约 24–40KB 的 JPEG，可直接用系统分享发到微信。 */
export async function buildWechatShareCard(card: WechatCardInput): Promise<File> {
  const title = String(card.title || '').trim() || '行程'
  const description = String(card.description || '').trim() || '打开查看每天的路线、三餐和住宿。'
  const cover = await loadCover(String(card.image || '').trim())

  const width = 600
  const height = 240
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法绘制分享卡片')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#e6e8ef'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)

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
  const boxY = Math.round((height - thumb) / 2)
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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((out) => (out ? resolve(out) : reject(new Error('卡片导出失败'))), 'image/jpeg', 0.82)
  })
  const name = title.replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 36) || '行程'
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
}
