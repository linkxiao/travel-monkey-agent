export const THEMES = [
  {
    id: 'terracotta',
    name: '陶土宣纸',
    fallback: true,
    vars: { bg: '#f4efe6', card: '#fffaf2', ink: '#1c1914', mid: '#3d3428', sakura: '#b4532a', teal: '#c4a15a', radius: '14px' },
    layout: 'default',
  },
  {
    id: 'matcha',
    name: '抹茶山房',
    vars: { bg: '#eef3ea', card: '#f7faf5', ink: '#1c3228', mid: '#2a4a38', sakura: '#3d5c45', teal: '#8a9a62', radius: '18px' },
    layout: 'editorial',
  },
  {
    id: 'ink',
    name: '墨金夜宴',
    vars: { bg: '#14110e', card: '#1c1914', ink: '#f4efe6', mid: '#c4b8a4', sakura: '#d4b36a', teal: '#8a7a68', radius: '10px' },
    layout: 'poster',
  },
  {
    id: 'coast',
    name: '海风蓝瓷',
    vars: { bg: '#eef4f7', card: '#ffffff', ink: '#16324f', mid: '#3d5a73', sakura: '#2a6f97', teal: '#5fa8d3', radius: '16px' },
    layout: 'editorial',
  },
  {
    id: 'rose',
    name: '绯樱手帐',
    vars: { bg: '#f8eee9', card: '#fff8f5', ink: '#3d1f24', mid: '#6b3a40', sakura: '#c45c5c', teal: '#d4a15a', radius: '20px' },
    layout: 'poster',
  },
  {
    id: 'slate',
    name: '青灰石庭',
    vars: { bg: '#eceae6', card: '#f7f6f3', ink: '#242422', mid: '#5c5a54', sakura: '#6b6b5c', teal: '#8a8680', radius: '8px' },
    layout: 'dense',
  },
  {
    id: 'sand',
    name: '沙金驿馆',
    vars: { bg: '#f3ead6', card: '#fff8e8', ink: '#3d2e16', mid: '#6b5428', sakura: '#c48a2a', teal: '#d4b36a', radius: '12px' },
    layout: 'default',
  },
  {
    id: 'night',
    name: '绀青旅馆',
    vars: { bg: '#12161c', card: '#1b222c', ink: '#e8eef4', mid: '#9aa8b5', sakura: '#5b8def', teal: '#7d9a78', radius: '14px' },
    layout: 'poster',
  },
]

const FALLBACK = THEMES[0]

export function listThemeIds() {
  return THEMES.map((t) => t.id)
}

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || FALLBACK
}

const DEST_RULES = [
  [/京都|奈良|金泽|茶寮|寺社|抹茶|町屋/, 'matcha'],
  [/冲绳|海岛|厦门|青岛|大连|海岸|海滩|三亚|舟山|鼓浪/, 'coast'],
  [/东京|夜景|酒吧|上海/, 'night'],
  [/夜宴|金阁|水墨/, 'ink'],
  [/樱|春游|武汉|花见/, 'rose'],
  [/西安|蜀|汉中|敦煌|丝路|西北|沙漠|剑门|秦岭/, 'sand'],
  [/北京|苏州|园林|杭州|石庭/, 'slate'],
]

export function pickTheme(seed, preferId) {
  if (preferId && THEMES.some((t) => t.id === preferId)) return getTheme(preferId)
  const text = String(seed || 'trip')
  const destHit = DEST_RULES.find(([re]) => re.test(text))
  if (destHit) return getTheme(destHit[1])
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 33 + text.charCodeAt(i)) >>> 0
  const pool = THEMES.filter((t) => !t.fallback)
  return pool[hash % pool.length]
}

export function nextTheme(id) {
  const i = THEMES.findIndex((t) => t.id === id)
  return THEMES[(i + 1) % THEMES.length]
}

function rgbOf(hex) {
  const h = String(hex).replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
}

function hexOf(rgb) {
  return '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')
}

function mix(a, b, t) {
  const x = rgbOf(a)
  const y = rgbOf(b)
  return hexOf(x.map((c, i) => c + (y[i] - c) * t))
}

function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// 把 color 往黑或白推，直到在 bg 上达到 min 对比度
function readable(color, bg, min) {
  const toward = luminance(bg) > 0.4 ? '#000000' : '#ffffff'
  let out = color
  for (let t = 0.05; contrast(out, bg) < min && t <= 1; t += 0.05) out = mix(color, toward, t)
  return out
}

function onColor(bg) {
  return contrast('#ffffff', bg) >= contrast('#1c1914', bg) ? '#ffffff' : '#1c1914'
}

export function themePalette(theme) {
  const v = (theme && theme.vars ? theme : FALLBACK).vars
  const card = v.card
  const raise = mix(card, v.ink, 0.07)
  const onCards = (color, min) => readable(readable(color, card, min), raise, min)
  const deep = readable(mix(v.sakura, '#000000', 0.55), '#ffffff', 7)
  const sakura = onCards(v.sakura, 4.5)
  return {
    bg: v.bg,
    card,
    raise,
    ink: onCards(v.ink, 7),
    mid: onCards(v.mid, 4.5),
    sakura,
    onSakura: onColor(sakura),
    teal: v.teal,
    tealInk: onCards(v.teal, 4.5),
    onTeal: onColor(v.teal),
    deep,
    deepLt: mix(deep, '#ffffff', 0.18),
    deepInk: onCards(deep, 4.5),
    deepAccent: readable(v.sakura, deep, 4.5),
  }
}

