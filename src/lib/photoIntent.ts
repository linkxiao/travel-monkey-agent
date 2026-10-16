/**
 * 配图意图模型（组合式，不靠枚举话术）
 *
 * 原子信号：
 *   topic      — 在谈「图」
 *   universal  — 全称量词（全部/所有/都…）→ 作用于集合全体
 *   distribute — 分配量词（每天/每一天）→ 展开范围，不必然覆盖真图
 *   force      — 更换/覆盖语义
 *   repair     — 缺损/不对/补充/优化语义
 *   ellipsis   — 短答，依赖上一轮追问
 *   priorAsk   — 上一轮在问换图范围
 *
 * 合成：
 *   overwrite = (topic|ellipsis) ∧ universal ∧ (force | 对追问的全量肯定)
 *   repair    = topic ∧ ¬overwrite
 *             （含「换图」「图不对」：先审计，对号入座只动坏格）
 */

import { mentionedDays, resolveTargets } from './target.ts'
import type { Trip } from './trip.ts'

export type PhotoMode = 'fill_gaps' | 'replace'

export type PhotoSignals = {
  topic: boolean
  universal: boolean
  distribute: boolean
  force: boolean
  repair: boolean
  ellipsis: boolean
  priorAsk: boolean
}

export type PhotoRequest = {
  mode: PhotoMode
  names: string[]
  kinds: string[]
  hint: string
  days: number[]
  query: string
  /** true = overwrite 全量覆盖；false = fill_gaps 审计对号入座 */
  replace: boolean
  signals?: PhotoSignals
}

type Day = { slots?: Array<Record<string, unknown>>; dining?: Array<Record<string, unknown>>; [key: string]: unknown }

const PARTICLE = /[吧啊呀呢了嘛哟哦诶欸]+$/
const PUNCT = /[。.!！？?\s]+$/

function norm(text: string) {
  return String(text || '').trim().replace(PUNCT, '').replace(PARTICLE, '').trim()
}

/** 上一轮是否在追问配图范围（对话状态，不是话术表） */
export function isPhotoScopeClarify(text: string) {
  return /点名|哪一天|哪个景点|哪一格|换错|要换图|补哪/.test(String(text || ''))
}

/** 短答：几乎只有量词/更换词，需挂在 prior 上理解 */
function isEllipsisReply(text: string) {
  const t = norm(text)
  if (!t || [...t].length > 12) return false
  // 允许「全部都换」「所有图」「都换掉」这类短收口
  return /^(全部|所有|全都|通通|统统|都|全)/.test(t) || /^(都|全).{0,4}(换|改|要|行|可以)/.test(t)
}

/**
 * 从一句话抽出原子信号。只认语义类，不枚举完整句子。
 */
export function extractPhotoSignals(text: string, priorAsk = ''): PhotoSignals {
  const raw = String(text || '')
  const t = norm(raw)
  const prior = isPhotoScopeClarify(priorAsk)

  // 全称：作用于「所有成员」；「每天」是分配量词，另计
  const universal = /全部|所有|全都|通通|统统/.test(t)
    || /都\s*(换|改|要|替换|更新|重配)/.test(t)
    || /全\s*(换|改|替换)/.test(t)
    || (isEllipsisReply(raw) && /^(全部|所有|全都|都换|全换)/.test(t))

  const distribute = /每\s*[天日]|每一\s*[天日]|各\s*[天日]/.test(t)

  // 力：更换/覆盖（「换图」带 force，但无 universal 时仍走 repair）
  const force = /换|替换|更换|重配|覆盖|改掉/.test(t)

  // 修：缺损、质量、补充
  const repair = /缺|补|没有|没了|不对|有问题|优化|更新|美化|清楚|高清|模糊|错了|坏了|加载/.test(t)
    || /为(什么|啥).{0,24}(图|照片)/.test(t)

  const ellipsis = prior && isEllipsisReply(raw)

  // 对象：显式「图/照片」，或追问短答，或「全部都换」这类全体更换（可无「图」字）
  const topic = /图|照片|图像|配图|实拍|附图/.test(raw)
    || ellipsis
    || (universal && force)

  return { topic, universal, distribute, force, repair, ellipsis, priorAsk: prior }
}

/** 信号 → 操作：overwrite 仅当「全体 + 更换」；其余配图默认审计修复 */
export function composePhotoMode(s: PhotoSignals): PhotoMode {
  // 追问后的全称短答：「全部」「都换」→ 覆盖全体
  if (s.priorAsk && s.ellipsis && (s.universal || s.force)) return 'replace'
  // 全称 ∧ 更换 → 全体重搜覆盖
  if (s.topic && s.universal && s.force) return 'replace'
  // 「所有图 / 全部图片」即便动词省略，也视为全体覆盖
  if (s.topic && s.universal && !s.repair && !s.distribute) return 'replace'
  return 'fill_gaps'
}

