// 账号只认邮箱。注册要验证码并设置密码；登录用密码。密码和验证码都只存校验值。
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { deliverCode } from './deliver.mjs'
import { dailyLimit } from './config.mjs'

const DEFAULT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.users.sqlite')
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const CODE_MS = 5 * 60 * 1000
const pool = new Map()

export function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase()
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) || email.length > 80) return ''
  return email
}

function codeHash(salt, code) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex')
}

function tokenId(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function newCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0')
}

export function identifyAccount(raw) {
  const email = normalizeEmail(raw)
  if (email) return { channel: 'email', account: email }
  return null
}

function accountLabel(row) {
  return row?.account || ''
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    channel TEXT NOT NULL,
    account TEXT NOT NULL UNIQUE,
    persona TEXT NOT NULL DEFAULT '',
    diet TEXT NOT NULL DEFAULT '[]',
    tier TEXT NOT NULL DEFAULT '',
    home TEXT NOT NULL DEFAULT '',
    password_salt TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    exp INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS verify_codes (
    id INTEGER PRIMARY KEY,
    channel TEXT NOT NULL,
    target TEXT NOT NULL,
    purpose TEXT NOT NULL,
    salt TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    exp INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS verify_target ON verify_codes(target, purpose, created_at);
  CREATE TABLE IF NOT EXISTS usage (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
`

function createSchema(db) {
  db.exec(SCHEMA)
}

function columnNames(db) {
  return new Set(db.prepare("SELECT name FROM pragma_table_info('users')").all().map((col) => col.name))
}

function ensureSchema(db) {
  let names = columnNames(db)
  if (!names.size) {
    createSchema(db)
    return
  }
  if (!names.has('channel')) {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    try {
      db.exec('ALTER TABLE users RENAME TO users_legacy')
      db.exec('ALTER TABLE sessions RENAME TO sessions_legacy')
      createSchema(db)
      db.exec('DROP TABLE sessions_legacy')
      db.exec('DROP TABLE users_legacy')
      db.exec('COMMIT')
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* 已经失败 */ }
      throw err
    } finally {
      db.exec('PRAGMA foreign_keys = ON')
    }
    names = columnNames(db)
  }
  if (!names.has('password_hash')) {
    db.exec("ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''")
    db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS verify_codes (
      id INTEGER PRIMARY KEY,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,
      purpose TEXT NOT NULL,
      salt TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      exp INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS verify_target ON verify_codes(target, purpose, created_at);
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `)
}

function openDb(file) {
  if (pool.has(file)) return pool.get(file)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  ensureSchema(db)
  pool.set(file, db)
  return db
}

function withWrite(db, run) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = run()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try { db.exec('ROLLBACK') } catch { /* 已经回滚 */ }
    throw err
  }
}

function pruneSessions(db, now = Date.now()) {
  db.prepare('DELETE FROM sessions WHERE exp < ?').run(now)
}

function issueSession(db, userId) {
  const token = crypto.randomBytes(32).toString('hex')
  pruneSessions(db)
  db.prepare('INSERT INTO sessions (token_hash, user_id, exp) VALUES (?, ?, ?)').run(tokenId(token), userId, Date.now() + SESSION_MS)
  return token
}

