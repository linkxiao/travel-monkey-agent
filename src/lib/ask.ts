export const ASK_WRITE_HINT = '或自己写一句，写完可以改'
const CHOICE_LETTERS = 'ABCDEFGH'
const TAIL = ['按你建议', '先跳过']

export type AskItem = {
  question: string
  source: string
}

function stripAnswerLine(text: string): string {
  return String(text || '').replace(/\n?\s*答案[：:].*$/s, '').trim()
}

function cleanChoice(raw: string): string {
  let t = stripAnswerLine(String(raw || ''))
  // 「还是」右侧若误带「答案：A.按你建议 B.先跳过」，不要把整段答案当选项
  if (/^[A-H][\.、\)）]/.test(t) || /\s[A-H][\.、\)）]/.test(t)) return ''
  if (/[：:]/.test(t) && !/第\s*\d+\s*格/.test(t)) t = (t.split(/[：:]/).pop() || t).trim()
  t = t.replace(/[？?。！!]+[\s\S]*$/, '').replace(/[（(][^）)]{0,24}[）)]\s*$/, '')
  t = t.replace(/^[\s、，,。；;]+/, '').replace(/[，,。；;：:\s]+$/, '')
  t = t.replace(/^[「『“"](.+)[」』”"]$/, '$1')
  return t.trim()
}

function displayQuestion(text: string): string {
  return stripAnswerLine(text)
}

function labelChoices(opts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...opts, ...TAIL]) {
    const t = cleanChoice(raw)
    if (!t || t.length > 56 || seen.has(t)) continue
    seen.add(t)
    out.push(`${CHOICE_LETTERS[out.length]}.${t}`)
  }
  return out
}

function splitLettered(text: string): string[] {
  const found: string[] = []
  for (const part of String(text || '').split(/(?=[A-H][\.、\)）])/)) {
    const m = part.trim().match(/^[A-H][\.、\)）]\s*(.+)$/)
    if (!m) continue
    const t = m[1].replace(/[，,；;]+$/, '').trim()
    if (t && !TAIL.includes(t)) found.push(t)
  }
  return found
}

function letteredChoices(text: string): string[] {
  const answer = String(text || '').match(/答案[：:]\s*(.+)/)?.[1] || ''
  const fromAnswer = splitLettered(answer)
  if (fromAnswer.length) return fromAnswer
  return splitLettered(text)
}

function expandShortList(parts: string[]): string[] {
  const out: string[] = []
  for (const part of parts) {
    const bits = part.split(/[、，,]/).map((s) => s.trim()).filter(Boolean)
    if (bits.length >= 2 && bits.every((b) => b.length <= 6)) out.push(...bits)
    else out.push(part)
  }
  return out
}

function orChoices(question: string): string[] {
  // 只从问句拆「还是/或者」，忽略模型写歪的「答案：」行
  const q = stripAnswerLine(question)
  const afterColon = q.split(/[：:]/).slice(1).join('：').trim()
  const src = /还是|或者/.test(afterColon) ? afterColon : q
  if (!/还是|或者/.test(src)) return []
  return expandShortList(src.split(/还是|或者/).map(cleanChoice).filter((t) => t.length >= 2))
}

function isPersonaQuestion(question: string): boolean {
  return /人格/.test(question) || (/旅居/.test(question) && /带队/.test(question) && /探秘/.test(question))
}

export function choicesForQuestion(question: string): string[] {
  const q = String(question || '').trim()
  const fromLetters = letteredChoices(q)
  // 答案行若只剩「按你建议/先跳过」，不算有效选项，继续从问句「还是」拆
  if (fromLetters.length >= 1) return labelChoices(fromLetters)
  const fromOr = orChoices(q)
  if (fromOr.length >= 2) return labelChoices(fromOr)
  if (isPersonaQuestion(q)) return labelChoices(['旅居', '带队', '探秘'])
  if (/是否|要不要|是不是/.test(stripAnswerLine(q))) return labelChoices(['是', '否'])
  return labelChoices([])
}

function pushItem(items: AskItem[], question: string, source: string) {
  const q = displayQuestion(question)
  if (!q) return
  items.push({ question: q, source: source.trim() || q })
}

function parseNumberedAsks(source: string): AskItem[] {
  const items: AskItem[] = []
  let current: AskItem | null = null
  for (const line of String(source || '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const numbered = trimmed.match(/^\d+\s*[\.、\)]\s*(.+)$/)
    if (numbered?.[1]) {
      if (current) items.push(current)
      current = { question: displayQuestion(numbered[1]), source: numbered[1].trim() }
      continue
    }
    if (current && /^(答案[：:]|[A-H][\.、\)）])/.test(trimmed)) {
      current.source = `${current.source}\n${trimmed}`
      continue
    }
    if (current && items.length + 1 >= 3) break
  }
  if (current) items.push(current)
  return items.slice(0, 3)
}

export function extractAskItems(text: string, opts?: { loose?: boolean }): AskItem[] {
  const raw = String(text || '')
  const after = raw.split(/待确认[：:]/).slice(1).join('\n')
  if (after.trim()) return parseNumberedAsks(after)

  if (/答案[：:]/.test(raw)) {
    const numbered = parseNumberedAsks(raw)
    if (numbered.length) return numbered
    const items: AskItem[] = []
    const standalone = raw.match(/(?:^|\n)\s*([^\n]{2,120})\n\s*答案[：:]\s*(.+)/)
    if (standalone) {
      pushItem(items, standalone[1].replace(/^\d+\s*[\.、\)]\s*/, ''), `${standalone[1]}\n答案：${standalone[2]}`)
    }
    return items.slice(0, 3)
  }

  if (opts?.loose) return parseNumberedAsks(raw)
  return []
}

export function formatAskAnswers(items: AskItem[], answers: string[]): string {
  const lines = items.map((item, i) => {
    const a = String(answers[i] || '').trim()
    return `${i + 1}. ${item.question}\n→ ${a || '按你建议'}`
  })
  return '对以下问题的答复（按选项写入，不要再追问同一批）：\n' + lines.join('\n')
}

function askFingerprint(question: string) {
  return String(question || '').replace(/\s+/g, '').replace(/[？?。！!，,、：:（）()「」“”"'《》]/g, '').slice(0, 24)
}

/** 用户刚提交的点选。这批问句不再抽成卡片，避免确认后原题再弹出来。 */
export function answeredAskKeys(text: string): string[] {
  const raw = String(text || '')
  if (!raw.includes('对以下问题的答复')) return []
  return raw.split('\n')
    .map((line) => line.match(/^\d+\s*[.、)]\s*(.+)$/)?.[1] || '')
    .map(askFingerprint)
    .filter((key) => key.length >= 4)
}

export function omitAnsweredAsks(items: AskItem[], answered: string[]): AskItem[] {
  if (!answered.length) return items
  return items.filter((item) => {
    const key = askFingerprint(item.question)
    if (key.length < 4) return true
    const head = key.slice(0, 12)
    return !answered.some((prev) => prev.startsWith(head) || head.startsWith(prev.slice(0, 12)))
  })
}

export function extractPlanQuestions(plan: string): string[] {
  return extractAskItems(plan, { loose: true }).map((item) => item.question)
}

export function formatPlanAnswers(questions: string[], answers: string[]): string {
  return formatAskAnswers(questions.map((question) => ({ question, source: question })), answers)
}
