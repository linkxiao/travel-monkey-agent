import { mentionedDays, resolveTargets } from './target.ts'

export type Trip = {
  title: string
  startDate: string
  [key: string]: unknown
}

export type SlotChange = {
  day?: number | string
  slot?: number | string
  kind?: string
  match?: string
  period?: string
  meal?: string
  set?: Record<string, unknown>
}

export type DayRewrite = {
  day?: number | string
  slots?: Array<Record<string, unknown>>
  dining?: Array<Record<string, unknown>>
  craft?: Record<string, unknown>
}

export type Envelope = {
  reply: string
  changes: SlotChange[]
  replaceDays: DayRewrite[]
}

type Day = { date?: string; slots?: Array<Record<string, unknown>>; dining?: Array<Record<string, unknown>>; [key: string]: unknown }

const THEME_NAMES: Record<string, string> = {
  terracotta: '陶土宣纸',
  matcha: '抹茶山房',
  ink: '墨金夜宴',
  coast: '海风蓝瓷',
  rose: '绯樱手帐',
  slate: '青灰石庭',
  sand: '沙金驿馆',
  night: '绀青旅馆',
}

const SET_KEYS = [
  'name', 'time', 'period', 'review', 'lat', 'lng',
  'openingHours', 'closedDays', 'ticketPrice', 'seasonal',
  'needsBooking', 'leadDays', 'transport',
]

