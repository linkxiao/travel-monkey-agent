export const PERSONAS = {
  stay: { id: 'stay', label: '旅居', tip: '按旅居节奏：半天一个点，三餐与午休优先，少搬少走。' },
  guide: { id: 'guide', label: '带队', tip: '按带队节奏：点名必看与可砍，写清集合与停车。' },
  trek: { id: 'trek', label: '探秘', tip: '按探秘节奏：写清值不值得、难度与补给。' },
}

export function normalizePersona(value) {
  const t = String(value || '').trim()
  if (/^stay$|旅居|退休|适老|中老/.test(t)) return 'stay'
  if (/^guide$|带队|导游|团操/.test(t)) return 'guide'
  if (/^trek$|探秘|驴友|专业徒步/.test(t)) return 'trek'
  return ''
}

export function detectPersona(text) {
  const t = String(text || '')
  const named = t.match(/人格[：:]\s*(旅居|带队|探秘|stay|guide|trek)/i)
  if (named) return normalizePersona(named[1])
  if (/探秘|驴友|专业徒步/.test(t)) return 'trek'
  if (/带队|导游|团操/.test(t)) return 'guide'
  if (/旅居|退休|适老|中老/.test(t)) return 'stay'
  return ''
}

export function personaLabel(id) {
  return PERSONAS[id]?.label || ''
}

export function personaTip(id) {
  return PERSONAS[id]?.tip || ''
}
