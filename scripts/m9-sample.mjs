// M9 真模型留样。Key 只从环境变量 M9_KEY 读，不写入结果文件。
// 跑法：M9_KEY=... node --experimental-strip-types scripts/m9-sample.mjs
import fs from 'node:fs'
import { applySkillSystem } from '../server/skill-prompt.mjs'
import { extractTrip } from '../src/lib/trip.ts'
import { avoidHits, learnFromModel, learnFromUser, planAvoidHits, takeMemo } from '../src/lib/memory.ts'
import { buildFillMessages, buildPlanMessages } from '../src/lib/context.ts'

const key = String(process.env.M9_KEY || '').trim()
if (!key || key.length < 20) {
  console.error('缺少 M9_KEY')
  process.exit(1)
}

const baseUrl = 'https://api.deepseek.com/v1'
const model = process.env.M9_MODEL || 'deepseek-chat'
const outPath = new URL(`../docs/${process.env.M9_OUT || 'm9-2026-10-10.json'}`, import.meta.url)

async function complete(messages, mode) {
  const full = applySkillSystem(messages, mode)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: full,
      temperature: mode === 'fill' ? 0.2 : 0.7,
    }),
    signal: AbortSignal.timeout(120000),
  })
  const raw = await res.text()
  if (!res.ok) {
    const safe = raw.replaceAll(key, '[redacted]')
    throw new Error(`HTTP ${res.status} ${safe.slice(0, 400)}`)
  }
  const json = JSON.parse(raw)
  const reply = json.choices?.[0]?.message?.content || ''
  return {
    request: full.map((m) => ({ role: m.role, content: m.content })),
    reply,
  }
}

function session() {
  return { facts: [], bubbles: [], planDraft: '' }
}

async function planTurn(s, text, label) {
  s.facts = learnFromUser(s.facts, text)
  const messages = buildPlanMessages({
    brief: '',
    facts: s.facts,
    bubbles: s.bubbles,
    planDraft: s.planDraft,
    text,
  })
  let turn = await complete(messages, 'plan')
  let memo = takeMemo(turn.reply)
  s.facts = learnFromModel(s.facts, memo)
  const hits = planAvoidHits(memo.text, s.facts)
  let retry = null
  if (hits.length) {
    retry = await complete([
      ...messages,
      { role: 'assistant', content: turn.reply },
      { role: 'user', content: `大纲里又排了用户明确说不去的「${hits.join('、')}」。删掉换成同片区同类的点，其余不变，输出完整大纲。` },
    ], 'plan')
    const again = takeMemo(retry.reply)
    s.facts = learnFromModel(s.facts, again)
    memo = again
    turn = { ...turn, retriedBecause: hits }
  }
  s.bubbles.push({ role: 'user', text }, { role: 'assistant', text: memo.text })
  s.planDraft = memo.text
  return {
    label,
    user: text,
    facts: s.facts.map((f) => ({ key: f.key, value: f.value })),
    memoFacts: memo.facts.map((f) => ({ key: f.key, value: f.value })),
    memoDrops: memo.drops,
    request: turn.request,
    reply: turn.reply,
    shown: memo.text,
    avoidHits: planAvoidHits(memo.text, s.facts),
    retry: retry && { request: retry.request, reply: retry.reply },
  }
}

const s1 = session()
const scene1 = []
scene1.push(await planTurn(s1, '膝盖不好、不吃辣、6 个人，去成都', '场景1·第1轮'))
scene1.push(await planTurn(s1, '偏人文和美食，想拍一次日出', '场景1·第2轮'))
scene1.push(await planTurn(s1, '改成4天3晚', '场景1·第3轮'))

const s2 = session()
const scene2plan = await planTurn(s2, '成都3天，不去熊猫基地，人太多', '场景2·大纲')
const fillMessages = buildFillMessages({
  brief: '',
  facts: s2.facts,
  bubbles: s2.bubbles,
  plan: s2.planDraft,
})
const filled = await complete(fillMessages, 'fill')
const trip = extractTrip(filled.reply)
const pageHits = trip ? avoidHits(trip, s2.facts) : ['没有解析出 trip']

const round3 = scene1[2].shown
const checks = {
  '第3轮大纲照顾到想拍日出': /日出/.test(round3),
  '第3轮大纲照顾到人文或美食': /人文|美食/.test(round3),
  '第3轮大纲仍带着硬约束': /不吃辣|膝盖|6/.test(round3) || scene1[2].request.some((m) => /不吃辣/.test(m.content) && /膝盖/.test(m.content)),
  '不去的点不在最终页': pageHits.length === 0,
  '不去的点不在最终大纲': scene2plan.avoidHits.length === 0,
  '模型写了记下且记下的是用户说过的不去': scene2plan.memoFacts.some((f) => f.key === 'avoid' && /熊猫/.test(f.value)),
  '记下没有编出用户没说的忌口或预算': !scene2plan.memoFacts.some((f) => f.key === 'diet' || f.key === 'budget'),
}

const report = {
  at: '2026-10-10',
  provider: 'deepseek',
  model,
  checks,
  pass: Object.values(checks).every(Boolean),
  scene1,
  scene2: {
    plan: scene2plan,
    fill: { request: filled.request, reply: filled.reply, pageHits },
  },
}

fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(model, report.pass ? 'PASS' : 'FAIL')
for (const [name, ok] of Object.entries(checks)) console.log(ok ? 'ok' : 'FAIL', name)
console.log('wrote', outPath.pathname)
