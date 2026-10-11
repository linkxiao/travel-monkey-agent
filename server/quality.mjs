// FILL 之后的质检清单。只查模具会画出来的必填项，不替模型编店名。
// 程序补齐后仍然是占位句的，算没过：占位不能冒充「已填」。
// 行程上带来的开放时间，对任意地点同一套：窗口外或闭馆日算没过。没有时刻就不查。
import { hoursIssues } from './hours.mjs'

const MEALS = ['早餐', '午餐', '晚餐']
const GENERIC_PLACE = /^(待定|当日特色餐饮|当日晚餐|景点附近午餐|住宿店内或就近清淡早餐|就近小食|就近清淡早餐)$/

function text(value) {
  return String(value || '').trim()
}

function mealOf(name) {
  const s = text(name)
  if (/早/.test(s)) return '早餐'
  if (/晚|夜/.test(s)) return '晚餐'
  if (/午(?!夜)|午餐|午饭/.test(s)) return '午餐'
  return ''
}

function dayLabel(day, index) {
  return `D${index + 1}`
}

export function qualityChecklist(trip) {
  const issues = []
  const days = Array.isArray(trip?.days) ? trip.days : []
  if (!days.length) issues.push('没有按天的安排')

  days.forEach((day, index) => {
    const label = dayLabel(day, index)
    const dining = Array.isArray(day?.dining) ? day.dining : []
    MEALS.forEach((meal) => {
      const row = dining.find((item) => item && mealOf(item.meal) === meal)
      const place = text(row?.place)
      if (!place || GENERIC_PLACE.test(place)) {
        issues.push(`${label} ${meal}没有具体店名`)
      }
    })

    const craft = day?.craft && typeof day.craft === 'object' ? day.craft : {}
    const load = craft.load && typeof craft.load === 'object' ? craft.load : {}
    const rain = craft.rain && typeof craft.rain === 'object' ? craft.rain : {}
    const park = craft.park && typeof craft.park === 'object' ? craft.park : {}
    if (!/轻|中|偏累/.test(text(load.level))) issues.push(`${label} 缺负荷（轻/中/偏累）`)
    if (!text(rain.cut)) issues.push(`${label} 缺雨天可砍的点`)
    if (!text(park.leave)) issues.push(`${label} 缺停车或集合点`)
  })

  const areas = Array.isArray(trip?.hotelAreas) ? trip.hotelAreas : []
  if (!areas.length) {
    issues.push('没有住宿片区')
  } else {
    areas.forEach((area) => {
      const where = text(area?.area) || '住宿'
      const options = Array.isArray(area?.options) ? area.options : []
      if (!options.length) {
        issues.push(`${where}没有住宿档`)
        return
      }
      options.forEach((opt) => {
        const note = text(opt?.access?.note)
        if (!note) issues.push(`${where}「${text(opt?.name) || '未命名'}」缺适老/集合/出山注记`)
      })
    })
  }

  const windows = Array.isArray(trip?.openHours) ? trip.openHours : []
  return [...issues, ...hoursIssues(trip, windows)]
}
