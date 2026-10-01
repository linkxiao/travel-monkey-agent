// 每一轮发给模型的消息怎么拼：纯函数，不碰 React，golden 可以按多轮脚本逐轮核对。
import { factsBlock, type Fact } from './memory.ts'
import { isBoilerReply, isEditReceipt, stripBoilerReply } from './trip.ts'

export type ContextMessage = { role: 'user' | 'assistant'; content: string }
export type ContextBubble = { role: 'user' | 'assistant'; text: string; pending?: boolean }

export const USER_PACK_MAX = 600
export const EARLIER_MAX = 300

const oneLine = (text: string) => String(text || '').replace(/\s+/g, ' ').trim()
const clip = (text: string, n: number) => (text.length > n ? text.slice(0, n - 1) + '…' : text)

// 点选答复只留用户选的那几项，问句是模型写的
function userLine(text: string) {
  const s = String(text || '')
  if (s.startsWith('对以下问题的答复')) {
    const picked = s.split('\n').filter((l) => l.trim().startsWith('→')).map((l) => l.replace(/^\s*→\s*/, '').trim())
    return picked.length ? '点选：' + picked.join('；') : ''
  }
  if (s.trim() === '确认生成') return ''
  return oneLine(s)
}

// 从最新往前装，装满预算为止，再按时间顺序摆回去
function budgetLines(lines: string[], max: number) {
  const out: string[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line || out.includes(line)) continue
    if (used + line.length > max) break
    out.unshift(line)
    used += line.length
  }
  return out
}

// 本趟用户说过的话：只要用户的，不要模型的长文
export function userPack(bubbles: ContextBubble[], max = USER_PACK_MAX): string[] {
  const lines = bubbles
    .filter((b) => b.role === 'user' && !b.pending && b.text.trim())
    .map((b) => clip(userLine(b.text), 120))
  return budgetLines(lines, max)
}

// 窗口外的旧对话：用户原话 + 已落到页面的改动，本机压，不打模型
export function earlierDigest(older: ContextBubble[], max = EARLIER_MAX): string[] {
  const lines = older.map((b) => {
    if (b.role === 'user') {
      const line = userLine(b.text)
      return line ? '你：' + clip(line, 60) : ''
    }
    const receipt = String(b.text || '').match(/已写入页面[：:]([^\n]+)/)
    return receipt ? '已改：' + clip(oneLine(receipt[1]), 80) : ''
  })
  return budgetLines(lines, max)
}

export function splitWindow(bubbles: ContextBubble[], limit: number) {
  const usable = bubbles.filter((b) => !b.pending && b.text.trim())
  const keep = (b: ContextBubble) => !isBoilerReply(b.text) && !isEditReceipt(b.text)
  const window = usable.filter(keep).slice(-limit)
  const start = window.length ? usable.indexOf(window[0]) : usable.length
  return { window, older: usable.slice(0, start) }
}

export function factsPair(facts: Fact[]): ContextMessage[] {
  const block = factsBlock(facts)
  return block ? [{ role: 'user', content: block }, { role: 'assistant', content: '已记下这些约束。' }] : []
}

function researchPair(brief?: string): ContextMessage[] {
  return brief
    ? [
        { role: 'user', content: '本机调研（高德/搜索短摘要，填表用，勿扩写成长文）：\n' + brief },
        { role: 'assistant', content: '已读调研摘要。' },
      ]
    : []
}

function packPair(bubbles: ContextBubble[], why: string): ContextMessage[] {
  const pack = userPack(bubbles)
  return pack.length
    ? [
        { role: 'user', content: `本趟用户之前说过的话（只摘用户原话，按时间；${why}）：\n- ` + pack.join('\n- ') },
        { role: 'assistant', content: '已读。' },
      ]
    : []
}

export function buildPlanMessages(opts: { brief?: string; facts: Fact[]; bubbles: ContextBubble[]; planDraft?: string; text: string }): ContextMessage[] {
  return [
    ...researchPair(opts.brief),
    ...factsPair(opts.facts),
    ...packPair(opts.bubbles, '大纲里没写到的偏好也要照顾到'),
    ...(opts.planDraft
      ? [
          { role: 'user' as const, content: '当前大纲：\n' + opts.planDraft },
          { role: 'assistant' as const, content: '已读当前大纲。' },
        ]
      : []),
    { role: 'user', content: opts.text },
  ]
}

export function buildFillMessages(opts: { brief?: string; facts: Fact[]; bubbles: ContextBubble[]; plan: string }): ContextMessage[] {
  return [
    ...researchPair(opts.brief),
    ...factsPair(opts.facts),
    ...packPair(opts.bubbles, '填 review、tips 时照顾到，不要因此重排大纲'),
    { role: 'user', content: '已确认计划（严格按此填表，不要重排）：\n' + opts.plan },
    { role: 'assistant', content: '已读确认计划。' },
    { role: 'user', content: '请按已确认计划输出 trip JSON。' },
  ]
}

export function buildChatMessages(opts: { facts: Fact[]; digest: string; bubbles: ContextBubble[]; extra?: ContextBubble[]; limit?: number }): ContextMessage[] {
  const { window, older } = splitWindow(opts.bubbles, opts.limit ?? 4)
  const block = factsBlock(opts.facts)
  const earlier = earlierDigest(older)
  const head = [
    block,
    earlier.length ? '更早的对话（已滑出窗口，只留用户原话和已落到页面的改动）：\n' + earlier.join('\n') : '',
    '当前行程摘要：\n' + opts.digest,
  ].filter(Boolean).join('\n\n')
  return [
    { role: 'user', content: head },
    { role: 'assistant', content: '已读摘要。' },
    ...window.map((b) => ({ role: b.role, content: stripBoilerReply(b.text) })),
    ...(opts.extra || []).map((b) => ({ role: b.role, content: b.text })),
  ]
}
