import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const mapJs = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'mold', 'travel-plan-viz', 'assets', 'map.js'))

const MAX_LEGS = 12

function wgs84ToGcj02(lat, lng) {
  const wgs = mapJs.gcj02ToWgs84(lat, lng)
  return { lat: lat * 2 - wgs.lat, lng: lng * 2 - wgs.lng }
}

async function amap(pathName, params) {
  const url = new URL(`https://restapi.amap.com/v3/${pathName}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  })
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  return res.json()
}

function navUri(from, to, mode) {
  return 'https://uri.amap.com/navigation?from='
    + from.lng + ',' + from.lat + ',' + encodeURIComponent(from.name || '起点')
    + '&to=' + to.lng + ',' + to.lat + ',' + encodeURIComponent(to.name || '终点')
    + '&mode=' + (mode || 'walk')
    + '&coordinate=wgs84&callnative=1&src=travel-monkey'
}

function havKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLng = (bLng - aLng) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function transitThreshold(persona) {
  if (persona === 'stay') return 1200 // 旅居：20 分钟以上就查公交，少暴走
  if (persona === 'guide') return 1800 // 带队：30 分钟以上统一乘车
  if (persona === 'trek') return 5400 // 探秘：90 分钟内都算徒步本分
  return 2400
}

function fmtDuration(sec) {
  const n = Number(sec)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 60) return '约 1 分钟'
  const min = Math.round(n / 60)
  if (min < 60) return `约 ${min} 分钟`
  return `约 ${(min / 60).toFixed(1)} 小时`
}

function mergeSource(trip, source) {
  const list = Array.isArray(trip.dataSources) ? trip.dataSources : []
  if (list.some((s) => s && s.name === source.name && s.scope === source.scope)) return
  list.push(source)
  trip.dataSources = list
}

export async function enrichTripTransport(trip, amapKey) {
  if (!amapKey) {
    mergeSource(trip, { name: '高德地图', scope: '未提供 Key，交通为模型参考', realtime: false })
    return trip
  }
  const days = Array.isArray(trip.days) ? trip.days : []
  const driveAfterKm = 30 // 超过 30km 按城际段走驾车，不再按邻点步行
  const walkToTransit = transitThreshold(trip.persona)
  let used = 0
  for (const day of days) {
    const slots = (day.slots || []).filter((s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
    for (let i = 1; i < slots.length && used < MAX_LEGS; i += 1) {
      const prev = slots[i - 1]
      const cur = slots[i]
      if (cur.transport && cur.transport.mode && cur.transport.actionLink) continue
      const fromGcj = wgs84ToGcj02(Number(prev.lat), Number(prev.lng))
      const toGcj = wgs84ToGcj02(Number(cur.lat), Number(cur.lng))
      const km = havKm(Number(prev.lat), Number(prev.lng), Number(cur.lat), Number(cur.lng))
      try {
        if (km > driveAfterKm) {
          const drive = await amap('direction/driving', {
            key: amapKey,
            origin: `${fromGcj.lng},${fromGcj.lat}`,
            destination: `${toGcj.lng},${toGcj.lat}`,
          })
          const p0 = drive.route && drive.route.paths && drive.route.paths[0]
          const duration = fmtDuration(p0 && Number(p0.duration))
          if (!duration) continue
          used += 1
          cur.transport = {
            mode: '自驾/包车',
            fare: (cur.transport && cur.transport.fare) || '油费过路费参考',
            duration,
            intercity: true,
            actionLink: {
              label: '导航',
              url: navUri(
                { lat: Number(prev.lat), lng: Number(prev.lng), name: prev.name },
                { lat: Number(cur.lat), lng: Number(cur.lng), name: cur.name },
                'car',
              ),
            },
          }
          continue
        }
        const walk = await amap('direction/walking', {
          key: amapKey,
          origin: `${fromGcj.lng},${fromGcj.lat}`,
          destination: `${toGcj.lng},${toGcj.lat}`,
        })
        const path = walk.route && walk.route.paths && walk.route.paths[0]
        const seconds = path && Number(path.duration)
        let mode = '步行'
        let duration = fmtDuration(seconds)
        let navMode = 'walk'
        if (Number.isFinite(seconds) && seconds > walkToTransit) {
          try {
            const transit = await amap('direction/transit/integrated', {
              key: amapKey,
              origin: `${fromGcj.lng},${fromGcj.lat}`,
              destination: `${toGcj.lng},${toGcj.lat}`,
              city: String(trip.title || '').slice(0, 8),
            })
            const t0 = transit.route && transit.route.transits && transit.route.transits[0]
            if (t0) {
              mode = '公交/地铁'
              duration = fmtDuration(t0.duration)
              navMode = 'bus'
            }
          } catch {
            /* keep walking */
          }
        }
        if (!duration) continue
        used += 1
        cur.transport = {
          mode,
          fare: mode === '步行' ? '步行' : (cur.transport && cur.transport.fare) || '参考',
          duration,
          actionLink: {
            label: '导航',
            url: navUri(
              { lat: Number(prev.lat), lng: Number(prev.lng), name: prev.name },
              { lat: Number(cur.lat), lng: Number(cur.lng), name: cur.name },
              navMode,
            ),
          },
        }
      } catch {
        /* skip this leg */
      }
    }
  }
  mergeSource(trip, { name: '高德地图', scope: '路线规划 / 天气 / POI，时效性由其官方保证', realtime: true })
  return trip
}
