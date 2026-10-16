// 每轮先判断：还是不是同一个任务。目的地或人数变了就是新任务，不带历史；其余都是同一任务。
import type { ChatMessage } from './chat'
import { looksLikeQuestion, mentionedDay, parseJsonish, wantsPhotos } from './trip.ts'

export type Action = 'edit' | 'ask' | 'photos' | 'replan'
export type Scope = { places: string[]; people: number | null }
export type Turn = { task: Scope; now: Scope; action: Action; prefs: string[]; source: 'model' | 'local' }

type TripLike = {
  title?: unknown
  startDate?: unknown
  days?: Array<{ slots?: Array<{ name?: unknown }>; dining?: Array<{ place?: unknown }> }>
  hotelAreas?: Array<{ area?: unknown; options?: Array<{ name?: unknown }> }>
}

const ACTIONS: Action[] = ['edit', 'ask', 'photos', 'replan']
const DIGITS: Record<string, number> = { 一: 1, 二: 2, 两: 2, 俩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
const NUM = '[\\d一二两俩三四五六七八九十]{1,3}'
const MAX_PREFS = 6

function toNum(raw: string): number | null {
  if (/^\d+$/.test(raw)) return Number(raw)
  if (raw.length === 1) return DIGITS[raw] ?? null
  const m = raw.match(/^([一二三四五六七八九])?十([一二三四五六七八九])?$/)
  if (m) return (m[1] ? DIGITS[m[1]] : 1) * 10 + (m[2] ? DIGITS[m[2]] : 0)
  return null
}

export function countPeople(text: string): number | null {
  const t = String(text || '')
  const mix = t.match(new RegExp(`(${NUM})\\s*大\\s*(${NUM})\\s*小`))
  if (mix) {
    const a = toNum(mix[1])
    const b = toNum(mix[2])
    return a != null && b != null ? a + b : null
  }
  const m = t.match(new RegExp(`(${NUM})\\s*(?:口|个人|人(?![均民])|位)`))
  return m ? toNum(m[1]) : null
}

export function statedDays(text: string): number | null {
  const m = String(text || '').match(new RegExp(`(?<![第前后这那每])(${NUM})\\s*(?:天|日游)`))
  return m ? toNum(m[1]) : null
}

// 指着现有行程的某一天、某一格说话，一定是在改这一趟
export function pointsAtTrip(text: string) {
  return mentionedDay(text) != null || /第\s*[\d一二三四五六七八九十]+\s*格|这一?[天格]/.test(text)
}

const normPlace = (p: string) => String(p || '').replace(/[\s「」『』“”"'《》（）()·.,，。、]/g, '')

function placeSet(list: string[]) {
  return [...new Set(list.map(normPlace).filter(Boolean))].sort()
}

export function samePlaces(a: string[], b: string[]) {
  const x = placeSet(a)
  const y = placeSet(b)
  return x.length === y.length && x.every((p, i) => p === y[i])
}

// 目的地按名称逐个比，「深圳」和「较场尾」、「莲花山」和「较场尾」都算不同；没说或认不出就不算变
export function isNewTask(turn: Pick<Turn, 'task' | 'now'>, text: string) {
  if (pointsAtTrip(text)) return false
  const { task, now } = turn
  if (placeSet(now.places).length && placeSet(task.places).length && !samePlaces(now.places, task.places)) return true
  return now.people != null && task.people != null && now.people !== task.people
}

export function tripHead(trip: TripLike | null, planDraft = ''): string {
  if (trip) {
    const days = trip.days || []
    const lines = [`当前行程：${String(trip.title || '未命名')}，${days.length} 天，出发 ${String(trip.startDate || '未定')}`]
    days.forEach((day, i) => {
      const names = (day.slots || []).slice(0, 4).map((s) => String(s.name || '')).filter(Boolean)
      lines.push(`D${i + 1} ${names.join(' / ')}`)
    })
    return lines.join('\n')
  }
  const draft = planDraft.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8)
  return draft.length ? `当前大纲（还没出页）：\n${draft.join('\n')}` : '还没有行程'
}

export function buildRouteMessages(opts: { opening: string; head: string; said: string[]; text: string }): ChatMessage[] {
  return [{
    role: 'user',
    content: [
      `任务开头那句：${opts.opening || '（无）'}`,
      opts.head,
      opts.said.length ? '本趟用户之前说过的话：\n- ' + opts.said.join('\n- ') : '本趟用户之前说过的话：无',
      `用户这句：${opts.text}`,
    ].join('\n\n'),
  }]
}

function localAction(text: string, tripDays: number | null): Action {
  // 配图优先于「为什么/怎么」问句：否则「为什么没有图片了」会被误判成 ask，永远换不了图
  if (wantsPhotos(text)) return 'photos'
  if (looksLikeQuestion(text)) return 'ask'
  const days = statedDays(text)
  if (days != null && tripDays != null && days !== tripDays && !pointsAtTrip(text)) return 'replan'
  return 'edit'
}

// 模型这一轮没回、回坏了或没填密钥时兜底：只比人数，目的地当作没变
export function localTurn(opening: string, text: string, tripDays: number | null): Turn {
  return {
    task: { places: [], people: countPeople(opening) },
    now: { places: [], people: countPeople(text) },
    action: localAction(text, tripDays),
    prefs: [],
    source: 'local',
  }
}

function readScope(raw: unknown): Scope {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { places?: unknown; people?: unknown }
  const places = Array.isArray(o.places) ? o.places.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 12) : []
  const n = Number(o.people)
  return { places, people: o.people != null && Number.isInteger(n) && n > 0 && n < 100 ? n : null }
}

export function parseTurn(raw: string): Turn | null {
  const obj = parseJsonish(raw) as { task?: unknown; now?: unknown; action?: unknown; prefs?: unknown } | null
  if (!obj || typeof obj !== 'object') return null
  const action = String(obj.action || '').trim() as Action
  if (!ACTIONS.includes(action)) return null
  const prefs = Array.isArray(obj.prefs)
    ? [...new Set(obj.prefs.map((p) => String(p || '').trim().slice(0, 30)).filter(Boolean))].slice(0, MAX_PREFS)
    : []
  return { task: readScope(obj.task), now: readScope(obj.now), action, prefs, source: 'model' }
}

const GROUP_BOUND = new RegExp(`${NUM}\\s*(?:座|辆|间)|包车|包一?辆|拼车|同行|带(?:着)?(?:老人|孩子|小孩|父母|长辈|宝宝|爸妈)`)
const ARRANGEMENT = new RegExp(`${NUM}\\s*晚|^(?:先|再|然后|最后|第\\s*${NUM}\\s*天)`)

// 上一趟的偏好里只留跟着人走的：提到上一趟地名店名的、排几晚先后的、跟人数绑定的都去掉
export function portablePrefs(prefs: string[], oldNames: string[]) {
  const names = [...new Set(oldNames.map(normPlace).filter((n) => [...n].length >= 2))]
  return prefs.filter((p) => {
    const flat = normPlace(p)
    if (!flat) return false
    if (names.some((n) => flat.includes(n))) return false
    return !GROUP_BOUND.test(p) && !ARRANGEMENT.test(p)
  })
}

export type PrefPlan = { mode: 'none' | 'carry' | 'ask'; prefs: string[] }

// 没剩下就直接生成；人数没变默认沿用；人数变了同行的人可能换了，才问
export function planPrefs(turn: Pick<Turn, 'task' | 'now' | 'prefs'>, oldNames: string[]): PrefPlan {
  const prefs = portablePrefs(turn.prefs, oldNames)
  if (!prefs.length) return { mode: 'none', prefs }
  const peopleChanged = turn.now.people != null && turn.task.people != null && turn.now.people !== turn.task.people
  return { mode: peopleChanged ? 'ask' : 'carry', prefs }
}

export function tripNames(trip: TripLike | null): string[] {
  if (!trip) return []
  const names: string[] = []
  for (const day of trip.days || []) {
    for (const slot of day.slots || []) names.push(String(slot.name || ''))
    for (const meal of day.dining || []) names.push(String(meal.place || ''))
  }
  for (const area of trip.hotelAreas || []) {
    names.push(String(area.area || ''))
    for (const opt of area.options || []) names.push(String(opt.name || ''))
  }
  return names
    .flatMap((n) => n.split(/[→\/、,，·\-—]+/))
    .map((n) => n.replace(/[（(].*?[）)]/g, '').trim())
    .filter(Boolean)
}

export function carryLine(prefs: string[]) {
  return prefs.length ? `沿用上一趟的偏好：${prefs.join('；')}` : ''
}
