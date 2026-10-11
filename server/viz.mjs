import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const vizRoot = path.resolve(__dirname, '..', 'vendor', 'mold')
const MOLD_FILE = path.join(vizRoot, 'scripts', 'gen-shudao-html.js')
const MOLD_DEPS = [MOLD_FILE, ...['map.js', 'reminders.js'].map((f) => path.join(vizRoot, 'travel-plan-viz', 'assets', f))]
const { validateTrip, validateAll } = require(path.join(vizRoot, 'travel-plan-viz', 'assets', 'validate.js'))

// require 缓存跟进程走，dev 服务重启不清；模具文件改了就重新加载
let moldStamp = ''
let moldRender = null
function renderTrip(trip) {
  const stamp = MOLD_DEPS.map((f) => {
    try { return fs.statSync(f).mtimeMs } catch { return 0 }
  }).join('|')
  if (!moldRender || stamp !== moldStamp) {
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(vizRoot + path.sep)) delete require.cache[key]
    }
    moldRender = require(MOLD_FILE).renderTrip
    moldStamp = stamp
  }
  return moldRender(trip)
}
import { enrichTripPhotos } from './photos.mjs'
import { applyThemeToTrip } from './themes.mjs'
import { enrichTripTransport } from './transport.mjs'
import { fetchHotelsByDest, guessDest } from './research.mjs'
import { detectPersona, normalizePersona, personaLabel, personaTip } from './persona.mjs'
import { ensureDayCraft } from './craft.mjs'
import { qualityChecklist } from './quality.mjs'

const SEED_JSON = path.join(vizRoot, 'scripts', 'shudao-trip-zhongqiu.json')

const DEFAULT_DISCLAIMER =
  '本页全部信息（天气、航班、高铁、酒店、餐厅、景点、门票、价格、营业时间、评分、活动等）均为 AI 基于公开资料整理的参考建议，可能不准确或已过时，不保证与实时情况一致；请务必在官方渠道核实后再出发。'

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function toNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

function coerceReminder(it) {
  if (typeof it === 'string' && it.trim()) return { item: it.trim(), leadDays: 7 }
  if (!it || typeof it !== 'object') return null
  const item = it.item || it.name || it.text || it.title
  const raw = it.leadDays ?? it.days ?? it.ahead
  const leadDays = toNumber(raw, NaN)
  if (!item || !Number.isFinite(leadDays)) return null
  return { item: String(item), leadDays }
}

function weekdayOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!m) return ''
  return WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const TRANSPORT_TIP = '市内以地铁 / 打车为主；热门时段预留排队与堵车时间。'

const SPARE_REMINDERS = [
  { item: '确认往返交通与住宿订单', leadDays: 14, key: /交通|车票|机票|高铁|住宿|酒店|民宿/ },
  { item: '热门景点预约门票', leadDays: 7, key: /门票|预约|购票/ },
  { item: '下载离线地图并保存订单截图', leadDays: 3, key: /离线|地图|截图/ },
  { item: '查看目的地天气与交通管制', leadDays: 2, key: /天气|管制|预警/ },
  { item: '检查身份证件、充电宝与常用药', leadDays: 1, key: /证件|身份证|充电|药/ },
]

function evenReminders(list) {
  if (list.length % 2 === 0) return list
  const said = list.map((r) => r.item).join('\n')
  const spare = SPARE_REMINDERS.find((r) => !r.key.test(said))
  if (spare) return [...list, { item: spare.item, leadDays: spare.leadDays }]
  return list.length > 1 ? list.slice(0, -1) : [...list, { item: SPARE_REMINDERS[4].item, leadDays: 1 }]
}

const BRIEF_MAX = 20
const PLACEHOLDER_THEME = /^(第\s*\d+\s*天|d\s*\d+|day\s*\d+)$/i
const FILLER_SPOT = /^(午休|茶歇|休息|自由活动|待定)/

function clipText(text, max) {
  const chars = [...text]
  return chars.length <= max ? text : chars.slice(0, max - 1).join('') + '…'
}

// 日标题右侧一句话：优先用当天主题，主题只是「第N天」时用景点名拼
export function dayBrief(day) {
  const theme = String(day.theme || '').trim()
  if (theme && !PLACEHOLDER_THEME.test(theme) && [...theme].length >= 4) return clipText(theme, BRIEF_MAX)
  const spots = (day.slots || [])
    .filter((s) => s && s.kind === 'spot' && s.name && !FILLER_SPOT.test(s.name))
    .map((s) => String(s.name).trim())
  let line = ''
  for (const name of spots) {
    const next = line ? `${line}·${name}` : name
    if ([...next].length > BRIEF_MAX) break
    line = next
  }
  if (!line && spots[0]) line = clipText(spots[0], BRIEF_MAX)
  return line || clipText(theme, BRIEF_MAX)
}

