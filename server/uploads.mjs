import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.resolve(__dirname, '..', 'travel-assets', 'uploads')

const MAX_BYTES = 8 * 1024 * 1024
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('文件太大了（单张上限 8MB），压缩一下再试。'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// 存成 travel-assets 下的本地文件：模具按本地图渲染，配图管线也不会再把它冲掉
export async function handleUpload(req, res) {
  const send = (code, obj) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
  }
  try {
    // base64 比原始字节大约 4/3，留足余量
    const raw = await readBody(req, Math.ceil(MAX_BYTES * 1.4))
    const body = JSON.parse(raw || '{}')
    const dataUrl = String(body.data || '')
    const head = dataUrl.match(/^data:([^;,]+);base64,/)
    if (!head) return send(400, { error: '只认 data:URL 形式的图片内容。' })
    const mime = head[1].toLowerCase()
    const ext = EXT_BY_MIME[mime]
    if (!ext) return send(400, { error: `不支持这种图片格式（${mime}）。请用 jpg / png / webp / gif。` })
    const buf = Buffer.from(dataUrl.slice(head[0].length), 'base64')
    if (!buf.length) return send(400, { error: '图片内容是空的。' })
    if (buf.length > MAX_BYTES) return send(400, { error: '文件太大了（单张上限 8MB），压缩一下再试。' })

    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
    // 按内容做名字：同一张图重复粘贴不会堆文件
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)
    const file = path.join(UPLOAD_DIR, `${hash}${ext}`)
    if (!file.startsWith(UPLOAD_DIR)) return send(400, { error: '文件名不合法。' })
    if (!fs.existsSync(file)) fs.writeFileSync(file, buf)

    send(200, {
      url: `/travel-assets/uploads/${hash}${ext}`,
      name: path.basename(String(body.name || '粘贴的图')).replace(/[\\/]/g, '').slice(0, 80) || '粘贴的图',
      bytes: buf.length,
    })
  } catch (err) {
    send(400, { error: err?.message || String(err) })
  }
}
