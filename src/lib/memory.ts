// 约束板：用户亲口说过的硬约束，结构化记下，每一轮都带给模型。
// 本机正则先抽（零成本、可测），模型在回复里顺手回 facts / 「记下：」行补充。宁少勿错。

export type FactKey = 'party' | 'diet' | 'body' | 'budget' | 'origin' | 'dates' | 'length' | 'transport' | 'stay' | 'must' | 'avoid'

export type Fact = { key: FactKey; value: string; source: 'user' | 'model'; at: number }

export type FactDrop = { key: FactKey; value: string }

export type MemoUpdate = { facts: Fact[]; drops: FactDrop[] }

export const FACT_LABELS: Record<FactKey, string> = {
  party: '同行',
  diet: '忌口',
  body: '身体',
  budget: '预算',
  origin: '出发地',
  dates: '日期',
  length: '天数',
  transport: '交通',
  stay: '住宿',
  must: '必去',
  avoid: '不去',
}

const ORDER: FactKey[] = ['party', 'body', 'diet', 'dates', 'length', 'origin', 'transport', 'stay', 'budget', 'must', 'avoid']

// 只保留最新一条的类别；其余类别可以并存多条
const SINGLE = new Set<FactKey>(['budget', 'origin', 'dates', 'length', 'transport'])

const MAX_FACTS = 16
const MAX_VALUE = 20

const NUM = '(?:\\d{1,2}|[一二两三四五六七八九十]{1,3})'
// 一个短语到这里就断：标点、空白、并列词
const STOP = '[^，。,.；;！!？?、\\s和及跟]'
// 地名到这里就断：再加上语气词
const NAME = '([^，。,.；;！!？?、\\s和及跟了吧啊呀的]{2,12})'
const HEADCOUNT = /^(\d{1,2}|[一二两三四五六七八九十]{1,3})人$|^一家.口$/
// 「去掉午休」「不去太远的地方」「删掉D2第3格」不是在点名一个地方
const NOT_PLACE = /^(太|那么|这么|很|特别|人多|D\d|第|这|那|一|两|几|每|今天|明天|后天|晚上|早上|上午|下午|中午|午休|茶歇|待定|休息|自由活动|购物|爬山|走路|早起|赶路|排队|景点|行程|安排|地方|酒店|住宿|那里|这里|哪|早饭|午饭|晚饭|早餐|午餐|晚餐|三餐|\d)/

function clauses(text: string) {
  return String(text || '')
    .split(/[。！!；;\n]+/)
    .flatMap((c) => c.split(/(?<=[？?])/))
    .map((c) => c.trim())
    .filter(Boolean)
}

// 问句里的词不当约束：「有电梯吗」「要不要自驾？」只是在问
function isQuestion(clause: string) {
  return /[？?]$|吗$|呢$|要不要|是否|能不能|可不可以|有没有|还是.+还是/.test(clause)
}

// 点选答复里问句是模型写的，只有「→」后面是用户的话
function userSpeech(text: string) {
  const s = String(text || '')
  if (!s.startsWith('对以下问题的答复')) return s
  return s.split('\n').filter((l) => l.trim().startsWith('→')).map((l) => l.replace(/^\s*→\s*/, '').replace(/^[A-Z][.．、]\s*/, '')).join('\n')
}

function push(out: Fact[], key: FactKey, value: string, at: number) {
  const v = value.trim().slice(0, MAX_VALUE)
  if (v.length < 2) return
  if (out.some((f) => f.key === key && f.value === v)) return
  out.push({ key, value: v, source: 'user', at })
}

function place(raw: string) {
  const v = raw.replace(/(这个|那个|这家|那家|这里|那里)$/, '').trim()
  return v.length >= 2 && !NOT_PLACE.test(v) ? v : ''
}