function normalizePreTrip(raw) {
  if (typeof raw === 'string' && raw.trim()) {
    return {
      weather: { summary: '出发前关注当地天气。', typhoon: '以官方预警为准。' },
      transport: TRANSPORT_TIP,
      packing: raw.trim(),
      payment: '微信 / 支付宝；小店备少量现金。',
      apps: ['高德地图', '航旅纵横'],
      ticketTip: '热门票提前在官方渠道预约。',
    }
  }
  const pre = asObject(raw)
  if (typeof pre.weather === 'string') {
    pre.weather = { summary: pre.weather, typhoon: '以官方预警为准。' }
  } else if (!pre.weather || typeof pre.weather !== 'object') {
    pre.weather = { summary: '出发前关注当地天气。', typhoon: '以官方预警为准。' }
  }
  pre.weather.summary = pre.weather.summary || '出发前关注当地天气。'
  pre.weather.typhoon = pre.weather.typhoon || '以官方预警为准。'
  pre.transport = typeof pre.transport === 'string' && pre.transport ? pre.transport : TRANSPORT_TIP
  pre.packing = typeof pre.packing === 'string' && pre.packing ? pre.packing : '舒适鞋 + 外套，按季节增减。'
  pre.payment = typeof pre.payment === 'string' && pre.payment ? pre.payment : '微信 / 支付宝；小店备少量现金。'
  pre.apps = Array.isArray(pre.apps) && pre.apps.length ? pre.apps.map(String) : ['高德地图', '航旅纵横']
  pre.ticketTip = typeof pre.ticketTip === 'string' && pre.ticketTip ? pre.ticketTip : '热门票提前在官方渠道预约。'
  return pre
}

function slotOfKind(day, kind) {
  return (day.slots || []).find((s) => s.kind === kind)
}

const MEAL_HOURS = { 早餐: '07:30–09:00', 午餐: '11:30–13:00', 晚餐: '18:00–20:00' }
const MEAL_PLACES = { 早餐: '住宿店内或就近清淡早餐', 午餐: '景点附近午餐', 晚餐: '当日晚餐' }

function mealKey(name) {
  const s = String(name || '')
  if (/早/.test(s)) return '早餐'
  if (/晚|夜/.test(s)) return '晚餐'
  if (/午(?!夜)|午餐|午饭/.test(s)) return '午餐'
  return ''
}

function asDishes(list) {
  const rows = Array.isArray(list) ? list : []
  const dishes = rows.filter((d) => d && (d.name || d.title)).map((d) => ({
    name: String(d.name || d.title || ''),
    price: String(d.price || '参考'),
  }))
  return dishes.length ? dishes : [{ name: '时令家常（参考）', price: '参考' }]
}

function guessSoft(place, dishes, note) {
  const blob = [place, (dishes || []).map((d) => d.name).join('、'), note].join(' ')
  const hard = /辣|麻辣|烧烤|火锅|干锅|香锅|串串|卤味|生腌|芥末|重油/.test(blob)
  const soft = /粥|粉|面|馄饨|蒸|炖|汤|豆腐|清淡|好消化|偏软|素食/.test(blob)
  if (hard && !soft) return '偏辣硬'
  if (soft && !hard) return '偏软'
  return ''
}

