// 把当前行程页存成 /s/:id ，复制链接即可发到微信聊天；
// 在微信里打开后，右上角菜单可以再发给好友或分享到朋友圈。
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './config.mjs'
import { bearerToken, sessionUser } from './users.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHARE_DIR = path.resolve(__dirname, '..', 'data', 'shares')
const MAX_BYTES = 8 * 1024 * 1024
const KEEP_FILES = 100

const ticketCache = { token: '', tokenExp: 0, ticket: '', ticketExp: 0 }

function escAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function textify(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (ch) => (
    ch === '<' ? '\\u003c' : ch === '>' ? '\\u003e' : '\\u0026'
  ))
}

export function shareId(html) {
  return crypto.createHash('sha256').update(String(html || '')).digest('hex').slice(0, 16)
}

export function isShareId(id) {
  return /^[a-f0-9]{16}$/.test(String(id || ''))
}

function shareFile(id, dir) {
  if (!isShareId(id)) return ''
  const root = path.resolve(dir)
  const file = path.resolve(root, `${id}.html`)
  if (file !== path.join(root, `${id}.html`)) return ''
  return file
}

function isSharePhoto(src) {
  const value = String(src || '').trim()
  if (!value || /^(?:data|blob):/i.test(value)) return false
  if (/\.svg(?:$|[?#])/i.test(value) || /favicon|sprite|logo|icon/i.test(value)) return false
  if (/\/travel-photo\?/i.test(value) || /(^|\/)travel-photo\?/i.test(value)) return true
  return /\.(?:jpe?g|png|webp|gif)(?:$|[?#])/i.test(value)
}

/** 代理地址里的 https 原图。微信抓缩略图不认 http，能用原图就用原图。 */
function upstreamHttps(src) {
  const value = String(src || '').trim()
  if (!value) return ''
  try {
    const url = new URL(value, 'http://share.local')
    if (url.pathname === '/travel-photo') {
      const inner = url.searchParams.get('u') || ''
      return /^https:\/\//i.test(inner) ? inner : ''
    }
  } catch { /* 不是可解析的地址 */ }
  return /^https:\/\//i.test(value) && isSharePhoto(value) ? value : ''
}

export function extractShareMeta(html) {
  const raw = String(html || '')
  const titleMatch = raw.match(/<title>([^<]*)<\/title>/i)
  const title = textify(titleMatch?.[1] || '') || 'Travel Monkey 行程'
  const sub = raw.match(/class=["'][^"']*hero-sub[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|p|h1|h2)>/i)
  const description = textify(sub?.[1] || '').slice(0, 120) || '打开查看每天的路线、三餐和住宿。'
  const found = []
  const urlRe = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi
  const imgRe = /<img[^>]+src=['"]([^'"]+)['"]/gi
  let match = urlRe.exec(raw)
  while (match) {
    found.push(match[1])
    match = urlRe.exec(raw)
  }
  match = imgRe.exec(raw)
  while (match) {
    found.push(match[1])
    match = imgRe.exec(raw)
  }
  const image = found.find((src) => isSharePhoto(src)) || ''
  return { title, description, image }
}

/** 分享卡片用的图：优先 https 原图，否则落到本站绝对地址。 */
export function shareCardImage(origin, src) {
  return upstreamHttps(src) || absoluteUrl(origin, src)
}

export function absoluteUrl(origin, src) {
  const value = String(src || '').trim()
  if (!value || value.startsWith('data:')) return ''
  if (/^https?:\/\//i.test(value)) return value
  const root = String(origin || '').replace(/\/$/, '')
  if (!root) return ''
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `${root}${value}`
  return `${root}/${value.replace(/^\.\//, '')}`
}

function lanHost() {
  const candidates = []
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(utun|awdl|llw|bridge|vmnet|docker|veth)/.test(name)) continue
    for (const net of list || []) {
      const v4 = net.family === 'IPv4' || net.family === 4
      if (!v4 || net.internal || String(net.address).startsWith('169.254.')) continue
      candidates.push({ name, address: net.address })
    }
  }
  const physical = candidates.find((item) => /^en\d+$/.test(item.name))
  return (physical || candidates[0])?.address || ''
}

export function requestOrigin(req) {
  // 生产务必设 PUBLIC_BASE_URL；未设时默认不信 X-Forwarded-*（防 Host 头伪造），除非 TRUST_PROXY=1
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '')
  if (/^https?:\/\//i.test(configured)) return configured
  const trustProxy = /^(1|true|yes)$/i.test(String(process.env.TRUST_PROXY || ''))
  const forwarded = trustProxy
    ? String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim()
    : ''
  const proto = forwarded || 'http'
  const host = trustProxy
    ? String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
    : String(req?.headers?.host || '').split(',')[0].trim()
  if (!host) return ''
  try {
    const url = new URL(`${proto}://${host}`)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
      const lan = lanHost()
      if (lan) url.hostname = lan
    }
    return url.origin
  } catch {
    return `${proto}://${host}`
  }
}

function pruneShares(dir) {
  const names = fs.readdirSync(dir).filter((name) => /^[a-f0-9]{16}\.html$/.test(name))
  if (names.length <= KEEP_FILES) return
  const ranked = names.map((name) => {
    const file = path.join(dir, name)
    return { file, mtime: fs.statSync(file).mtimeMs }
  }).sort((a, b) => a.mtime - b.mtime)
  for (const item of ranked.slice(0, ranked.length - KEEP_FILES)) fs.unlinkSync(item.file)
}

export function publishShareHtml(html, dir = SHARE_DIR) {
  const text = String(html || '')
  if (!/<!DOCTYPE html/i.test(text) || !/<\/html>/i.test(text)) {
    const err = new Error('还没有可分享的行程页')
    err.status = 400
    throw err
  }
  if (Buffer.byteLength(text) > MAX_BYTES) {
    const err = new Error('行程页太大，无法生成链接')
    err.status = 413
    throw err
  }
  const id = shareId(text)
  const root = path.resolve(dir)
  fs.mkdirSync(root, { recursive: true })
  const file = shareFile(id, root)
  if (!file) {
    const err = new Error('链接生成失败')
    err.status = 500
    throw err
  }
  if (fs.existsSync(file)) {
    const now = new Date()
    fs.utimesSync(file, now, now)
  } else {
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  }
  pruneShares(root)
  return id
}

export function readShareHtml(id, dir = SHARE_DIR) {
  const file = shareFile(id, dir)
  if (!file || !fs.existsSync(file)) return ''
  return fs.readFileSync(file, 'utf8')
}

/** 微信里「打开蓝链 → 点右上角」只会发出裸链接；卡片靠聊天里粘贴后由微信服务器抓 OG。 */
function shareBar(card) {
  return `
<style data-tm-share="1">
#tm-wx-share{position:sticky;top:0;z-index:99999;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0;padding:10px 14px;background:#0e1530;color:#e9eef6;font:13px/1.45 "Noto Sans SC",sans-serif}
#tm-wx-share[hidden]{display:none}
#tm-wx-share button{border:0;border-radius:999px;background:#ffb088;color:#0e1530;font:inherit;font-weight:600;padding:6px 12px;white-space:nowrap}
#tm-wx-share .tm-wx-tip{flex:1;min-width:0}
</style>
<div id="tm-wx-share" hidden>
  <span class="tm-wx-tip">微信里点右上角只会发出网址。请回 Travel Monkey 点「发到微信」，发送带封面的卡片图</span>
  <button type="button" id="tm-wx-copy">复制链接</button>
</div>
<script>
(function () {
  var card = ${jsonForScript(card)};
  var inWx = /MicroMessenger/i.test(navigator.userAgent) || /[?&]wx=1(?:&|$)/.test(location.search);
  var bar = document.getElementById('tm-wx-share');
  var btn = document.getElementById('tm-wx-copy');
  if (inWx && bar) bar.hidden = false;
  function copyLink() {
    var link = card.link || location.href.split('#')[0];
    function ok() { if (btn) btn.textContent = '已复制'; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(ok).catch(function () {
        var input = document.createElement('input');
        input.value = link;
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy'); ok(); } catch (e) {}
        input.remove();
      });
      return;
    }
    var input = document.createElement('input');
    input.value = link;
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); ok(); } catch (e) {}
    input.remove();
  }
  if (btn) btn.addEventListener('click', copyLink);
  function bindBridge() {
    if (!window.WeixinJSBridge || !card) return;
    WeixinJSBridge.on('menu:share:appmessage', function () {
      WeixinJSBridge.invoke('sendAppMessage', {
        title: card.title || document.title,
        desc: card.desc || '',
        link: card.link || location.href.split('#')[0],
        img_url: card.imgUrl || ''
      }, function () {});
    });
    WeixinJSBridge.on('menu:share:timeline', function () {
      WeixinJSBridge.invoke('shareTimeline', {
        title: card.title || document.title,
        link: card.link || location.href.split('#')[0],
        img_url: card.imgUrl || ''
      }, function () {});
    });
  }
  if (typeof WeixinJSBridge === 'undefined') {
    document.addEventListener('WeixinJSBridgeReady', bindBridge, false);
  } else {
    bindBridge();
  }
})();
</script>`
}

function wechatBoot(config, card) {
  if (!config?.appId || !config.signature) return ''
  return `
<script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"></script>
<script>
  wx.config({
    debug: false,
    appId: ${jsonForScript(config.appId)},
    timestamp: ${Number(config.timestamp) || 0},
    nonceStr: ${jsonForScript(config.nonceStr)},
    signature: ${jsonForScript(config.signature)},
    jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData']
  });
  wx.ready(function () {
    var card = ${jsonForScript(card)};
    wx.updateAppMessageShareData({ title: card.title, desc: card.desc, link: card.link, imgUrl: card.imgUrl });
    wx.updateTimelineShareData({ title: card.title, link: card.link, imgUrl: card.imgUrl });
  });
</script>`
}

export function decorateShareHtml(html, { pageUrl, origin, wechat = null, cardImage = '' } = {}) {
  const meta = extractShareMeta(html)
  // 微信缩略图不吃超大图；有专用小图就用小图，否则退回原图地址
  const image = String(cardImage || '').trim() || shareCardImage(origin, meta.image)
  const tags = [
    `<meta name="description" content="${escAttr(meta.description)}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:title" content="${escAttr(meta.title)}">`,
    `<meta property="og:description" content="${escAttr(meta.description)}">`,
    `<meta property="og:url" content="${escAttr(pageUrl)}">`,
    image ? `<meta property="og:image" content="${escAttr(image)}">` : '',
    image ? '<meta property="og:image:type" content="image/jpeg">' : '',
    image ? '<meta property="og:image:width" content="300">' : '',
    image ? '<meta property="og:image:height" content="300">' : '',
    image ? `<link rel="image_src" href="${escAttr(image)}">` : '',
    `<meta itemprop="name" content="${escAttr(meta.title)}">`,
    `<meta itemprop="description" content="${escAttr(meta.description)}">`,
    image ? `<meta itemprop="image" content="${escAttr(image)}">` : '',
    '<base href="/">',
  ].filter(Boolean).join('\n')
  let next = String(html || '')
  if (/<head[^>]*>/i.test(next)) next = next.replace(/<head[^>]*>/i, (head) => `${head}\n${tags}`)
  else next = `${tags}\n${next}`
  const card = { title: meta.title, desc: meta.description, link: pageUrl, imgUrl: image }
  const bar = shareBar(card)
  if (/<body[^>]*>/i.test(next)) next = next.replace(/<body[^>]*>/i, (body) => `${body}\n${bar}`)
  else next = `${bar}\n${next}`
  const boot = wechatBoot(wechat, card)
  if (boot) {
    if (/<\/body>/i.test(next)) next = next.replace(/<\/body>/i, `${boot}\n</body>`)
    else next += boot
  }
  return next
}

export function signWechatUrl(ticket, pageUrl, { nonceStr, timestamp } = {}) {
  const nonce = nonceStr || crypto.randomBytes(8).toString('hex')
  const ts = timestamp || Math.floor(Date.now() / 1000)
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonce}&timestamp=${ts}&url=${pageUrl}`
  const signature = crypto.createHash('sha1').update(raw).digest('hex')
  return { nonceStr: nonce, timestamp: ts, signature }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
  return res.json()
}

export async function wechatConfigFor(pageUrl) {
  const appId = String(process.env.WECHAT_APP_ID || '').trim()
  const secret = String(process.env.WECHAT_APP_SECRET || '').trim()
  if (!appId || !secret || !pageUrl) return null
  const now = Date.now()
  try {
    if (!ticketCache.token || ticketCache.tokenExp <= now + 60_000) {
      const data = await fetchJson(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`)
      if (!data.access_token) return null
      ticketCache.token = data.access_token
      ticketCache.tokenExp = now + (Number(data.expires_in) || 7200) * 1000
    }
    if (!ticketCache.ticket || ticketCache.ticketExp <= now + 60_000) {
      const data = await fetchJson(`https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(ticketCache.token)}&type=jsapi`)
      if (!data.ticket) return null
      ticketCache.ticket = data.ticket
      ticketCache.ticketExp = now + (Number(data.expires_in) || 7200) * 1000
    }
    return { appId, ...signWechatUrl(ticketCache.ticket, pageUrl) }
  } catch {
    return null
  }
}

function sendHtml(res, code, html, cache, { csp = false } = {}) {
  res.statusCode = code
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  // 分享页默认不加 CSP：昨天下午能出卡片的链接当时就没有 CSP。
  // 抓取响应尤其不能带 CSP；人在微信里打开行程页也不靠 CSP 拦登录态。
  if (csp) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'none'",
        "img-src * data: blob:",
        "media-src * data: blob:",
        "style-src 'unsafe-inline' https: data:",
        "font-src https: data:",
        "script-src 'unsafe-inline' 'self' https://res.wx.qq.com https://res2.wx.qq.com",
        "connect-src https: http: 'self'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
    )
  }
  res.setHeader('Cache-Control', cache)
  res.end(html)
}

