/**
 * 天地图 Web 服务：个人可申请，国内网络稳定。
 * 驾车/步行共用 /drive（style 0 驾车，3 步行）；公交用 /transit。
 * 坐标按 WGS-84/CGCS2000 传「经度,纬度」。
 */

function xmlTag(xml, tag) {
  const m = String(xml || '').match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'))
  return m ? m[1].trim() : ''
}

async function tdtGet(pathName, postStr, type, tk) {
  const url = new URL(`https://api.tianditu.gov.cn/${pathName}`)
  url.searchParams.set('postStr', typeof postStr === 'string' ? postStr : JSON.stringify(postStr))
  url.searchParams.set('type', type)
  url.searchParams.set('tk', tk)
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  const text = await res.text()
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return { kind: 'json', data: JSON.parse(trimmed) } } catch { /* fallthrough */ }
  }
  return { kind: 'xml', data: trimmed }
}

function parseDriveXml(xml) {
  const distanceKm = Number(xmlTag(xml, 'distance'))
  const duration = Number(xmlTag(xml, 'duration'))
  if (!Number.isFinite(duration) || duration <= 0) return null
  const meters = Number.isFinite(distanceKm) && distanceKm > 0
    ? Math.round(distanceKm * 1000)
    : 0
  return { durationSec: duration, meters }
}

/** style: 0 最快驾车，3 步行 */
export async function tdtRoute(tk, fromLng, fromLat, toLng, toLat, style) {
  const postStr = {
    orig: `${fromLng},${fromLat}`,
    dest: `${toLng},${toLat}`,
    style: String(style),
  }
  const out = await tdtGet('drive', postStr, 'search', tk)
  if (out.kind === 'xml') return parseDriveXml(out.data)
  // 偶发 JSON
  const d = out.data || {}
  const duration = Number(d.duration || d.time)
  const distanceKm = Number(d.distance)
  if (!Number.isFinite(duration) || duration <= 0) return null
  return {
    durationSec: duration,
    meters: Number.isFinite(distanceKm) ? Math.round(distanceKm * 1000) : 0,
  }
}

export async function tdtTransit(tk, fromLng, fromLat, toLng, toLat) {
  const postStr = {
    startposition: `${fromLng},${fromLat}`,
    endposition: `${toLng},${toLat}`,
    linetype: '1',
  }
  const out = await tdtGet('transit', postStr, 'busline', tk)
  const data = out.kind === 'json' ? out.data : null
  if (!data) return null
  // 结构因版本略有差异，尽量宽松解析
  const results = data.results || data.result || data
  const typeResults = results?.lineData || results?.types || results?.typeResults || []
  const list = Array.isArray(typeResults) ? typeResults : []
  let best = null
  for (const tr of list) {
    const lines = tr.lines || tr.line || []
    for (const line of (Array.isArray(lines) ? lines : [lines])) {
      if (!line) continue
      const duration = Number(line.time || line.duration || line.totalTime)
      const dist = Number(line.distance || line.totalDistance)
      const cost = Number(line.price || line.cost || line.ticketPrice)
      const meters = Number.isFinite(dist)
        ? (dist > 1000 ? Math.round(dist) : Math.round(dist * 1000))
        : 0
      if (!Number.isFinite(duration) || duration <= 0) continue
      if (!best || duration < best.durationSec) {
        best = {
          durationSec: duration > 10000 ? Math.round(duration / 1000) : duration, // 有的接口给毫秒
          meters,
          transitYuan: Number.isFinite(cost) && cost > 0 ? cost : 0,
        }
      }
    }
  }
  // 另一常见形状：直接 lines
  if (!best && Array.isArray(data.lines)) {
    for (const line of data.lines) {
      const duration = Number(line.time || line.duration)
      if (!Number.isFinite(duration) || duration <= 0) continue
      best = {
        durationSec: duration,
        meters: Math.round(Number(line.distance || 0) * (Number(line.distance) < 100 ? 1000 : 1)),
        transitYuan: Number(line.price || 0) || 0,
      }
      break
    }
  }
  return best
}

export async function tdtSearchPoi(tk, keyword, specify = '') {
  const postStr = {
    keyWord: keyword,
    queryType: '1',
    start: '0',
    count: '5',
    specify: specify || undefined,
  }
  const url = new URL('https://api.tianditu.gov.cn/v2/search')
  url.searchParams.set('postStr', JSON.stringify(postStr))
  url.searchParams.set('type', 'query')
  url.searchParams.set('tk', tk)
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const data = await res.json()
  const pois = data.pois || data.suggests || []
  return Array.isArray(pois) ? pois : []
}
