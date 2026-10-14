/** 联网搜索：博查（国内）/ Tavily / Serper */

export async function searchWeb(query, { searchKey, searchProvider }) {
  if (!searchKey) return []
  const provider = String(searchProvider || 'bocha').toLowerCase()

  if (provider === 'serper') {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': searchKey },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return (data.organic || []).slice(0, 5).map((x) => ({ title: x.title, snippet: x.snippet, url: x.link }))
  }

  if (provider === 'tavily') {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: searchKey, query, max_results: 5, search_depth: 'basic' }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return (data.results || []).slice(0, 5).map((x) => ({ title: x.title, snippet: x.content, url: x.url }))
  }

  // 默认博查（国内网络更稳）
  const res = await fetch('https://api.bochaai.com/v1/web-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${searchKey}`,
    },
    body: JSON.stringify({
      query,
      freshness: 'noLimit',
      summary: true,
      count: 5,
    }),
    signal: AbortSignal.timeout(12000),
  })
  const data = await res.json()
  const pages = data?.data?.webPages?.value
    || data?.data?.webPages
    || data?.webPages?.value
    || data?.results
    || []
  const list = Array.isArray(pages) ? pages : []
  return list.slice(0, 5).map((x) => ({
    title: x.name || x.title || '',
    snippet: x.summary || x.snippet || x.description || '',
    url: x.url || x.link || '',
  }))
}

export function normalizeSearchProvider(raw) {
  const p = String(raw || '').toLowerCase()
  if (p === 'serper' || p === 'tavily' || p === 'bocha') return p
  return 'bocha'
}
