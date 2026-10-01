function text(value) {
  return String(value || '').trim()
}

function isRestName(name) {
  return /午休|茶歇|休息|歇脚/.test(text(name))
}

function isOutdoorName(name) {
  const n = text(name)
  if (!n || isRestName(n)) return false
  if (/博物馆|美术馆|室内|茶馆|餐厅/.test(n)) return false
  return /道|山|岭|峡|徒步|穿越|栈道|关隘|城墙|露天|古道|柏/.test(n)
}

function isShelterName(name) {
  const n = text(name)
  return /寺|祠|庙|博物馆|馆|院|茶|墓/.test(n) && !/古道|栈道/.test(n)
}

function slotNames(day, pred) {
  return (day.slots || []).filter((s) => s && pred(s)).map((s) => text(s.name)).filter(Boolean)
}

function mergePart(cur, fallback) {
  const out = { ...fallback }
  if (!cur || typeof cur !== 'object') return out
  Object.keys({ ...out, ...cur }).forEach((key) => {
    const next = text(cur[key])
    if (next) out[key] = next
  })
  return out
}

function deriveLoad(day, persona) {
  const spots = slotNames(day, (s) => s.kind === 'spot' && !isRestName(s.name))
  const route = slotNames(day, (s) => s.kind === 'route')[0] || ''
  const hike = /徒步|步行|穿越|古道/.test(route) || Boolean(day.hikeRoute)
  let level = '中'
  if (persona === 'stay') {
    if (spots.length <= 1 && !hike) level = '轻'
    else if (spots.length >= 3 || hike) level = '偏累'
  } else if (persona === 'trek') {
    level = hike || spots.length >= 2 ? '偏累' : '中'
  } else if (hike) {
    level = '偏累'
  } else if (spots.length <= 1) {
    level = '轻'
  }
  const walk = hike ? '徒步为主，公里数出发前按路书核' : (spots.length >= 3 ? '景间多段步行，少连续坐车' : '少走路，以车或室内为主')
  const why = hike
    ? '有徒步/古道段，预留体力，不要再加第三处硬景。'
    : (level === '轻' ? '真景点少，适合旅居或收尾日。' : '两到三个点，按馆点节奏走即可。')
  return { level, walk, why }
}

function deriveRain(day) {
  const cut = slotNames(day, (s) => s.kind === 'spot' && isOutdoorName(s.name))
  const keep = slotNames(day, (s) => s.kind === 'spot' && (isRestName(s.name) || isShelterName(s.name)))
  return {
    cut: cut.join('、') || '露天古道、爬山和城墙段',
    keep: keep.join('、') || '室内馆、寺祠、茶歇、就近午餐',
    instead: cut[0] ? `雨天砍「${cut[0]}」，改就近室内或提前回住，不要湿滑路硬走。` : '雨天按馆点走，少在露天停留。',
  }
}

function derivePark(day, persona) {
  const route = slotNames(day, (s) => s.kind === 'route')[0] || ''
  const stay = slotNames(day, (s) => s.kind === 'stay')[0] || ''
  const parked = route.match(/([\u4e00-\u9fffA-Za-z0-9]{2,14}停车[场馆]?)/)
  if (parked) {
    return {
      leave: parked[1],
      then: '车停稳再步行或短驳进线，不要堵在步道口。',
      pickup: stay ? `当天回到「${stay}」一侧或原停车场取车` : '原停车场取车',
    }
  }
  if (/徒步|古道|穿越/.test(route) || day.hikeRoute) {
    return {
      leave: '起点附近停车场（出发前核官方名字）',
      then: '停妥再进线：步行或短驳，线中不挪车。',
      pickup: stay ? `走完回到「${stay}」方向取车` : '终点或原停车场取车',
    }
  }
  if (persona === 'guide') {
    return {
      leave: '景区大巴场或住宿门口集合',
      then: '统一乘车到第一点，勿各自开车穿城。',
      pickup: stay || '当晚住宿门口',
    }
  }
  return {
    leave: stay ? `${stay} 或景区停车场` : '景区或住宿停车场',
    then: '车停稳再进点，景区内少挪车。',
    pickup: '原停车场取车；无自驾则改为公交/出租上下车点',
  }
}

export function ensureDayCraft(day, persona) {
  const raw = day.craft && typeof day.craft === 'object' ? day.craft : {}
  const load = mergePart(raw.load, deriveLoad(day, persona))
  const rain = mergePart(raw.rain, deriveRain(day))
  const park = mergePart(raw.park, derivePark(day, persona))
  if (!/轻|中|偏累|累/.test(load.level)) load.level = deriveLoad(day, persona).level
  day.craft = { load, rain, park }
  ;(day.slots || []).forEach((slot) => {
    if (slot.kind !== 'spot' || isRestName(slot.name)) return
    if (rain.cut && text(slot.name) && rain.cut.includes(text(slot.name).slice(0, 4))) {
      slot.cuttable = true
    }
  })
  return day
}

export function ensureTripCraft(trip) {
  const persona = text(trip.persona)
  ;(trip.days || []).forEach((day) => ensureDayCraft(day, persona))
  return trip
}
