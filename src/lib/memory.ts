// 约束板：用户亲口说过的硬约束，结构化记下，每一轮都带给模型。
// 本机正则先抽（零成本、可测），模型在改表回复里顺手回 facts 补充。宁少勿错。

export type FactKey = 'party' | 'diet' | 'body' | 'budget' | 'origin' | 'dates' | 'length' | 'transport' | 'stay'

export type Fact = { key: FactKey; value: string; source: 'user' | 'model'; at: number }

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
}

const ORDER: FactKey[] = ['party', 'body', 'diet', 'dates', 'length', 'origin', 'transport', 'stay', 'budget']

// 只保留最新一条的类别；其余类别可以并存多条
const SINGLE = new Set<FactKey>(['budget', 'origin', 'dates', 'length', 'transport'])

const MAX_FACTS = 12
const MAX_VALUE = 20

const NUM = '(?:\\d{1,2}|[一二两三四五六七八九十]{1,3})'
// 一个短语到这里就断：标点、空白、并列词
const STOP = '[^，。,.；;！!？?、\\s和及跟]'
const HEADCOUNT = /^(\d{1,2}|[一二两三四五六七八九十]{1,3})人$|^一家.口$/

function clauses(text: string) {
  return String(text || '')
    .split(/[。！!；;\n]+/)
    .flatMap((c) => c.split(/(?<=[？?])/))
    .map((c) => c.trim())
    .filter(Boolean)
}

// 问句里的词不当约束：「有电梯吗」「要不要自驾？」只是在问
function isQuestion(clause: string) {
  return /[？?]$|吗$|呢$|要不要|是否|能不能|可不可以|有没有/.test(clause)
}

function push(out: Fact[], key: FactKey, value: string, at: number) {
  const v = value.trim().slice(0, MAX_VALUE)
  if (v.length < 2) return
  if (out.some((f) => f.key === key && f.value === v)) return
  out.push({ key, value: v, source: 'user', at })
}

export function extractFacts(text: string, at = Date.now()): Fact[] {
  const out: Fact[] = []
  for (const c of clauses(text)) {
    if (isQuestion(c)) continue

    for (const m of c.matchAll(new RegExp(`(?<![第每前后这那哪])(${NUM})\\s*(?:个)?(?:大人|成人|人)(?![民气文物均头])`, 'g'))) push(out, 'party', `${m[1]}人`, at)
    for (const m of c.matchAll(/一家[三四五六七]口/g)) push(out, 'party', m[0], at)
    for (const m of c.matchAll(/带(?:着)?(孩子|小孩|娃|宝宝|老人|父母|爸妈|老妈|老爸|我妈|我爸|孙子|孙女|外孙|宠物|狗)/g)) push(out, 'party', `带${m[1]}`, at)
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

    for (const m of c.matchAll(/电梯|一楼|一层|低楼层|无障碍|安静|不换酒店|不想换酒店|连住|民宿|町屋|青旅|经济型|高端酒店|五星/g)) push(out, 'stay', m[0], at)
  }
  return out
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
} as Record<string, FactKey>

// 模型回的 facts：[{ k: '忌口', v: '不吃辣' }]，键名写法不拘，认不出的类别丢掉
export function normalizeModelFacts(raw: unknown, at = Date.now()): Fact[] {
  if (!Array.isArray(raw)) return []
  const out: Fact[] = []
  for (const it of raw) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const name = String(o.k ?? o.key ?? o.type ?? o.label ?? '').trim()
    const key = KEY_BY_NAME[name]
    const value = String(o.v ?? o.value ?? o.text ?? '').trim().slice(0, MAX_VALUE)
    if (!key || value.length < 2) continue
    if (out.some((f) => f.key === key && f.value === value)) continue
    out.push({ key, value, source: 'model', at })
  }
  return out
}

export function mergeFacts(prev: Fact[], incoming: Fact[]): Fact[] {
  let next = [...prev]
  for (const f of incoming) {
    if (SINGLE.has(f.key)) {
      next = next.filter((g) => g.key !== f.key)
    } else if (f.key === 'party' && HEADCOUNT.test(f.value)) {
      next = next.filter((g) => !(g.key === 'party' && HEADCOUNT.test(g.value)))
    }
    const same = next.filter((g) => g.key === f.key)
    if (same.some((g) => g.value.includes(f.value))) continue
    next = next.filter((g) => !(g.key === f.key && f.value.includes(g.value)))
    next.push(f)
  }
  return next.slice(-MAX_FACTS)
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
      return vals.length ? `- ${FACT_LABELS[key]}：${vals.join('、')}` : ''
    })
    .filter(Boolean)
  return '本趟硬约束（用户亲口说过；每条都要遵守，与大纲或摘要冲突时以此为准）：\n' + lines.join('\n')
}