function ensureDayDining(day) {
  const raw = Array.isArray(day.dining) ? day.dining : []
  const by = { 早餐: null, 午餐: null, 晚餐: null }
  const extras = []
  raw.forEach((item) => {
    if (!item || typeof item !== 'object') return
    const key = mealKey(item.meal)
    if (key && !by[key]) by[key] = item
    else extras.push(item)
  })
  const food = slotOfKind(day, 'food')
  const stay = slotOfKind(day, 'stay')
  const dinnerFromFood = food && food.name && food.name !== '当日特色餐饮' && food.name !== '待定' ? food.name : ''
  const required = ['早餐', '午餐', '晚餐'].map((meal) => {
    const cur = by[meal] || {}
    let place = String(cur.place || '').trim()
    if (!place && meal === '晚餐') place = dinnerFromFood
    const stayName = stay && stay.name ? String(stay.name).trim() : ''
    const stayUsable = stayName && !/待定|当日住宿|住宿（参考）|住宿\(参考\)|回市|市区|住店|^住宿$/.test(stayName)
    if ((!place || /住宿店内|就近清淡/.test(place)) && meal === '早餐' && stayUsable) {
      place = stayName
    }
    if (!place) place = MEAL_PLACES[meal]
    const dishes = asDishes(cur.dishes)
    const note = String(cur.note || '').trim()
    const soft = String(cur.soft || '').trim() || guessSoft(place, dishes, note)
    return {
      meal,
      place,
      hours: String(cur.hours || '').trim() || MEAL_HOURS[meal],
      note,
      soft,
      dishes,
      photo: cur.photo || '',
    }
  })
  const kept = extras.map((item) => ({
    meal: String(item.meal || '加餐'),
    place: String(item.place || '').trim() || '就近小食',
    hours: String(item.hours || '').trim() || '',
    note: String(item.note || '').trim(),
    soft: String(item.soft || '').trim() || guessSoft(item.place, item.dishes, item.note),
    dishes: asDishes(item.dishes),
    photo: item.photo || '',
  }))
  day.dining = required.concat(kept)
  if (food && (!food.name || food.name === '当日特色餐饮' || food.name === '待定')) {
    food.name = required[2].place
    food.review = food.review || required[2].note || '与当日晚餐对齐。'
  }
}

const HOTEL_TIERS = ['经济', '中档', '高端']
const HOTEL_PRICE = {
  经济: '约 ¥150–350/晚（参考）',
  中档: '约 ¥350–800/晚（参考）',
  高端: '约 ¥800–1600/晚（参考）',
}

function hotelTierOf(opt) {
  const t = String((opt && (opt.tier || opt.name)) || '')
  if (/高|豪华|奢|度假|五星/.test(t)) return '高端'
  if (/经|快捷|如家|7天|汉庭|锦江之星|青旅/.test(t)) return '经济'
  return '中档'
}

function takeHotelHint(list, used) {
  for (const item of list || []) {
    const name = typeof item === 'string' ? item : item && item.name
    if (!name || used.has(name) || /参考$|同片区|待定/.test(name)) continue
    used.add(name)
    return typeof item === 'string' ? { name } : item
  }
  return null
}

function isLodgingName(name) {
  return /酒店|饭店|宾馆|民宿|客栈|旅馆|度假|公寓|民居|如家|汉庭|7天|七天|锦江|全季|亚朵|希尔顿|万豪|喜来登|洲际|假日|宜必思|速8|格林|莫泰|维也纳|桔子|和颐|凯宾斯基|香格里拉|诺富特|inn|hotel|ryokan|町屋/i.test(String(name || ''))
}

function hasHotelHints(hints) {
  return Boolean(hints && HOTEL_TIERS.some((tier) => (hints[tier] || []).length))
}

function tripHasRealHotels(trip) {
  return (trip.hotelAreas || []).some((area) => (area.options || []).some((opt) => opt && !isFakeHotelName(opt.name)))
}

function isFakeHotelName(name) {
  const n = String(name || '').trim()
  if (!n) return true
  if (/参考$|同片区|待定住宿/.test(n)) return true
  return !isLodgingName(n)
}

