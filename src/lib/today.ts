// 出发当日：今天是这趟的哪一天，下雨就改用当天的雨备，不另叫模型。
import type { Trip } from './trip.ts'

export type TodayAdvice = {
  inTrip: boolean
  dayLabel: string
  headline: string
  detail: string
}

function ymd(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return ymd(date)
}

function slotNames(day: { slots?: Array<{ name?: string }> } | undefined) {
  return (day?.slots || []).map((slot) => String(slot?.name || '').trim()).filter(Boolean)
}

export function todayAdvice(trip: Trip | null | undefined, opts: { now?: Date; rain?: boolean } = {}): TodayAdvice {
  const days = Array.isArray(trip?.days) ? trip.days : []
  const start = String(trip?.startDate || '')
  const today = ymd(opts.now || new Date())
  const index = days.findIndex((_, i) => addDays(start, i) === today)
  if (index < 0) {
    return { inTrip: false, dayLabel: '', headline: '今天不在这趟日期里', detail: start ? `这趟从 ${start} 开始。` : '行程还没有出发日期。' }
  }
  const day = days[index] as { slots?: Array<{ name?: string }>; craft?: { rain?: { cut?: string; instead?: string } } }
  const label = `D${index + 1}`
  const names = slotNames(day)
  const rain = day?.craft?.rain
  if (opts.rain && (rain?.cut || rain?.instead)) {
    return {
      inTrip: true,
      dayLabel: label,
      headline: `今天下雨，${label} 改雨备`,
      detail: [`先不走：${rain?.cut || '露天段'}`, rain?.instead ? `改去：${rain.instead}` : ''].filter(Boolean).join('。'),
    }
  }
  return {
    inTrip: true,
    dayLabel: label,
    headline: `今天按原计划走 ${label}`,
    detail: names.length ? names.join(' / ') : '这一天还没有格子。',
  }
}
