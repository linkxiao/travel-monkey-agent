import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleChat } from './chat-proxy.mjs'
import { handleRender, handleValidate, loadSeedTrip } from './viz.mjs'
import { skillStatus } from './skill-prompt.mjs'
import { handlePhotoProxy } from './photos.mjs'
import { handleResearch } from './research.mjs'
import { handleUpload } from './uploads.mjs'
import { handleAccount } from './accounts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
const assetsRoot = path.resolve(__dirname, '..', 'travel-assets')
const seedHtml = path.resolve(__dirname, '..', 'seed', 'shudao-zhongqiu.html')
const htmlToImage = path.resolve(__dirname, '..', 'node_modules', 'html-to-image', 'dist', 'html-to-image.js')
const PORT = Number(process.env.PORT || 5177)

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
  const ext = path.extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
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
  if (url.pathname === '/api/account') {
    return handleAccount(req, res)
  }
  if (url.pathname === '/travel-photo') {
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
  if (url.pathname === '/seed/trip.json') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(loadSeedTrip()))
    return
  }
  if (url.pathname === '/seed/trip.html' && fs.existsSync(seedHtml)) {
    return sendFile(res, seedHtml)
  }
  if (url.pathname.startsWith('/travel-assets/')) {
    const file = path.join(assetsRoot, url.pathname.replace('/travel-assets/', ''))
    if (file.startsWith(assetsRoot) && fs.existsSync(file)) return sendFile(res, file)
  }
  const rel = url.pathname === '/' ? '/index.html' : url.pathname
  const file = path.join(dist, rel)
  if (file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(res, file)
  }
  const fallback = path.join(dist, 'index.html')
  if (fs.existsSync(fallback)) return sendFile(res, fallback)
  res.writeHead(404)
  res.end('Not found. Run npm run build first.')
})

server.listen(PORT, () => {
  console.log(`Travel Monkey  http://127.0.0.1:${PORT}`)
})
