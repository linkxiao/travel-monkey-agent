export const THEMES = [
  {
    id: 'terracotta',
    name: '岩土',
    fallback: true,
    vars: { bg: '#f4f3f0', card: '#ffffff', ink: '#1d1b18', mid: '#57524b', sakura: '#a24c27', teal: '#8c7a5b', radius: '12px' },
  },
  {
    id: 'matcha',
    name: '山房',
    vars: { bg: '#f1f4f0', card: '#ffffff', ink: '#16261d', mid: '#4a5a50', sakura: '#3b6a4c', teal: '#7f8f5a', radius: '12px' },
  },
  {
    id: 'ink',
    name: '墨夜',
    vars: { bg: '#131311', card: '#1c1b19', ink: '#f2efe8', mid: '#b7b0a2', sakura: '#d2b06a', teal: '#8f8574', radius: '12px' },
  },
  {
    id: 'coast',
    name: '海岸',
    vars: { bg: '#f1f4f6', card: '#ffffff', ink: '#13283d', mid: '#4a5d70', sakura: '#1f6790', teal: '#4f93bb', radius: '12px' },
  },
  {
    id: 'rose',
    name: '花信',
    vars: { bg: '#f7f3f2', card: '#ffffff', ink: '#33191d', mid: '#6e4c50', sakura: '#a8424a', teal: '#b9874d', radius: '12px' },
  },
  {
    id: 'slate',
    name: '石庭',
    vars: { bg: '#f2f2f0', card: '#ffffff', ink: '#222220', mid: '#5a5852', sakura: '#485754', teal: '#7f7b74', radius: '12px' },
  },
  {
    id: 'sand',
    name: '沙丘',
    vars: { bg: '#f5f1e9', card: '#ffffff', ink: '#2e2414', mid: '#665741', sakura: '#996a1c', teal: '#b9974f', radius: '12px' },
  },
  {
    id: 'night',
    name: '夜航',
    vars: { bg: '#10141a', card: '#181e26', ink: '#e8eef4', mid: '#9aa8b5', sakura: '#78a2ef', teal: '#7d9a78', radius: '12px' },
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
  const deep = readable(mix(v.sakura, '#15171a', 0.74), '#ffffff', 7)
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
  const dark = luminance(p.bg) < 0.2
  return `
:root{
  --bg:${p.bg};
  --bg-card:${p.card};
  --bg-raise:${p.raise};
  --ink:${p.ink};
  --ink-mid:${p.mid};
  --ink-soft:${p.mid};
  --sakura:${p.sakura};
  --teal:${p.teal};
  --teal-ink:${p.tealInk};
  --indigo:${p.deep};
  --indigo-lt:${p.deepLt};
  --deep-ink:${p.deepInk};
  --deep-accent:${p.deepAccent};
  --radius:${v.radius};
  --rule:${dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)'};
}
.hero-title,.day-weekday,.checklist-title{color:#fff!important}
.day-when-week,.day-brief{color:rgba(255,255,255,.9)!important}
.day-when-date{color:rgba(255,255,255,.7)!important}
.todo-text{color:rgba(255,255,255,.9)!important}
.todo-deadline{color:var(--deep-accent)!important}
.slot-name,.overview-day,.craft-title,.dish-name,.overview-cell{color:var(--ink)!important}
.craft-body,.overview-meta,.disclaimer-box{color:var(--ink-mid)!important}
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
