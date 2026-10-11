// 开放时间对任意地点同一套规则：窗口外或闭馆日才拦。没有时刻就不拦。
function ymd(date) {
  return date.toISOString().slice(0, 10)
}

export function addIsoDays(iso, days) {
  const [year, month, day] = String(iso || '').split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return ymd(date)
}

function weekday(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number)
  if (!year || !month || !day) return -1
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function inRange(iso, from, to) {
  if (!from && !to) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !iso) return false
  if (from <= to) return iso >= from && iso <= to
  return iso >= from || iso <= to
}

function clock(value) {
  const matched = String(value || '').match(/(\d{1,2}):(\d{2})/)
  if (!matched) return null
  return Number(matched[1]) * 60 + Number(matched[2])
}

function endMinutes(windowText) {
  const matched = String(windowText || '').match(/(\d{1,2}):(\d{2})\s*[-–~到至]\s*(\d{1,2}):(\d{2})/)
  if (!matched) return null
  return Number(matched[3]) * 60 + Number(matched[4])
}

const WEEK = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 }

export function parseOpenText(raw) {
  const text = String(raw || '').replace(/\s+/g, '')
  if (!text) return null
  const matched = text.match(/(\d{1,2}):(\d{2})[-–~到至](\d{1,2}):(\d{2})/)
  const open = matched
    ? `${String(matched[1]).padStart(2, '0')}:${matched[2]}-${String(matched[3]).padStart(2, '0')}:${matched[4]}`
    : ''
  const closedWeekdays = []
  if (/闭馆|闭园|不开放|休息/.test(text)) {
    for (const hit of text.matchAll(/周([一二三四五六日天])/g)) {
      const day = WEEK[hit[1]]
      if (day != null && !closedWeekdays.includes(day)) closedWeekdays.push(day)
    }
  }
  if (!open && !closedWeekdays.length) return null
  return { open, closedWeekdays }
}

function placeName(item) {
  return String(item?.name || item?.点 || '').trim()
}

export function hoursIssues(trip, windows = []) {
  const issues = []
  const days = Array.isArray(trip?.days) ? trip.days : []
  days.forEach((day, index) => {
    const date = addIsoDays(trip?.startDate, index)
    const slots = Array.isArray(day?.slots) ? day.slots : []
    slots.forEach((slot) => {
      const name = String(slot?.name || '').trim()
      const at = clock(slot?.time)
      if (name.length < 2) return
      windows.forEach((item) => {
        const place = placeName(item)
        if (place.length < 2 || (!name.includes(place) && !place.includes(name))) return
        if (!inRange(date, item.from || item.起, item.to || item.止)) return
        const closed = Array.isArray(item.closedWeekdays) ? item.closedWeekdays : []
        if (date && closed.includes(weekday(date))) {
          issues.push(`D${index + 1}「${name}」落在闭馆日`)
          return
        }
        const close = endMinutes(item.open || item.开放)
        if (at == null || close == null || at <= close) return
        const hh = String(Math.floor(at / 60)).padStart(2, '0')
        const mm = String(at % 60).padStart(2, '0')
        issues.push(`D${index + 1}「${name}」排在 ${hh}:${mm}，开放到 ${item.open || item.开放}`)
      })
    })
  })
  return issues
}
