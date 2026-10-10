import { useEffect, useMemo, useRef, useState } from 'react'
import { attachmentsToPrompt, filesFromPaste, prettyBytes, readAttachments, wantsVision, type Attachment } from './lib/attach'
import { streamChat, type ChatMessage } from './lib/chat'
import { copyHtml, exportH5, exportImage, sharePage } from './lib/export'
import { getProvider, isAuthFail, keyLooksUnusable, keyMismatchHint, PROVIDERS, sanitizeApiKey } from './lib/models'
import { WELCOME_HTML } from './lib/prompt'
import { fetchResearch, type ResearchBrief } from './lib/research'
import { renderTripPage } from './lib/render'
import { detectPersona, PERSONAS, personaLabel } from './lib/persona'
import { isEmptyProfile, loadProfile, mergeProfile, profileLines, proposeProfile, removeProfilePart, saveProfile, wantsRemember, type Profile } from './lib/profile'
import { ASK_WRITE_HINT, choicesForQuestion, extractAskItems, formatAskAnswers, tripFromPlan } from './lib/plan'
import { buildChatMessages, buildFillMessages, buildPlanMessages, factsPair } from './lib/context'
import { avoidHits, FACT_LABELS, learnFromModel, learnFromUser, modelDrops, namesHitAvoid, normalizeModelFacts, planAvoidHits, removeFact, sortFacts, takeMemo, type Fact, type MemoUpdate } from './lib/memory'
import { isEmptySession, listSessions, loadSession, newSessionId, removeSession, saveSession, sessionTitle, type SessionData, type SessionMeta } from './lib/session'
import { applyAdds, applyChanges, applyPhotoTo, applyReplaceDays, collectPhotoRequest, collectPhotos, digestTrip, extractEnvelope, extractTrip, findUnseenInHtml, inferEditFrom, inferLocalEdit, isBoilerReply, isEditReceipt, mentionedDay, photoOutcome, stripBoilerReply, stripEditClaim, wantsPageSync, wantsPhotos, wantsTripEdit, type Trip } from './lib/trip'

const THEME_IDS = ['terracotta', 'matcha', 'ink', 'coast', 'rose', 'slate', 'sand', 'night']
const THEME_ALIASES: Array<[string, RegExp]> = [
  ['terracotta', /陶土|宣纸/],
  ['matcha', /抹茶|山房/],
  ['ink', /墨金|夜宴/],
  ['coast', /海风|蓝瓷/],
  ['rose', /绯樱|手帐/],
  ['slate', /青灰|石庭/],
  ['sand', /沙金|驿馆/],
  ['night', /绀青|旅馆/],
]

function themeFromText(text: string) {
  return THEME_ALIASES.find(([, re]) => re.test(text))?.[0]
}

function isConfirm(text: string) {
  return /^(确认出页|确认生成|就按这个出页|按这个出页)[。.!！]?$/.test(text.trim())
}

type Bubble = { role: 'user' | 'assistant'; text: string; pending?: boolean }

const EXAMPLES = [
  '京都、奈良5天4晚、两人，偏寺庙、樱花、咖啡和人文古迹和，住町屋',
  '深圳周边3天2晚、一家三口，偏亲子与海边，住较场尾',
  '甘南6天5晚、两人轻装，偏徒步、星空、人文、自然和美食，住县城方便出山',
]

