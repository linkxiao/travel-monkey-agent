/** 地图/交通共用：距离格式、打车估价、导航深链（深链不消耗 Key） */

export function havKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function fmtDuration(sec) {
  const n = Number(sec)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 60) return '约 1 分钟'
  const min = Math.round(n / 60)
  if (min < 60) return `约 ${min} 分钟`
  return `约 ${(min / 60).toFixed(1)} 小时`
}

export function fmtDistance(meters, fallbackKm) {
  const m = Number(meters)
  if (Number.isFinite(m) && m > 0) {
    if (m < 1000) return `约 ${Math.round(m)} 米`
    const km = m / 1000
    return km < 10 ? `约 ${km.toFixed(1)} 公里` : `约 ${Math.round(km)} 公里`
  }
  const km = Number(fallbackKm)
  if (!Number.isFinite(km) || km <= 0) return ''
  if (km < 1) return `约 ${Math.round(km * 1000)} 米`
  return km < 10 ? `约 ${km.toFixed(1)} 公里` : `约 ${Math.round(km)} 公里`
}

/** 日间出租车大概估价：起步约 ¥13/3km，超出约 ¥2.5/km（各城不同，仅参考） */
export function estimateTaxiYuan(meters) {
  const m = Number(meters)
  if (!Number.isFinite(m) || m <= 0) return 0
  const km = m / 1000
  if (km <= 3) return 13
  return Math.max(13, Math.round(13 + (km - 3) * 2.5))
}

export function fmtYuan(n) {
  const x = Number(n)
  if (!Number.isFinite(x) || x <= 0) return ''
  return `约 ¥${Math.round(x)}`
}

export function buildFare({ mode, transitYuan, taxiYuan }) {
  if (mode === '步行') {
    if (taxiYuan > 0) return `免费；打车${fmtYuan(taxiYuan)}`
    return '免费'
  }
  if (mode === '公交/地铁') {
    const bus = transitYuan > 0 ? `公交${fmtYuan(transitYuan)}` : '公交参考'
    const taxi = taxiYuan > 0 ? `打车${fmtYuan(taxiYuan)}` : ''
    return [bus, taxi].filter(Boolean).join('；')
  }
  if (taxiYuan > 0) return `打车${fmtYuan(taxiYuan)}（油费过路另计）`
  return '油费过路费参考'
}

export function transitThresholdSec(persona) {
  if (persona === 'stay') return 1200
  if (persona === 'guide') return 1800
  if (persona === 'trek') return 5400
  return 2400
}

export function navUri(from, to, mode) {
  // 高德 App 深链，不消耗 Web 服务 Key
  return 'https://uri.amap.com/navigation?from='
    + from.lng + ',' + from.lat + ',' + encodeURIComponent(from.name || '起点')
    + '&to=' + to.lng + ',' + to.lat + ',' + encodeURIComponent(to.name || '终点')
    + '&mode=' + (mode || 'walk')
    + '&coordinate=wgs84&callnative=1&src=travel-monkey'
}

export function weakFare(fare) {
  const s = String(fare || '').trim()
  if (!s) return true
  return /^(参考|步行|油费过路费参考)$/.test(s)
}

export function transportComplete(t) {
  if (!t || typeof t !== 'object') return false
  if (!t.mode || !t.duration || !t.distance || !t.actionLink) return false
  if (weakFare(t.fare)) return false
  if (t.mode !== '步行' && !/打车|免费/.test(String(t.fare || ''))) return false
  return true
}

export function mergeSource(trip, source) {
  const list = Array.isArray(trip.dataSources) ? trip.dataSources : []
  if (list.some((s) => s && s.name === source.name && s.scope === source.scope)) return
  list.push(source)
  trip.dataSources = list
}

export function walkSecondsFromKm(km) {
  // ≈ 5 km/h
  return Math.round((Number(km) || 0) * 3600 / 5)
}
