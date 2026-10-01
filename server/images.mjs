import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ASSET_ROOT = path.resolve(__dirname, '..', 'travel-assets')

// 模型那端的单图上限普遍比本机上传限制小，太大的直接拦下来说清楚，别等上游报一句看不懂的话
const MAX_BYTES = 5 * 1024 * 1024
export const MAX_IMAGES = 4

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
}

// 本机图存在磁盘上，上游模型取不到 127.0.0.1，必须读出来内联成 base64。
// 只认 travel-assets 下的文件：别人塞 ../../etc/passwd 进来要挡住。
function loadLocal(url) {
  const clean = decodeURIComponent(String(url).split('?')[0].split('#')[0])
  const rel = clean.replace(/^\/travel-assets\//, '')
  const file = path.resolve(ASSET_ROOT, rel)
  if (file !== ASSET_ROOT && !file.startsWith(ASSET_ROOT + path.sep)) {
    throw new Error('图片路径不合法。')
  }
  if (!fs.existsSync(file)) throw new Error(`本机找不到这张图（${clean}）。`)
  const mime = MIME_BY_EXT[path.extname(file).toLowerCase()]
  if (!mime) throw new Error(`这种图片格式发不给模型（${path.extname(file) || '无后缀'}）。`)
  const buf = fs.readFileSync(file)
  if (!buf.length) throw new Error('图片内容是空的。')
  if (buf.length > MAX_BYTES) {
    throw new Error(`这张图 ${(buf.length / 1024 / 1024).toFixed(1)}MB，超过发给模型的 5MB 上限，压缩一下再试。`)
  }
  return { mime, base64: buf.toString('base64'), bytes: buf.length }
}

// 返回 {mime, base64, bytes}；外链原样留给上游自己取
export function loadImageForModel(url) {
  const s = String(url || '').trim()
  if (!s) throw new Error('图片地址是空的。')
  if (/^data:image\//i.test(s)) {
    const head = s.match(/^data:([^;,]+);base64,/)
    if (!head) throw new Error('只认 base64 形式的 data:URL 图片。')
    const base64 = s.slice(head[0].length)
    return { mime: head[1].toLowerCase(), base64, bytes: Math.floor(base64.length * 0.75) }
  }
  if (/^https?:\/\//i.test(s)) return { remote: s }
  if (s.startsWith('/travel-assets/')) return loadLocal(s)
  throw new Error(`这个图片地址发不给模型（${s.slice(0, 60)}）。`)
}

export function imagePartsOpenAI(images) {
  return images.map((img) => ({
    type: 'image_url',
    image_url: { url: img.remote || `data:${img.mime};base64,${img.base64}` },
  }))
}

export function imagePartsAnthropic(images) {
  return images.map((img) => (img.remote
    ? { type: 'image', source: { type: 'url', url: img.remote } }
    : { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.base64 } }))
}

// 图片挂到最后一条用户消息上：那条才是「这张图是什么」这句话本身
export function attachImages(messages, images, provider) {
  if (!images?.length) return messages
  const out = [...messages]
  let at = -1
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (out[i].role === 'user') { at = i; break }
  }
  if (at < 0) return messages
  const parts = provider === 'anthropic' ? imagePartsAnthropic(images) : imagePartsOpenAI(images)
  const text = typeof out[at].content === 'string' ? out[at].content : ''
  out[at] = {
    role: 'user',
    content: [...parts, { type: 'text', text: text || '看看这几张图。' }],
  }
  return out
}
