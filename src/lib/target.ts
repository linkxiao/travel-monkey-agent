import type { Trip } from './trip'

function mentionedDay(text: string) {
  const m = String(text || '').match(/D\s*(\d{1,2})|第\s*(\d{1,2})\s*天|day\s*(\d{1,2})/i)
  if (!m) return null
  const n = parseInt(m[1] || m[2] || m[3], 10)
  return Number.isFinite(n) && n >= 1 ? n : null
}

// 一句里点了几天就全认：「day1、day2 的景点图」「D1和D3」「第2、3天」
export function mentionedDays(text: string): number[] {
  const t = String(text || '')
  const out: number[] = []
  const push = (raw: string) => {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 1 && n <= 60 && !out.includes(n)) out.push(n)
  }
  // 「第N」必须带「天」，否则「第5格」会被当成第5天
  for (const m of t.matchAll(/(?:D|day)\s*(\d{1,2})((?:\s*[、,，和跟及\-~—至]\s*(?:D|day)?\s*\d{1,2})*)/gi)) {
    push(m[1])
    for (const tail of (m[2] || '').matchAll(/\d{1,2}/g)) push(tail[0])
  }
  for (const m of t.matchAll(/第\s*(\d{1,2})((?:\s*[、,，和跟及\-~—至]\s*\d{1,2})*)\s*天/g)) {
    push(m[1])
    for (const tail of (m[2] || '').matchAll(/\d{1,2}/g)) push(tail[0])
  }
  return out.sort((a, b) => a - b)
}

// Trip 带索引签名，Trip['days'] 推不出元素类型，照 trip.ts 的写法直接声明
type Day = { date?: string; slots?: Array<Record<string, unknown>>; dining?: Array<Record<string, unknown>>; [key: string]: unknown }

const ASK_STOP = /^(的|了|吗|呢|请|帮|我|你|一下|这个|那个|为啥|为什么|没有|补充|高清|大图|配图|换图|附图|实拍|照片|图片|行程|当天|格子|还是|或者|修改|每日|每天|景点|内容|对号|入座)$/
const SCENE = /星空|夜观|夜景|银河|观星|日出|日落|云海|雪景|雾凇|晚霞|花海/

export type TripHit = {
  day: number
  slot?: number
  meal?: string
  name: string
  kind: string
  score: number
}

export type TripTarget = {
  day: number | null
  days: number[]
  hits: TripHit[]
  names: string[]
  hint: string
}

export function nameTokens(text: string): string[] {
  const raw = String(text || '')
  // 括号里多半是通称（「人头上（人头山）顶」），用户点名时用的就是它，得当成别名收下
  const alias = [...raw.matchAll(/[（(]([^）)]*)[）)]/g)].map((m) => m[1])
  const outer = raw.replace(/[（(][^）)]*[）)]/g, ' ')
  const parts = [outer, ...alias].join(' ').split(/[·・／/,，+|＋、\s]/).map((s) => s.trim()).filter((s) => s.length >= 2)
  return [...new Set(parts)].filter((t) => t.length >= 2 && !ASK_STOP.test(t))
}

export function scoreName(ask: string, name: string): number {
  const askStr = String(ask || '')
  const core = String(name || '').split(/[（(+＋]/)[0].trim()
  if (core.length >= 3 && askStr.includes(core)) return 8
  if (core.length >= 2 && askStr.includes(core)) return 5
  let score = 0
  if (core.length >= 3) {
    for (let len = Math.min(4, core.length); len >= 3; len -= 1) {
      for (let i = 0; i <= core.length - len; i += 1) {
        const chunk = core.slice(i, i + len)
        if (!ASK_STOP.test(chunk) && askStr.includes(chunk)) {
          score = Math.max(score, len >= 4 ? 5 : 3)
        }
      }
    }
  }
  for (const t of nameTokens(name)) {
    if (t.length >= 3 && askStr.includes(t)) score = Math.max(score, 3)
  }
  if (SCENE.test(askStr) && SCENE.test(name)) score = Math.max(score, 3)
  return score
}

function leftoverHint(text: string, names: string[]): string {
  let t = String(text || '')
    .replace(/D\s*\d+|第\s*\d+\s*天|day\s*\d+/gi, ' ')
    .replace(/为(什么|啥)|没有|请补充|请|帮我|一下|高清图|高清|大图|图片|照片|配图|换图|附图|补充|格子|还是|或者|修改|每日|每天|景点|行程|内容|对号|入座|换成|更清楚|清楚些|把|换了|改了/g, ' ')
  for (const name of names) {
    for (const tok of nameTokens(name)) t = t.split(tok).join(' ')
    const core = String(name || '').split(/[（(+＋]/)[0].trim()
    if (core) t = t.split(core).join(' ')
  }
  t = t.replace(/[^\u4e00-\u9fffA-Za-z0-9\s]/g, ' ').replace(/\s+/g, ' ').replace(/^(的|了|不对)\s*|\s*(的|了|不对)$/g, ' ').trim()
  return t.length >= 2 ? t : ''
}

// Trip 带索引签名，days 取出来是 unknown，统一在这里收口
const daysOf = (trip: Trip | null | undefined): Day[] => ((trip || {}) as { days?: Day[] }).days || []

export function resolveTargets(text: string, trip: Trip | null, opts?: { photoAsk?: boolean }): TripTarget {
  const days = mentionedDays(text)
  const day = days[0] ?? mentionedDay(text)
  const hits: TripHit[] = []
  ;daysOf(trip).forEach((d, i) => {
    ;(d.slots || []).forEach((slot, j) => {
      const name = String(slot.name || '')
      const score = scoreName(text, name)
      if (score > 0) hits.push({ day: i + 1, slot: j + 1, name, kind: String(slot.kind || 'spot'), score })
    })
    for (const meal of d.dining || []) {
      const name = String(meal.place || '')
      const score = scoreName(text, name)
      if (score > 0) hits.push({ day: i + 1, meal: String(meal.meal || ''), name, kind: 'dining', score })
    }
  })
  hits.sort((a, b) => b.score - a.score)
  const scoped = days.length ? hits.filter((h) => days.includes(h.day)) : (day ? hits.filter((h) => h.day === day) : hits)
  const pool = scoped.length ? scoped : hits
  const best = pool[0]?.score || 0
  let picked = pool.filter((h) => h.score >= 3 && h.score >= best - 1)

  // 说了天但没点名具体格子（「day1、day2 的景点图不对」）：点到的每一天都收，缺图的优先
  if (!picked.length && opts?.photoAsk) {
    const wanted = days.length ? days : (day ? [day] : [])
    const spotOnly = /景点/.test(String(text || ''))
    for (const dn of wanted) {
      const d = daysOf(trip)[dn - 1]
      if (!d) continue
      const all = (d.slots || []).map((slot, j) => ({ slot, j })).filter(({ slot }) => !spotOnly || slot.kind === 'spot')
      const empty = all.filter(({ slot }) => slot.kind !== 'depart' && !slot.photo && !(Array.isArray(slot.photos) && slot.photos[0]))
      const dayPool = empty.length ? empty : all.filter(({ slot }) => spotOnly || slot.kind === 'spot')
      picked.push(...dayPool.map(({ slot, j }) => ({
        day: dn,
        slot: j + 1,
        name: String(slot.name || ''),
        kind: String(slot.kind || 'spot'),
        score: 1,
      })))
    }
  }

  const names = [...new Set(picked.map((h) => h.name).filter(Boolean))]
  return { day, days, hits: picked, names, hint: leftoverHint(text, names) }
}
