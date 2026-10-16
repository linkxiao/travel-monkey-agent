// 生产闸门：登录校验、body 上限、简易 IP 限流、安全响应头
import { bearerToken, sessionUser } from './users.mjs'

const buckets = new Map()

export function applySecurityHeaders(res) {
  if (res.getHeader?.('X-Content-Type-Options')) return
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // 完整 CSP 留给 Nginx；这里先挡住最常见的嗅探与嵌套滥用
}

/** @returns {{ ok: true, username: string } | { ok: false }} 失败时已写响应 */
export function requireLogin(req, res, message = '登录后才能使用') {
  const user = sessionUser(bearerToken(req))
  if (user.ok) return user
  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: user.error || message }))
  return { ok: false }
}

export function readJsonLimited(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        const err = new Error(`请求体过大（上限 ${Math.round(maxBytes / 1024)}KB）`)
        err.status = 413
        reject(err)
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return xf || req.socket?.remoteAddress || 'unknown'
}

/** 滑动窗口：同一 key 在 windowMs 内最多 max 次。超限返回 false 并写 429。 */
export function rateLimit(req, res, { key, windowMs = 60_000, max = 60 } = {}) {
  const id = `${key}:${clientIp(req)}`
  const now = Date.now()
  let bucket = buckets.get(id)
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 }
    buckets.set(id, bucket)
  }
  bucket.count += 1
  if (bucket.count > max) {
    res.statusCode = 429
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Retry-After', String(Math.ceil((bucket.start + windowMs - now) / 1000)))
    res.end(JSON.stringify({ error: '请求太频繁，请稍后再试' }))
    return false
  }
  // 偶尔清理，避免 Map 无限涨
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.start >= windowMs) buckets.delete(k)
    }
  }
  return true
}

/** 拦自定义 Base URL 指到内网 / 链路本地 / 云 metadata */
export function assertPublicHttpsUrl(raw, label = 'Base URL') {
  const text = String(raw || '').trim()
  if (!text) throw new Error(`请填写${label}`)
  let u
  try {
    u = new URL(text)
  } catch {
    throw new Error(`${label} 不是合法地址`)
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error(`${label} 只支持 http/https`)
  }
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') {
    throw new Error(`${label} 不能指向本机`)
  }
  if (
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)
    || host === '::1'
    || host === '[::1]'
    || host === 'metadata.google.internal'
  ) {
    throw new Error(`${label} 不能指向内网或云元数据地址`)
  }
  return u.toString().replace(/\/$/, '')
}

export function healthPayload({ distExists, sqliteOk }) {
  return {
    ok: Boolean(distExists && sqliteOk),
    service: 'travel-monkey',
    time: new Date().toISOString(),
    dist: Boolean(distExists),
    sqlite: Boolean(sqliteOk),
  }
}