/** 人在微信里点开链接（带 Sec-Fetch-Dest: document）。 */
export function isWeChatBrowser(ua, headers = {}) {
  const s = String(ua || '')
  if (!/MicroMessenger|WindowsWechat|MacWechat|\bWeChat\b/i.test(s)) return false
  const dest = String(headers['sec-fetch-dest'] || '').toLowerCase()
  if (dest === 'document' || dest === 'iframe') return true
  // 老版本微信内置浏览器有时不带 Sec-Fetch，但仍像真人浏览：有 Mobile + Language
  if (!dest && /Language\//i.test(s) && /Mobile\/|MMWEBSDK|MMWEBID|\bXWEB\//i.test(s)) return true
  return false
}

/**
 * 微信服务器抓分享卡片的 UA 也带 MicroMessenger / Android / Language，
 * 不能靠「像手机」来区分。真人打开几乎总会带 Sec-Fetch-Dest: document。
 */
export function isLinkCrawler(ua, headers = {}) {
  const s = String(ua || '')
  if (isWeChatBrowser(s, headers)) return false
  if (/facebookexternalhit|Twitterbot|TelegramBot|WhatsApp|Slackbot|Discordbot|LinkedInBot|Bytespider|SkypeUriPreview/i.test(s)) {
    return true
  }
  // 微信/企业微信抓取：带 MicroMessenger，但不是上面认定的内置浏览器
  return /MicroMessenger|WindowsWechat|MacWechat|\bWeChat\b|wxwork/i.test(s)
}

/** 给抓卡片的请求用：看完整请求头，不只看 UA。 */
export function wantsLinkPreview(req) {
  const headers = req?.headers || {}
  return isLinkCrawler(headers['user-agent'], headers)
}

export function shareCardDocument({ title, description, pageUrl, image }) {
  const name = escAttr(title || '行程')
  const desc = escAttr(description || '打开查看每天的路线、三餐和住宿。')
  const img = escAttr(image || '')
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>${name}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="${name}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${escAttr(pageUrl)}">
${img ? `<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="300">
<meta property="og:image:height" content="300">
<meta itemprop="image" content="${img}">` : ''}
<meta itemprop="name" content="${name}">
<meta itemprop="description" content="${desc}">
</head><body>${img ? `<img src="${img}" alt="">` : ''}<p>${desc}</p></body></html>`
}

const MISSING = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>链接失效</title></head>
<body style="margin:0;padding:72px 24px;font-family:'Noto Sans SC',sans-serif;color:#0e1530;background:#f4f6fb">
<main style="max-width:28rem"><h1 style="font-weight:500;font-size:28px;margin:0 0 12px">这份行程链接已经失效</h1>
<p style="margin:0;line-height:1.7;color:#5d6578">请让对方重新生成分享链接。</p></main>
</body></html>`

/**
 * 分享地址必须是纯路径 /s/:id，不要带 ?v=。
 * 聊天记录里唯一出过卡片的是 http://…/s/e10346…（无查询串）；
 * 带 ?v=4/?v=6 的全部掉成绿气泡裸链。
 */
export function sharePagePath(id) {
  return `/s/${id}`
}

export function matchShare(pathname) {
  const matched = String(pathname || '').match(/^\/s\/([a-f0-9]{16})\/?$/)
  return matched ? matched[1] : ''
}

export function matchShareCard(pathname) {
  const matched = String(pathname || '').match(/^\/s\/([a-f0-9]{16})\/card\.jpg$/)
  return matched ? matched[1] : ''
}

const ASSET_ROOT = path.resolve(__dirname, '..', 'travel-assets')

/** 只允许读项目里的 travel-assets，避免分享缩略图变成任意文件读取。 */
export function localShareAsset(src) {
  let value = String(src || '').trim().split(/[?#]/)[0]
  if (!value || /^https?:/i.test(value) || value.includes('..')) return ''
  value = value.replace(/^\.?\//, '')
  if (!value.startsWith('travel-assets/')) return ''
  const file = path.resolve(ASSET_ROOT, value.slice('travel-assets/'.length))
  if (file !== ASSET_ROOT && !file.startsWith(`${ASSET_ROOT}${path.sep}`)) return ''
  return file
}

function runFfmpeg(input, output) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', input,
      '-frames:v', '1',
      // 微信缩略图要求至少 300×300，横幅原图会被丢弃，整张卡片就退回成裸链接
      '-vf', 'scale=300:300:force_original_aspect_ratio=increase,crop=300:300',
      '-q:v', '5',
      output,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('缩略图生成超时'))
    }, 20000)
    proc.stderr.on('data', (chunk) => { err += chunk })
    proc.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(err.trim() || `ffmpeg ${code}`))
    })
  })
}

