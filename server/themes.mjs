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

export function themeCss(theme) {
  const t = theme && theme.vars ? theme : FALLBACK
  const v = t.vars
  const layout = {
    editorial: `.hero-title,h1{letter-spacing:.12em;font-weight:800}.slot-name{font-size:22px!important;letter-spacing:.06em}.slot-card{padding:6px 6px 14px}.section-header{letter-spacing:.16em}`,
    poster: `.hero-title{font-size:clamp(36px,6vw,64px)!important;font-weight:900}.slot-img-wrap{min-height:240px!important}.overview-card,.slot-card{border-radius:20px}.hero{min-height:280px}.slot-kind{letter-spacing:.14em}`,
    dense: `.slot-img-wrap{min-height:156px!important}.slot-review,.hero-sub{font-size:12px}.overview-card{padding:10px}.slot-card{border-radius:8px}.hero-title{font-size:clamp(28px,5vw,44px)!important}`,
    default: `.hero-title{letter-spacing:.08em}.slot-card{border-radius:var(--radius)}`,
  }[t.layout] || ''
  return `
:root{
  --bg:${v.bg}!important;
  --bg-card:${v.card}!important;
  --bg-section:${v.bg}!important;
  --ink:${v.ink}!important;
  --ink-mid:${v.mid}!important;
  --sakura:${v.sakura}!important;
  --sakura-lt:${v.sakura}!important;
  --teal:${v.teal}!important;
  --teal-lt:${v.teal}!important;
  --radius:${v.radius}!important;
}
body{background:var(--bg)!important;color:var(--ink)!important}
.hero-title,.slot-name,.day-theme{color:var(--ink)!important}
.hero-eyebrow,.hero-badge,.pill.sakura{color:var(--sakura)!important}
.hero{position:relative;overflow:hidden}
.slot-card,.overview-card,.section{background:var(--bg-card)!important;border-radius:var(--radius)}
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