export function extractFacts(text: string, at = Date.now()): Fact[] {
  const out: Fact[] = []
  for (const c of clauses(userSpeech(text))) {
    if (isQuestion(c)) continue

    for (const m of c.matchAll(new RegExp(`(?<![第每前后这那哪])(${NUM})\\s*(?:个)?(?:大人|成人|人)(?![民气文物均头间])`, 'g'))) push(out, 'party', `${m[1]}人`, at)
    for (const m of c.matchAll(/一家[三四五六七]口/g)) push(out, 'party', m[0], at)
    for (const m of c.matchAll(/(?<![不没别])带(?:着)?(孩子|小孩|娃|宝宝|老人|父母|爸妈|老妈|老爸|我妈|我爸|孙子|孙女|外孙|宠物|狗)/g)) push(out, 'party', `带${m[1]}`, at)
    for (const m of c.matchAll(/夫妻|情侣|闺蜜|独自|一个人去/g)) push(out, 'party', m[0], at)

    for (const m of c.matchAll(new RegExp(`(?:不吃|不能吃|吃不了|不喝)${STOP}{1,6}`, 'g'))) push(out, 'diet', m[0], at)
    for (const m of c.matchAll(new RegExp(`${STOP}{1,6}过敏`, 'g'))) push(out, 'diet', m[0].replace(/^(对|吃)/, ''), at)
    for (const m of c.matchAll(/吃素|素食|清真/g)) push(out, 'diet', m[0], at)

    for (const m of c.matchAll(new RegExp(`(?:膝盖|腿脚|腰(?=不好|疼|痛)|心脏|血压|血糖|糖尿病|高血压|哮喘|轮椅|拐杖|行动不便|走不动|走不了远路|恐高|晕车|晕船|高反|怀孕|孕妇|孕期)${STOP}{0,5}`, 'g'))) push(out, 'body', m[0], at)

    const budget = c.match(/预算[^\d]{0,4}(\d+(?:\.\d+)?\s*(?:万|千|k|K|w|W)?\s*(?:元|块)?(?:\s*(?:\/人|每人|一人))?)/)
    if (budget) push(out, 'budget', `预算${budget[1].replace(/\s+/g, '')}`, at)
    const perHead = c.match(/人均\s*(\d+(?:\.\d+)?\s*(?:元|块)?)/)
    if (perHead) push(out, 'budget', `人均${perHead[1].replace(/\s+/g, '')}`, at)

    const origin = c.match(/从([\u4e00-\u9fff]{2,5}?)(?:出发|过去|飞过去|飞|开车|自驾|坐高铁|坐飞机)/)
    if (origin) push(out, 'origin', `从${origin[1]}出发`, at)

    const dates: string[] = []
    const range = c.match(/(\d{1,2}月\d{1,2}[日号]?)\s*(?:到|至|-|~|～|—)\s*((?:\d{1,2}月)?\d{1,2}[日号]?)/)
    if (range) dates.push(`${range[1]}—${range[2]}`)
    else {
      const day = c.match(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]|\d{4}-\d{2}-\d{2}/)
      if (day) dates.push(day[0].replace(/\s+/g, ''))
    }
    const holiday = c.match(/国庆|中秋|春节|元旦|五一|清明|端午|暑假|寒假/)
    if (holiday) dates.unshift(holiday[0])
    if (dates.length) push(out, 'dates', dates.join(' '), at)

    const length = c.match(new RegExp(`(?<![第前后这那哪每])(${NUM})\\s*天(?:\\s*(${NUM})\\s*[晚夜])?`))
    if (length) push(out, 'length', `${length[1]}天${length[2] ? length[2] + '晚' : ''}`, at)

    const transport = c.match(/不开车|没有车|没车|不自驾|自驾|开车|租车|包车|高铁|动车|坐飞机|公共交通|公交地铁|打车/)
    if (transport) push(out, 'transport', transport[0], at)

    for (const m of c.matchAll(/(?<!不用|不需要|不要求|不必)(电梯|一楼|一层|低楼层|无障碍|安静|不换酒店|不想换酒店|连住|民宿|町屋|青旅|经济型|高端酒店|五星)/g)) push(out, 'stay', m[1], at)

    for (const m of c.matchAll(new RegExp(`(?:一定要去|必须去|必去|一定要看|必看|务必去)${NAME}`, 'g'))) {
      const p = place(m[1])
      if (p) push(out, 'must', p, at)
    }
    for (const m of c.matchAll(new RegExp(`(?:不想去|不要去|不去|别去|别安排|不要安排|不安排|去掉|删掉|砍掉|跳过|不考虑)${NAME}`, 'g'))) {
      const p = place(m[1])
      if (p) push(out, 'avoid', p, at)
    }
  }
  return out
}