async function cardSourceFile(html) {
  const meta = extractShareMeta(html)
  const local = localShareAsset(meta.image)
  if (local && fs.existsSync(local)) return { file: local, temp: false }
  const remote = upstreamHttps(meta.image)
  if (!remote) return null
  const res = await fetch(remote, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length || buf.length > 12 * 1024 * 1024) return null
  const tmp = path.join(os.tmpdir(), `tm-card-${crypto.randomBytes(6).toString('hex')}`)
  fs.writeFileSync(tmp, buf)
  return { file: tmp, temp: true }
}

export async function ensureShareCard(id, dir = SHARE_DIR) {
  const html = readShareHtml(id, dir)
  if (!html) return ''
  const root = path.resolve(dir)
  const out = path.join(root, `${id}.card300.jpg`)
  const htmlFile = shareFile(id, root)
  if (fs.existsSync(out) && htmlFile && fs.statSync(out).mtimeMs >= fs.statSync(htmlFile).mtimeMs) return out
  const source = await cardSourceFile(html)
  if (!source) return ''
  const tmp = `${out}.${process.pid}.tmp.jpg`
  try {
    await runFfmpeg(source.file, tmp)
    if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 400) return ''
    fs.renameSync(tmp, out)
    return out
  } finally {
    if (source.temp) fs.rmSync(source.file, { force: true })
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true })
  }
}