function isCopiedSpotArea(area, trip) {
  const a = String(area || '').trim()
  if (!a) return true
  if (isLodgingName(a) || /县城|镇上|市区|街区|片区|就近住/.test(a)) return false
  for (const day of trip.days || []) {
    for (const slot of day.slots || []) {
      const n = String(slot.name || '').split(/[（(+＋]/)[0].trim()
      if (!n) continue
      if (slot.kind === 'stay' && isLodgingName(n)) continue
      if (a === n || a.includes(n) || n.includes(a)) return true
    }
  }
  return false
}

function stayFitTip(persona) {
  if (persona === 'stay') return '旅居：优先电梯/一层/坐便，出发前电话核实。'
  if (persona === 'guide') return '带队：以集合点/停车方便为准，大车先问能不能停。'
  if (persona === 'trek') return '探秘：走完再住，近出山/主干道一侧。'
  return ''
}

function stayAccessNote(persona) {
  if (persona === 'stay') return '适老：电梯/低楼层/坐便（订房时确认）'
  if (persona === 'guide') return '集合：集合点/大车停车（订房时确认）'
  if (persona === 'trek') return '出山：近出山/主干道一侧（以实际路况为准）'
  return '入住：位置与房型（订房时确认）'
}

function ensureStayAccess(trip) {
  const note = stayAccessNote(trip.persona)
  ;(trip.hotelAreas || []).forEach((area) => {
    ;(area.options || []).forEach((opt) => {
      if (opt && !opt.access) opt.access = { note, status: '待核实' }
    })
  })
}

function mergeStayAreas(trip) {
  // 同片区（前两字相同）多个 area 合并为一个：连住只列一处，三档各取第一家
  const groups = new Map()
  ;(trip.hotelAreas || []).forEach((area) => {
    const key = String(area.area || '').slice(0, 2)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(area)
  })
  const merged = []
  for (const [, list] of groups) {
    if (list.length === 1) { merged.push(list[0]); continue }
    const by = {}
    const reasons = []
    list.forEach((area) => {
      if (area.reason && !reasons.includes(area.reason)) reasons.push(area.reason)
      ;(area.options || []).forEach((opt) => {
        if (opt && opt.tier && !by[opt.tier]) by[opt.tier] = opt
      })
    })
    merged.push({
      area: list[0].area,
      reason: reasons.join(''),
      options: HOTEL_TIERS.map((tier) => by[tier]).filter(Boolean),
    })
  }
  trip.hotelAreas = merged.filter((area) => (area.options || []).length)
}

function markStayNights(trip) {
  const stays = (trip.days || []).map((d) => String(((d.slots || []).find((s) => s.kind === 'stay') || {}).name || ''))
  // 只统计“连续”同片区（前两字相同），避免跳镇也被标连住
  const runs = []
  let cur = { key: '', len: 0 }
  stays.forEach((n) => {
    const key = n ? n.slice(0, 2) : ''
    if (key && key === cur.key) cur.len += 1
    else {
      if (cur.key) runs.push({ ...cur })
      cur = { key, len: key ? 1 : 0 }
    }
  })
  if (cur.key) runs.push({ ...cur })
  ;(trip.hotelAreas || []).forEach((area) => {
    const key = String(area.area || '').slice(0, 2)
    if (!key) return
    const best = runs.filter((r) => r.key === key).reduce((m, r) => Math.max(m, r.len), 0)
    if (best >= 2 && !/连住/.test(area.reason || '')) {
      area.reason = `${area.reason || ''}连住${best}晚，少换房。`.trim()
    }
    if (trip.persona === 'stay' && !/电梯|低楼层/.test(area.reason || '')) {
      area.reason = `${area.reason || ''}（订房时确认电梯/低楼层）。`.trim()
    }
  })
}

function ensureBudget(trip) {
  const nights = (trip.days || []).filter((d) => (d.slots || []).some((s) => s.kind === 'stay')).length || (trip.days || []).length
  const mid = { 经济: 250, 中档: 550, 高端: 1200 }
  trip.budget = {
    nights,
    note: '按整程住宿晚数×三档中间价估算，仅作预算信封参考。',
    tiers: HOTEL_TIERS.map((tier) => ({ tier, total: `约 ¥${mid[tier] * nights}（${nights}晚参考）` })),
  }
  return trip.budget
}

function destLabel(trip) {
  const blob = [trip.title, ...(trip.days || []).map((d) => d.theme)].join(' ')
  const hit = blob.match(/[\u4e00-\u9fff]{2,4}/)
  return (hit && hit[0]) || '行程'
}

function optionFromHint(tier, hint) {
  return {
    tier,
    name: hint.name,
    priceRange: hint.cost ? `参考 ${hint.cost}` : HOTEL_PRICE[tier],
    note: hint.address ? `${hint.address}。参考，不能代订。` : `位置出发前核实，不能代订。`,
    lat: hint.lat,
    lng: hint.lng,
  }
}

function ensureHotelTiers(trip) {
  const hints = trip.hotelHints && typeof trip.hotelHints === 'object' ? trip.hotelHints : {}
  const used = new Set()
  const allFake = !(trip.hotelAreas || []).some((area) => (area.options || []).some((opt) => !isFakeHotelName(opt.name)))
  if (allFake && HOTEL_TIERS.some((tier) => (hints[tier] || []).length)) {
    trip.hotelAreas = [{
      area: `${destLabel(trip)}就近住宿`,
      reason: '按当日行程就近入住。三档是不同店的参考，不能代订。',
      options: [],
    }]
  }
  ;(trip.hotelAreas || []).forEach((area) => {
    if (isCopiedSpotArea(area.area, trip)) {
      area.area = `${destLabel(trip)}就近住宿`
      area.reason = area.reason || '按当日行程就近入住。'
    }
    const by = { 经济: null, 中档: null, 高端: null }
    ;(area.options || []).forEach((opt) => {
      if (isFakeHotelName(opt.name)) return
      const tier = hotelTierOf(opt)
      opt.tier = tier
      if (!by[tier]) {
        by[tier] = opt
        used.add(opt.name)
      }
    })
    HOTEL_TIERS.forEach((tier) => {
      if (by[tier] && !isFakeHotelName(by[tier].name)) return
      const hint = takeHotelHint(hints[tier], used)
      by[tier] = hint ? optionFromHint(tier, hint) : null
    })
    area.options = HOTEL_TIERS.map((tier) => by[tier]).filter(Boolean)
  })
  trip.hotelAreas = (trip.hotelAreas || []).filter((area) => (area.options || []).length)
}

function applyPersona(trip) {
  const id = normalizePersona(trip.persona) || detectPersona([trip.persona, trip.title, trip.ui && trip.ui.overviewLead].filter(Boolean).join('\n'))
  if (!id) return
  trip.persona = id
  trip.personaLabel = personaLabel(id)
  const tip = personaTip(id)
  if (tip && !trip.tips.some((t) => String(t).includes(personaLabel(id)))) {
    trip.tips = [tip, ...trip.tips]
  }
}

function nameHint(slot) {
  const n = String((slot && slot.name) || '')
  if (/机场|返程|登机|飞回|高铁回/.test(n)) return 'depart'
  if (/酒店|旅馆|民宿|町屋|入住|客栈|ryokan|hotel|inn/i.test(n)) return 'stay'
  if (/餐|料理|寿司|拉面|咖啡|居酒屋|食堂|烧鸟|茶寮|cafe|restaurant/i.test(n)) return 'food'
  if (/线路|步行|巴士|地铁|自驾|前往|交通|一日游/.test(n)) return 'route'
  return ''
}

function inferKind(slot) {
  const kind = slot && slot.kind
  if (kind === 'route' || kind === 'spot' || kind === 'stay' || kind === 'food' || kind === 'depart') return kind
  return nameHint(slot) || 'spot'
}

function cityFallback(trip) {
  const coords = []
  for (const day of trip.days || []) {
    for (const slot of day.slots || []) {
      const lat = toNumber(slot.lat, NaN)
      const lng = toNumber(slot.lng, NaN)
      if (Number.isFinite(lat) && Number.isFinite(lng)) coords.push({ lat, lng })
    }
  }
  if (coords.length) return coords[Math.floor(coords.length / 2)]
  const title = String(trip.title || '')
  if (/京都|kyoto/i.test(title)) return { lat: 35.0116, lng: 135.7681 }
  if (/大阪|osaka/i.test(title)) return { lat: 34.6937, lng: 135.5023 }
  if (/东京|tokyo/i.test(title)) return { lat: 35.6762, lng: 139.6503 }
  return { lat: 34.26, lng: 108.95 }
}

function makeSlot(kind, name, fallback) {
  return {
    kind,
    name,
    time: kind === 'route' ? '08:30–10:00' : kind === 'food' ? '18:00–20:00' : kind === 'stay' || kind === 'depart' ? '21:00' : '10:00–12:00',
    period: kind === 'route' ? 'morning' : kind === 'food' || kind === 'stay' || kind === 'depart' ? 'evening' : 'noon',
    lat: fallback.lat,
    lng: fallback.lng,
    review: kind === 'route' ? '当日主线路，细节待核实。' : '待核实',
  }
}

function ensureDaySlots(day, isLast, fallback) {
  const items = (Array.isArray(day.slots) ? day.slots : []).filter((s) => s && typeof s === 'object')
  items.forEach((s) => { s.kind = inferKind(s) })
  const used = new Set()
  const pick = (kind, count) => {
    const out = []
    for (const s of items) {
      if (out.length >= count) break
      if (used.has(s) || s.kind !== kind) continue
      used.add(s)
      out.push(s)
    }
    return out
  }
  const steal = (want) => {
    const hinted = items.find((it) => !used.has(it) && nameHint(it) === want)
    if (hinted) {
      used.add(hinted)
      return hinted
    }
    const neutral = items.find((it) => !used.has(it) && !nameHint(it))
    if (neutral) {
      used.add(neutral)
      return neutral
    }
    const s = items.find((it) => !used.has(it))
    if (s) used.add(s)
    return s
  }
  const fill = (list, kind, count, placeholder) => {
    while (list.length < count) {
      const extra = steal(kind)
      if (extra) {
        extra.kind = kind
        list.push(extra)
      } else {
        list.push(makeSlot(kind, placeholder, fallback))
      }
    }
    list.forEach((s) => { s.kind = kind })
    return list.slice(0, count)
  }

  const route = fill(pick('route', 1), 'route', 1, day.theme ? `${day.theme} 线路` : '当日线路')
  const spots = fill(pick('spot', 3), 'spot', 3, '待定景点')
  const preferDepart = isLast && items.some((s) => s.kind === 'depart')
  const stayKind = preferDepart ? 'depart' : 'stay'
  const staySeed = preferDepart ? [...pick('depart', 1), ...pick('stay', 1)] : [...pick('stay', 1), ...pick('depart', 1)]
  const stay = fill(staySeed.slice(0, 1), stayKind, 1, stayKind === 'depart' ? '返程' : '当日住宿')
  const food = fill(pick('food', 1), 'food', 1, '当日特色餐饮')

  const ordered = [route[0], spots[0], spots[1], spots[2], stay[0], food[0]]
  const periods = ['morning', 'morning', 'noon', 'noon', 'evening', 'evening']
  ordered.forEach((slot, i) => {
    slot.lat = toNumber(slot.lat, fallback.lat)
    slot.lng = toNumber(slot.lng, fallback.lng)
    slot.name = slot.name || '待定'
    slot.time = slot.time || ''
    slot.period = slot.period || periods[i]
    slot.review = slot.review || ''
    if (typeof slot.transport === 'string') {
      slot.transport = { mode: slot.transport, fare: '', duration: '' }
    } else if (slot.transport && typeof slot.transport === 'object') {
      slot.transport.mode = slot.transport.mode || ''
      slot.transport.fare = slot.transport.fare || ''
      slot.transport.duration = slot.transport.duration || ''
    }
    if (slot.needsBooking && typeof slot.leadDays !== 'number') slot.leadDays = toNumber(slot.leadDays, 7)
  })
  day.slots = ordered
}

function normalizeTrip(trip) {
  if (!trip || typeof trip !== 'object') throw new Error('trip 不是对象')
  const out = JSON.parse(JSON.stringify(trip))
  out.title = out.title || '未命名行程'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(out.startDate || '')) || Number.isNaN(Date.parse(`${out.startDate}T00:00:00Z`))) {
    out.startDate = new Date().toISOString().slice(0, 10)
  }
  out.disclaimer = out.disclaimer && String(out.disclaimer).length >= 20 ? out.disclaimer : DEFAULT_DISCLAIMER
  out.tips = Array.isArray(out.tips) ? out.tips.filter(Boolean).map(String) : []
  if (!out.tips.length) {
    out.tips = ['热门餐厅避开午晚高峰。', '门票与开放时间出发前在官方渠道核实。', '坐标为参考，导航以实地路牌为准。']
  }
  out.hotelAreas = Array.isArray(out.hotelAreas) ? out.hotelAreas : []
  out.flights = asObject(out.flights)
  out.flights.booked = Array.isArray(out.flights.booked) ? out.flights.booked : []
  out.flights.candidates = Array.isArray(out.flights.candidates) ? out.flights.candidates : []
  out.preTrip = normalizePreTrip(out.preTrip)
  out.ui = asObject(out.ui)
  out.days = Array.isArray(out.days) ? out.days.filter((d) => d && typeof d === 'object') : []
  const fallback = cityFallback(out)
  out.days.forEach((day, di) => {
    const base = new Date(out.startDate + 'T00:00:00Z')
    base.setUTCDate(base.getUTCDate() + di)
    day.date = /^\d{4}-\d{2}-\d{2}$/.test(day.date || '') ? day.date : base.toISOString().slice(0, 10)
    day.weekday = day.weekday || weekdayOf(day.date)
    day.theme = day.theme || `第 ${di + 1} 天`
    ensureDaySlots(day, di === out.days.length - 1 && out.days.length > 1, fallback)
    ensureDayDining(day)
  })
  out.days.forEach((day) => { day.brief = dayBrief(day) })
  applyPersona(out)
  out.days.forEach((day) => ensureDayCraft(day, out.persona))
  if (out.persona === 'stay') {
    out.days.forEach((day) => {
      ;(day.dining || []).forEach((m) => {
        if (m.soft === '偏辣硬' && !/软|清淡/.test(m.note || '')) {
          m.note = `${m.note || ''}旅居建议换软和的，可问店家做清淡。`.trim()
        }
      })
    })
  }

  out.reminders = (Array.isArray(out.reminders) ? out.reminders : []).map(coerceReminder).filter(Boolean)
  if (!out.reminders.length) {
    const booked = out.days.flatMap((d) => (d.slots || []).filter((s) => s.needsBooking && s.name))
    out.reminders = booked.length
      ? booked.slice(0, 6).map((s) => ({ item: s.name, leadDays: toNumber(s.leadDays, 7) }))
      : [
          { item: '确认往返交通与住宿', leadDays: 14 },
          { item: '热门景点预约门票', leadDays: 7 },
          { item: '出发前看天气与交通管制', leadDays: 3 },
        ]
  }
  out.reminders = evenReminders(out.reminders)

  out.hotelAreas = out.hotelAreas.filter((area) => area && (area.area || area.name))
  out.hotelAreas.forEach((area) => {
    area.area = area.area || area.name || '住宿片区'
    area.reason = area.reason || ''
    area.options = Array.isArray(area.options) ? area.options : []
    area.options.forEach((opt) => {
      opt.tier = opt.tier || '中档'
      opt.name = opt.name || '待定住宿'
      opt.priceRange = opt.priceRange || '参考价，出发前核实'
      opt.note = opt.note || ''
    })
  })
  if (!out.hotelAreas.length) {
    const stays = out.days
      .map((d) => slotOfKind(d, 'stay'))
      .filter((s) => s && s.name && s.name !== '待定' && isLodgingName(s.name))
    const seen = new Set()
    stays.forEach((s) => {
      if (seen.has(s.name)) return
      seen.add(s.name)
      out.hotelAreas.push({
        area: s.name,
        reason: s.review || '按当日行程就近入住。',
        options: [{ tier: '中档', name: s.name, priceRange: s.ticketPrice || '参考价，出发前核实', note: s.review || '' }],
      })
    })
  }
  ensureHotelTiers(out)
  mergeStayAreas(out)
  ensureStayAccess(out)
  markStayNights(out)
  const fit = stayFitTip(out.persona)
  if (fit && !out.tips.some((t) => String(t).includes('电梯') || String(t).includes('集合点') || String(t).includes('走完再住'))) {
    out.tips = [...out.tips, fit]
  }
  ensureBudget(out)
  delete out.hotelHints

  // 总览每次从 days 全量重建：首轮后 overview 已进 trip state，
  // 若只建不刷，改某天格子后顶部卡片永远显示旧名（"改了但页面没变"）。
  // load/rain/park 也都可从 craft 导出，无需保留旧值。
  out.overview = out.days.map((d, i) => {
    const spots = (d.slots || []).filter((s) => s.kind === 'spot').map((s) => s.name).join(' / ')
    const route = slotOfKind(d, 'route')
    const stay = slotOfKind(d, 'stay') || slotOfKind(d, 'depart')
    const food = slotOfKind(d, 'food')
    const craft = d.craft || {}
    return {
      day: i + 1,
      date: d.date,
      route: (route && route.name) || d.theme,
      spots,
      stay: (stay && stay.name) || '',
      food: (food && food.name) || '',
      distance: d.distance || '',
      load: (craft.load && craft.load.level) || '',
      rain: (craft.rain && craft.rain.cut) || '',
      park: (craft.park && craft.park.leave) || '',
    }
  })
  out.ui = out.ui || {}
  if (!out.ui.overviewLead) out.ui.overviewLead = `${out.title}：按日看线路、景点、住宿与餐饮。`
  if (!out.ui.heroSub) out.ui.heroSub = out.disclaimer.slice(0, 42)
  return out
}

