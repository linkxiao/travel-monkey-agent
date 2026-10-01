import { detectPersona } from './persona'
import type { Trip } from './trip'

function parseCraftLine(line: string) {
  if (!/累[：:]|雨砍[：:]|车[：:]/.test(line)) return null
  const level = line.match(/累[：:]\s*(轻|中|偏累)/)?.[1] || ''
  const cut = (line.match(/雨砍[：:]\s*([^；;]+)/)?.[1] || '').trim()
  const park = (line.match(/车[：:]\s*(.+)$/)?.[1] || '').trim()
  const [leave, pickup] = park.split(/[/／]/).map((s) => s.trim())
  const craft: Record<string, unknown> = {}
  if (level) craft.load = { level }
  if (cut) craft.rain = { cut }
  if (leave) craft.park = { leave, pickup: pickup || '' }
  return Object.keys(craft).length ? craft : null
}

function stripMealPrefix(value: string) {
  return String(value || '').replace(/^(早|午|晚)[餐饭·・.\s]*/u, '').trim()
}

export function tripFromPlan(plan: string): Trip | null {
  const text = String(plan || '')
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const days: Array<Record<string, unknown>> = []
  for (const line of lines) {
    const craft = parseCraftLine(line)
    if (craft) {
      if (days.length) days[days.length - 1].craft = { ...(days[days.length - 1].craft as object || {}), ...craft }
      continue
    }
    const dm = line.match(/^(?:D(?:ay)?\s*(\d+)|第\s*(\d+)\s*天)\s*[：:\s]+(.+)$/i)
    if (!dm) continue
    const rest = dm[3]
    const dateM = rest.match(/(\d{4}-\d{2}-\d{2})/)
    const date = dateM ? dateM[1] : ''
    const body = (dateM ? rest.slice((dateM.index || 0) + dateM[0].length) : rest).replace(/^[：:\s]+/, '')
    const parts = body.split(/[/／]/).map(stripMealPrefix).filter(Boolean)
    const meals = [parts[5], parts[6], parts[7]]
    days.push({
      date,
      theme: parts[0] || `第 ${days.length + 1} 天`,
      slots: [
        { kind: 'route', name: parts[0] || '当日线路' },
        { kind: 'spot', name: parts[1] || '待定' },
        { kind: 'spot', name: parts[2] || '午休' },
        { kind: 'spot', name: parts[3] || '待定' },
        { kind: 'stay', name: parts[4] || '当日住宿' },
        { kind: 'food', name: meals[2] || meals[1] || '当日特色餐饮' },
      ],
      dining: [
        meals[0] ? { meal: '早餐', place: meals[0] } : null,
        meals[1] ? { meal: '午餐', place: meals[1] } : null,
        meals[2] ? { meal: '晚餐', place: meals[2] } : null,
      ].filter(Boolean),
    })
  }
  if (!days.length) {
    const n = parseInt(text.match(/(\d)\s*[日天]/)?.[1] || '', 10)
    if (n >= 1 && n <= 10) {
      for (let i = 0; i < n; i += 1) days.push({ theme: `第 ${i + 1} 天`, slots: [], dining: [] })
    }
  }
  if (!days.length) return null
  const title = lines.find((l) => !/^(人格|待确认|D\s*\d|第\s*\d|累[：:]|雨砍|车[：:]|住宿)/.test(l)) || '行程'
  return {
    title,
    startDate: String(days[0].date || '') || new Date().toISOString().slice(0, 10),
    persona: detectPersona(text),
    disclaimer: '本行程按已确认大纲生成，时间与价格为参考，出发前请自行核实，不能代订。',
    days,
  }
}

export {
  choicesForQuestion,
  extractAskItems,
  extractPlanQuestions,
  formatAskAnswers,
  formatPlanAnswers,
  ASK_WRITE_HINT,
} from './ask'