function loadSetting(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function looksLikePageUrl(value: string) {
  const s = value.trim()
  return /^https?:\/\//i.test(s) || /127\.0\.0\.1|localhost/i.test(s)
}

export default function App() {
  const [providerId, setProviderId] = useState(() => loadSetting('ct.provider', 'openrouter'))
  const [modelId, setModelId] = useState(() => loadSetting('ct.model', 'anthropic/claude-sonnet-4.5'))
  const [apiKey, setApiKey] = useState(() => {
    const saved = sanitizeApiKey(loadSetting('ct.key', ''))
    return looksLikePageUrl(saved) ? '' : saved
  })
  const [customBaseUrl, setCustomBaseUrl] = useState(() => loadSetting('ct.base', ''))
  const [customModel, setCustomModel] = useState(() => loadSetting('ct.customModel', ''))
  const [input, setInput] = useState('')
  const [html, setHtml] = useState(WELCOME_HTML)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [versions, setVersions] = useState<Array<{ label: string; trip: Trip; html: string }>>(() => {
    try {
      const raw = localStorage.getItem('ct.versions')
      const arr = raw ? JSON.parse(raw) : []
      return Array.isArray(arr) ? arr.filter((v) => v && v.trip && v.html).slice(-5) : []
    } catch { return [] }
  })
  const [versionSel, setVersionSel] = useState(-1)
  const [report, setReport] = useState<{ errors: string[]; warnings: string[] }>({ errors: [], warnings: [] })
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone')
  const [shareOpen, setShareOpen] = useState(false)
  const [skillLabel, setSkillLabel] = useState('')
  const [amapKey, setAmapKey] = useState(() => loadSetting('ct.amap', ''))
  const [searchKey, setSearchKey] = useState(() => loadSetting('ct.search', ''))
  const [searchProvider, setSearchProvider] = useState(() => loadSetting('ct.searchPv', 'tavily'))
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [planDraft, setPlanDraft] = useState('')
  const [planAnswers, setPlanAnswers] = useState<string[]>([])
  const [planningPersona, setPlanningPersona] = useState('')
  const [profile, setProfile] = useState<Profile>(() => loadProfile())
  const [profileOffer, setProfileOffer] = useState<Profile | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const researchRef = useRef<{ done?: boolean; query?: string; brief?: string; sources?: ResearchBrief['sources']; hotelsByTier?: ResearchBrief['hotelsByTier'] }>({})
  const [facts, setFacts] = useState<Fact[]>([])
  // 同一轮里先记约束再发请求，state 来不及更新，发请求时读 ref
  const factsRef = useRef<Fact[]>([])
  const profileRef = useRef<Profile>(profile)
  const [sessionId, setSessionId] = useState('')
  const [sessionList, setSessionList] = useState<SessionMeta[]>([])
  const [hydrated, setHydrated] = useState(false)
  const createdRef = useRef(Date.now())

  const provider = getProvider(providerId)
  const model = providerId === 'custom' ? (customModel || 'gpt-4o') : modelId
  const canConfirm = Boolean(planDraft && !trip)
  const askItems = useMemo(() => {
    if (canConfirm) return extractAskItems(planDraft, { loose: true })
    if (!trip) return []
    const last = [...bubbles].reverse().find((b) => b.role === 'assistant' && !b.pending && String(b.text || '').trim())
    return last ? extractAskItems(last.text) : []
  }, [canConfirm, planDraft, trip, bubbles])
  const planQuestions = askItems

  useEffect(() => {
    localStorage.setItem('ct.provider', providerId)
    localStorage.setItem('ct.model', modelId)
    localStorage.setItem('ct.key', apiKey)
    localStorage.setItem('ct.base', customBaseUrl)
    localStorage.setItem('ct.customModel', customModel)
    localStorage.setItem('ct.amap', amapKey)
    localStorage.setItem('ct.search', searchKey)
    localStorage.setItem('ct.searchPv', searchProvider)
  }, [providerId, modelId, apiKey, customBaseUrl, customModel, amapKey, searchKey, searchProvider])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [bubbles, busy])

  const askKey = askItems.map((item) => item.question).join('\n')
  useEffect(() => {
    setPlanAnswers(askItems.map(() => ''))
  }, [askKey])

  useEffect(() => {
    if (loadSetting('ct.keyBad', '') && sanitizeApiKey(apiKey)) {
      setError('上次这个密钥没通过，浏览器还记着旧的。请到官网复制新的，粘贴到上方后再发。')
    }
  }, [])

  useEffect(() => {
    fetch('/api/skill')
      .then((r) => r.json())
      .then((data) => {
        const names = (data.files || []).filter((f: { loaded?: boolean }) => f.loaded).map((f: { title: string }) => f.title)
        setSkillLabel(names.length ? `已加载 skill：${names.join(' + ')}` : '')
      })
      .catch(() => setSkillLabel(''))
  }, [])

  useEffect(() => {
    profileRef.current = profile
    saveProfile(profile)
  }, [profile])

  function commitFacts(next: Fact[]) {
    factsRef.current = next
    setFacts(next)
  }

  function learnUser(text: string) {
    commitFacts(learnFromUser(factsRef.current, text))
  }

  function learnModel(update: MemoUpdate) {
    if (update.facts.length || update.drops.length) commitFacts(learnFromModel(factsRef.current, update))
  }

  function rememberSessionId(id: string) {
    try { localStorage.setItem('ct.session', id) } catch { /* ignore */ }
  }

  function resetWorkspace(s?: SessionData) {
    abortRef.current?.abort()
    setBubbles(s?.bubbles || [])
    setTrip(s?.trip || null)
    setHtml(s?.trip && s.html ? s.html : WELCOME_HTML)
    setPlanDraft(s?.planDraft || '')
    setPlanningPersona(s?.persona || '')
    researchRef.current = (s?.research || {}) as typeof researchRef.current
    commitFacts(s?.facts || [])
    setVersions(s?.versions || [])
    setVersionSel(-1)
    setReport({ errors: [], warnings: [] })
    setError('')
    setAttachments([])
    setInput('')
    createdRef.current = s?.createdAt || Date.now()
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      const id = loadSetting('ct.session', '')
      const saved = id ? await loadSession(id).catch(() => null) : null
      if (!alive) return
      if (saved) {
        resetWorkspace(saved)
        setSessionId(saved.id)
      } else {
        const fresh = newSessionId()
        rememberSessionId(fresh)
        setSessionId(fresh)
        const remembered = loadProfile()
        if (remembered.persona) setPlanningPersona(remembered.persona)
      }
      setSessionList(await listSessions().catch(() => []))
      if (alive) setHydrated(true)
    })()
    return () => { alive = false }
  }, [])

  async function persistNow() {
    if (!hydrated || !sessionId) return
    const data: SessionData = {
      id: sessionId,
      title: '',
      createdAt: createdRef.current,
      updatedAt: Date.now(),
      bubbles: bubbles.filter((b) => !b.pending).map(({ role, text }) => ({ role, text })),
      trip,
      html: trip ? html : '',
      planDraft,
      persona: planningPersona,
      research: researchRef.current,
      facts: factsRef.current,
      versions,
    }
    if (isEmptySession(data) && !sessionList.some((s) => s.id === sessionId)) return
    data.title = sessionTitle(data)
    try {
      await saveSession(data)
      setSessionList(await listSessions())
      // 旧版把版本放在 localStorage，进了会话就不再要它
      localStorage.removeItem('ct.versions')
    } catch { /* 存不下就只留在内存里 */ }
  }

  useEffect(() => {
    if (!hydrated || !sessionId || busy) return
    const timer = window.setTimeout(() => void persistNow(), 400)
    return () => window.clearTimeout(timer)
  }, [hydrated, sessionId, busy, bubbles, trip, html, planDraft, planningPersona, facts, versions])

  async function newTrip() {
    if (busy) return
    await persistNow()
    const id = newSessionId()
    resetWorkspace()
    if (profileRef.current.persona) setPlanningPersona(profileRef.current.persona)
    rememberSessionId(id)
    setSessionId(id)
    setProfileOffer(null)
  }

  async function switchTrip(id: string) {
    if (busy || !id || id === sessionId) return
    await persistNow()
    const s = await loadSession(id).catch(() => null)
    if (!s) {
      showToast('这趟行程读不出来了')
      setSessionList(await listSessions().catch(() => []))
      return
    }
    resetWorkspace(s)
    rememberSessionId(s.id)
    setSessionId(s.id)
  }

  async function dropTrip(id: string) {
    if (busy) return
    const meta = sessionList.find((s) => s.id === id)
    if (!window.confirm(`删除「${meta?.title || '这趟行程'}」？对话、页面和版本都会删掉。`)) return
    // 先换掉当前会话，免得还没触发的自动保存把刚删的又写回去
    if (id === sessionId) {
      resetWorkspace()
      if (profileRef.current.persona) setPlanningPersona(profileRef.current.persona)
      const fresh = newSessionId()
      rememberSessionId(fresh)
      setSessionId(fresh)
    }
    await removeSession(id).catch(() => {})
    setSessionList(await listSessions().catch(() => []))
  }

  const previewDoc = useMemo(() => html, [html])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2400)
  }

  async function applyTrip(next: Trip, opts?: { themeId?: string; keepThemeId?: string; fallback?: boolean; skipPhotos?: boolean; skipTransport?: boolean; replacePhotos?: boolean; photoNames?: string[]; photoKinds?: string[]; photoHint?: string; photoDays?: number[]; photoQuery?: string }) {
    const out = await renderTripPage(next, {
      ...opts,
      amapKey: amapKey.trim() || undefined,
      searchKey: searchKey.trim() || undefined,
      searchProvider,
    })
    setTrip(out.trip)
    setHtml(out.html)
    setReport({ errors: out.errors || [], warnings: out.warnings || [] })
    if (out.trip && Array.isArray((out.trip as unknown as { days?: unknown[] }).days) && ((out.trip as unknown as { days?: unknown[] }).days as unknown[]).length) {
      const label = new Date().toLocaleString('zh-CN', { hour12: false }).slice(5, 16)
      const entry = { label, trip: out.trip as Trip, html: out.html }
      setVersions((prev) => {
        const last = prev[prev.length - 1]
        if (last && JSON.stringify(last.trip) === JSON.stringify(out.trip)) return prev
        return [...prev.slice(-9), entry]
      })
      setVersionSel(-1)
    }
    return out
  }

  function rollbackVersion(index: number) {
    const v = versions[index < 0 ? versions.length - 1 : index]
    if (!v) return
    setTrip(v.trip)
    setHtml(v.html)
    setReport({ errors: [], warnings: [] })
    showToast(`已回到 ${v.label} 那一版`)
  }

  async function restyle(preferId?: string) {
    if (!trip) {
      showToast('先生成一页再换皮')
      return
    }
    const cur = String((trip.ui as { themeId?: string } | undefined)?.themeId || 'terracotta')
    const next = preferId && THEME_IDS.includes(preferId)
      ? preferId
      : THEME_IDS[(THEME_IDS.indexOf(cur) + 1 + THEME_IDS.length) % THEME_IDS.length] || THEME_IDS[0]
    const out = await applyTrip(trip, { themeId: next, skipPhotos: true, skipTransport: true })
    showToast(out.fallback ? '换皮未通过校验，已回退陶土模具' : `已换皮：${out.themeName || next}`)
    return out
  }

  async function loadSeed() {
    try {
      const res = await fetch('/seed/trip.json')
      if (!res.ok) {
        showToast('没有找到本地示例行程表')
        return
      }
      const data = await res.json()
      const out = await applyTrip(data, { skipPhotos: true, skipTransport: true })
      setPlanDraft('')
      setPlanAnswers([])
      setPlanningPersona('')
      showToast(out.themeName ? `已载入示例行程（${out.themeName}）` : '已载入示例行程表')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function ensureResearch(query: string) {
    if (researchRef.current.done && researchRef.current.query === query) return researchRef.current
    if (!amapKey.trim() && !searchKey.trim()) {
      researchRef.current = {
        done: true,
        query,
        brief: '无 Key 模式：坐标、交通、酒店价格均为模型记忆参考，出行前请以官方渠道核实。',
        sources: [{ name: '模型记忆', scope: '无 Key 参考', realtime: false }],
        hotelsByTier: undefined,
      }
      return researchRef.current
    }
    try {
      const research = await fetchResearch({
        query,
        amapKey: amapKey.trim(),
        searchKey: searchKey.trim(),
        searchProvider,
      })
      researchRef.current = {
        done: true,
        query,
        brief: research.brief || '',
        sources: research.sources,
        hotelsByTier: research.hotelsByTier,
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '调研跳过')
      researchRef.current = { done: true, query, brief: '', sources: [], hotelsByTier: undefined }
    }
    return researchRef.current
  }

  async function streamTo(history: ChatMessage[], mode: 'plan' | 'fill' | 'talk' | 'edit' | 'look', pendingText: string, live = false, images: string[] = []) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    let acc = ''
    await streamChat({
      provider: providerId,
      model,
      apiKey: sanitizeApiKey(apiKey),
      customBaseUrl,
      messages: history,
      mode,
      images,
      signal: ac.signal,
      onDelta: (delta) => {
        acc += delta
        setBubbles((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { role: 'assistant', text: live ? takeMemo(acc).text : pendingText, pending: true }
          }
          return next
        })
      },
    })
    try { localStorage.removeItem('ct.keyBad') } catch { /* ignore */ }
    return { acc, signal: ac.signal }
  }

  function rememberKeyFailed() {
    try { localStorage.setItem('ct.keyBad', '1') } catch { /* ignore */ }
  }

  function showFail(msg: string) {
    const auth = isAuthFail(msg)
    if (auth) rememberKeyFailed()
    setError(msg)
    const chat = auth ? '密钥没通过。请在上方重新粘贴完整 Key 后再发。' : `出错了：${msg}`
    setBubbles((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.pending) next[next.length - 1] = { role: 'assistant', text: chat }
      else next.push({ role: 'assistant', text: chat })
      return next
    })
  }

  async function runPlan(text: string) {
    const picked = planningPersona && !detectPersona(text)
      ? `规划人格：${personaLabel(planningPersona)}。按此人格写大纲。\n${text}`
      : text
    const research = await ensureResearch(text)
    const history: ChatMessage[] = buildPlanMessages({ brief: research.brief, facts: factsRef.current, bubbles, planDraft, text: picked, profile: profileRef.current })
    const first = await streamTo(history, 'plan', '正在写按天的大纲…', true)
    if (first.signal.aborted) return
    let acc = first.acc
    if (!acc.trim()) throw new Error('模型没有返回计划')
    let memo = takeMemo(acc)
    learnModel(memo)
    // 用户说过不去的点又排进了大纲：打回一次，不让用户自己去挑
    const hits = planAvoidHits(memo.text, factsRef.current)
    if (hits.length) {
      const again = await streamTo([
        ...history,
        { role: 'assistant', content: acc },
        { role: 'user', content: `大纲里又排了用户明确说不去的「${hits.join('、')}」。删掉换成同片区同类的点，其余不变，输出完整大纲。` },
      ], 'plan', '大纲里有你说不去的点，正在换掉…', true)
      if (again.signal.aborted) return
      if (again.acc.trim()) {
        acc = again.acc
        memo = takeMemo(acc)
        learnModel(memo)
      }
    }
    const nextPlan = memo.text
    const found = detectPersona(nextPlan)
    if (found) setPlanningPersona(found)
    setPlanDraft(nextPlan)
    setPlanAnswers(extractAskItems(nextPlan).map(() => ''))
    const still = planAvoidHits(nextPlan, factsRef.current)
    setBubbles((prev) => {
      const next = [...prev]
      next[next.length - 1] = {
        role: 'assistant',
        text: nextPlan
          + (still.length ? `\n\n注意：大纲里仍有你说不去的「${still.join('、')}」，出页时会再换一次；也可以直接说换成什么。` : '')
          + '\n\n下面先点选项或自己写，看完后再点「提交答复」；也可以直接「确认生成」。',
      }
      return next
    })
  }

  async function runFill(plan: string) {
    const research = researchRef.current
    const history: ChatMessage[] = buildFillMessages({ brief: research.brief, facts: factsRef.current, bubbles, plan, profile: profileRef.current })
    let acc = ''
    try {
      const filled = await streamTo(history, 'fill', '正在填写行程表…')
      if (filled.signal.aborted) return
      acc = filled.acc
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (isAuthFail(msg) || /连不上|密钥不完整/.test(msg)) throw err
    }
    const parsed = extractTrip(acc)
    const nextTrip = parsed || tripFromPlan(plan)
    if (!nextTrip || !Array.isArray(nextTrip.days) || !nextTrip.days.length) {
      throw new Error('确认大纲里还没有按天的安排。请先写出 D1 / D2 再出页。')
    }
    const persona = detectPersona(plan) || planningPersona
    if (persona && !nextTrip.persona) nextTrip.persona = persona
    if (research.hotelsByTier && !nextTrip.hotelHints) nextTrip.hotelHints = research.hotelsByTier
    if (research.sources?.length && !Array.isArray(nextTrip.dataSources)) {
      nextTrip.dataSources = research.sources
    }
    let out = await applyTrip(nextTrip)
    const avoided = avoidHits(out.trip, factsRef.current)
    const qualityOf = (page: { quality?: string[] }) => page.quality || []
    if ((out.errors.length || qualityOf(out).length || avoided.length) && parsed) {
      setBubbles((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', text: out.errors.length ? '页面校验未过，正在修表…' : qualityOf(out).length ? '质检还缺店名或规划条，正在补…' : '表里有你说不去的点，正在换掉…', pending: true }
        return next
      })
      try {
        const repair = [
          ...history,
          { role: 'assistant' as const, content: acc },
          {
            role: 'user' as const,
            content: [
              '机械校验未通过。请只输出修正后的完整 trip JSON，不要解释。',
              out.errors.length ? 'ERROR:\n- ' + out.errors.join('\n- ') : '',
              qualityOf(out).length ? '质检清单（必须补上具体内容，不要用「待定 / 就近 / 当日晚餐」占位）：\n- ' + qualityOf(out).join('\n- ') : '',
              avoided.length ? `用户明确说不去：${avoided.join('、')}。这些点和店必须换成同片区同类的，其余不动。` : '',
            ].filter(Boolean).join('\n'),
          },
        ]
        const fixedRun = await streamTo(repair, 'fill', '正在修表…')
        if (fixedRun.signal.aborted) return
        const fixed = extractTrip(fixedRun.acc)
        if (fixed) {
          if (research.hotelsByTier && !fixed.hotelHints) fixed.hotelHints = research.hotelsByTier
          out = await applyTrip(fixed)
        }
      } catch {
        /* 修表失败也保留已出的页 */
      }
    }
    const gaps = qualityOf(out)
    const note = !parsed
      ? '这版是按你确认的大纲直接出的，细节可以继续打磨。要改哪一天，直接告诉我。'
      : out.errors.length
        ? '已出页，但还有两处要你定一下：' + out.errors.slice(0, 2).join('；')
        : gaps.length
          ? '已出页。质检还缺：' + gaps.slice(0, 2).join('；') + (gaps.length > 2 ? `等 ${gaps.length} 处` : '') + '。直接说店名或第几天，我来补。'
          : (out.fallback ? '这版版式没过检查，已换回陶土宣纸，内容不受影响。' : `已出页。要改某一天，直接说改哪个点；问时间、距离、累不累，我先回答。`)
    const left = avoidHits(out.trip, factsRef.current)
    setBubbles((prev) => {
      const next = [...prev]
      next[next.length - 1] = { role: 'assistant', text: left.length ? `${note}\n注意：页面里仍有你说不去的「${left.join('、')}」，直接说「D2第3格换成…」我来改。` : note }
      return next
    })
  }

  function recentChat(extra: { role: 'user' | 'assistant'; text: string }[] = [], opts?: { limit?: number; day?: number | null }): ChatMessage[] {
    return buildChatMessages({ facts: factsRef.current, digest: digestTrip(trip, { day: opts?.day }), bubbles, extra, limit: opts?.limit, profile: profileRef.current })
  }

  function finishBubble(text: string) {
    setBubbles((prev) => {
      const next = [...prev]
      next[next.length - 1] = { role: 'assistant', text }
      return next
    })
  }

  async function runTalk(text: string) {
    const { acc, signal } = await streamTo(recentChat([{ role: 'user', text }], { limit: 4, day: mentionedDay(text) }), 'talk', '正在对照行程…', true)
    if (signal.aborted) return
    if (!acc.trim()) throw new Error('模型没有返回内容')
    const memo = takeMemo(acc)
    learnModel(memo)
    finishBubble(stripBoilerReply(memo.text) || memo.text)
  }

  // 让模型看图说话：这一轮只出文字，右边页面一个字都不动
  async function runLook(text: string, pics: Attachment[]) {
    const urls = pics.map((p) => (p.kind === 'image' ? p.url : '')).filter(Boolean)
    const ask = [
      text || '看看这几张图，告诉我是什么、在哪。',
      trip ? '（右边已有行程页，这一轮只回答，不要改页面。）' : '',
    ].filter(Boolean).join('\n')
    const history = trip
      ? recentChat([{ role: 'user', text: ask }], { limit: 4, day: mentionedDay(text) })
      : [...factsPair(factsRef.current), { role: 'user' as const, content: ask }]
    const { acc, signal } = await streamTo(history, 'look', '正在看图…', true, urls)
    if (signal.aborted) return
    if (!acc.trim()) throw new Error('模型没有返回内容')
    finishBubble([
      stripEditClaim(stripBoilerReply(acc) || acc.trim()),
      trip ? '要把图贴到页面上，直接说「D2第2格用这张图」。' : '',
    ].filter(Boolean).join('\n\n'))
  }

  async function commitEdit(nextTrip: Trip, applied: string[], failed: string[], namesChanged: boolean, restyleAsked: boolean, reply: string, touched: string[] = []) {
    if (!applied.length) {
      // 一个字都没落到页面上时，不许把模型那句"已经改好了"当结论转给用户
      finishBubble([
        stripEditClaim(stripBoilerReply(reply)),
        failed.length ? failed.join('\n') : '',
        '这次没有改到页面上。请说清第几天、哪一格、换成什么，例如「D2第2格改成翠华山」。',
      ].filter(Boolean).join('\n'))
      return trip
    }
    const keepThemeId = !restyleAsked ? String((trip?.ui as { themeId?: string } | undefined)?.themeId || '') : ''
    const out = await applyTrip(nextTrip, {
      keepThemeId: keepThemeId || undefined,
      skipPhotos: !namesChanged,
      skipTransport: !namesChanged,
    })
    // 验货：新名必须在渲染后的 HTML 里找得到，否则"进了表没上页"，不许说已写入
    const unseen = findUnseenInHtml(touched, out.html)
    const avoided = namesHitAvoid(touched, factsRef.current)
    finishBubble([
      stripBoilerReply(reply),
      '已写入页面：' + applied.join('；'),
      failed.length ? '未改成：' + failed.join('；') : '',
      unseen.length ? `页面上没找到「${unseen.join('、')}」（补丁已进表，疑似模具没渲染该字段，请截图告诉我）` : '',
      avoided.length ? `注意：「${avoided.join('、')}」是你说过不去的；要恢复就说「还是去${avoided[0]}」。` : '',
      namesChanged ? '点名变了，正在按新名字补图。' : '',
      out.errors.length ? '校验：' + out.errors.slice(0, 2).join('；') : '',
    ].filter(Boolean).join('\n'))
    return out.trip
  }

  async function runEdit(text: string, restyleAsked: boolean) {
    if (!trip) throw new Error('还没有行程可改')
    const recentTexts = bubbles
      .filter((b) => !b.pending && b.text.trim() && !isBoilerReply(b.text) && !isEditReceipt(b.text))
      .slice(-8)
      .map((b) => stripBoilerReply(b.text))
      .reverse()
    const local = inferLocalEdit(text, recentTexts)
    if (local.replaceDays.length || local.changes.length || local.adds.length) {
      const rewritten = applyReplaceDays(trip, local.replaceDays)
      const added = applyAdds(rewritten.trip, local.adds)
      const patched = applyChanges(added.trip, local.changes)
      return commitEdit(
        patched.trip,
        [...rewritten.applied, ...added.applied, ...patched.applied],
        [...rewritten.failed, ...added.failed, ...patched.failed],
        rewritten.namesChanged || added.namesChanged || patched.namesChanged,
        restyleAsked,
        local.replaceDays.length ? '已按刚才确认的安排写入页面。' : '已按你的改动写入页面。',
        [...rewritten.touched, ...added.touched, ...patched.touched],
      )
    }
    const sync = wantsPageSync(text)
    const history = recentChat([{ role: 'user', text }], {
      limit: sync ? 4 : 2,
      day: mentionedDay(text),
    })
    const { acc, signal } = await streamTo(history, 'edit', '正在改你点名的那一格…')
    if (signal.aborted) return
    const env = extractEnvelope(acc)
    if (!env) {
      if (extractTrip(acc)) {
        throw new Error('模型又回了整份行程表，这次没有改。请再说一次要改第几天、哪个点。')
      }
      throw new Error(acc.trim() ? '模型没有按补丁格式回答，行程未改。' : '模型没有返回内容')
    }
    learnModel({ facts: normalizeModelFacts(env.facts), drops: modelDrops(env.facts) })
    const rewritten = applyReplaceDays(trip, env.replaceDays || [])
    const patched = applyChanges(rewritten.trip, env.changes)
    let nextTrip = patched.trip
    let applied = [...rewritten.applied, ...patched.applied]
    let failed = [...rewritten.failed, ...patched.failed]
    let namesChanged = rewritten.namesChanged || patched.namesChanged
    let touched = [...rewritten.touched, ...patched.touched]
    // 模型只口头说"已改"却没给补丁时，照你原话和它自己的回话本地补一刀，别让页面干等
    if (!applied.length) {
      const rescue = inferEditFrom([text, env.reply])
      if (rescue.changes.length || rescue.adds.length) {
        const added = applyAdds(nextTrip, rescue.adds)
        const again = applyChanges(added.trip, rescue.changes)
        if (added.applied.length || again.applied.length) {
          nextTrip = again.trip
          applied = [...added.applied, ...again.applied]
          failed = [...added.failed, ...again.failed]
          namesChanged = added.namesChanged || again.namesChanged
          touched = [...added.touched, ...again.touched]
        }
      }
    }
    return commitEdit(nextTrip, applied, failed, namesChanged, restyleAsked, env.reply, touched)
  }

  async function runPhotos(text: string, append = false, fromTrip?: Trip | null) {
    const base = fromTrip || trip
    if (!base) return
    const req = collectPhotoRequest(text, base)
    if (!req.names.length && !req.kinds.length && !req.days.length) {
      const msg = '请点名哪一天或哪个景点要换图，避免把别的格子换错。'
      if (append) {
        setBubbles((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          next[next.length - 1] = { role: 'assistant', text: [last?.text, msg].filter(Boolean).join('\n') }
          return next
        })
        return
      }
      finishBubble(msg)
      return
    }
    const keepThemeId = String((base.ui as { themeId?: string } | undefined)?.themeId || '')
    const beforePhotos = JSON.stringify(collectPhotos(base))
    const out = await applyTrip(base, {
      keepThemeId: keepThemeId || undefined,
      skipPhotos: false,
      replacePhotos: true,
      photoNames: req.names,
      photoKinds: req.kinds,
      photoHint: req.hint,
      photoDays: req.days,
      photoQuery: req.query,
      skipTransport: true,
    })
    const changedPhotos = JSON.stringify(collectPhotos(out.trip)) !== beforePhotos
    // 逐格说真话：换上了哪几个、哪几个公开图库真的没有
    const outcome = photoOutcome(base, out.trip, req)
    const scope = req.days.length ? `D${req.days.join('、D')} ` : ''
    const lines = [
      outcome.changed.length ? `${scope}已换上新图：${outcome.changed.join('、')}。` : '',
      outcome.missing.length
        ? `${scope}没找到合格图：${outcome.missing.join('、')}（公开图库里没有对得上的，已保留原样）。可以直接给我一个能打开的图片链接，或换个更通用的地名让我再搜。`
        : '',
    ].filter(Boolean)
    const msg = lines.length
      ? lines.join('\n')
      : changedPhotos
        ? '已按你点名的格子补图。'
        : `${scope}的图没换成：没找到可用的新图，原图保留。请确认点名是不是真名，或直接给我图片链接。`
    if (append) {
      setBubbles((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        next[next.length - 1] = { role: 'assistant', text: [last?.text, msg].filter(Boolean).join('\n') }
        return next
      })
      return
    }
    finishBubble(msg)
  }

  function setAnswer(index: number, value: string, toggle = false) {
    setPlanAnswers((prev) => planQuestions.map((_, i) => {
      if (i !== index) return prev[i] || ''
      if (toggle && prev[i] === value) return ''
      return value
    }))
  }

  async function submitPlanAnswers() {
    if (!planQuestions.length || busy) return
    if (planAnswers.some((a) => !String(a || '').trim())) {
      showToast('每道待确认都选好或写好后，再点提交答复')
      return
    }
    await run(formatAskAnswers(askItems, planAnswers))
  }

  function requireModelKey() {
    const key = sanitizeApiKey(apiKey)
    const broken = keyLooksUnusable(key)
    if (broken) {
      setError(broken)
      return false
    }
    const mismatch = keyMismatchHint(providerId, key)
    if (mismatch) {
      setError(mismatch)
      return false
    }
    return true
  }

  async function confirmPage() {
    if (!planDraft || busy) {
      showToast('先生成一份计划')
      return
    }
    if (!requireModelKey()) return
    setError('')
    setBusy(true)
    setBubbles((prev) => [...prev, { role: 'user', text: '确认生成' }, { role: 'assistant', text: '正在生成行程页…', pending: true }])
    try {
      await runFill(planDraft)
    } catch (err) {
      showFail(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function takeFiles(files: File[]) {
    const list = files.filter(Boolean)
    if (!list.length) return
    const added: Attachment[] = []
    const bad: string[] = []
    for (const f of list) {
      try {
        // 一个 zip 可能拆出好几条，所以按数组收
        added.push(...await readAttachments(f))
      } catch (err) {
        bad.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (added.length) setAttachments((prev) => [...prev, ...added].slice(-12))
    if (bad.length) showToast(bad[0])
    else if (added.length) showToast(`已收下 ${added.length} 个附件，发送时一并处理`)
  }

  // 图片贴到页面上：说清哪一格就直接写进去，说不清就按本机问法问一句
  async function runAttachPhotos(text: string, pics: Attachment[]) {
    if (!trip) {
      finishBubble('先生成行程页，再把图贴给我，我放进对应的格子。')
      return false
    }
    const urls = pics.map((p) => (p.kind === 'image' ? p.url : '')).filter(Boolean)
    const res = applyPhotoTo(trip, urls, text)
    if (!res.applied.length) {
      finishBubble(res.ask)
      return false
    }
    const keepThemeId = String((trip.ui as { themeId?: string } | undefined)?.themeId || '')
    const out = await applyTrip(res.trip, {
      keepThemeId: keepThemeId || undefined,
      skipPhotos: true,
      skipTransport: true,
    })
    finishBubble([
      '已写入页面：' + res.applied.join('；'),
      '这是你自己给的图，本机后面补图不会再把它换掉。',
      out.errors.length ? '校验：' + out.errors.slice(0, 2).join('；') : '',
    ].filter(Boolean).join('\n'))
    return true
  }

  function userLinesForProfile(extra = '') {
    return [...bubbles.filter((b) => b.role === 'user' && !b.pending).map((b) => b.text), extra].filter(Boolean)
  }

  function offerRemember(text: string) {
    learnUser(text)
    const offer = proposeProfile({
      persona: planningPersona || profileRef.current.persona,
      facts: factsRef.current,
      userLines: userLinesForProfile(text),
    })
    setInput('')
    setProfileOffer(isEmptyProfile(offer) ? null : offer)
    setBubbles((prev) => [...prev, {
      role: 'user',
      text,
    }, {
      role: 'assistant',
      text: isEmptyProfile(offer)
        ? '这趟还没有能带到下一趟的内容。能记的只有人格、忌口、住宿档位（经济 / 中档 / 高端）和常住片区。日期、天数、必去、不去不会记。'
        : '下一趟可以记住这些。点「确认记住」，或者说「先跳过」。\n' + profileLines(offer).join('\n'),
    }])
  }

  function confirmProfile(offer = profileOffer) {
    if (!offer || isEmptyProfile(offer)) return
    const next = mergeProfile(profileRef.current, offer)
    setProfile(next)
    if (next.persona) setPlanningPersona(next.persona)
    setProfileOffer(null)
    setBubbles((prev) => [...prev, { role: 'assistant', text: '已记住。新建行程时会带上这些，不再重问人格。要去掉某一条，点画像上的 ×。' }])
  }

  async function run(prompt: string) {
    const text = prompt.trim()
    if (busy) return
    if (profileOffer && /先跳过|不用记|取消记住/.test(text)) {
      setProfileOffer(null)
      setInput('')
      setBubbles((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '好，这次不写入跨行程画像。' }])
      return
    }
    if (profileOffer && /确认记住|记住这些/.test(text)) {
      setInput('')
      setBubbles((prev) => [...prev, { role: 'user', text }])
      confirmProfile()
      return
    }
    if (wantsRemember(text) && !attachments.length) {
      offerRemember(text)
      return
    }
    const pics = attachments.filter((a) => a.kind === 'image')
    const docs = attachments.filter((a) => a.kind === 'text')
    if ((!text && !attachments.length) || busy) return
    const restyleAsked = /换皮|换配色|换版式|换一版/.test(text)
    const restyleOnly = /^(请?帮我)?(换皮|换配色|换版式|换一版)([成到为：:\s].*)?[。.!！]?$/.test(text)
    const recentForLocal = bubbles
      .filter((b) => !b.pending && b.text.trim() && !isBoilerReply(b.text) && !isEditReceipt(b.text))
      .slice(-8)
      .map((b) => stripBoilerReply(b.text))
      .reverse()
    const requestPack = [text, ...bubbles.filter((b) => b.role === 'user' && b.text.trim() && !b.pending).slice(-3).map((b) => b.text)].join('\n')
    const replay = Boolean(trip && (wantsPageSync(text) || /继续(优化|改|做)|一直没有|没有反应/.test(text)))
    const pack = replay ? requestPack : text
    const local = trip && (wantsTripEdit(text) || wantsTripEdit(pack)) ? inferLocalEdit(text, recentForLocal) : { replaceDays: [], changes: [], adds: [] }
    const localEdit = Boolean(local.replaceDays.length || local.changes.length || local.adds.length)
    const doEdit = Boolean(trip && (wantsTripEdit(text) || wantsTripEdit(pack) || localEdit))
    const doPhotos = Boolean(trip && (wantsPhotos(text) || wantsPhotos(pack)))
    const doLook = Boolean(pics.length && wantsVision(text, Boolean(trip)))
    const needsModel = (() => {
      if (doLook) return true
      if (pics.length) return false
      if (trip && restyleOnly) return false
      if (trip && doPhotos && !doEdit) return false
      if (trip && doEdit && localEdit) return false
      return true
    })()
    if (needsModel && !requireModelKey()) return
    setError('')
    setInput('')
    setBusy(true)
    // 附件里的备注（「忌口：不吃辣」）也算用户说的；整份攻略只看开头，免得把别人的行程当约束
    learnUser([text, ...docs.map((d) => (d.kind === 'text' ? d.text.slice(0, 3000) : ''))].filter(Boolean).join('\n'))
    if (trip && restyleOnly) {
      setBubbles((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '正在换皮…', pending: true }])
      try {
        const out = await restyle(themeFromText(text))
        setBubbles((prev) => {
          const next = [...prev]
          next[next.length - 1] = {
            role: 'assistant',
            text: out?.fallback ? '换皮未过校验，已回退陶土模具。' : `已换皮：${out?.themeName || '下一套'}（没走模型）。`,
          }
          return next
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
      return
    }
    const attachNote = attachments.length ? `（附件：${attachments.map((a) => a.name).join('、')}）` : ''
    setBubbles((prev) => [...prev, { role: 'user', text: [text, attachNote].filter(Boolean).join(' ') }, { role: 'assistant', text: '', pending: true }])
    try {
      // 贴图走本机（不花钱），问图才送模型看
      if (doLook) {
        await runLook(docs.length ? [text, attachmentsToPrompt(docs)].filter(Boolean).join('\n\n') : text, pics)
        setAttachments([])
        return
      }
      if (pics.length) {
        const done = await runAttachPhotos(text, pics)
        if (done) setAttachments((prev) => prev.filter((a) => a.kind !== 'image'))
        return
      }
      const ask = docs.length ? [text, attachmentsToPrompt(docs)].filter(Boolean).join('\n\n') : text
      const edited = trip && doEdit ? await runEdit(ask, restyleAsked) : trip
      if (trip && doPhotos) await runPhotos(pack, doEdit, edited)
      if (trip && !doEdit && !doPhotos) await runTalk(ask)
      else if (!trip && planDraft && isConfirm(text)) await runFill(planDraft)
      else if (!trip) await runPlan(ask)
      setAttachments((prev) => prev.filter((a) => a.kind !== 'text'))
    } catch (err) {
      if (abortRef.current?.signal.aborted) return
      showFail(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onShare() {
    try {
      const mode = await sharePage(html)
      showToast(mode === 'copied' ? '已复制 HTML，可发给同伴' : '已调起系统分享')
      setShareOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onCopy() {
    await copyHtml(html)
    showToast('HTML 已复制到剪贴板')
    setShareOpen(false)
  }

  async function onImage() {
    try {
      showToast('正在导出长图…')
      await exportImage(iframeRef.current, html, device)
      showToast('长图已开始下载')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      showToast(msg)
    }
  }

  return (
    <div className="shell">
      <aside className="pane">
        <header className="brand">
          <div className="brand-kicker">TRAVEL MONKEY</div>
          <h1>Travel <span>Monkey</span></h1>
          <p>先选人格  如：旅居/带队/探秘，再描述行程 如：想去哪，玩几天。系统会给您输出行程大纲，你点击「确认生成」后系统才会生成具体的行程页（此时才消耗token）。</p>
          {skillLabel && <p className="skill-ok">{skillLabel}</p>}
        </header>

        <div className="session-bar">
          <select
            value={sessionId}
            disabled={busy || !hydrated}
            onChange={(e) => void switchTrip(e.target.value)}
            title="历史行程：刷新页面也会接着上次"
          >
            {!sessionList.some((s) => s.id === sessionId) && <option value={sessionId}>新行程（还没开始）</option>}
            {sessionList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {new Date(s.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}{s.stage === 'plan' ? ' · 大纲' : ''}
              </option>
            ))}
          </select>
          <button type="button" className="ghost" disabled={busy || !hydrated} onClick={() => void newTrip()}>新建行程</button>
          <button type="button" className="ghost" disabled={busy} onClick={() => offerRemember('记住我')}>记住我</button>
          {sessionList.some((s) => s.id === sessionId) && (
            <button type="button" className="ghost" disabled={busy} onClick={() => void dropTrip(sessionId)}>删除</button>
          )}
        </div>

        <section className="controls">
          <label>
            <span>服务商</span>
            <select
              value={providerId}
              onChange={(e) => {
                const next = getProvider(e.target.value)
                setProviderId(next.id)
                setModelId(next.models[0].id)
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {providerId === 'custom' ? (
            <>
              <label>
                <span>Base URL</span>
                <input value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
              </label>
              <label>
                <span>模型名</span>
                <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="gpt-4o" />
              </label>
            </>
          ) : (
            <label>
              <span>模型</span>
              <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>API Key · 模型密钥，不是网页地址</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                const next = sanitizeApiKey(e.target.value)
                setApiKey(next)
                try { localStorage.removeItem('ct.keyBad') } catch { /* ignore */ }
                setError((prev) => (isAuthFail(prev) ? '' : prev))
              }}
              placeholder={provider.keyHint}
              autoComplete="off"
            />
          </label>
          {looksLikePageUrl(apiKey) && (
            <div className="err">这里应填 {provider.keyHint}，不要填 http://127.0.0.1:5177/</div>
          )}
          {!looksLikePageUrl(apiKey) && keyMismatchHint(providerId, apiKey) && (
            <div className="err">{keyMismatchHint(providerId, apiKey)}</div>
          )}
          <div className="controls-row">
            <label>
              <span>高德 Web 服务 Key</span>
              <input type="password" value={amapKey} onChange={(e) => setAmapKey(e.target.value)} placeholder="lbs.amap.com" autoComplete="off" />
            </label>
            <label>
              <span>搜索 · 飞猪摘要</span>
              <select value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)}>
                <option value="tavily">Tavily</option>
                <option value="serper">Serper</option>
              </select>
            </label>
          </div>
          <label>
            <span>搜索 Key · 可选，不能代订</span>
            <input type="password" value={searchKey} onChange={(e) => setSearchKey(e.target.value)} placeholder="可选；有则点评店图优先" autoComplete="off" />
          </label>
          {!amapKey.trim() && !searchKey.trim() && (
            <p className="plan-ask-hint">没填 Key 也能用：坐标、交通、酒店价按模型记忆参考，出行前请以官方渠道核实。</p>
          )}
        </section>

        <div className="log" ref={logRef}>
          {bubbles.map((b, i) => (
            <div key={i} className={`bubble ${b.role}`}>
              <div className="who">{b.role === 'user' ? '你' : 'Agent'}{b.pending ? ' · 生成中' : ''}</div>
              <div className="txt">{b.text || (b.pending ? '正在处理…' : '')}</div>
            </div>
          ))}
        </div>

        {(!isEmptyProfile(profile) || profileOffer) && (
          <div className="plan-ask facts-board">
            <div className="plan-ask-k">跨行程画像 · 新建行程也会带上，点 × 删掉</div>
            {!isEmptyProfile(profile) && (
              <div className="chips">
                {profile.persona && (
                  <span className="chip fact">
                    <b>人格</b>
                    <span className="chip-name">{personaLabel(profile.persona)}</span>
                    <button type="button" aria-label="删掉画像人格" disabled={busy} onClick={() => setProfile(removeProfilePart(profile, 'persona'))}>×</button>
                  </span>
                )}
                {profile.diet.map((item) => (
                  <span className="chip fact" key={item}>
                    <b>忌口</b>
                    <span className="chip-name">{item}</span>
                    <button type="button" aria-label={`删掉画像忌口 ${item}`} disabled={busy} onClick={() => setProfile(removeProfilePart(profile, 'diet', item))}>×</button>
                  </span>
                ))}
                {profile.tier && (
                  <span className="chip fact">
                    <b>档位</b>
                    <span className="chip-name">{profile.tier}</span>
                    <button type="button" aria-label="删掉画像档位" disabled={busy} onClick={() => setProfile(removeProfilePart(profile, 'tier'))}>×</button>
                  </span>
                )}
                {profile.home && (
                  <span className="chip fact">
                    <b>常住</b>
                    <span className="chip-name">{profile.home}</span>
                    <button type="button" aria-label="删掉画像常住" disabled={busy} onClick={() => setProfile(removeProfilePart(profile, 'home'))}>×</button>
                  </span>
                )}
              </div>
            )}
            {profileOffer && (
              <div className="plan-q-ops">
                <button type="button" className="ghost" disabled={busy} onClick={() => confirmProfile()}>确认记住</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => { setProfileOffer(null); setBubbles((prev) => [...prev, { role: 'assistant', text: '好，这次不写入跨行程画像。' }]) }}>先跳过</button>
              </div>
            )}
          </div>
        )}

        {facts.length > 0 && (
          <div className="plan-ask facts-board">
            <div className="plan-ask-k">本趟记住的约束 · 每轮都带给模型，记错了点 × 删掉</div>
            <div className="chips">
              {sortFacts(facts).map((f) => (
                <span className={`chip fact ${f.source}`} key={`${f.key}-${f.value}`} title={f.source === 'model' ? '模型从你的话里记下的' : '从你的原话里记下的'}>
                  <b>{FACT_LABELS[f.key]}</b>
                  <span className="chip-name">{f.value}</span>
                  <button
                    type="button"
                    aria-label={`删掉约束 ${f.value}`}
                    disabled={busy}
                    onClick={() => commitFacts(removeFact(factsRef.current, f))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {error && <div className="err">{error}</div>}
        {report.errors.length > 0 && (
          <div className="err">校验：{report.errors.slice(0, 3).join('；')}</div>
        )}

        {askItems.length > 0 && (
          <div className="plan-ask">
            <div className="plan-ask-k">待确认 · 先选或先写，不会自动发送</div>
            {askItems.map((item, i) => (
              <div key={item.question} className="plan-q">
                <p>{i + 1}. {item.question}</p>
                <div className="plan-q-ops">
                  <span className="plan-q-ans">答案</span>
                  {choicesForQuestion(item.source).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={planAnswers[i] === opt ? 'on' : ''}
                      disabled={busy}
                      onClick={() => setAnswer(i, opt, true)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  value={planAnswers[i] || ''}
                  disabled={busy}
                  placeholder={ASK_WRITE_HINT}
                  onChange={(e) => setAnswer(i, e.target.value)}
                />
              </div>
            ))}
            <p className="plan-ask-hint">已选 {planAnswers.filter((a) => String(a || '').trim()).length}/{askItems.length}。看完确认后再点提交，点错选项可再点一次取消。</p>
            <div className="plan-ask-bar">
              <button
                type="button"
                className="go"
                disabled={busy || planAnswers.some((a) => !String(a || '').trim())}
                onClick={() => void submitPlanAnswers()}
              >
                提交答复
              </button>
              {canConfirm && (
                <button type="button" className="ghost" disabled={busy} onClick={() => void confirmPage()}>
                  跳过并出页
                </button>
              )}
            </div>
          </div>
        )}

        {!trip && (
          <div className="plan-ask persona-pick">
            <div className="plan-ask-k">规划人格 · 先选择再出计划</div>
            <div className="plan-q-ops">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={planningPersona === p.id ? 'on' : ''}
                  disabled={busy}
                  onClick={() => setPlanningPersona(planningPersona === p.id ? '' : p.id)}
                >
                  {p.label} · {p.hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {!trip && bubbles.length === 0 && (
          <div className="plan-ask persona-pick">
            <div className="plan-ask-k">输入示意</div>
            <div className="plan-q-ops example-ops">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" title={ex} disabled={busy} onClick={() => setInput(ex)}>{ex}</button>
              ))}
            </div>
          </div>
        )}

        <form
          className={`composer${dragOver ? ' drop' : ''}`}
          onSubmit={(e) => {
            e.preventDefault()
            void run(input)
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            void takeFiles(Array.from(e.dataTransfer?.files || []))
          }}
        >
          {attachments.length > 0 && (
            <div className="chips">
              {attachments.map((a, i) => (
                <span className="chip" key={`${a.name}-${i}`}>
                  {a.kind === 'image' ? <img src={a.url} alt="" /> : <b>{((a.name.split('.').pop() || 'TXT').split(/[^\w]/)[0] || 'TXT').slice(0, 4).toUpperCase()}</b>}
                  <span className="chip-name">{a.name}</span>
                  <span className="chip-size">{prettyBytes(a.bytes)}</span>
                  <button
                    type="button"
                    aria-label={`移除 ${a.name}`}
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={(trip ? '可同时说改哪一天、加哪个点、补哪张图；图片/文本/zip 直接粘贴或拖进来' : planDraft ? '说要改哪一天，或点确认生成' : '先选人格  如：旅居/带队/探秘，再描述行程 如：想去哪，玩几天（图片/文本/zip 可直接拖进来）') + '\n回车发送，Shift+回车换行'}
            rows={4}
            onPaste={(e) => {
              const files = filesFromPaste(e)
              if (!files.length) return
              e.preventDefault()
              void takeFiles(files)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey) return
              // 中文输入法选词时的回车只是上屏；Safari 在 compositionend 之后还会补一个 keyCode 229
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              if (!busy) void run(input)
            }}
          />
          <div className="composer-bar">
            <button type="button" className="ghost" onClick={() => void loadSeed()}>载入示例行程</button>
            {canConfirm && (
              <button type="button" className="go" disabled={busy} onClick={() => void confirmPage()}>
                {busy ? '生成中' : '确认生成'}
              </button>
            )}
            <button type="submit" className="go" disabled={busy}>
              {busy ? '生成中'
                : attachments.some((a) => a.kind === 'image')
                  ? (wantsVision(input, Boolean(trip)) ? '看图' : '贴图')
                  : trip ? '发送' : planDraft ? '改计划' : '生成计划'}
            </button>
          </div>
        </form>
      </aside>

      <main className="stage">
        <div className="toolbar">
          <div className="seg">
            <button type="button" className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')}>手机</button>
            <button type="button" className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>桌面</button>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void restyle()}>换皮</button>
            {versions.length > 1 && (
              <>
                <select
                  value={versionSel}
                  onChange={(e) => setVersionSel(Number(e.target.value))}
                  title="行程版本"
                >
                  <option value={-1}>回到上一版</option>
                  {versions.map((v, i) => (
                    <option key={`${v.label}-${i}`} value={i}>
                      {i + 1}. {v.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => rollbackVersion(versionSel)}
                >
                  回退（共{versions.length}版）
                </button>
              </>
            )}
            <button type="button" onClick={() => setShareOpen(true)}>分享</button>
            <button type="button" onClick={() => void onImage()}>导出图片</button>
            <button type="button" className="primary" onClick={() => { exportH5(html); showToast('H5 已下载') }}>导出 H5</button>
          </div>
        </div>
        <div className={`frame ${device}`}>
          <iframe ref={iframeRef} title="行程预览" srcDoc={previewDoc} sandbox="allow-scripts allow-same-origin allow-popups" />
        </div>
      </main>

      {shareOpen && (
        <div className="modal" onClick={() => setShareOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-k">一键分享</div>
            <h2>发给同伴</h2>
            <p>H5 是单文件，微信/邮件直接传即可离线打开。系统分享会带上这个 HTML 文件。</p>
            <div className="sheet-actions">
              <button type="button" className="primary" onClick={() => void onShare()}>系统分享</button>
              <button type="button" onClick={() => void onCopy()}>复制 HTML</button>
              <button type="button" onClick={() => { exportH5(html); setShareOpen(false) }}>下载 H5</button>
              <button type="button" className="ghost" onClick={() => setShareOpen(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
