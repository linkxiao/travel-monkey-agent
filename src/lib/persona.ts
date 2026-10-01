export const PERSONAS = [
  { id: 'stay', label: '旅居', hint: '退休慢游 · 劳逸结合' },
  { id: 'guide', label: '带队', hint: '经典线路 · 吃喝玩乐' },
  { id: 'trek', label: '探秘', hint: '自然探索 · 挑战体验' },
] as const

export type PersonaId = (typeof PERSONAS)[number]['id']

export function normalizePersona(value: string) {
  const t = String(value || '').trim()
  if (/^stay$|旅居|退休|适老|中老/.test(t)) return 'stay'
  if (/^guide$|带队|导游|团操/.test(t)) return 'guide'
  if (/^trek$|探秘|驴友|专业徒步/.test(t)) return 'trek'
  return ''
}

export function detectPersona(text: string) {
  const t = String(text || '')
  const named = t.match(/人格[：:]\s*(旅居|带队|探秘|stay|guide|trek)/i)
  if (named) return normalizePersona(named[1])
  if (/探秘|驴友|专业徒步/.test(t)) return 'trek'
  if (/带队|导游|团操/.test(t)) return 'guide'
  if (/旅居|退休|适老|中老/.test(t)) return 'stay'
  return ''
}

export function personaLabel(id: string) {
  return PERSONAS.find((p) => p.id === id)?.label || ''
}
