// 出发日按北京时间算。用户没写具体日期时，整趟从下个月 1 号起，后面每天顺延。

export function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function nextMonthFirst(now = new Date()) {
  const [y, m] = shanghaiDate(now).split('-').map(Number)
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 1 : m + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function addIsoDays(iso, days) {
  const base = new Date(`${iso}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

// 用户原话里有没有写出具体一天。大纲里模型自己填的日期不算。
export function hasWrittenDate(text) {
  const s = String(text || '')
  if (/\d{4}\s*[-./年]\s*\d{1,2}\s*[-./月]\s*\d{1,2}/.test(s)) return true
  if (/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/.test(s)) return true
  if (/今天|明天|后天|大后天|国庆|五一|春节|中秋|元旦/.test(s)) return true
  return false
}

export function stampUndatedTrip(trip, source, now = new Date()) {
  if (!trip || typeof trip !== 'object' || hasWrittenDate(source)) return trip
  const start = nextMonthFirst(now)
  trip.startDate = start
  const days = Array.isArray(trip.days) ? trip.days : []
  days.forEach((day, i) => {
    if (day && typeof day === 'object') day.date = addIsoDays(start, i)
  })
  return trip
}