// 用户改口：「能吃辣了」「老人不去了」「还是去锦里吧」，把对应的旧约束撤掉
export function extractDrops(text: string): FactDrop[] {
  const out: FactDrop[] = []
  const add = (key: FactKey, value: string) => {
    if (value && !out.some((d) => d.key === key && d.value === value)) out.push({ key, value })
  }
  for (const c of clauses(userSpeech(text))) {
    if (isQuestion(c)) continue
    for (const m of c.matchAll(/(?<![不没])(?:能|可以|也能)吃(辣|海鲜|肉|牛肉|羊肉|猪肉|香菜|葱|蒜|鱼|生冷)/g)) add('diet', m[1])
    if (/吃辣没问题|辣也行|微辣可以/.test(c)) add('diet', '辣')
    if (/不忌口|什么都能吃|啥都吃/.test(c)) add('diet', '*')
    for (const m of c.matchAll(/(老人|孩子|小孩|娃|宝宝|爸妈|父母|宠物|狗|老妈|老爸|我妈|我爸)(?:不去了|不来了|不跟了|不一起了|不去)/g)) add('party', m[1])
    for (const m of c.matchAll(/不带(老人|孩子|小孩|娃|宝宝|爸妈|父母|宠物|狗|老妈|老爸|我妈|我爸)/g)) add('party', m[1])
    for (const m of c.matchAll(/不(?:用|需要|必|要求)(电梯|一楼|一层|低楼层|无障碍|连住|民宿|町屋|青旅)/g)) add('stay', m[1])
    for (const m of c.matchAll(new RegExp(`(?:加上|加个|加|改成|换成|还是去|又想去|恢复|保留)${NAME}`, 'g'))) {
      const p = place(m[1])
      if (p) add('avoid', p)
    }
  }
  return out
}

function matches(f: Fact, d: FactDrop) {
  if (f.key !== d.key) return false
  if (d.value === '*') return true
  return f.value.includes(d.value) || d.value.includes(f.value)
}

export function dropFacts(facts: Fact[], drops: FactDrop[]): Fact[] {
  return drops.length ? facts.filter((f) => !drops.some((d) => matches(f, d))) : facts
}

const KEY_BY_NAME: Record<string, FactKey> = {
  ...Object.fromEntries(Object.entries(FACT_LABELS).map(([k, v]) => [v, k])),
  ...Object.fromEntries(ORDER.map((k) => [k, k])),
  人数: 'party',
  同行人: 'party',
  饮食: 'diet',
  身体状况: 'body',
  健康: 'body',
  时间: 'dates',
  时长: 'length',
  住宿要求: 'stay',
  必看: 'must',
  想去: 'must',
  否决: 'avoid',
  不要: 'avoid',
} as Record<string, FactKey>

function readItem(it: unknown): { key: FactKey; value: string; drop: boolean } | null {
  if (!it || typeof it !== 'object') return null
  const o = it as Record<string, unknown>
  const key = KEY_BY_NAME[String(o.k ?? o.key ?? o.type ?? o.label ?? '').trim()]
  const value = String(o.v ?? o.value ?? o.text ?? '').trim().slice(0, MAX_VALUE)
  if (!key || value.length < 2) return null
  return { key, value, drop: o.drop === true || o.drop === 'true' }
}

// 模型回的 facts：[{ k: '忌口', v: '不吃辣' }]，键名写法不拘，认不出的类别丢掉；带 drop:true 的是作废
export function normalizeModelFacts(raw: unknown, at = Date.now()): Fact[] {
  if (!Array.isArray(raw)) return []
  const out: Fact[] = []
  for (const it of raw) {
    const r = readItem(it)
    if (!r || r.drop) continue
    if (out.some((f) => f.key === r.key && f.value === r.value)) continue
    out.push({ key: r.key, value: r.value, source: 'model', at })
  }
  return out
}

export function modelDrops(raw: unknown): FactDrop[] {
  if (!Array.isArray(raw)) return []
  return raw.map(readItem).filter((r): r is NonNullable<ReturnType<typeof readItem>> => Boolean(r?.drop)).map(({ key, value }) => ({ key, value }))
}

const MEMO_LINE = /^\s*[【[]?记下[】\]]?\s*[:：](.*)$/

// 出大纲、聊天时模型不回 JSON，约定在末尾单独写一行「记下：忌口=不吃辣；不去=锦里；作废=忌口:不吃辣」
export function takeMemo(text: string, at = Date.now()): MemoUpdate & { text: string } {
  const lines = String(text || '').split('\n')
  const items: unknown[] = []
  const kept = lines.filter((line) => {
    const m = line.match(MEMO_LINE)
    if (!m) return true
    for (const part of m[1].split(/[；;，,]/)) {
      const drop = part.match(/^\s*作废\s*[=＝]\s*([^:：]+)[:：](.+)$/)
      if (drop) {
        items.push({ k: drop[1].trim(), v: drop[2].trim(), drop: true })
        continue
      }
      const kv = part.match(/^\s*([^=＝]+)[=＝](.+)$/)
      if (kv) items.push({ k: kv[1].trim(), v: kv[2].trim() })
    }
    return false
  })
  return { text: kept.join('\n').trim(), facts: normalizeModelFacts(items, at), drops: modelDrops(items) }
}

