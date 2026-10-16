import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleChat } from './chat-proxy.mjs'
import { handleRender, handleValidate, listSeedTrips, loadSeedTrip } from './viz.mjs'
import { skillStatus } from './skill-prompt.mjs'
import { handlePhotoProxy } from './photos.mjs'
import { handleResearch } from './research.mjs'
import { handleUpload } from './uploads.mjs'
import { handleAuth, sessionUser } from './users.mjs'
import { handleConfig } from './config.mjs'
import { handleShareCard, handleShareGet, handleSharePublish, matchShare, matchShareCard } from './share.mjs'
import { applySecurityHeaders, healthPayload, rateLimit } from './guard.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
const assetsRoot = path.resolve(__dirname, '..', 'travel-assets')
const seedHtml = path.resolve(__dirname, '..', 'seed', 'shudao-zhongqiu.html')
const htmlToImage = path.resolve(__dirname, '..', 'node_modules', 'html-to-image', 'dist', 'html-to-image.js')
const PORT = Number(process.env.PORT || 5177)
// 生产默认只绑本机，前面必须有 Nginx；开发可设 HOST=0.0.0.0
const HOST = String(process.env.HOST || '127.0.0.1').trim() || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

function sendFile(res, filePath) {
  applySecurityHeaders(res)
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res)
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  if (req.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/api/healthz')) {
    const distExists = fs.existsSync(path.join(dist, 'index.html'))
    let sqliteOk = false
    try {
      // 轻探：无 token 时 sessionUser 只表示「库能开」
      sessionUser('')
      sqliteOk = true
    } catch {
      sqliteOk = false
    }
    const body = healthPayload({ distExists, sqliteOk })
    res.writeHead(body.ok ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    return handleChat(req, res)
  }
  if (req.method === 'POST' && url.pathname === '/api/render') {
    return handleRender(req, res)
  }
  if (req.method === 'POST' && url.pathname === '/api/validate') {
    return handleValidate(req, res)
  }
  if (req.method === 'POST' && url.pathname === '/api/research') {
    return handleResearch(req, res)
  }
  if (req.method === 'POST' && url.pathname === '/api/upload') {
    return handleUpload(req, res)
  }
  if (url.pathname === '/api/config') {
    return handleConfig(req, res)
  }
  if (url.pathname.startsWith('/api/auth')) {
    return handleAuth(req, res)
  }
  if (req.method === 'POST' && url.pathname === '/api/share') {
    return handleSharePublish(req, res)
  }
  if (req.method === 'GET' && matchShareCard(url.pathname)) {
    return handleShareCard(req, res)
  }
  if (req.method === 'GET' && matchShare(url.pathname)) {
    return handleShareGet(req, res)
  }
  if (url.pathname === '/travel-photo') {
    if (!rateLimit(req, res, { key: 'photo', max: 120 })) return
    return handlePhotoProxy(req, res)
  }
  if (url.pathname === '/export/html-to-image.js' && fs.existsSync(htmlToImage)) {
    return sendFile(res, htmlToImage)
  }
  if (url.pathname === '/api/skill') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(skillStatus()))
    return
  }
  if (url.pathname === '/seed/list.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(listSeedTrips()))
    return
  }
  if (url.pathname === '/seed/trip.json') {
    const seed = loadSeedTrip(url.searchParams.get('id') || '')
    res.writeHead(seed ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(seed || { error: '没有示例行程' }))
    return
  }
  if (url.pathname === '/seed/trip.html' && fs.existsSync(seedHtml)) {
    return sendFile(res, seedHtml)
  }
  if (url.pathname.startsWith('/travel-assets/')) {
    const rel = path.normalize(url.pathname.replace('/travel-assets/', '')).replace(/^(\.\.(\/|\\|$))+/, '')
    const file = path.resolve(assetsRoot, rel)
    if ((file === assetsRoot || file.startsWith(assetsRoot + path.sep)) && fs.existsSync(file)) {
      return sendFile(res, file)
    }
  }
  const rel = url.pathname === '/' ? '/index.html' : url.pathname
  const file = path.resolve(dist, '.' + path.normalize('/' + rel.replace(/^\//, '')))
  if ((file === dist || file.startsWith(dist + path.sep)) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(res, file)
  }
  const fallback = path.join(dist, 'index.html')
  if (fs.existsSync(fallback)) return sendFile(res, fallback)
  res.writeHead(404)
  res.end('Not found. Run npm run build first.')
})

function shutdown(signal) {
  console.log(`[prod] ${signal}，停止接新连接…`)
  server.close(() => {
    console.log('[prod] 已退出')
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 15000).unref()
}

server.listen(PORT, HOST, () => {
  console.log(`Travel Monkey  http://${HOST}:${PORT}`)
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.log('[prod] 警告：进程直接对公网监听；生产请用 Nginx 反代，并把 HOST=127.0.0.1')
  }
})

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