function userFromToken(db, token) {
  const row = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.exp >= ?
  `).get(tokenId(token), Date.now())
  if (!row) return null
  return { username: accountLabel(row), user: row }
}

function findUser(db, account) {
  const id = identifyAccount(account)
  if (!id) return null
  return db.prepare('SELECT * FROM users WHERE account = ?').get(id.account) || null
}

function passwordError(password) {
  const value = String(password || '')
  if (value.length < 8) return '密码至少 8 位'
  if (value.length > 64) return '密码最长 64 位'
  return ''
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex')
}

function hasPassword(row) {
  return Boolean(row?.password_hash && row?.password_salt)
}

function passwordMatches(row, password) {
  if (!hasPassword(row)) return false
  const hash = hashPassword(password, row.password_salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(row.password_hash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function tooSoon(db, target, purpose, minInterval) {
  const latest = db.prepare(`
    SELECT created_at FROM verify_codes
    WHERE target = ? AND purpose = ?
    ORDER BY id DESC LIMIT 1
  `).get(target, purpose)
  if (latest && Date.now() - latest.created_at < minInterval) return true
  const hour = db.prepare(`
    SELECT COUNT(*) AS n FROM verify_codes
    WHERE target = ? AND created_at > ?
  `).get(target, Date.now() - 60 * 60 * 1000)
  return (hour?.n || 0) >= 8
}

export async function requestVerify({ purpose, account, file = DEFAULT_FILE, sink, minInterval = 60 * 1000 }) {
  if (purpose !== 'register') return { ok: false, error: '没有这种验证码' }
  const id = identifyAccount(account)
  if (!id) return { ok: false, error: '请填写邮箱' }
  const db = openDb(file)
  const existing = findUser(db, id.account)
  if (existing && hasPassword(existing)) return { ok: false, error: '这个账号已经注册，请直接登录' }
  if (tooSoon(db, id.account, purpose, minInterval)) return { ok: false, error: '验证码刚发过，请稍后再试' }
  const code = newCode()
  const salt = crypto.randomBytes(16).toString('hex')
  let via = 'sink'
  if (Array.isArray(sink)) sink.push({ channel: id.channel, target: id.account, code })
  else {
    try {
      via = await deliverCode({ channel: id.channel, target: id.account, code })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '验证码没有发出去' }
    }
  }
  const now = Date.now()
  withWrite(db, () => {
    db.prepare(`
      INSERT INTO verify_codes (channel, target, purpose, salt, code_hash, exp, created_at, attempts, used)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(id.channel, id.account, purpose, salt, codeHash(salt, code), now + CODE_MS, now)
  })
  return { ok: true, channel: id.channel, via }
}

function matchCode(db, { channel, target, purpose, code }) {
  const row = db.prepare(`
    SELECT * FROM verify_codes
    WHERE channel = ? AND target = ? AND purpose = ? AND used = 0 AND exp >= ?
    ORDER BY id DESC LIMIT 1
  `).get(channel, target, purpose, Date.now())
  if (!row || row.attempts >= 5) return { ok: false, id: row?.id || 0 }
  const hash = codeHash(row.salt, String(code || '').trim())
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(row.code_hash, 'hex')
  const same = a.length === b.length && crypto.timingSafeEqual(a, b)
  return { ok: same, id: row.id }
}

function acceptCode(db, id, purpose, code) {
  const matched = matchCode(db, { channel: id.channel, target: id.account, purpose, code })
  if (!matched.ok) {
    if (matched.id) {
      withWrite(db, () => {
        db.prepare('UPDATE verify_codes SET attempts = attempts + 1 WHERE id = ?').run(matched.id)
      })
    }
    return 0
  }
  return matched.id
}

function codeError() {
  return '邮箱验证码不对'
}