export async function handleShareCard(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const id = matchShareCard(url.pathname)
  const send = (code) => {
    res.statusCode = code
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.end()
  }
  if (!id) return send(404)
  try {
    const file = await ensureShareCard(id)
    if (!file) return send(404)
    const body = fs.readFileSync(file)
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Content-Length', body.length)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // 微信抓封面常先发 HEAD；以前 HEAD 落到站点 HTML，封面会被直接判失败
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(body)
  } catch {
    send(404)
  }
}

export async function handleShareGet(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const id = matchShare(url.pathname)
  if (!id) {
    sendHtml(res, 404, MISSING, 'no-store')
    return
  }
  const html = readShareHtml(id)
  if (!html) {
    sendHtml(res, 404, MISSING, 'no-store')
    return
  }
  const origin = requestOrigin(req)
  const pageUrl = origin ? `${origin}${sharePagePath(id)}` : sharePagePath(id)
  const cardImage = origin ? `${origin}/s/${id}/card.jpg` : ''
  const meta = extractShareMeta(html)
  if (wantsLinkPreview(req)) {
    // 抓取响应：短 HTML + 零 CSP，贴近昨天下午能出卡片时的形态
    sendHtml(res, 200, shareCardDocument({
      title: meta.title,
      description: meta.description,
      pageUrl,
      image: cardImage,
    }), 'public, max-age=300', { csp: false })
    return
  }
  const wechat = await wechatConfigFor(pageUrl.split('#')[0])
  sendHtml(
    res,
    200,
    decorateShareHtml(html, { pageUrl, origin, wechat, cardImage }),
    wechat ? 'private, no-store' : 'public, max-age=86400',
    { csp: false },
  )
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(Object.assign(new Error('行程页太大，无法生成链接'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function handleSharePublish(req, res) {
  const send = (code, obj) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
  }
  try {
    const user = sessionUser(bearerToken(req))
    if (!user.ok) return send(401, { error: '登录后才能生成分享链接' })
    const raw = await readBody(req, MAX_BYTES + 64 * 1024)
    const body = JSON.parse(raw || '{}')
    const id = publishShareHtml(body.html)
    const origin = requestOrigin(req)
    const meta = extractShareMeta(body.html)
    try { await ensureShareCard(id) } catch { /* 首次抓取时再生成 */ }
    const page = origin ? `${origin}${sharePagePath(id)}` : sharePagePath(id)
    send(200, {
      id,
      url: page,
      title: meta.title,
      description: meta.description,
      image: origin ? `${origin}/s/${id}/card.jpg` : '',
    })
  } catch (err) {
    send(err?.status || 400, { error: err?.message || '链接生成失败' })
  }
}