export function mergeFacts(prev: Fact[], incoming: Fact[]): Fact[] {
  let next = [...prev]
  for (const f of incoming) {
    if (SINGLE.has(f.key)) {
      next = next.filter((g) => g.key !== f.key)
    } else if (f.key === 'party' && HEADCOUNT.test(f.value)) {
      next = next.filter((g) => !(g.key === 'party' && HEADCOUNT.test(g.value)))
    } else if (f.key === 'must' || f.key === 'avoid') {
      const other = f.key === 'must' ? 'avoid' : 'must'
      next = next.filter((g) => !matches(g, { key: other, value: f.value }))
    }
    const same = next.filter((g) => g.key === f.key)
    if (same.some((g) => g.value.includes(f.value))) continue
    next = next.filter((g) => !(g.key === f.key && f.value.includes(g.value)))
    next.push(f)
  }
  return next.slice(-MAX_FACTS)
}

// 一句用户话进来：先记新的，再按改口撤旧的
export function learnFromUser(prev: Fact[], text: string, at = Date.now()): Fact[] {
  return dropFacts(mergeFacts(prev, extractFacts(text, at)), extractDrops(text))
}

export function learnFromModel(prev: Fact[], update: MemoUpdate): Fact[] {
  return dropFacts(mergeFacts(prev, update.facts), update.drops)
}

export function removeFact(facts: Fact[], target: Pick<Fact, 'key' | 'value'>): Fact[] {
  return facts.filter((f) => !(f.key === target.key && f.value === target.value))
}

export function sortFacts(facts: Fact[]): Fact[] {
  return [...facts].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key) || a.at - b.at)
}

export function factsBlock(facts: Fact[]): string {
  if (!facts.length) return ''
  const lines = ORDER
    .map((key) => {
      const vals = facts.filter((f) => f.key === key).map((f) => f.value)
      if (!vals.length) return ''
      const tail = key === 'avoid' ? '（不要再排进行程）' : key === 'must' ? '（必须排进行程）' : ''
      return `- ${FACT_LABELS[key]}：${vals.join('、')}${tail}`
    })
    .filter(Boolean)
  return '本趟硬约束（用户亲口说过；每条都要遵守，与大纲或摘要冲突时以此为准）：\n' + lines.join('\n')
}

function avoids(facts: Fact[]) {
  return facts.filter((f) => f.key === 'avoid').map((f) => f.value)
}

// 用户说简称、模型写全称：「熊猫基地」要认出「成都大熊猫繁育研究基地」，字按顺序都在就算
function inOrder(name: string, short: string) {
  let i = 0
  for (const ch of name) if (ch === short[i]) i += 1
  return i === short.length
}

function hitName(name: string, avoid: string) {
  const n = String(name || '').trim()
  if (n.length < 2) return false
  if (n.includes(avoid) || (n.length >= 3 && avoid.includes(n))) return true
  return avoid.length >= 3 && n.length <= avoid.length * 3 && inOrder(n, avoid)
}

// 用户说过不去的点又出现在行程表里：本机查，不靠模型自觉
export function avoidHits(trip: unknown, facts: Fact[]): string[] {
  const list = avoids(facts)
  const days = (trip as { days?: Array<{ slots?: Array<{ name?: unknown }>; dining?: Array<{ place?: unknown }> }> } | null)?.days
  if (!list.length || !Array.isArray(days)) return []
  const names = days.flatMap((d) => [
    ...(d.slots || []).map((s) => String(s?.name || '')),
    ...(d.dining || []).map((m) => String(m?.place || '')),
  ])
  return list.filter((a) => names.some((n) => hitName(n, a)))
}

// 大纲里的按天行，排除「不去 X / 去掉 X」这种复述
export function planAvoidHits(plan: string, facts: Fact[]): string[] {
  const list = avoids(facts)
  if (!list.length) return []
  const dayLines = String(plan || '').split('\n')
    .filter((l) => /^\s*(?:D\d+|第[一二三四五六七八九十\d]+天|Day\s*\d+)/i.test(l))
    .filter((l) => !/不去|去掉|不安排|删掉|砍掉|跳过|不考虑/.test(l))
  const parts = dayLines.flatMap((l) => l.split(/[\/／、，,：:·|｜]+/).map((p) => p.trim()))
  return list.filter((a) => parts.some((p) => hitName(p, a)))
}

export function namesHitAvoid(names: string[], facts: Fact[]): string[] {
  return avoids(facts).filter((a) => names.some((n) => hitName(n, a)))
}
