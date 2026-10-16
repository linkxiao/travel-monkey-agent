/** 联网搜索：博查（国内优先）/ Tavily / Serper；主源失败可自动换备用 */

function normalizeSearchProvider(raw) {
  const p = String(raw || '').toLowerCase()
  if (p === 'serper' || p === 'tavily' || p === 'bocha') return p
  return 'bocha'
}

async function searchOnce(query, provider, searchKey) {
  const key = String(searchKey || '').trim()
  if (!key) return { ok: false, results: [], reason: 'no-key' }
  const p = normalizeSearchProvider(provider)

  if (p === 'serper') {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, results: [], reason: data.message || data.error || `http-${res.status}` }
    }
    const list = (data.organic || []).slice(0, 5).map((x) => ({
      title: x.title || '',
      snippet: x.snippet || '',
      url: x.link || '',
    }))
    return { ok: true, results: list, provider: p }
  }

  if (p === 'tavily') {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: 'basic' }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error || data.detail) {
      return { ok: false, results: [], reason: data.error || data.detail || `http-${res.status}` }
    }
    const list = (data.results || []).slice(0, 5).map((x) => ({
      title: x.title || '',
      snippet: x.content || '',
      url: x.url || '',
    }))
    return { ok: true, results: list, provider: p }
  }

  // 博查
  const res = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      freshness: 'noLimit',
      summary: true,
      count: 5,
    }),
    signal: AbortSignal.timeout(12000),
  })
  const data = await res.json().catch(() => ({}))
  const code = data.code ?? data.status ?? data.data?.code
  const errMsg = data.message || data.msg || data.error || data.data?.message
  if (!res.ok) {
    return { ok: false, results: [], reason: errMsg || `http-${res.status}` }
  }
  if (code != null) {
    const okCode = Number(code) === 200 || Number(code) === 0 || String(code).toLowerCase() === 'success'
    if (!okCode) {
      return { ok: false, results: [], reason: errMsg || String(code) }
    }
  }
  const pages = data?.data?.webPages?.value
    || data?.data?.webPages
    || data?.webPages?.value
    || data?.results
    || []
  const list = (Array.isArray(pages) ? pages : []).slice(0, 5).map((x) => ({
    title: x.name || x.title || '',
    snippet: x.summary || x.snippet || x.description || '',
    url: x.url || x.link || '',
  }))
  return { ok: true, results: list, provider: 'bocha' }
}

function stepId(step) {
  return `${step.provider}\0${step.key}`
}

function isCredentialFailure(reason) {
  const s = String(reason || '')
  if (/invalid api key|unauthorized|authentication/i.test(s)) return true
  if (/密钥|api\s*key/i.test(s) && /无效|错误|不正确|失效|invalid/i.test(s)) return true
  return /^http-40[13]$/.test(s)
}

// 同一进程里，无效密钥只探测一次。并发的航班/酒店/时令三路共用这一次结果。
const authState = new Map()

export function resetSearchAuth() {
  authState.clear()
}

function beginProbe(id) {
  let release = () => {}
  const gate = new Promise((resolve) => { release = resolve })
  const state = { status: 'probing', gate, release, reason: '' }
  authState.set(id, state)
  return state
}

async function callProvider(query, step, gateAuth) {
  const id = stepId(step)
  let state = authState.get(id)
  if (state?.status === 'dead') {
    return { ok: false, results: [], reason: state.reason, skipped: true }
  }
  if (gateAuth && state?.status === 'probing') {
    await state.gate
    if (state.status === 'dead') {
      return { ok: false, results: [], reason: state.reason, skipped: true }
    }
  } else if (gateAuth && !state) {
    state = beginProbe(id)
    try {
      const out = await searchOnce(query, step.provider, step.key)
      if (!out.ok && isCredentialFailure(out.reason)) {
        state.status = 'dead'
        state.reason = out.reason || 'invalid-key'
        out.retired = true
      } else if (out.ok) {
        state.status = 'ok'
      } else {
        state.status = 'open'
      }
      return out
    } catch (err) {
      state.status = 'open'
      throw err
    } finally {
      state.release()
    }
  }

  const out = await searchOnce(query, step.provider, step.key)
  if (!out.ok && isCredentialFailure(out.reason)) {
    authState.set(id, { status: 'dead', reason: out.reason || 'invalid-key', gate: Promise.resolve(), release() {} })
    out.retired = true
  } else if (out.ok) {
    authState.set(id, { status: 'ok', reason: '', gate: Promise.resolve(), release() {} })
  }
  return out
}

/**
 * 先主源，失败再备用。opts:
 *   searchKey, searchProvider
 *   searchFallbackKey, searchFallbackProvider
 */
export async function searchWeb(query, opts = {}) {
  const primary = {
    provider: normalizeSearchProvider(opts.searchProvider),
    key: String(opts.searchKey || '').trim(),
  }
  const fallback = {
    provider: normalizeSearchProvider(opts.searchFallbackProvider || 'tavily'),
    key: String(opts.searchFallbackKey || '').trim(),
  }

  const chain = []
  if (primary.key) chain.push(primary)
  if (fallback.key && !(fallback.provider === primary.provider && fallback.key === primary.key)) {
    chain.push(fallback)
  }
  if (!chain.length) return []

  let lastEmpty = []
  for (let i = 0; i < chain.length; i += 1) {
    const step = chain[i]
    try {
      const out = await callProvider(query, step, i === 0)
      if (out.skipped) continue
      if (out.ok) {
        if (i > 0) {
          console.log(`[search] 主源失败，已用备用 ${step.provider}，命中 ${out.results.length} 条`)
        }
        return out.results
      }
      const tail = out.retired
        ? `，本进程后续跳过该密钥${i < chain.length - 1 ? '，尝试备用' : ''}`
        : (i < chain.length - 1 ? '，尝试备用' : '')
      console.log(`[search] ${step.provider} 失败：${out.reason || 'unknown'}${tail}`)
      lastEmpty = []
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[search] ${step.provider} 异常：${msg}${i < chain.length - 1 ? '，尝试备用' : ''}`)
    }
  }
  return lastEmpty
}

export { normalizeSearchProvider }
