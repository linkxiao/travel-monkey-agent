import fs from 'node:fs'
import { parseOpenText } from './hours.mjs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const mapJs = require(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'mold', 'travel-plan-viz', 'assets', 'map.js'))

const DEST_CITIES = [
  '深圳', '大鹏', '较场尾', '盐田', '南山', '福田', '宝安', '龙岗', '东莞', '惠州', '珠海', '广州', '中山',
  '汕头', '潮州', '西安', '陕西', '礼泉', '咸阳', '汉中', '成都', '剑阁', '广元',
  '京都', '奈良', '大阪', '东京', '杭州', '苏州', '北京', '上海',
  '四川', '甘肃', '敦煌', '青海', '厦门', '青岛', '大理', '丽江', '桂林',
  '武汉', '长沙', '重庆', '南京', '天津', '昆明', '三亚', '海口', '安康',
  '甘南', '康定', '白玉', '稻城', '理塘', '香格里拉', '拉萨',
]

const OVERSEAS_DEST = new Set(['京都', '奈良', '大阪', '东京'])

const DEST_STOP = /^(规划|人格|旅居|带队|探秘|大纲|行程|旅行|旅游|假期|中秋|国庆|春节|元旦|推荐|亲子|周边|附近|一带|不知道|请给|给我|先选|输出|系统|用户)$/

function stripResearchMeta(query) {
  return String(query || '')
    .replace(/规划人格[：:][^\n]*/g, ' ')
    .replace(/按此人格写大纲。?/g, ' ')
}

export function guessDest(query) {
  const text = stripResearchMeta(query).replace(/\s+/g, '')
  const around = text.match(/([\u4e00-\u9fff]{2,8}?)(?:周边|附近|一带|郊外)/)
  if (around?.[1] && !DEST_STOP.test(around[1])) {
    return DEST_CITIES.find((c) => around[1].includes(c)) || around[1]
  }
  const found = DEST_CITIES
    .filter((c) => text.includes(c))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b) || b.length - a.length)
  if (found[0]) return found[0]
  const go = text.match(/(?:去|到|在|玩|游)([\u4e00-\u9fff]{2,6})/)
  if (go?.[1] && !DEST_STOP.test(go[1])) {
    return DEST_CITIES.find((c) => go[1].includes(c) || c.includes(go[1])) || go[1]
  }
  return ''
}

function geoMatchesDest(first, dest) {
  if (!dest || !first) return false
  const blob = [first.formatted_address, first.province, first.city, first.district, first.township].join('')
  const city = String(first.city || '').replace(/市$/, '')
  return blob.includes(dest) || (city && (dest.includes(city) || city.includes(dest)))
}

function otherDestCities(dest) {
  return DEST_CITIES.filter((c) => c !== dest && !dest.includes(c) && !c.includes(dest))
}

const PROVINCE_WORDS = new Set(['四川', '甘肃', '陕西', '青海', '云南', '西藏'])

function blobInDest(blob, dest) {
  const text = String(blob || '')
  if (!dest) return false
  if (text.includes(dest)) return true
  if (otherDestCities(dest).some((c) => text.includes(c))) return false
  return false
}

function poiInDest(p, dest) {
  return blobInDest([p.name, p.address, p.cityname, p.adname, p.pname].join(''), dest)
}

function hotelInDest(p, dest) {
  if (!dest || !p || !p.name) return false
  const blob = [p.name, p.address, p.cityname, p.adname, p.pname].join('')
  if (blob.includes(dest)) return true
  if (otherDestCities(dest).some((c) => !PROVINCE_WORDS.has(c) && blob.includes(c))) return false
  return true
}

function hotelsFromPacks(dest, cheapHotels, midHotels, highHotels) {
  const hotelsByTier = { 经济: [], 中档: [], 高端: [] }
  const seen = new Set()
  ;[
    ['经济', cheapHotels],
    ['中档', midHotels],
    ['高端', highHotels],
  ].forEach(([tier, pack]) => {
    for (const p of (pack && pack.pois) || []) {
      if (!p.name || seen.has(p.name) || !hotelInDest(p, dest)) continue
      seen.add(p.name)
      let wgs = null
      if (p.location) {
        const [lng, lat] = String(p.location).split(',')
        wgs = toWgs(lat, lng)
      }
      hotelsByTier[tier].push({
        name: p.name,
        lat: wgs && wgs.lat,
        lng: wgs && wgs.lng,
        address: p.address || '',
        tier,
        cost: p.biz_ext && p.biz_ext.cost,
      })
    }
  })
  return hotelsByTier
}

