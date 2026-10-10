// 跨行程画像：只留确认过的长期偏好。日期、天数、必去、不去、这趟的出发地不进这里。
import type { Fact } from './memory.ts'
import { normalizePersona, personaLabel, type PersonaId } from './persona.ts'

export type StayTier = '经济' | '中档' | '高端'

export type Profile = {
  persona: PersonaId | ''
  diet: string[]
  tier: StayTier | ''
  home: string
}

const STORAGE_KEY = 'ct.profile'

export function emptyProfile(): Profile {
  return { persona: '', diet: [], tier: '', home: '' }
}

export function isEmptyProfile(profile: Profile) {
  return !profile.persona && profile.diet.length === 0 && !profile.tier && !profile.home
}

function asTier(value: string): StayTier | '' {
  if (/经济/.test(value)) return '经济'
  if (/高端|五星|豪华/.test(value)) return '高端'
  if (/中档/.test(value)) return '中档'
  return ''
}

function cleanHome(raw: string) {
  const name = raw.replace(/(这边|那里|这里|一带|附近|的|了|吧|啊)$/g, '').trim()
  if (name.length < 2 || name.length > 8) return ''
  if (/酒店|宾馆|民宿|客栈|这趟|今天|明天/.test(name)) return ''
  return name
}

export function homeFromLines(lines: string[]) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const matched = String(lines[i] || '').match(/(?:常住|家在|住在|人在)([\u4e00-\u9fff]{2,8})/)
    const home = matched ? cleanHome(matched[1]) : ''
    if (home) return home
  }
  return ''
}

export function proposeProfile(opts: { persona?: string; facts: Fact[]; userLines: string[] }): Profile {
  const persona = normalizePersona(opts.persona || '') as PersonaId | ''
  const diet = [...new Set(opts.facts.filter((fact) => fact.key === 'diet').map((fact) => fact.value))]
  let tier: StayTier | '' = ''
  opts.facts.forEach((fact) => {
    if (fact.key !== 'stay') return
    const next = asTier(fact.value)
    if (next) tier = next
  })
  return { persona, diet, tier, home: homeFromLines(opts.userLines) }
}

export function mergeProfile(base: Profile, extra: Profile): Profile {
  return {
    persona: extra.persona || base.persona,
    diet: extra.diet.length ? [...new Set([...base.diet, ...extra.diet])] : base.diet,
    tier: extra.tier || base.tier,
    home: extra.home || base.home,
  }
}

export function removeProfilePart(profile: Profile, part: 'persona' | 'tier' | 'home' | 'diet', dietValue = ''): Profile {
  if (part === 'diet') return { ...profile, diet: profile.diet.filter((item) => item !== dietValue) }
  if (part === 'persona') return { ...profile, persona: '' }
  if (part === 'tier') return { ...profile, tier: '' }
  return { ...profile, home: '' }
}

export function profileBlock(profile: Profile) {
  if (isEmptyProfile(profile)) return ''
  const lines = [
    profile.persona ? `人格：${personaLabel(profile.persona)}` : '',
    profile.diet.length ? `忌口：${profile.diet.join('、')}` : '',
    profile.tier ? `住宿档位：${profile.tier}` : '',
    profile.home ? `常住：${profile.home}` : '',
  ].filter(Boolean)
  return '跨行程画像（用户确认过的长期偏好，新行程也照此；日期、天数、必去、不去不要写进这里）：\n- ' + lines.join('\n- ')
}

export function profileLines(profile: Profile) {
  return profileBlock(profile).split('\n').slice(1)
}

export function wantsRemember(text: string) {
  return /记住我|帮我记住|记到下一趟|这趟结束了|行程结束/.test(String(text || ''))
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyProfile()
    const data = JSON.parse(raw) as Partial<Profile>
    const diet = Array.isArray(data.diet) ? data.diet.map((item) => String(item || '').trim()).filter((item) => item.length >= 2) : []
    return {
      persona: normalizePersona(data.persona || '') as PersonaId | '',
      diet: [...new Set(diet)].slice(0, 8),
      tier: asTier(data.tier || ''),
      home: cleanHome(String(data.home || '')),
    }
  } catch {
    return emptyProfile()
  }
}

export function saveProfile(profile: Profile) {
  try {
    if (isEmptyProfile(profile)) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    /* 浏览器拒写时，这一页里的画像还在 */
  }
}