export function themeCss(theme) {
  const t = theme && theme.vars ? theme : FALLBACK
  const v = t.vars
  const p = themePalette(t)
  const layout = {
    editorial: `.hero-title,h1{letter-spacing:.12em;font-weight:800}.slot-name{font-size:22px!important;letter-spacing:.06em}.slot-card{padding:6px 6px 14px}.section-header{letter-spacing:.16em}`,
    poster: `.hero-title{font-size:clamp(36px,6vw,64px)!important;font-weight:900}.slot-img-wrap{min-height:240px!important}.overview-card,.slot-card{border-radius:20px}.hero{min-height:280px}.slot-kind{letter-spacing:.14em}`,
    dense: `.slot-img-wrap{min-height:156px!important}.slot-review,.hero-sub{font-size:12px}.overview-card{padding:10px}.slot-card{border-radius:8px}.hero-title{font-size:clamp(28px,5vw,44px)!important}`,
    default: `.hero-title{letter-spacing:.08em}.slot-card{border-radius:var(--radius)}`,
  }[t.layout] || ''
  return `
:root{
  --bg:${p.bg}!important;
  --bg-card:${p.card}!important;
  --bg-section:${p.bg}!important;
  --bg-raise:${p.raise};
  --ink:${p.ink}!important;
  --ink-mid:${p.mid}!important;
  --ink-soft:${p.mid}!important;
  --sakura:${p.sakura}!important;
  --sakura-lt:${p.sakura}!important;
  --teal:${p.teal}!important;
  --teal-lt:${p.teal}!important;
  --teal-ink:${p.tealInk};
  --indigo:${p.deep}!important;
  --indigo-lt:${p.deepLt}!important;
  --deep-ink:${p.deepInk};
  --deep-accent:${p.deepAccent};
  --radius:${v.radius}!important;
}
body{background:var(--bg)!important;color:var(--ink)!important}
.hero-title,.day-weekday,.checklist-title{color:#fff!important}
.hero-eyebrow{color:#f4e8c8!important}
.hero-sub,.hero-badge{color:rgba(255,248,230,.94)!important}
.day-when-week,.day-brief{color:rgba(255,255,255,.9)!important}
.day-when-date{color:rgba(255,255,255,.74)!important}
.todo-text{color:rgba(255,255,255,.92)!important}
.todo-deadline,.hero-title span{color:var(--deep-accent)!important}
.slot-name,.overview-day,.craft-title,.hike-route-title,.hike-stop-name,.dish-name,.overview-route,.overview-cell{color:var(--ink)!important}
.craft-body,.hike-route-note,.hike-stop-row,.hike-route-meta,.overview-meta,.gallery-item figcaption,.slot-rating-num,.disclaimer-box,.ov-route,.ov-stay{color:var(--ink-mid)!important}
.craft-kicker,.overview-date,.hike-route-kicker,.hike-leg,.hike-stop-kind,.hike-stop-row b,.hike-stop-hot,.slot-cut,.gallery-kind,.ov-spot,.pill.sakura,.info-label{color:var(--sakura)!important}
.slot-time,.hotel-price,.dining-header,.day-alts-head,.seasonal-tag,.flight-tag,.pill.teal,.tier-economy,.ov-food{color:var(--teal-ink)!important}
.section-title,.pill,.flight-label,.hotel-area-name,.tier-mid{color:var(--deep-ink)!important}
.dining-section,.craft-card,.hike-route,.overview-card,.dining-item{background:var(--bg-raise)!important}
.hike-stop,.hike-stop.on{background:var(--bg-card)!important}
.route-pin__num{color:${p.onSakura}!important}
.dining-meal-badge{color:${p.onTeal}!important}
.hero{position:relative;overflow:hidden}
.slot-card,.section{background:var(--bg-card)!important;border-radius:var(--radius)}
.overview-card{border-radius:var(--radius)}
.action-link{display:inline-block;margin-top:8px;padding:4px 10px;border:1px solid var(--sakura);border-radius:999px;font-size:11px;letter-spacing:.08em;color:var(--sakura)!important;text-decoration:none}
.data-sources{margin-top:8px;font-size:11px;line-height:1.6;color:var(--ink-mid);opacity:.85}
${layout}
`
}

export function applyThemeToTrip(trip, { keepId, forceId, fallback } = {}) {
  const ui = trip.ui && typeof trip.ui === 'object' ? trip.ui : {}
  let theme
  if (fallback) theme = FALLBACK
  else if (forceId) theme = getTheme(forceId)
  else if (keepId) theme = getTheme(keepId)
  else theme = pickTheme(`${trip.title || ''} ${trip.ui && trip.ui.heroSub || ''}`)
  ui.themeId = theme.id
  ui.themeName = theme.name
  ui.themeCss = themeCss(theme)
  trip.ui = ui
  return theme
}