export async function registerUser({ account, code, password, file = DEFAULT_FILE }) {
  const id = identifyAccount(account)
  if (!id) return { ok: false, error: '请填写邮箱' }
  const weak = passwordError(password)
  if (weak) return { ok: false, error: weak }
  const db = openDb(file)
  const existing = findUser(db, id.account)
  if (existing && hasPassword(existing)) return { ok: false, error: '这个账号已经注册，请直接登录' }
  const codeId = acceptCode(db, id, 'register', code)
  if (!codeId) return { ok: false, error: codeError() }
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = hashPassword(password, salt)
  const token = crypto.randomBytes(32).toString('hex')
  try {
    const userId = withWrite(db, () => {
      let rowId = existing?.id
      if (existing) {
        db.prepare('UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, existing.id)
      } else {
        const info = db.prepare(`
          INSERT INTO users (channel, account, password_salt, password_hash, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(id.channel, id.account, salt, hash, Date.now())
        rowId = Number(info.lastInsertRowid)
      }
      db.prepare('UPDATE verify_codes SET used = 1 WHERE id = ?').run(codeId)
      pruneSessions(db)
      db.prepare('INSERT INTO sessions (token_hash, user_id, exp) VALUES (?, ?, ?)').run(tokenId(token), rowId, Date.now() + SESSION_MS)
      return rowId
    })
    if (!userId) return { ok: false, error: '注册没有完成，请再试一次' }
  } catch (err) {
    if (String(err?.message || '').includes('UNIQUE')) return { ok: false, error: '这个账号已经注册，请直接登录' }
    throw err
  }
  return { ok: true, token, username: id.account }
}

export async function loginUser({ account, password, file = DEFAULT_FILE }) {
  const id = identifyAccount(account)
  if (!id) return { ok: false, error: '请填写邮箱' }
  const weak = passwordError(password)
  if (weak) return { ok: false, error: '密码不对' }
  const db = openDb(file)
  const user = findUser(db, id.account)
  if (!user) return { ok: false, error: '还没有这个账号，请先注册' }
  if (!hasPassword(user)) return { ok: false, error: '这个账号还没有设置密码，请先完成注册' }
  if (!passwordMatches(user, password)) return { ok: false, error: '密码不对' }
  const token = crypto.randomBytes(32).toString('hex')
  withWrite(db, () => {
    pruneSessions(db)
    db.prepare('INSERT INTO sessions (token_hash, user_id, exp) VALUES (?, ?, ?)').run(tokenId(token), user.id, Date.now() + SESSION_MS)
  })
  return { ok: true, token, username: accountLabel(user) }
}

export function sessionUser(token, file = DEFAULT_FILE) {
  const db = openDb(file)
  const found = userFromToken(db, token)
  if (!found) return { ok: false, error: '登录已失效，请重新登录' }
  return { ok: true, username: found.username }
}

function today(now = Date.now()) {
  return new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

// 用服务端模型的次数：按账号按天（北京时间）计，超过上限就拒绝
export function takeQuota(token, limit, { file = DEFAULT_FILE, now = Date.now(), bucket = '' } = {}) {
  const db = openDb(file)
  const found = token ? userFromToken(db, token) : null
  if (!found) return { ok: false, error: '用服务端模型需要先登录。' }
  const day = bucket ? `${today(now)}:${bucket}` : today(now)
  return withWrite(db, () => {
    const row = db.prepare('SELECT count FROM usage WHERE user_id = ? AND day = ?').get(found.user.id, day)
    const used = row ? Number(row.count) : 0
    if (used >= limit && bucket) return { ok: false, used, limit, error: '今天的请求太频繁，明天再来；也可改用自己的模型密钥继续。' }
    if (used >= limit) return { ok: false, used, limit, error: `今天的 ${limit} 次已经用完，明天再来；也可改用自己的模型密钥继续。` }
    db.prepare(`
      INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1)
      ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1
    `).run(found.user.id, day)
    return { ok: true, used: used + 1, limit }
  })
}

export function quotaLeft(token, limit, { file = DEFAULT_FILE, now = Date.now() } = {}) {
  const db = openDb(file)
  const found = token ? userFromToken(db, token) : null
  if (!found) return null
  const row = db.prepare('SELECT count FROM usage WHERE user_id = ? AND day = ?').get(found.user.id, today(now))
  return Math.max(0, limit - (row ? Number(row.count) : 0))
}

export function bearerToken(req) {
  return bearer(req)
}

export function logoutUser(token, file = DEFAULT_FILE) {
  const db = openDb(file)
  withWrite(db, () => {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenId(token))
  })
  return { ok: true }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function bearer(req) {
  const header = String(req.headers.authorization || '')
  const matched = header.match(/^Bearer\s+(\S+)$/i)
  return matched ? matched[1] : ''
}

export async function handleAuth(req, res) {
  const send = (code, obj) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
  }
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const route = url.pathname.replace(/^\/api\/auth/, '') || '/'
    const token = bearer(req)
    if (req.method === 'GET' && route === '/session') return send(200, sessionUser(token))
    if (req.method === 'GET' && route === '/quota') return send(200, { left: quotaLeft(token, dailyLimit()), limit: dailyLimit() })
    if (req.method !== 'POST') return send(405, { ok: false, error: '这个地址不接受该请求' })
    const body = JSON.parse((await readBody(req)) || '{}')
    if (route === '/code') return send(200, await requestVerify({ purpose: body.purpose, account: body.account }))
    if (route === '/register') return send(200, await registerUser({ account: body.account, code: body.code, password: body.password }))
    if (route === '/login') return send(200, await loginUser({ account: body.account, password: body.password }))
    if (route === '/logout') return send(200, logoutUser(token))
    send(404, { ok: false, error: '没有这个账号接口' })
  } catch (err) {
    send(400, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
