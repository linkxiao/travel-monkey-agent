import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleChat } from './server/chat-proxy.mjs'
import { handleRender, handleValidate, loadSeedTrip } from './server/viz.mjs'
import { skillStatus } from './server/skill-prompt.mjs'
import { handlePhotoProxy } from './server/photos.mjs'
import { handleResearch } from './server/research.mjs'
import { handleUpload } from './server/uploads.mjs'
import { handleAccount } from './server/accounts.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetsRoot = path.join(__dirname, 'travel-assets')
const seedHtml = path.join(__dirname, 'seed', 'shudao-zhongqiu.html')
const htmlToImage = path.resolve(__dirname, 'node_modules', 'html-to-image', 'dist', 'html-to-image.js')

function localAssets(): Plugin {
  return {
    name: 'travel-monkey-local',
    configureServer(server) {
      const skill = skillStatus()
      console.log('[travel-monkey] travel-plan-viz skill', skill.bootedAt, skill.files.map((f: { title: string }) => f.title).join(' + '))
      server.middlewares.use('/api/chat', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        handleChat(req, res)
      })
      server.middlewares.use('/api/render', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        handleRender(req, res)
      })
      server.middlewares.use('/api/validate', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        handleValidate(req, res)
      })
      server.middlewares.use('/api/research', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        handleResearch(req, res)
      })
      server.middlewares.use('/api/account', (req, res) => {
        handleAccount(req, res)
      })
      server.middlewares.use('/api/upload', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        handleUpload(req, res)
      })
      server.middlewares.use('/travel-photo', (req, res) => {
        handlePhotoProxy(req, res)
      })
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (url === '/export/html-to-image.js' && fs.existsSync(htmlToImage)) {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          fs.createReadStream(htmlToImage).pipe(res)
          return
        }
        if (url === '/api/skill') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(skillStatus()))
          return
        }
        if (url === '/seed/trip.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(loadSeedTrip()))
          return
        }
        if (url === '/seed/trip.html' && fs.existsSync(seedHtml)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          fs.createReadStream(seedHtml).pipe(res)
          return
        }
        if (url.startsWith('/travel-assets/')) {
          const file = path.join(assetsRoot, decodeURIComponent(url.replace('/travel-assets/', '')))
          if (file.startsWith(assetsRoot) && fs.existsSync(file)) {
            const ext = path.extname(file).toLowerCase()
            const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream'
            res.setHeader('Content-Type', mime)
            fs.createReadStream(file).pipe(res)
            return
          }
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localAssets()],
  server: {
    port: 5177,
    host: '127.0.0.1',
  },
})