function parseJsonish(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  const candidates = [raw.slice(start, end + 1), raw.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1')]
  for (const chunk of candidates) {
    try {
      return JSON.parse(chunk)
    } catch {
      /* try next */
    }
  }
  return null
}

export function extractTrip(text: string): Trip | null {
  const obj = parseJsonish(text) as Trip | null
  if (obj && typeof obj === 'object' && (obj.title || obj.days) && Array.isArray(obj.days)) {
    return obj
  }
  return null
}

function asRewrites(value: unknown): DayRewrite[] {
  if (!Array.isArray(value)) return []
  return value.filter((it) => it && typeof it === 'object' && (it as DayRewrite).day != null && (Array.isArray((it as DayRewrite).slots) || Array.isArray((it as DayRewrite).dining))) as DayRewrite[]
}

export function extractEnvelope(text: string): Envelope | null {
  const obj = parseJsonish(text) as {
    reply?: unknown
    message?: unknown
    changes?: unknown
    edits?: unknown
    days?: unknown
    replaceDays?: unknown
    rewrites?: unknown
    title?: unknown
  } | null
  const replaceDays = asRewrites(obj?.replaceDays || obj?.rewrites)
  if (obj && Array.isArray(obj.days) && obj.title && !obj.changes && !obj.edits && !replaceDays.length) return null
  if (obj && (typeof obj.reply === 'string' || typeof obj.message === 'string' || Array.isArray(obj.changes) || Array.isArray(obj.edits) || replaceDays.length)) {
    const raw = (obj.changes || obj.edits || []) as unknown[]
    return {
      reply: String(obj.reply || obj.message || '').trim(),
      changes: raw.filter((it) => it && typeof it === 'object') as SlotChange[],
      replaceDays,
    }
  }
  const trimmed = text.replace(/```[\s\S]*?```/g, '').trim()
  if (trimmed && !trimmed.includes('{') && !/^\s*</.test(trimmed)) {
    return { reply: trimmed, changes: [], replaceDays: [] }
  }
  return null
}

export function compactTrip(trip: Trip | null) {
  if (!trip) return null
  const copy = JSON.parse(JSON.stringify(trip)) as Trip & {
    ui?: Record<string, unknown>
    days?: Array<{ slots?: Array<Record<string, unknown>>; dining?: Array<Record<string, unknown>> }>
    hotelAreas?: Array<{ options?: Array<Record<string, unknown>> }>
  }
  if (copy.ui) {
    copy.ui = { themeId: copy.ui.themeId }
  }
  ;(copy.days || []).forEach((day) => {
    ;(day.slots || []).forEach((slot) => {
      if (Array.isArray(slot.photos) && slot.photos.length) slot.photo = slot.photo || slot.photos[0]
      delete slot.photos
      delete slot.gallery
    })
    ;(day.dining || []).forEach((meal) => { delete meal.photo })
  })
  ;(copy.hotelAreas || []).forEach((area) => {
    ;(area.options || []).forEach((opt) => {
      delete opt.photos
    })
  })
  return copy
}

export function mentionedDay(text: string) {
  const m = String(text || '').match(/D\s*(\d{1,2})|第\s*(\d{1,2})\s*天|day\s*(\d{1,2})/i)
  if (!m) return null
  const n = parseInt(m[1] || m[2] || m[3], 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

export function digestTrip(trip: Trip | null, opts?: { day?: number | null }) {
  if (!trip) return '（尚无行程）'
  const themeId = String((trip.ui as { themeId?: string } | undefined)?.themeId || '')
  const theme = THEME_NAMES[themeId] || themeId || '未选'
  const days = (trip.days || []) as Day[]
  const persona = String(trip.personaLabel || trip.persona || '未定')
  const only = opts?.day && opts.day >= 1 ? opts.day : null
  const lines = [
    `标题：${trip.title || ''}`,
    `出发：${trip.startDate || ''}`,
    `人格：${persona}（旅居/带队/探秘，不是酒店）`,
    `皮肤：${theme}（只是页面配色名，不是酒店或地点）`,
  ]
  if (only) lines.push(`只改 D${only}，其他天不要动。`)
  days.forEach((day, i) => {
    if (only && i + 1 !== only) return
    lines.push(`D${i + 1} ${day.date || ''}`.trim())
    ;(day.slots || []).forEach((slot, j) => {
      const review = String(slot.review || '').replace(/\s+/g, ' ').slice(0, 48)
      lines.push(`  ${j + 1}[${slot.kind || '?'}/${slot.period || '?'}] ${slot.name || '未命名'}  ${slot.time || ''}${review ? `  ${review}` : ''}`)
    })
    ;(day.dining || []).forEach((meal) => {
      const dishes = Array.isArray(meal.dishes) ? meal.dishes.map((d) => String((d as { name?: string }).name || '')).filter(Boolean).slice(0, 2).join('、') : ''
      lines.push(`  餐[${meal.meal || '?'}] ${meal.place || '未定'}  ${meal.hours || ''}${dishes ? `  ${dishes}` : ''}`)
    })
    const craft = (day.craft || {}) as { load?: Record<string, unknown>; rain?: Record<string, unknown>; park?: Record<string, unknown> }
    const load = craft.load || {}
    const rain = craft.rain || {}
    const park = craft.park || {}
    if (load.level || rain.cut || park.leave) {
      lines.push(`  累[${load.level || '?'}] ${load.walk || ''} ${load.why || ''}`.replace(/\s+/g, ' ').trim())
      lines.push(`  雨砍 ${rain.cut || '未写'}；留 ${rain.keep || '室内/茶歇'}`)
      lines.push(`  车 ${park.leave || '未写'} → ${park.then || '停妥再走'}；取 ${park.pickup || '原停车场'}`)
    }
  })
  return lines.join('\n')
}

export function wantsPhotos(text: string) {
  return /图片|照片|图像|高清|大图|配图|换图|图换|附图|实拍|配.?图|线路图|路线图|缺图|同一张图|没有啊?，?请给出|补充.{0,8}图|补(张|一张|个)?.{0,6}图|没有.{0,16}图|换.{0,8}图|图.{0,4}(换|改|补)|把.{0,24}图|(优化|更新|美化|重配|重新配|调整).{0,12}图/.test(text)
}

function slotNameParts(name: string) {
  return String(name || '').split(/[·・（(\/／|,，+|＋、\s]/).map((s) => s.trim()).filter((s) => s.length >= 2)
}

export function wantsRoutePhotos(text: string) {
  return /线路图|路线图/.test(text) || (/线路/.test(text) && /图|缺|没/.test(text))
}

export function wantsRestPhotos(text: string) {
  return /(午休|茶歇).{0,30}(图|同一|换|对应|都用)/.test(text) || /同一张图/.test(text)
}

export function namesInTrip(text: string, trip: Trip | null) {
  return resolveTargets(text, trip, { photoAsk: wantsPhotos(text) }).names
}

export function wantsSpotPhotos(text: string) {
  return /景点.{0,12}(图|大图|配图|换图)|每日.{0,12}(景点)?(图|大图)|每天.{0,8}(景点)?(图|大图)|各[日天].{0,8}(景点)?(图|大图)/.test(text)
}

export function collectPhotoRequest(text: string, trip: Trip | null) {
  const target = resolveTargets(text, trip, { photoAsk: wantsPhotos(text) })
  const names = [...target.names]
  const kinds: string[] = []
  if (wantsRoutePhotos(text)) kinds.push('route')
  if (wantsSpotPhotos(text) && !names.length) kinds.push('spot')
  if (wantsRestPhotos(text) && trip) {
    for (const day of (trip.days || []) as Day[]) {
      for (const slot of day.slots || []) {
        if (/午休|茶歇|休息|歇脚/.test(String(slot.name || ''))) names.push(String(slot.name || ''))
      }
    }
  }
  const scene = String(target.hint || '').match(/星空|夜观|夜景|银河|观星|日出|日落|云海|雪景|雾凇|晚霞|花海|夕阳|晨雾/g) || []
  return {
    names: [...new Set(names.filter(Boolean))],
    kinds: [...new Set(kinds)],
    hint: [...new Set(scene)].join(' '),
    days: target.days,
    query: explicitPhotoQuery(text),
  }
}

// 用户自己给了检索词就照他说的搜：「去百度搜索「终南山扯袍峪人头山」然后换图」
export function explicitPhotoQuery(text: string): string {
  const t = String(text || '')
  const quoted = t.match(/[「『“"']([^」』”"']{3,30})[」』”"']/)
  if (quoted) {
    const q = quoted[1].trim()
    if (q && !/^(经济|中档|高端|参考)$/.test(q)) return q
  }
  const after = t.match(/(?:搜索|搜一下|搜|查)\s*[:：]?\s*([\u4e00-\u9fffA-Za-z0-9·\s]{3,30})/)
  if (after) {
    return after[1]
      .replace(/(然后|再|并|之后|以后|即可|就行|抓取|替换|更换|换图|配图|图片|照片|的图|更新|优化)[\s\S]*$/, '')
      .replace(/^(百度|抖音|小红书|点评|大众点评|网上|上|去|从)+/g, '')
      .trim()
  }
  return ''
}

export function wantsPageSync(text: string) {
  const t = text.trim()
  if (wantsPhotos(t) && !/同步|更新页面|改到页|落到页/.test(t)) return false
  return /同步|更新页面|刷新页面|改到页|落到页|出到页|请你同步/.test(t)
    || /没(有)?更新|为(什么|啥).{0,12}(没|不)|还是旧的|没有改上来|怎么没改|一直没有|没有反应/.test(t)
    || /按(刚才|上面|你说|确认|你确认|前面|我前面)的/.test(t)
    || /继续(优化|改|做)/.test(t)
}

export function wantsTripEdit(text: string) {
  const t = text.trim()
  // 纯配图请求不走改表；但同时说了改名/新增/删除的混合句要两边都走
  if (wantsPhotos(t) && !/改成|改为|换成|同步|新增|加上|增加|加一个|补一个|删掉|删除/.test(t)) return false
  if (wantsPageSync(t)) return true
  if (/新增|加上|增加|加一个|补一个/.test(t) && /景点|点|祠|墓|寺|馆|廊|铺/.test(t)) return true
  if (/并没有改|没有改动|未改成|你并没有改/.test(t)) return true
  if (/改成|改为|换成|换掉|删掉|删除|加上|补上|调整到|调整为|改一下|改一改|改下|改餐|换餐/.test(t)) return true
  if (/(早|午|晚)餐|(早|午|晚)饭/.test(t) && /改|换|不要/.test(t)) return true
  if (/修改\s*(第\s*\d+|day\s*\d+|行程)/i.test(t)) return true
  if (/改第\s*\d+|把.{0,30}(改成|改为|换成|删|加|改)/.test(t)) return true
  if (/第\s*\d+\s*天.{0,24}改/.test(t)) return true
  if (/day\s*\d+.{0,24}改/i.test(t)) return true
  if (/做到.{0,12}衔接|无缝衔接/.test(t)) return true
  if (/(砍掉|去掉|压缩|优化).{0,16}(段|点|线|天)|D\s*\d+.{0,12}(砍|去|优化|压缩)/i.test(t)) return true
  if (/(太累|减负|轻松一点|少走点|别那么满)/.test(t) && !/累不累/.test(t)) return true
  if (/(雨天|下雨).{0,12}(砍|改|换)(?!什么)/.test(t)) return true
  if (/(停车|取车|车停).{0,12}(改|换)/.test(t)) return true
  if (/改(负荷|雨备|规划条|停车)/.test(t)) return true
  return false
}

export function isBoilerReply(text: string) {
  return /走小红书\/点评\/百度|请明确说改哪一天哪个点|我这边不能实际抓取|不能单独配图|两条线|同步不了|图片配置是|两边不同步/.test(text)
}

// 一个补丁都没落地时，把模型自称"已改好"的句子摘掉，只留它给的信息
export function stripEditClaim(text: string) {
  return String(text || '')
    .split(/(?<=[。！!\n])/)
    .filter((s) => !/(已经|已|都)[^。！!\n]{0,14}(改|换|更新|调整|替换|写入|加上|删)/.test(s) && !/改好了|换好了|更新完了|已完成|搞定/.test(s))
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function stripBoilerReply(text: string) {
  return String(text || '')
    .replace(/如果你其实想改行程[，,]?请明确说改哪一天哪个点。?/g, '')
    .replace(/配图[：:].{0,80}(维基|小红书|Google).{0,40}/g, '')
    .replace(/[^。\n]*两条线[^。\n]*。?/g, '')
    .replace(/[^。\n]*同步不了[^。\n]*。?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function padClock(value: string) {
  const [h, m] = value.split(':')
  return `${String(h).padStart(2, '0')}:${m || '00'}`
}

function parseDiningHint(text: string) {
  const m = String(text || '').match(/早[餐饭·・]?([^、，,；\n]+?)[、，,]\s*午[餐饭·・]?([^、，,；\n]+?)[、，,]\s*晚[餐饭·・]?([^。\n]+)/)
  if (!m) return null
  return [
    { meal: '早餐', place: m[1].trim() },
    { meal: '午餐', place: m[2].trim() },
    { meal: '晚餐', place: m[3].trim() },
  ]
}

export function parseDayRewriteFromText(text: string, fallbackDay?: number | null): DayRewrite | null {
  const raw = String(text || '')
  if (/已写入页面/.test(raw)) return null
  const day = mentionedDay(raw) ?? fallbackDay ?? null
  if (day == null) return null
  const slots: Array<Record<string, unknown> | undefined> = []
  const lineRe = /(?:^|\n)\s*(\d)[.、．)）]?\s*([^\n]+)/g
  let hit: RegExpExecArray | null
  while ((hit = lineRe.exec(raw))) {
    const idx = parseInt(hit[1], 10)
    if (idx < 1 || idx > 6) continue
    let rest = hit[2].trim()
    const timeM = rest.match(/(\d{1,2}:\d{2})(?:\s*[-–~—到至]\s*(\d{1,2}:\d{2}))?/)
    let time = ''
    if (timeM) {
      time = timeM[2] ? `${padClock(timeM[1])}-${padClock(timeM[2])}` : padClock(timeM[1])
      rest = `${rest.slice(0, timeM.index)}${rest.slice((timeM.index || 0) + timeM[0].length)}`.trim()
    }
    let review = ''
    const paren = rest.match(/[（(]([^）)]+)[）)]\s*$/)
    if (paren) {
      review = paren[1].trim()
      rest = rest.slice(0, paren.index).trim()
    }
    rest = rest.replace(/[：:]\s*$/, '').trim()
    if (!rest) continue
    slots[idx - 1] = { name: rest, ...(time ? { time } : {}), ...(review ? { review } : {}) }
  }
  const filled = slots.filter(Boolean)
  if (filled.length < 4) return null
  const dining = parseDiningHint(raw)
  return {
    day,
    slots: [0, 1, 2, 3, 4, 5].map((i) => slots[i] || {}),
    ...(dining ? { dining } : {}),
  }
}

export function inferReplaceDaysFromChat(userText: string, recentTexts: string[]) {
  const day = mentionedDay(userText)
  const fromUser = parseDayRewriteFromText(userText, day)
  if (fromUser) return [fromUser]
  if (!wantsPageSync(userText)) return []
  for (const chunk of recentTexts) {
    const parsed = parseDayRewriteFromText(chunk, day ?? mentionedDay(chunk))
    if (parsed) return [parsed]
  }
  return []
}

export function isEditReceipt(text: string) {
  return /已写入页面|已按刚才确认的安排写入页面|已按你的改动写入页面|点名变了，本机正在按新名字补图/.test(text)
}

function clipName(value: string) {
  return String(value || '')
    .replace(/^[「『“"']+|[」』”"']+$/g, '')
    .split(/[。！？，,\n]|然后|并且/)[0]
    .trim()
    .slice(0, 32)
}

function splitNameTime(value: string) {
  const raw = String(value || '')
  const timeM = raw.match(/(\d{1,2}:\d{2})(?:\s*[-–~—到至]\s*(\d{1,2}:\d{2}))?/)
  const name = clipName(timeM ? `${raw.slice(0, timeM.index)}${raw.slice((timeM.index || 0) + timeM[0].length)}` : raw)
  if (!timeM) return { name, time: '' }
  return { name, time: timeM[2] ? `${padClock(timeM[1])}-${padClock(timeM[2])}` : padClock(timeM[1]) }
}

function periodOf(value: string) {
  if (/早|上午/.test(value)) return 'morning'
  if (/午|下午/.test(value)) return 'noon'
  if (/晚|夜/.test(value)) return 'evening'
  return ''
}

export function inferChangesFromText(text: string): SlotChange[] {
  const t = String(text || '').trim()
  const day = mentionedDay(t)
  if (!day) return []
  if (/(减负|轻松一点|少走点|别那么满|太累)/.test(t) && !/累不累/.test(t)) {
    return [{ day, kind: 'craft', set: { load: { level: '轻', why: '按你的要求减负，少走路。' } } }]
  }
  if (/(改成|改为|调成).{0,6}(偏累|累一点)/.test(t) || (/(偏累|累一点)/.test(t) && /改|调/.test(t))) {
    return [{ day, kind: 'craft', set: { load: { level: '偏累' } } }]
  }
  const rainM = t.match(/(?:雨天|下雨)(?:改|砍|换)\s*[「『“"']?([\u4e00-\u9fffA-Za-z0-9]{2,16})/)
  if (rainM && !/什么|哪儿|哪里/.test(rainM[1])) {
    return [{ day, kind: 'craft', set: { rain: { cut: rainM[1], instead: `雨天砍「${rainM[1]}」。` } } }]
  }
  const parkM = t.match(/(?:停车|车停|取车)(?:改成|改为|换成|换到)\s*[「『“"']?([\u4e00-\u9fffA-Za-z0-9]{2,20})/)
  if (parkM) {
    return [{ day, kind: 'craft', set: { park: { leave: parkM[1] } } }]
  }
  const verb = '改成|改为|换成|换掉|改到|调整为|调整到'
  const slotM = t.match(new RegExp(`第\\s*(\\d+)\\s*格.{0,12}(?:${verb})\\s*(.+)$`))
  if (slotM) {
    const slot = parseInt(slotM[1], 10)
    const { name, time } = splitNameTime(slotM[2])
    if (slot >= 1 && slot <= 6 && name) return [{ day, slot, set: { name, ...(time ? { time } : {}) } }]
  }
  const mealM = t.match(new RegExp(`(早|午|晚)餐.{0,8}(?:${verb})\\s*(.+)$`))
  if (mealM) {
    const place = clipName(mealM[2])
    if (place) return [{ day, meal: `${mealM[1]}餐`, set: { place } }]
  }
  const periodM = t.match(new RegExp(`(早上|上午|中午|下午|傍晚|晚上).{0,8}(?:${verb})\\s*(.+)$`))
  if (periodM) {
    const { name, time } = splitNameTime(periodM[2])
    const period = periodOf(periodM[1])
    if (name && period) return [{ day, period, set: { name, ...(time ? { time } : {}) } }]
  }
  // kind 句式：D1住宿改成X / D2线路换成Y / D3景点改为Z（餐走上面的 mealM，定位更准）
  const kindMap: Record<string, string> = { 住宿: 'stay', 入住: 'stay', 线路: 'route', 路线: 'route', 景点: 'spot' }
  const kindM = t.match(new RegExp(`(住宿|入住|线路|路线|景点).{0,8}(?:${verb})\\s*(.+)$`))
  if (kindM && kindMap[kindM[1]]) {
    const { name, time } = splitNameTime(kindM[2])
    if (name) return [{ day, kind: kindMap[kindM[1]], set: { name, ...(time ? { time } : {}) } }]
  }
  const matchM = t.match(new RegExp(`把(.{1,20}?)(?:${verb})\\s*(.+)$`))
  if (matchM) {
    const match = clipName(matchM[1])
      .replace(/^(?:第\s*\d+\s*天|D\s*\d+|day\s*\d+)\s*/i, '')
      .replace(/^[的之]\s*/, '')
    const { name, time } = splitNameTime(matchM[2])
    if (match && name) return [{ day, match, set: { name, ...(time ? { time } : {}) } }]
  }
  return []
}

export type SpotAdd = { day: number; name: string }

export function inferAddsFromText(text: string): SpotAdd[] {
  const t = String(text || '')
  const fallback = mentionedDay(t)
  const out: SpotAdd[] = []
  const re = /(?:D\s*(\d+)|第\s*(\d+)\s*天)?[^。；;\n]{0,20}(?:新增|加上|增加|加一个|补一个)\s*[「『“"']?([\u4e00-\u9fffA-Za-z0-9]{2,16})[」』”"']?/g
  let hit: RegExpExecArray | null
  while ((hit = re.exec(t))) {
    const day = parseInt(hit[1] || hit[2] || '', 10) || fallback
    const name = clipName(hit[3] || '').replace(/景点$/, '').replace(/点$/, '')
    if (!day || !name || /^(景点|点|行程|图片|大图)$/.test(name)) continue
    if (out.some((a) => a.day === day && a.name === name)) continue
    out.push({ day, name })
  }
  return out
}

// 从任意几段话里推出补丁。模型只口头说"已改"却不给补丁时，用它兜住。
export function inferEditFrom(texts: string[]) {
  const adds: SpotAdd[] = []
  const changes: SlotChange[] = []
  for (const chunk of texts) {
    if (!String(chunk || '').trim()) continue
    inferAddsFromText(chunk).forEach((a) => {
      if (!adds.some((x) => x.day === a.day && x.name === a.name)) adds.push(a)
    })
    inferChangesFromText(chunk).forEach((c) => {
      if (!changes.some((x) => JSON.stringify(x) === JSON.stringify(c))) changes.push(c)
    })
  }
  return { adds, changes }
}

export function inferLocalEdit(userText: string, recentTexts: string[]) {
  const texts = [userText]
  if (wantsPageSync(userText) || /继续(优化|改|做)|一直没有|没有反应/.test(userText)) {
    texts.push(...recentTexts)
  }
  const { adds, changes } = inferEditFrom(texts)
  if (adds.length || changes.length) {
    return { replaceDays: [] as DayRewrite[], changes, adds }
  }
  return { replaceDays: inferReplaceDaysFromChat(userText, recentTexts), changes: [] as SlotChange[], adds: [] as SpotAdd[] }
}

function asIndex(value: unknown) {
  const n = typeof value === 'number' ? value : parseInt(String(value || '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n >= 1 ? n - 1 : -1
}

function findDay(days: Day[], change: SlotChange) {
  const idx = asIndex(change.day)
  if (idx >= 0 && days[idx]) return { day: days[idx], index: idx }
  return null
}

const DINING_KEYS = ['place', 'hours', 'note', 'dishes', 'meal']
const CRAFT_PARTS = ['load', 'rain', 'park'] as const

// 模型经常把要改的值平铺在补丁上、不套 set（{day,slot,name} 而不是 {day,slot,set:{name}}）。
// day/slot/match/kind/meal/period 是定位用的，其余已知字段都当成"要改的值"收下。
const FLAT_VALUE_KEYS = [
  ...SET_KEYS.filter((k) => k !== 'period'),
  ...DINING_KEYS.filter((k) => k !== 'meal'),
  ...CRAFT_PARTS,
  'level', 'cut', 'keep', 'instead', 'leave', 'then', 'pickup',
]

function liftSet(change: SlotChange): Record<string, unknown> | null {
  const direct = change.set && typeof change.set === 'object' ? change.set : null
  if (direct && Object.keys(direct).length) return direct
  const src = change as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of FLAT_VALUE_KEYS) {
    if (src[key] !== undefined) out[key] = src[key]
  }
  return Object.keys(out).length ? out : null
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function mergeCraft(cur: Record<string, unknown>, set: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...cur }
  CRAFT_PARTS.forEach((part) => {
    if (set[part] === undefined) return
    next[part] = { ...asRecord(cur[part]), ...asRecord(set[part]) }
  })
  if (set.level != null) next.load = { ...asRecord(next.load), level: set.level }
  if (set.cut != null || set.keep != null || set.instead != null) {
    next.rain = { ...asRecord(next.rain), ...(set.cut != null ? { cut: set.cut } : {}), ...(set.keep != null ? { keep: set.keep } : {}), ...(set.instead != null ? { instead: set.instead } : {}) }
  }
  if (set.leave != null || set.then != null || set.pickup != null) {
    next.park = { ...asRecord(next.park), ...(set.leave != null ? { leave: set.leave } : {}), ...(set.then != null ? { then: set.then } : {}), ...(set.pickup != null ? { pickup: set.pickup } : {}) }
  }
  return next
}

function mealKey(name: string) {
  const s = String(name || '')
  if (/早/.test(s)) return '早餐'
  if (/晚|夜/.test(s)) return '晚餐'
  if (/午(?!夜)|午餐|午饭/.test(s)) return '午餐'
  return s
}

function findDining(day: Day, change: SlotChange) {
  const dining = day.dining || []
  const want = mealKey(String(change.meal || change.match || ''))
  if (!want) return null
  const hit = dining.findIndex((m) => mealKey(String(m.meal || '')) === want || String(m.meal || '').includes(want))
  if (hit < 0) return null
  return { meal: dining[hit], index: hit }
}

function findSlot(day: Day, change: SlotChange) {
  const slots = day.slots || []
  const idx = asIndex(change.slot)
  if (idx >= 0 && slots[idx]) return { slot: slots[idx], index: idx }
  const match = String(change.match || '').replace(/^[的之]\s*/, '').trim()
  if (match) {
    const hit = slots.findIndex((s) => String(s.name || '').includes(match))
    if (hit >= 0) return { slot: slots[hit], index: hit }
    // 「人头山」对「人头上（人头山）顶」这类：反向包含也算命中
    if (match.length >= 2) {
      const loose = slots.findIndex((s) => {
        const core = String(s.name || '').split(/[（(+＋·・]/)[0].trim()
        return core.length >= 2 && match.includes(core)
      })
      if (loose >= 0) return { slot: slots[loose], index: loose }
    }
  }
  const period = change.period === 'afternoon' ? 'noon' : change.period
  if (change.kind && period) {
    const hit = slots.findIndex((s) => s.kind === change.kind && s.period === period)
    if (hit >= 0) return { slot: slots[hit], index: hit }
  }
  if (period) {
    const hit = slots.findIndex((s) => s.period === period)
    if (hit >= 0) return { slot: slots[hit], index: hit }
  }
  if (change.kind) {
    const hit = slots.findIndex((s) => s.kind === change.kind)
    if (hit >= 0) return { slot: slots[hit], index: hit }
  }
  return null
}

export function applyChanges(trip: Trip, changes: SlotChange[]) {
  const next = JSON.parse(JSON.stringify(trip)) as Trip
  const days = (next.days || []) as Day[]
  const applied: string[] = []
  const failed: string[] = []
  const touched: string[] = []
  let namesChanged = false

  changes.forEach((change, i) => {
    const set = liftSet(change)
    if (!set) {
      failed.push(`第 ${i + 1} 条补丁没写要改成什么`)
      return
    }
    const foundDay = findDay(days, change)
    if (!foundDay) {
      failed.push(`找不到第 ${change.day ?? '?'} 天`)
      return
    }
    if (change.kind === 'craft') {
      const before = foundDay.day.craft && typeof foundDay.day.craft === 'object'
        ? foundDay.day.craft as Record<string, unknown>
        : {}
      const merged = mergeCraft(before, set)
      if (JSON.stringify(before) === JSON.stringify(merged)) {
        failed.push(`D${foundDay.index + 1} 规划条补丁与原文相同`)
        return
      }
      foundDay.day.craft = merged
      applied.push(`D${foundDay.index + 1} 规划条已改`)
      return
    }
    const diningHit = (change.meal || change.kind === 'dining') ? findDining(foundDay.day, change) : null
    if (diningHit) {
      const before = String(diningHit.meal.place || diningHit.meal.meal || '')
      const notes: string[] = []
      DINING_KEYS.forEach((key) => {
        if (set[key] === undefined) return
        const prev = diningHit.meal[key]
        if (JSON.stringify(prev) === JSON.stringify(set[key])) return
        diningHit.meal[key] = set[key]
        if (key === 'place') {
          namesChanged = true
          delete diningHit.meal.photo
          notes.push(`${before || '未定'} → ${set[key]}`)
          touched.push(String(set[key]))
        } else {
          notes.push(`${key} 已改`)
        }
      })
      if (!notes.length) {
        failed.push(`D${foundDay.index + 1}「${before}」餐补丁与原文相同`)
        return
      }
      applied.push(`D${foundDay.index + 1} ${diningHit.meal.meal || '餐'} ${notes.join('；')}`)
      return
    }
    const foundSlot = findSlot(foundDay.day, change)
    if (!foundSlot) {
      failed.push(`D${foundDay.index + 1} 找不到格子 ${change.slot || change.match || change.kind || change.meal || ''}`)
      return
    }
    const before = String(foundSlot.slot.name || '')
    const notes: string[] = []
    SET_KEYS.forEach((key) => {
      if (set[key] === undefined) return
      const value = key === 'period' && set[key] === 'afternoon' ? 'noon' : set[key]
      const prev = foundSlot.slot[key]
      if (JSON.stringify(prev) === JSON.stringify(value)) return
      foundSlot.slot[key] = value
      if (key === 'name') {
        namesChanged = true
        delete foundSlot.slot.photo
        delete foundSlot.slot.photos
        delete foundSlot.slot.gallery
        notes.push(`${before || '未命名'} → ${value}`)
        touched.push(String(value))
      } else {
        notes.push(`${key}：${String(prev ?? '空')} → ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
      }
    })
    if (!notes.length) {
      failed.push(`D${foundDay.index + 1}「${before}」补丁与原文相同`)
      return
    }
    applied.push(`D${foundDay.index + 1} 第${foundSlot.index + 1}格 ${notes.join('；')}`)
  })

  return { trip: next, applied, failed, namesChanged, touched }
}

function alreadyHasName(day: Day, name: string) {
  const want = String(name || '')
  return (day.slots || []).some((s) => {
    const n = String(s.name || '')
    return n === want || slotNameParts(n).includes(want)
  })
}

function pickAddSlot(day: Day) {
  const slots = day.slots || []
  const rest = slots.findIndex((s) => s.kind === 'spot' && /午休|茶歇|休息|歇脚|待定/.test(String(s.name || '')))
  if (rest >= 0) return rest
  const empty = slots.findIndex((s) => s.kind === 'spot' && !String(s.name || '').trim())
  if (empty >= 0) return empty
  return -1
}

export function applyAdds(trip: Trip, adds: SpotAdd[]) {
  const next = JSON.parse(JSON.stringify(trip)) as Trip
  const days = (next.days || []) as Day[]
  const applied: string[] = []
  const failed: string[] = []
  const touched: string[] = []
  let namesChanged = false
  adds.forEach((add) => {
    const found = findDay(days, { day: add.day })
    if (!found) {
      failed.push(`找不到第 ${add.day ?? '?'} 天`)
      return
    }
    const name = clipName(add.name).replace(/景点$/, '')
    if (!name) return
    if (alreadyHasName(found.day, name)) {
      applied.push(`D${found.index + 1} 已有「${name}」`)
      touched.push(name)
      return
    }
    const idx = pickAddSlot(found.day)
    if (idx < 0) {
      const spots = (found.day.slots || [])
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.kind === 'spot')
        .slice(0, 3)
      const opts = spots.map(({ s, i }, n) => `${'ABC'[n]}.第${i + 1}格「${s.name || '未命名'}」`).join(' ')
      failed.push(`D${found.index + 1} 三个景点格已满，替换哪一格才放入「${name}」。\n答案：${opts} D.按你建议 E.先跳过`)
      return
    }
    const target = found.day.slots![idx]
    const before = String(target.name || '未命名')
    target.name = name
    target.review = `与同日其他点不是同一处，单独看。`
    delete target.photo
    delete target.photos
    delete target.gallery
    namesChanged = true
    applied.push(`D${found.index + 1} 第${idx + 1}格 ${before} → ${name}（新增）`)
    touched.push(name)
  })
  return { trip: next, applied, failed, namesChanged, touched }
}

export function applyReplaceDays(trip: Trip, replaceDays: DayRewrite[]) {
  const next = JSON.parse(JSON.stringify(trip)) as Trip
  const days = (next.days || []) as Day[]
  const applied: string[] = []
  const failed: string[] = []
  const touched: string[] = []
  let namesChanged = false
  replaceDays.forEach((block) => {
    const found = findDay(days, { day: block.day })
    if (!found) {
      failed.push(`找不到第 ${block.day ?? '?'} 天`)
      return
    }
    const slots = found.day.slots || []
    const incoming = Array.isArray(block.slots) ? block.slots : []
    incoming.forEach((raw, si) => {
      if (!raw || typeof raw !== 'object') return
      const set = ((raw as { set?: Record<string, unknown> }).set && typeof (raw as { set?: Record<string, unknown> }).set === 'object'
        ? (raw as { set: Record<string, unknown> }).set
        : raw) as Record<string, unknown>
      const target = slots[si]
      if (!target) return
      SET_KEYS.forEach((key) => {
        if (set[key] === undefined) return
        const value = key === 'period' && set[key] === 'afternoon' ? 'noon' : set[key]
        if (key === 'name' && String(target.name || '') !== String(value)) {
          namesChanged = true
          delete target.photo
          delete target.photos
          delete target.gallery
          touched.push(String(value))
        }
        target[key] = value
      })
    })
    if (Array.isArray(block.dining) && block.dining.length) {
      found.day.dining = block.dining.map((meal) => ({ ...meal }))
      block.dining.forEach((meal) => {
        const place = (meal as Record<string, unknown>).place
        if (typeof place === 'string' && place.trim()) touched.push(place.trim())
      })
      namesChanged = true
    }
    if (block.craft && typeof block.craft === 'object') {
      found.day.craft = mergeCraft(asRecord(found.day.craft), asRecord(block.craft))
    }
    applied.push(`D${found.index + 1} 已按新安排写入页面`)
  })
  return { trip: next, applied, failed, namesChanged, touched }
}

// 验货：补丁里写入的新名，渲染后的 HTML 里必须找得到；找不到就是"进了表没上页"，收据不许说已写入。
export function findUnseenInHtml(touched: string[], html: string): string[] {
  const body = String(html || '')
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of touched || []) {
    const t = String(raw || '').trim()
    if (t.length < 2 || seen.has(t)) continue
    seen.add(t)
    if (!body.includes(t)) out.push(t)
  }
  return out
}

export type PhotoSlotOption = { day: number; slot: number; name: string }

// 用户粘来的图要放哪一格：先认「D2第2格」，再认点名（人头山），都没有就把候选列出来问
export function applyPhotoTo(trip: Trip, urls: string[], text: string) {
  const next = JSON.parse(JSON.stringify(trip)) as Trip
  const days = (next.days || []) as Day[]
  const applied: string[] = []
  const pics = urls.filter(Boolean)
  const put = (slot: Record<string, unknown>, url: string, label: string) => {
    slot.photo = url
    slot.photos = [url]
    delete slot.gallery
    applied.push(`${label} 用你给的图`)
  }
  const t = String(text || '')
  const dayNos = mentionedDays(t)
  const dayNo = dayNos[0] ?? mentionedDay(t)

  // 1) 明确到格：「D2第2格」
  const cell = t.match(/第\s*(\d{1,2})\s*格/)
  if (cell && dayNo) {
    const si = parseInt(cell[1], 10)
    const slot = (days[dayNo - 1]?.slots || [])[si - 1]
    if (slot) {
      put(slot, pics[0], `D${dayNo} 第${si}格 ${slot.name || ''}`.trim())
      return { trip: next, applied, ask: '', options: [] as PhotoSlotOption[] }
    }
  }

  // 2) 点名命中：只认真正匹配上的名字，不退化成整天（一张图不能糊满六格）
  const hits = resolveTargets(t, trip, { photoAsk: false }).hits.filter((h) => h.score >= 3)
  if (hits.length) {
    hits.forEach((hit, i) => {
      const url = pics[Math.min(i, pics.length - 1)]
      if (!url) return
      const day = days[hit.day - 1]
      if (!day) return
      if (hit.meal) {
        const meal = (day.dining || []).find((m) => String(m.meal || '') === hit.meal)
        if (meal) {
          meal.photo = url
          applied.push(`D${hit.day} ${hit.meal} ${meal.place || ''} 用你给的图`.replace(/\s+/g, ' '))
        }
        return
      }
      const slot = (day.slots || [])[(hit.slot || 1) - 1]
      if (slot) put(slot, url, `D${hit.day} 第${hit.slot}格 ${slot.name || ''}`.trim())
    })
    if (applied.length) return { trip: next, applied, ask: '', options: [] as PhotoSlotOption[] }
  }

  // 3) 说不清就问，把候选格子按本机问法列出来
  const options: PhotoSlotOption[] = []
  const pool = dayNos.length ? dayNos : (dayNo ? [dayNo] : days.map((_, i) => i + 1))
  for (const dn of pool) {
    const day = days[dn - 1]
    if (!day) continue
    ;(day.slots || []).forEach((slot, si) => {
      const name = String(slot.name || '')
      if (!name || NO_PHOTO_SLOT.test(name)) return
      if (options.length < 5) options.push({ day: dn, slot: si + 1, name })
    })
  }
  const letters = 'ABCDEF'
  const ask = options.length
    ? `这张图放哪一格？\n答案：${options.map((o, i) => `${letters[i]}.D${o.day}第${o.slot}格「${o.name}」`).join(' ')} ${letters[options.length] || 'F'}.先跳过`
    : '先生成行程页，再把图贴给我，我放进对应的格子。'
  return { trip: next, applied, ask, options }
}

const NO_PHOTO_SLOT = /^(午休|茶歇|休息|歇脚|待定|待定景点|返程|未命名|当日线路|当日住宿|当日特色餐饮)/

function nameHitsAny(name: string, needles: string[]) {
  const n = String(name || '')
  if (!n) return false
  const core = n.split(/[（(+＋]/)[0].trim()
  return needles.some((q) => {
    const qq = String(q || '').trim()
    if (qq.length < 2) return false
    return n.includes(qq) || (core.length >= 2 && qq.includes(core))
  })
}

// 逐格对比换图结果：哪几格真换上了、哪几格在范围内却仍然没图。
// 前端据此说真话，不再笼统地报「已补…的图」。
export function photoOutcome(
  before: Trip | null,
  after: Trip | null,
  req: { names?: string[]; kinds?: string[]; days?: number[] },
) {
  const names = req.names || []
  const kinds = req.kinds || []
  const days = req.days || []
  const changed: string[] = []
  const missing: string[] = []
  const photoOf = (slot: Record<string, unknown> | undefined) => {
    if (!slot) return ''
    const one = slot.photo
    if (typeof one === 'string' && one) return one
    const list = slot.photos
    return Array.isArray(list) && typeof list[0] === 'string' ? list[0] : ''
  }
  const beforeDays = ((before || {}) as { days?: Day[] }).days || []
  const afterDays = ((after || {}) as { days?: Day[] }).days || []
  afterDays.forEach((day, di) => {
    const dayNo = di + 1
    if (days.length && !days.includes(dayNo)) return
    ;(day.slots || []).forEach((slot, si) => {
      const name = String(slot.name || '')
      if (!name || NO_PHOTO_SLOT.test(name)) return
      const inScope = names.length
        ? nameHitsAny(name, names)
        : kinds.length
          ? kinds.includes(String(slot.kind || ''))
          : days.length > 0
      if (!inScope) return
      const now = photoOf(slot)
      const was = photoOf((beforeDays[di]?.slots || [])[si])
      if (now && now !== was) changed.push(name)
      else if (!now) missing.push(name)
    })
  })
  return { changed: [...new Set(changed)], missing: [...new Set(missing)] }
}

// 全页配图 URL 快照：换图前后对比，URL 集合没变就是"图没换成"，不许说已补。
export function collectPhotos(trip: Trip | null): string[] {
  const urls: string[] = []
  const push = (v: unknown) => { if (typeof v === 'string' && v) urls.push(v) }
  const days = ((trip || {}) as { days?: Day[] }).days || []
  days.forEach((d) => {
    (d.slots || []).forEach((s) => {
      push(s.photo)
      if (Array.isArray(s.photos)) s.photos.forEach(push)
    })
    ;(d.dining || []).forEach((m) => { push(m.photo) })
  })
  const areas = ((trip || {}) as { hotelAreas?: Array<{ options?: Array<Record<string, unknown>> }> }).hotelAreas || []
  areas.forEach((a) => (a.options || []).forEach((o) => {
    push(o.photo)
    if (Array.isArray(o.photos)) (o.photos as unknown[]).forEach(push)
  }))
  return [...new Set(urls)].sort()
}
