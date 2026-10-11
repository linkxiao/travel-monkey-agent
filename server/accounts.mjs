// 跨行程画像按口令分账号存在服务端文件。口令不同就读不到对方的画像。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.accounts.json')

export function normalizeAccountCode(raw) {
  const code = String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (code.length < 6 || code.length > 16) return ''
  return code
}

function asTier(value) {
  if (/经济/.test(value)) return '经济'
  if (/高端|五星|豪华/.test(value)) return '高端'
  if (/中档/.test(value)) return '中档'
  return ''
}

export function cleanAccountProfile(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const diet = Array.isArray(data.diet) ? data.diet.map((item) => String(item || '').trim()).filter((item) => item.length >= 2 && item.length <= 12) : []
  const home = String(data.home || '').trim()
  const persona = /^(stay|guide|trek)$/.test(data.persona) ? data.persona : ''
  return {
    persona,
    diet: [...new Set(diet)].slice(0, 8),
    tier: asTier(data.tier || ''),
    home: home.length >= 2 && home.length <= 8 && !/酒店|宾馆|民宿|客栈/.test(home) ? home : '',
  }
}

function readStore(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

function writeStore(store, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(store))
}

export function getAccount(code, file = DEFAULT_FILE) {
  const id = normalizeAccountCode(code)
  if (!id) return { ok: false, error: '口令需要 6 到 16 位字母或数字' }
  const row = readStore(file)[id]
  if (!row) return { ok: true, found: false, profile: null }
  return { ok: true, found: true, profile: cleanAccountProfile(row) }
}

export function putAccount(code, profile, file = DEFAULT_FILE) {
  const id = normalizeAccountCode(code)
  if (!id) return { ok: false, error: '口令需要 6 到 16 位字母或数字' }
  const store = readStore(file)
  store[id] = cleanAccountProfile(profile)
  writeStore(store, file)
  return { ok: true, found: true, profile: store[id] }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export async function handleAccount(req, res) {
  const send = (code, obj) => {
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(obj))
  }
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET') return send(200, getAccount(url.searchParams.get('code') || ''))
    if (req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}')
      return send(200, putAccount(body.code, body.profile))
    }
    send(405, { ok: false, error: '只接受读取和保存' })
  } catch (err) {
    send(400, { ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