export async function fetchHotelsByDest(dest, amapKey) {
  const empty = { 经济: [], 中档: [], 高端: [] }
  if (!amapKey || !dest || OVERSEAS_DEST.has(dest)) return empty
  try {
    let geo = await amap('geocode/geo', { key: amapKey, address: dest, city: dest })
    let first = geo.geocodes && geo.geocodes[0]
    if (first && !geoMatchesDest(first, dest)) {
      geo = await amap('geocode/geo', { key: amapKey, address: `${dest}市` })
      first = geo.geocodes && geo.geocodes[0]
    }
    if (first && !geoMatchesDest(first, dest)) first = null
    const city = (first && (first.city || first.adcode)) || dest
    const [cheapHotels, midHotels, highHotels] = await Promise.all([
      amap('place/text', { key: amapKey, keywords: dest + ' 经济型酒店', city, offset: 4, extensions: 'all' }),
      amap('place/text', { key: amapKey, keywords: dest + ' 酒店', city, offset: 4, extensions: 'all' }),
      amap('place/text', { key: amapKey, keywords: dest + ' 豪华酒店', city, offset: 4, extensions: 'all' }),
    ])
    return hotelsFromPacks(dest, cheapHotels, midHotels, highHotels)
  } catch {
    return empty
  }
}