const SEED_DIR = path.resolve(__dirname, '..', 'seed', 'trips')

// 示例行程都放在 seed/trips/，按文件名排序；目录空了才退回模具自带的那份
function seedFiles() {
  const files = fs.existsSync(SEED_DIR)
    ? fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json')).sort()
      .map((f) => ({ id: f.replace(/\.json$/, ''), file: path.join(SEED_DIR, f) }))
    : []
  return files.length ? files : [{ id: '01', file: SEED_JSON }]
}

export function listSeedTrips() {
  return seedFiles().map(({ id, file }) => {
    try {
      return { id, title: String(JSON.parse(fs.readFileSync(file, 'utf8')).title || id) }
    } catch {
      return null
    }
  }).filter(Boolean)
}

// 把当前行程存成示例；同名行程覆盖原文件，否则按顺序新编号
export function saveSeedTrip(raw) {
  const trip = raw && typeof raw === 'object' ? JSON.parse(JSON.stringify(raw)) : null
  if (!trip || !trip.title || !Array.isArray(trip.days) || !trip.days.length) throw new Error('当前没有完整行程')
  if (trip.ui && typeof trip.ui === 'object') delete trip.ui.themeCss
  fs.mkdirSync(SEED_DIR, { recursive: true })
  const same = fs.readdirSync(SEED_DIR).length ? listSeedTrips().find((s) => s.title === trip.title) : null
  const top = Math.max(0, ...seedFiles().map((s) => Number(s.id) || 0))
  const id = same ? same.id : String(top + 1).padStart(2, '0')
  fs.writeFileSync(path.join(SEED_DIR, `${id}.json`), JSON.stringify(trip, null, 2) + '\n')
  return { id, title: trip.title, order: listSeedTrips().findIndex((s) => s.id === id) + 1 }
}

