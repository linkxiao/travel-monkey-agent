import type { Trip } from './trip'

type Day = {
  date?: string
  weekday?: string
  brief?: string
  theme?: string
  slots?: Array<{ kind?: string; name?: string; time?: string }>
  dining?: Array<{ meal?: string; place?: string }>
}

/** 给人看的行程片段，适合粘贴到微信聊天（不是给模型用的 digest）。 */
export function formatShareSnippet(trip: Trip | null | undefined): string {
  if (!trip) return ''
  const days = (trip.days || []) as Day[]
  const lines: string[] = [`【${String(trip.title || '行程').trim()}】`]
  if (trip.startDate) lines.push(`出发 ${String(trip.startDate)}`)
  if (days.length) lines.push(`共 ${days.length} 天`)
  lines.push('')

  days.forEach((day, i) => {
    const brief = String(day.brief || day.theme || '').trim()
    const when = [day.weekday, day.date].filter(Boolean).join(' ')
    lines.push(`Day${i + 1}${when ? ` · ${when}` : ''}${brief ? `｜${brief}` : ''}`)

    const path = (day.slots || [])
      .filter((s) => {
        const k = String(s.kind || '')
        return !k || k === 'spot' || k === 'route' || k === 'depart'
      })
      .map((s) => String(s.name || '').trim())
      .filter(Boolean)
      .slice(0, 5)
    if (path.length) lines.push(`路线：${path.join(' → ')}`)

    const stay = (day.slots || []).find((s) => String(s.kind || '') === 'stay')
    if (stay?.name) lines.push(`住宿：${String(stay.name).trim()}`)

    const meals = (day.dining || [])
      .map((m) => {
        const place = String(m.place || '').trim()
        if (!place) return ''
        const meal = String(m.meal || '').trim()
        return meal ? `${meal} ${place}` : place
      })
      .filter(Boolean)
      .slice(0, 3)
    if (meals.length) lines.push(`餐饮：${meals.join('；')}`)
    lines.push('')
  })

  lines.push('—— 来自 Travel Monkey')
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export async function sharePlainText(opts: {
  title?: string
  text: string
}): Promise<'shared' | 'aborted' | 'unavailable'> {
  const text = String(opts.text || '').trim()
  if (!text) return 'unavailable'
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unavailable'
  try {
    await navigator.share({
      title: opts.title || '行程',
      text,
    })
    return 'shared'
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'aborted'
    return 'unavailable'
  }
}