async function amap(pathName, params) {
  const url = new URL(`https://restapi.amap.com/v3/${pathName}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  })
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  return res.json()
}

function toWgs(lat, lng) {
  const nlat = Number(lat)
  const nlng = Number(lng)
  if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) return null
  return mapJs.gcj02ToWgs84(nlat, nlng)
}

async function searchWeb(query, { searchKey, searchProvider }) {
  if (!searchKey) return []
  if (searchProvider === 'serper') {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': searchKey },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return (data.organic || []).slice(0, 5).map((x) => ({ title: x.title, snippet: x.snippet, url: x.link }))
  }
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: searchKey, query, max_results: 5, search_depth: 'basic' }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json()
  return (data.results || []).slice(0, 5).map((x) => ({ title: x.title, snippet: x.content, url: x.url }))
}

function wgs84ToGcj02(lat, lng) {
  const wgs = mapJs.gcj02ToWgs84(lat, lng)
  return { lat: lat * 2 - wgs.lat, lng: lng * 2 - wgs.lng }
}

async function walkLeg(amapKey, a, b) {
  const from = wgs84ToGcj02(a.lat, a.lng)
  const to = wgs84ToGcj02(b.lat, b.lng)
  const data = await amap('direction/walking', {
    key: amapKey,
    origin: `${from.lng},${from.lat}`,
    destination: `${to.lng},${to.lat}`,
  })
  const path = data.route && data.route.paths && data.route.paths[0]
  if (!path) return ''
  const min = Math.max(1, Math.round(Number(path.duration || 0) / 60))
  return `${a.name}→${b.name} 步行约 ${min} 分钟`
}

export function routeLibraryLine(query, dest) {
  const arr = (x) => (Array.isArray(x) ? x : (x ? [x] : []))
  try {
    const lib = JSON.parse(fs.readFileSync(new URL('./routes.json', import.meta.url), 'utf8'))
    const blob = String(query || '').replace(/\s+/g, '') + String(dest || '')
    // L3 地名线优先：薄数据高风险线的实测走法
    const hit = (lib.routes || []).find((r) => (r.锚 || []).some((a) => a && blob.includes(a)))
    if (hit) {
      const score = hit.分 || {}
      const stars = [score.代表性 ? `代表性${score.代表性}星` : '', score.难度 ? `难度${score.难度}星` : ''].filter(Boolean).join('·')
      const src = [hit.来源 ? `来源${hit.来源}` : '', hit.更新 ? `更新${hit.更新}` : ''].filter(Boolean).join('，')
      const clocks = arr(hit.时刻).map((item) => {
        const bits = [item.点, item.开放, item.闭馆 ? `闭馆${item.闭馆}` : '', item.演出 ? `演出${item.演出}` : '', item.置信].filter(Boolean)
        return bits.join(' ')
      }).filter(Boolean)
      const when = clocks.length ? `时刻：${clocks.join('；')}。` : ''
      return `线路库「${hit.线}」：必看${arr(hit.必看).join('、')}（不要漏）；可砍${arr(hit.可砍).join('、')}（只二选一地砍）；${hit.耗时}；${hit.补给}。${stars}${src ? `。${src}` : ''}。${when}`
    }
    // L2 模式线兜底：按地形/主题命中，非本线实测
    const pat = (lib.patterns || []).find((p) => (p.命中 || []).some((w) => w && blob.includes(w)))
    if (!pat) return ''
    return `模式参考「${pat.线}」（非本线实测，按通用走法排，实地以官方信息为准）：必看${arr(pat.必看).join('、')}；可砍${arr(pat.可砍).join('、')}；${pat.耗时}；${pat.补给}。`
  } catch { return '' }
}

export async function researchQuery({ query, amapKey, searchKey, searchProvider }) {
  const dest = guessDest(query)
  const sources = []
  const places = []
  const hotelsPoi = []
  const legs = []
  let weather = ''
  let flights = []
  let hotels = []
  let local = []

  if (amapKey && dest) {
    try {
      let geo = await amap('geocode/geo', { key: amapKey, address: dest, city: dest })
      let first = geo.geocodes && geo.geocodes[0]
      if (first && !geoMatchesDest(first, dest)) {
        geo = await amap('geocode/geo', { key: amapKey, address: `${dest}市` })
        first = geo.geocodes && geo.geocodes[0]
      }
      if (first && !geoMatchesDest(first, dest)) first = null
      if (OVERSEAS_DEST.has(dest) && !first) {
        sources.push({ name: '高德地图', scope: '境外点不套国内店，已跳过', realtime: false })
      } else if (first || !OVERSEAS_DEST.has(dest)) {
      const city = (first && (first.city || first.adcode)) || dest
      if (first && first.location) {
        const [lng, lat] = String(first.location).split(',')
        const wgs = toWgs(lat, lng)
        if (wgs) places.push({ name: dest + '（城市中心）', lat: wgs.lat, lng: wgs.lng, from: '高德地理编码' })
      }
      const [poi, cheapHotels, midHotels, highHotels] = await Promise.all([
        amap('place/text', { key: amapKey, keywords: dest + ' 景点', city, offset: 6, extensions: 'all' }),
        amap('place/text', { key: amapKey, keywords: dest + ' 经济型酒店', city, offset: 4, extensions: 'all' }),
        amap('place/text', { key: amapKey, keywords: dest + ' 酒店', city, offset: 4, extensions: 'all' }),
        amap('place/text', { key: amapKey, keywords: dest + ' 豪华酒店', city, offset: 4, extensions: 'all' }),
      ])
      const hotelsByDest = hotelsFromPacks(dest, cheapHotels, midHotels, highHotels)
      hotelsPoi.push(...['经济', '中档', '高端'].flatMap((tier) => hotelsByDest[tier]))
      for (const p of poi.pois || []) {
        if (!p.location || !poiInDest(p, dest)) continue
        const [lng, lat] = String(p.location).split(',')
        const wgs = toWgs(lat, lng)
        if (!wgs) continue
        const hours = parseOpenText(p.biz_ext?.opentime || p.biz_ext?.open_time || '')
        places.push({
          name: p.name,
          lat: wgs.lat,
          lng: wgs.lng,
          address: p.address || '',
          from: '高德 POI',
          open: hours?.open || '',
          closedWeekdays: hours?.closedWeekdays || [],
        })
      }
      if (first && first.adcode) {
        const w = await amap('weather/weatherInfo', { key: amapKey, city: first.adcode, extensions: 'base' })
        const live = w.lives && w.lives[0]
        if (live && blobInDest(`${live.city} ${live.province || ''}`, dest)) {
          weather = `${live.city} ${live.weather} ${live.temperature}°C ${live.winddirection}风`
        }
      }
      const spots = places.filter((p) => p.from === '高德 POI').slice(0, 4)
      for (let i = 1; i < spots.length; i += 1) {
        try {
          const line = await walkLeg(amapKey, spots[i - 1], spots[i])
          if (line) legs.push(line)
        } catch {
          /* skip */
        }
      }
      sources.push({ name: '高德地图', scope: '地理编码 / POI / 天气 / 路线', realtime: true })
      }
    } catch {
      sources.push({ name: '高德地图', scope: '调用失败，已跳过', realtime: false })
    }
  }

  if (searchKey && dest) {
    try {
      const [flightHits, hotelHits, localHits] = await Promise.all([
        searchWeb(`${dest} 机票 航班 飞猪 时刻`, { searchKey, searchProvider }),
        searchWeb(`${dest} 酒店 飞猪 片区 推荐`, { searchKey, searchProvider }),
        searchWeb(`${dest} 当季 活动 必吃`, { searchKey, searchProvider }),
      ])
      const keepHit = (h) => {
        const blob = `${h.title || ''} ${h.snippet || ''}`
        if (otherDestCities(dest).some((c) => blob.includes(c))) return false
        return blob.includes(dest)
      }
      flights = flightHits.filter(keepHit)
      hotels = hotelHits.filter(keepHit)
      local = localHits.filter(keepHit)
      sources.push({ name: '联网搜索', scope: '航班/酒店/时令公开信息（含飞猪等页面摘要，参考，不能代订）', realtime: true })
    } catch {
      sources.push({ name: '联网搜索', scope: '调用失败，已跳过', realtime: false })
    }
  }

  const lines = [
    dest ? `目的地：${dest}` : '目的地未点名，不要按陌生城市调研。',
    routeLibraryLine(query, dest),
    weather ? `天气：${weather}` : '',
    places.length ? `坐标（已转 WGS-84）：` + places.slice(0, 8).map((p) => `${p.name} ${p.lat.toFixed(4)},${p.lng.toFixed(4)}${p.address ? `（${p.address}）` : ''}`).join('；') : dest ? '无高德 Key：坐标请用已知公开资料并标待核实。' : '',
    hotelsPoi.length ? `酒店三档（参考，不能代订）：`
      + ['经济', '中档', '高端'].map((tier) => {
        const names = hotelsPoi.filter((h) => h.tier === tier).slice(0, 2).map((h) => h.name)
        return names.length ? `${tier} ${names.join('、')}` : ''
      }).filter(Boolean).join(' / ') : '',
    legs.length ? `点到点：` + legs.join('；') : '',
    places.some((p) => p.open || (p.closedWeekdays || []).length)
      ? `开放时间（高德，任何地点同一套：不要排在窗口外，闭馆日不要排）：` + places.filter((p) => p.open || (p.closedWeekdays || []).length).slice(0, 8).map((p) => {
        const days = (p.closedWeekdays || []).map((d) => '日一二三四五六'[d] || '').filter(Boolean)
        return `${p.name} ${[p.open, days.length ? `周${days.join('、')}闭馆` : ''].filter(Boolean).join(' ')}`
      }).join('；')
      : '',
    flights.length ? `航班线索：` + flights.slice(0, 3).map((f) => f.title).join(' / ') : '',
    hotels.length ? `酒店线索：` + hotels.slice(0, 3).map((h) => h.title).join(' / ') : '',
    local.length ? `时令/必吃：` + local.slice(0, 3).map((h) => h.title).join(' / ') : '',
    `来源：${sources.map((s) => s.name).join('、') || '无（仅模型记忆）'}。飞猪不能代订。`,
  ].filter(Boolean)

  const hotelsByTier = { 经济: [], 中档: [], 高端: [] }
  hotelsPoi.forEach((h) => {
    const tier = hotelsByTier[h.tier] ? h.tier : '中档'
    hotelsByTier[tier].push(h)
  })

  return {
    dest,
    sources,
    places: places.slice(0, 10),
    openHours: places.filter((p) => p.open || (p.closedWeekdays || []).length).slice(0, 8).map((p) => ({
      name: p.name,
      open: p.open || '',
      closedWeekdays: p.closedWeekdays || [],
    })),
    weather,
    hotelsByTier,
    brief: lines.join('\n').slice(0, 2000),
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

export async function handleResearch(req, res) {
  try {
    const body = await readJsonBody(req)
    const out = await researchQuery(body)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(out))
  } catch (err) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: err.message || String(err) }))
  }
}
