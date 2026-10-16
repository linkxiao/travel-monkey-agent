// 服务端统一配置：读项目根的 .env。密钥只在服务端用，对外只说「配没配」，不回传密钥本身。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 开发服务重启时进程不变：上次从 .env 读进来的值要能被新内容覆盖，外部环境变量仍然优先
const fromFile = (globalThis.__tmEnvKeys ||= new Set())

function loadLocalEnv() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env')
  if (!fs.existsSync(file)) return
  const seen = new Set()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] && !fromFile.has(key)) continue
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    fromFile.add(key)
    seen.add(key)
  }
  for (const key of fromFile) {
    if (!seen.has(key)) {
      delete process.env[key]
      fromFile.delete(key)
    }
  }
}

loadLocalEnv()

const env = (key) => String(process.env[key] || '').trim()

export function serverModel() {
  const provider = env('LLM_PROVIDER')
  const model = env('LLM_MODEL')
  const apiKey = env('LLM_API_KEY')
  const baseUrl = env('LLM_BASE_URL')
  if (!provider || !model || !apiKey) return null
  if (provider === 'custom' && !baseUrl) return null
  return { provider, model, apiKey, baseUrl }
}

export function serverAmapKey() {
  return env('AMAP_KEY')
}

export function serverTiandituKey() {
  return env('TIANDITU_KEY')
}

function asSearchProvider(raw, fallback = 'bocha') {
  const p = String(raw || '').toLowerCase()
  return p === 'serper' || p === 'tavily' || p === 'bocha' ? p : fallback
}

export function serverSearch() {
  const key = env('SEARCH_KEY')
  const fallbackKey = env('SEARCH_FALLBACK_KEY')
  if (!key && !fallbackKey) return null
  return {
    key,
    provider: asSearchProvider(env('SEARCH_PROVIDER'), 'bocha'),
    fallbackKey,
    fallbackProvider: asSearchProvider(env('SEARCH_FALLBACK_PROVIDER'), 'tavily'),
  }
}

// 地图/搜索：用户自己填的优先，没填用服务端的
export function dataKeys(body = {}) {
  const search = serverSearch()
  const ownSearch = String(body.searchKey || '').trim()
  const ownProvider = String(body.searchProvider || '').toLowerCase()
  const ownFallback = String(body.searchFallbackKey || '').trim()
  const ownFallbackPv = String(body.searchFallbackProvider || '').toLowerCase()
  const provider = ownSearch
    ? asSearchProvider(ownProvider, 'bocha')
    : (search?.provider || asSearchProvider(ownProvider, 'bocha'))
  return {
    amapKey: String(body.amapKey || '').trim() || serverAmapKey(),
    tiandituKey: String(body.tiandituKey || '').trim() || serverTiandituKey(),
    searchKey: ownSearch || search?.key || '',
    searchProvider: provider,
    searchFallbackKey: ownFallback || search?.fallbackKey || '',
    searchFallbackProvider: ownFallback
      ? asSearchProvider(ownFallbackPv, 'tavily')
      : (search?.fallbackProvider || asSearchProvider(ownFallbackPv, 'tavily')),
  }
}

export function dailyLimit() {
  const n = Number(env('LLM_DAILY_LIMIT') || 10)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10
}

export function publicConfig() {
  const model = serverModel()
  const search = serverSearch()
  return {
    model: model ? { provider: model.provider, model: model.model } : null,
    amap: Boolean(serverAmapKey()),
    tianditu: Boolean(serverTiandituKey()),
    search: Boolean(search?.key || search?.fallbackKey),
    dailyLimit: dailyLimit(),
  }
}

export function handleConfig(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(publicConfig()))
}