export async function handleSeedSave(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    const body = await readJsonBody(req)
    res.end(JSON.stringify(saveSeedTrip(body.trip)))
  } catch (err) {
    res.statusCode = 400
    res.end(JSON.stringify({ error: err.message || String(err) }))
  }
}

export function loadSeedTrip(id) {
  const files = seedFiles()
  const hit = files.find((s) => s.id === id) || files[0]
  return JSON.parse(fs.readFileSync(hit.file, 'utf8'))
}

export async function runSkillPage(raw, opts = {}) {
  const draft = raw && typeof raw === 'object' ? raw : {}
  if (!hasHotelHints(draft.hotelHints) && !tripHasRealHotels(draft) && opts.amapKey) {
    const dest = guessDest([draft.title, ...(draft.days || []).map((d) => d.theme)].filter(Boolean).join(' '))
    draft.hotelHints = await fetchHotelsByDest(dest, opts.amapKey)
  }
  const trip = normalizeTrip(draft)
  applyThemeToTrip(trip, {
    keepId: opts.keepThemeId,
    forceId: opts.themeId,
    fallback: !!opts.fallback,
  })
  if (!opts.skipPhotos) {
    await enrichTripPhotos(trip, {
      replacePhotos: !!opts.replacePhotos,
      photoNames: opts.photoNames,
      photoKinds: opts.photoKinds,
      photoHint: opts.photoHint,
      photoDays: opts.photoDays,
      photoQuery: opts.photoQuery,
      searchKey: opts.searchKey,
      searchProvider: opts.searchProvider,
      amapKey: opts.amapKey,
    })
  }
  if (!opts.skipTransport) await enrichTripTransport(trip, opts.amapKey)
  let html = renderTrip(trip)
  let report = validateAll(html)
  let usedFallback = !!opts.fallback
  if ((report.errors || []).length && !opts.fallback) {
    applyThemeToTrip(trip, { fallback: true })
    html = renderTrip(trip)
    report = validateAll(html)
    usedFallback = true
  }
  return {
    html,
    trip,
    errors: report.errors || [],
    warnings: report.warnings || [],
    quality: qualityChecklist(trip),
    themeId: trip.ui && trip.ui.themeId,
    themeName: trip.ui && trip.ui.themeName,
    fallback: usedFallback,
  }
}

export async function handleRender(req, res) {
  try {
    const body = await readJsonBody(req)
    const out = await runSkillPage(body.trip || body, {
      themeId: body.themeId,
      keepThemeId: body.keepThemeId,
      fallback: body.fallback,
      skipPhotos: !!body.skipPhotos,
      skipTransport: !!body.skipTransport,
      replacePhotos: !!body.replacePhotos,
      photoNames: body.photoNames,
      photoKinds: body.photoKinds,
      photoHint: body.photoHint,
      photoDays: body.photoDays,
      photoQuery: body.photoQuery,
      amapKey: body.amapKey,
      searchKey: body.searchKey,
      searchProvider: body.searchProvider,
    })
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(out))
  } catch (err) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: err.message || String(err) }))
  }
}

export async function handleValidate(req, res) {
  try {
    const body = await readJsonBody(req)
    const report = body.html
      ? validateAll(body.html)
      : validateTrip(normalizeTrip(body.trip || body))
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(report))
  } catch (err) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: err.message || String(err) }))
  }
}

export { normalizeTrip }