export function wantsPhotos(text: string, priorAsk = '') {
  return extractPhotoSignals(text, priorAsk).topic || composePhotoMode(extractPhotoSignals(text, priorAsk)) === 'replace'
}

export function wantsFullPhotoReplace(text: string, priorAsk = '') {
  return composePhotoMode(extractPhotoSignals(text, priorAsk)) === 'replace'
}

export function interpretPhotoMode(text: string, opts?: { priorAsk?: string }): PhotoMode {
  return composePhotoMode(extractPhotoSignals(text, opts?.priorAsk || ''))
}

/** @deprecated 兼容旧名：短答全称 */
export function isPhotoAllFollowup(text: string) {
  return isEllipsisReply(text) && extractPhotoSignals(text).universal
}

export function wantsAllPhotoScope(text: string) {
  const s = extractPhotoSignals(text)
  return s.universal || s.distribute
}

export function wantsMissingPhotos(text: string) {
  const s = extractPhotoSignals(text)
  return s.topic && (s.repair || (!s.universal && s.force)) && composePhotoMode(s) === 'fill_gaps'
}

export function wantsReplacePhotos(text: string) {
  return wantsFullPhotoReplace(text)
}

export function wantsRoutePhotos(text: string) {
  return /线路图|路线图/.test(text) || (/线路/.test(text) && /图|缺|没/.test(text))
}

export function wantsRestPhotos(text: string) {
  return /(午休|茶歇).{0,30}(图|同一|换|对应|都用)/.test(text) || /同一张图/.test(text)
}

export function wantsSpotPhotos(text: string) {
  return /景点/.test(text) && /图|照片/.test(text)
}

export function explicitPhotoQuery(text: string): string {
  const t = String(text || '')
  const quoted = t.match(/[「『“"']([^」』”"']{3,30})[」』”"']/)
  if (quoted) {
    const q = quoted[1].trim()
    if (q && !/^(经济|中档|高端|参考)$/.test(q)) return q
  }
  const after = t.match(/(?:搜索|搜一下|搜|查)\s*[:：]?\s*([\u4e00-\u9fffA-Za-z0-9·\s]{3,30})/)
  if (after) {
    return after[1]
      .replace(/(然后|再|并|之后|以后|即可|就行|抓取|替换|更换|换图|配图|图片|照片|的图|更新|优化)[\s\S]*$/, '')
      .replace(/^(百度|抖音|小红书|点评|大众点评|网上|上|去|从)+/g, '')
      .trim()
  }
  return ''
}

/**
 * 唯一入口：信号 → 模式 → 范围。
 * fill_gaps：审计后对号入座；replace：范围内全部重搜覆盖。
 */
export function resolvePhotoIntent(text: string, trip: Trip | null, opts?: { priorAsk?: string }): PhotoRequest {
  const prior = String(opts?.priorAsk || '')
  const signals = extractPhotoSignals(text, prior)
  const mode = composePhotoMode(signals)
  const effective = String(text || '')

  const target = resolveTargets(effective, trip, { photoAsk: true })
  const names = mode === 'replace' ? [] : [...target.names]
  const kinds: string[] = []
  if (wantsRoutePhotos(effective)) kinds.push('route')
  if (wantsRestPhotos(effective) && trip && mode !== 'replace') {
    for (const day of (trip.days || []) as Day[]) {
      for (const slot of day.slots || []) {
        if (/午休|茶歇|休息|歇脚/.test(String(slot.name || ''))) names.push(String(slot.name || ''))
      }
    }
  }

  let days = [...target.days]
  // 未点名具体店：全称/分配/修复/覆盖 → 扫整趟（或已点名的天）
  const widen = mode === 'replace' || signals.universal || signals.distribute || mode === 'fill_gaps'
  if (widen && trip && !names.length) {
    const n = ((trip.days || []) as Day[]).length
    if (n > 0) days = days.length ? days : Array.from({ length: n }, (_, i) => i + 1)
    // 点了部分天就尊重；一个都没点则全天
    if (!mentionedDays(effective).length && n > 0) {
      days = Array.from({ length: n }, (_, i) => i + 1)
    }
  }

  const scene = String(target.hint || '').match(/星空|夜观|夜景|银河|观星|日出|日落|云海|雪景|雾凇|晚霞|花海|夕阳|晨雾/g) || []
  return {
    mode,
    names: [...new Set(names.filter(Boolean))],
    kinds: [...new Set(kinds)],
    hint: [...new Set(scene)].join(' '),
    days,
    query: explicitPhotoQuery(effective),
    replace: mode === 'replace',
    signals,
  }
}

export function interpretPhotoIntent(text: string, trip: Trip | null, opts?: { priorAsk?: string }) {
  return resolvePhotoIntent(text, trip, opts)
}

export function collectPhotoRequest(text: string, trip: Trip | null, opts?: { priorAsk?: string }) {
  return resolvePhotoIntent(text, trip, opts)
}
