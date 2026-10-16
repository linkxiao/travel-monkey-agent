import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  buildFare,
  estimateTaxiYuan,
  fmtDistance,
  fmtDuration,
  havKm,
  mergeSource,
  navUri,
  transportComplete,
  transitThresholdSec,
  walkSecondsFromKm,
} from './maps/common.mjs'
import { tdtRoute, tdtSearchPoi, tdtTransit } from './maps/tianditu.mjs'

const require = createRequire(import.meta.url)
const mapJs = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'mold', 'travel-plan-viz', 'assets', 'map.js'))

const MAX_LEGS = 48
const MAX_TICKETS = 36

function wgs84ToGcj02(lat, lng) {
  const wgs = mapJs.gcj02ToWgs84(lat, lng)
  return { lat: lat * 2 - wgs.lat, lng: lng * 2 - wgs.lng }
}

const amapCache = new Map()

async function amap(pathName, params) {
  const url = new URL(`https://restapi.amap.com/v3/${pathName}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  })
  const key = url.toString()
  const hit = amapCache.get(key)
  if (hit && hit.until > Date.now()) return hit.data
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  const data = await res.json()
  amapCache.set(key, { until: Date.now() + 10 * 60 * 1000, data })
  return data
}

async function mapPool(items, limit, fn) {
  let i = 0
  const width = Math.min(limit, items.length || 1)
  await Promise.all(Array.from({ length: width }, async () => {
    while (i < items.length) {
      const idx = i
      i += 1
      await fn(items[idx])
    }
  }))
}

function metersOf(pathOrTransit, fallbackKm) {
  const m = Number(pathOrTransit && pathOrTransit.distance)
  if (Number.isFinite(m) && m > 0) return m
  const km = Number(fallbackKm)
  if (Number.isFinite(km) && km > 0) return Math.round(km * 1000)
  return 0
}

function parseTransitCost(transit) {
  const raw = transit && (transit.cost != null ? transit.cost : transit.night_cost)
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) return n
  const s = String(raw || '').replace(/[^\d.]/g, '')
  const m = Number(s)
  return Number.isFinite(m) && m > 0 ? m : 0
}

/** 无路网结果时：用直线距离 + 步行速度启发式，仍补距离/打车估价 */
function localLeg(prev, cur, persona) {
  const km = havKm(Number(prev.lat), Number(prev.lng), Number(cur.lat), Number(cur.lng))
  const meters = Math.round(km * 1000)
  const walkSec = walkSecondsFromKm(km)
  const driveAfterKm = 30
  const walkToTransit = transitThresholdSec(persona)
  let mode = '步行'
  let durationSec = walkSec
  let navMode = 'walk'
  if (km > driveAfterKm) {
    mode = '自驾/包车'
    durationSec = Math.max(600, Math.round(km / 60 * 3600)) // 约 60km/h
    navMode = 'car'
  } else if (walkSec > walkToTransit) {
    mode = '公交/地铁'
    durationSec = Math.max(300, Math.round(walkSec * 0.55))
    navMode = 'bus'
  }
  const taxiYuan = meters >= 800 || mode !== '步行' ? estimateTaxiYuan(meters) : (meters >= 500 ? estimateTaxiYuan(meters) : 0)
  return {
    mode,
    fare: buildFare({ mode, transitYuan: 0, taxiYuan }),
    duration: fmtDuration(durationSec),
    distance: fmtDistance(meters, km),
    meters,
    taxiYuan: taxiYuan || undefined,
    intercity: km > driveAfterKm || undefined,
    provider: 'local',
    actionLink: {
      label: '导航',
      url: navUri(
        { lat: Number(prev.lat), lng: Number(prev.lng), name: prev.name },
        { lat: Number(cur.lat), lng: Number(cur.lng), name: cur.name },
        navMode,
      ),
    },
  }
}

async function tiandituLeg(tk, prev, cur, persona) {
  const lng1 = Number(prev.lng)
  const lat1 = Number(prev.lat)
  const lng2 = Number(cur.lng)
  const lat2 = Number(cur.lat)
  const km = havKm(lat1, lng1, lat2, lng2)
  const driveAfterKm = 30
  const walkToTransit = transitThresholdSec(persona)

  if (km > driveAfterKm) {
    const drive = await tdtRoute(tk, lng1, lat1, lng2, lat2, 0)
    if (!drive) return null
    const taxiYuan = estimateTaxiYuan(drive.meters || km * 1000)
    return {
      mode: '自驾/包车',
      fare: buildFare({ mode: '自驾/包车', taxiYuan }),
      duration: fmtDuration(drive.durationSec),
      distance: fmtDistance(drive.meters, km),
      meters: drive.meters,
      taxiYuan,
      intercity: true,
      provider: 'tianditu',
      actionLink: {
        label: '导航',
        url: navUri(
          { lat: lat1, lng: lng1, name: prev.name },
          { lat: lat2, lng: lng2, name: cur.name },
          'car',
        ),
      },
    }
  }

  const walk = await tdtRoute(tk, lng1, lat1, lng2, lat2, 3)
  if (!walk) return null
  let mode = '步行'
  let durationSec = walk.durationSec
  let meters = walk.meters || Math.round(km * 1000)
  let navMode = 'walk'
  let transitYuan = 0
  if (durationSec > walkToTransit) {
    try {
      const bus = await tdtTransit(tk, lng1, lat1, lng2, lat2)
      if (bus) {
        mode = '公交/地铁'
        durationSec = bus.durationSec
        meters = bus.meters || meters
        transitYuan = bus.transitYuan || 0
        navMode = 'bus'
      }
    } catch { /* keep walk */ }
  }
  const taxiYuan = mode === '步行'
    ? (meters >= 800 ? estimateTaxiYuan(meters) : 0)
    : estimateTaxiYuan(meters)
  return {
    mode,
    fare: buildFare({ mode, transitYuan, taxiYuan }),
    duration: fmtDuration(durationSec),
    distance: fmtDistance(meters, km),
    meters,
    transitYuan: transitYuan || undefined,
    taxiYuan: taxiYuan || undefined,
    provider: 'tianditu',
    actionLink: {
      label: '导航',
      url: navUri(
        { lat: lat1, lng: lng1, name: prev.name },
        { lat: lat2, lng: lng2, name: cur.name },
        navMode,
      ),
    },
  }
}

async function amapTransitLeg(amapKey, fromGcj, toGcj, prev, cur, km, tripTitle) {
  const transit = await amap('direction/transit/integrated', {
    key: amapKey,
    origin: `${fromGcj.lng},${fromGcj.lat}`,
    destination: `${toGcj.lng},${toGcj.lat}`,
    city: String(tripTitle || '').slice(0, 8),
  })
  const t0 = transit.route && transit.route.transits && transit.route.transits[0]
  if (!t0 || !fmtDuration(t0.duration)) return null
  const meters = metersOf(t0, km)
  const taxiYuan = estimateTaxiYuan(meters)
  return {
    mode: '公交/地铁',
    fare: buildFare({ mode: '公交/地铁', transitYuan: parseTransitCost(t0), taxiYuan }),
    duration: fmtDuration(t0.duration),
    distance: fmtDistance(meters, km),
    meters,
    transitYuan: parseTransitCost(t0) || undefined,
    taxiYuan: taxiYuan || undefined,
    provider: 'amap',
    actionLink: {
      label: '导航',
      url: navUri(
        { lat: Number(prev.lat), lng: Number(prev.lng), name: prev.name },
        { lat: Number(cur.lat), lng: Number(cur.lng), name: cur.name },
        'bus',
      ),
    },
  }
}

async function amapLeg(amapKey, prev, cur, persona, tripTitle) {
  const fromGcj = wgs84ToGcj02(Number(prev.lat), Number(prev.lng))
  const toGcj = wgs84ToGcj02(Number(cur.lat), Number(cur.lng))
  const km = havKm(Number(prev.lat), Number(prev.lng), Number(cur.lat), Number(cur.lng))
  const driveAfterKm = 30
  const walkToTransit = transitThresholdSec(persona)

  // 同一景区里的相邻点，直线估算已经够用，不必再打一次路线接口
  if (km < 0.35) {
    const near = localLeg(prev, cur, persona)
    near.provider = 'estimate'
    return near
  }

  if (km > driveAfterKm) {
    const drive = await amap('direction/driving', {
      key: amapKey,
      origin: `${fromGcj.lng},${fromGcj.lat}`,
      destination: `${toGcj.lng},${toGcj.lat}`,
    })
    const p0 = drive.route && drive.route.paths && drive.route.paths[0]
    const duration = fmtDuration(p0 && Number(p0.duration))
    if (!duration) return null
    const meters = metersOf(p0, km)
    const apiTaxi = Number(drive.route && drive.route.taxi_cost)
    const taxiYuan = Number.isFinite(apiTaxi) && apiTaxi > 0 ? Math.round(apiTaxi) : estimateTaxiYuan(meters)
    return {
      mode: '自驾/包车',
      fare: buildFare({ mode: '自驾/包车', taxiYuan }),
      duration,
      distance: fmtDistance(meters, km),
      meters,
      taxiYuan,
      intercity: true,
      provider: 'amap',
      actionLink: {
        label: '导航',
        url: navUri(
          { lat: Number(prev.lat), lng: Number(prev.lng), name: prev.name },
          { lat: Number(cur.lat), lng: Number(cur.lng), name: cur.name },
          'car',
        ),
      },
    }
  }

  // 直线已经明显超过该人格的步行上限时，直接查公交，少一次必失败的步行请求
  if (walkSecondsFromKm(km) > walkToTransit * 1.4) {
    try {
      const hopped = await amapTransitLeg(amapKey, fromGcj, toGcj, prev, cur, km, tripTitle)
      if (hopped) return hopped
    } catch { /* 再试步行 */ }
  }

  const walk = await amap('direction/walking', {
    key: amapKey,
    origin: `${fromGcj.lng},${fromGcj.lat}`,
    destination: `${toGcj.lng},${toGcj.lat}`,
  })
  const path0 = walk.route && walk.route.paths && walk.route.paths[0]
  const seconds = path0 && Number(path0.duration)
  let mode = '步行'
  let duration = fmtDuration(seconds)
  let navMode = 'walk'
  let transitYuan = 0
  let meters = metersOf(path0, km)
  if (Number.isFinite(seconds) && seconds > walkToTransit) {
    try {
      const hopped = await amapTransitLeg(amapKey, fromGcj, toGcj, prev, cur, km, tripTitle)
      if (hopped) return hopped
    } catch { /* keep walking */ }
  }
  if (!duration) return null
  const taxiYuan = meters >= 800 ? estimateTaxiYuan(meters) : 0
  return {
    mode,
    fare: buildFare({ mode, transitYuan, taxiYuan }),
    duration,
    distance: fmtDistance(meters, km),
    meters,
    transitYuan: transitYuan || undefined,
    taxiYuan: taxiYuan || undefined,
    provider: 'amap',
    actionLink: {
      label: '导航',
      url: navUri(
        { lat: Number(prev.lat), lng: Number(prev.lng), name: prev.name },
        { lat: Number(cur.lat), lng: Number(cur.lng), name: cur.name },
        navMode,
      ),
    },
  }
}

function mapOpts(opts) {
  if (typeof opts === 'string') return { amapKey: opts, tiandituKey: '', localOnly: false }
  return {
    amapKey: String(opts?.amapKey || '').trim(),
    tiandituKey: String(opts?.tiandituKey || '').trim(),
    localOnly: !!opts?.localOnly,
  }
}

function routeSettled(t) {
  return transportComplete(t) && t.provider !== 'local'
}

function weakTicket(price) {
  const s = String(price || '').trim()
  if (!s) return true
  return /^(参考|参考价|待查|未知)$/.test(s)
}

function formatTicketCost(raw) {
  const s = String(raw || '').trim()
  if (!s || s === '[]' || s === '{}') return ''
  if (/免费|无需购票|免票/.test(s)) return '免费（参考）'
  if (/^\d+(\.\d+)?$/.test(s)) return `门票参考约 ¥${s}`
  if (/¥|￥|元/.test(s)) return `门票参考 ${s}`
  if (/\d/.test(s)) return `门票参考 ${s}${/元|¥|￥/.test(s) ? '' : ' 元'}`
  return ''
}

function foldName(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '')
}

function poiNameMatches(poiName, query) {
  const p = foldName(poiName)
  const q = foldName(query)
  if (!p || !q || q.length < 2) return false
  return p.includes(q) || q.includes(p)
}

async function fillTicket(slot, { amapKey, tiandituKey, cityHint }) {
  const name = String(slot.name || '').trim()
  if (amapKey) {
    const data = await amap('place/text', {
      key: amapKey,
      keywords: name,
      city: cityHint,
      offset: 5,
      extensions: 'all',
    })
    const pois = Array.isArray(data.pois) ? data.pois : []
    const hit = pois.find((p) => poiNameMatches(p.name, name) && p.biz_ext && p.biz_ext.cost)
      || pois.find((p) => poiNameMatches(p.name, name))
    if (hit) {
      const price = formatTicketCost(hit.biz_ext && hit.biz_ext.cost)
      if (price) {
        slot.ticketPrice = price
        if (!slot.openingHours && hit.biz_ext) {
          const open = hit.biz_ext.opentime || hit.biz_ext.open_time
          if (open && String(open).trim() && String(open) !== '[]') slot.openingHours = String(open).trim()
        }
        return true
      }
      const type = String(hit.type || '')
      if (/风景名胜|景区|公园|博物馆|寺庙|文物/.test(type)) {
        slot.ticketPrice = '门票以官方为准（高德暂无标价）'
        return true
      }
    }
  }
  if (tiandituKey && weakTicket(slot.ticketPrice)) {
    const pois = await tdtSearchPoi(tiandituKey, name, cityHint)
    const hit = pois.find((p) => poiNameMatches(p.name || p.hotPointID, name))
    if (hit) {
      slot.ticketPrice = slot.ticketPrice || '门票以官方为准（天地图无标价）'
      return true
    }
  }
  return false
}

export async function enrichTripTickets(trip, opts) {
  const { amapKey, tiandituKey } = mapOpts(opts)
  if (!amapKey && !tiandituKey) return trip
  const days = Array.isArray(trip.days) ? trip.days : []
  const cityHint = String(trip.title || '').replace(/\d+.*/, '').slice(0, 12)
  const jobs = []
  for (const day of days) {
    for (const slot of day.slots || []) {
      if (jobs.length >= MAX_TICKETS) break
      if (!slot || (slot.kind !== 'spot' && slot.kind !== 'route')) continue
      if (!weakTicket(slot.ticketPrice)) continue
      const name = String(slot.name || '').trim()
      if (!name || /待定|午休|茶歇|自由活动/.test(name)) continue
      jobs.push(slot)
    }
    if (jobs.length >= MAX_TICKETS) break
  }
  let used = 0
  await mapPool(jobs, 6, async (slot) => {
    try {
      if (await fillTicket(slot, { amapKey, tiandituKey, cityHint })) used += 1
    } catch { /* skip */ }
  })
  if (used) {
    mergeSource(trip, {
      name: amapKey ? '高德地图' : '天地图',
      scope: 'POI 门票/营业时间参考，非实时票务',
      realtime: false,
    })
  }
  return trip
}

/**
 * 出页补交通。优先级：高德 Key > 天地图 Key > 本地直线估算（无 Key 也能出距离/打车估价）。
 * opts 可为旧版字符串 amapKey，或 { amapKey, tiandituKey }。
 */
export async function enrichTripTransport(trip, opts) {
  const { amapKey, tiandituKey, localOnly } = mapOpts(opts)
  const days = Array.isArray(trip.days) ? trip.days : []
  const offline = localOnly || (!amapKey && !tiandituKey)
  const jobs = []
  for (const day of days) {
    const slots = (day.slots || []).filter((s) => s && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lng)))
    for (let i = 1; i < slots.length; i += 1) {
      if (jobs.length >= MAX_LEGS) break
      if (routeSettled(slots[i].transport)) continue
      jobs.push({ prev: slots[i - 1], cur: slots[i] })
    }
    if (jobs.length >= MAX_LEGS) break
  }
  const seen = { amap: false, tianditu: false, local: false }
  await mapPool(jobs, offline ? jobs.length || 1 : 6, async ({ prev, cur }) => {
    let leg = null
    try {
      if (!offline && amapKey) leg = await amapLeg(amapKey, prev, cur, trip.persona, trip.title)
      else if (!offline && tiandituKey) leg = await tiandituLeg(tiandituKey, prev, cur, trip.persona)
    } catch { leg = null }
    if (!leg) leg = localLeg(prev, cur, trip.persona)
    cur.transport = leg
    if (leg.provider === 'amap') seen.amap = true
    else if (leg.provider === 'tianditu') seen.tianditu = true
    else seen.local = true
  })
  if (seen.amap) mergeSource(trip, { name: '高德地图', scope: '路线规划（距离/耗时/公交与打车参考价）', realtime: true })
  if (seen.tianditu) mergeSource(trip, { name: '天地图', scope: '路线规划（距离/耗时/公交参考）；打车价为估算', realtime: true })
  if (seen.amap || seen.tianditu) {
    trip.dataSources = (trip.dataSources || []).filter((s) => !s || s.name !== '本地路网估算')
  } else if (seen.local) {
    mergeSource(trip, {
      name: '本地路网估算',
      scope: localOnly
        ? '先按直线距离估算，路网结果随后替换'
        : '无地图 Key：按坐标直线距离估算步行/公交/打车，非实测路网',
      realtime: false,
    })
  }
  return trip
}
