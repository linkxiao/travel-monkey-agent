import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { renderSVG } from 'uqr'
import { attachmentsToPrompt, filesFromPaste, prettyBytes, readAttachments, wantsVision, type Attachment } from './lib/attach'
import { fetchQuotaLeft, fetchServerConfig, streamChat, type ChatMessage, type ServerConfig } from './lib/chat'
import { copyText } from './lib/clipboard'
import { downloadBlob, exportH5, exportImage, needsMobileImageSheet, publishShare, shareJpegFile, shareReach, type ShareCard } from './lib/export'
import { shareH5Card } from './lib/h5Share'
import { buildWechatShareCard, wechatShareCaption } from './lib/wechatCard'
import { formatShareSnippet } from './lib/shareSnippet'
import { getProvider, isAuthFail, keyLooksUnusable, keyMismatchHint, PROVIDERS, sanitizeApiKey } from './lib/models'
import { WELCOME_HTML } from './lib/prompt'
import { fetchResearch, type ResearchBrief } from './lib/research'
import { renderTripPage } from './lib/render'
import { detectPersona, PERSONAS, personaLabel } from './lib/persona'
import { AccountDialog, type AuthInput, type AuthScreen, type AuthSuccess } from './AccountDialog'
import { AlpineScene } from './AlpineScene'
import { FieldSelect } from './FieldSelect'
import { BrandLogo } from './BrandLogo'
import { TOKEN_KEY, fetchSession, loginAccount, logoutAccount, registerAccount, requestAuthCode } from './lib/auth'
import { repairMobileChecklist } from './lib/html'
import { todayAdvice } from './lib/today'
import { stampUndatedTrip } from '../server/dates.mjs'
import { ASK_WRITE_HINT, choicesForQuestion, extractAskItems, formatAskAnswers, tripFromPlan } from './lib/plan'
import { answeredAskKeys, omitAnsweredAsks } from './lib/ask'
import { buildChatMessages, buildFillMessages, buildPlanMessages, userPack } from './lib/context'
import { buildRouteMessages, carryLine, isNewTask, localTurn, parseTurn, planPrefs, tripHead, tripNames, type PrefPlan, type Turn } from './lib/route'
import { isEmptySession, listSessions, loadSession, newSessionId, removeSession, saveSession, sessionOwner, sessionPointerKey, sessionTitle, setSessionOwner, type SessionData, type SessionMeta } from './lib/session'
import { applyAdds, applyChanges, applyPhotoTo, applyReplaceDays, collectPhotoRequest, collectPhotos, digestTrip, extractEnvelope, extractTrip, findUnseenInHtml, inferEditFrom, inferLocalEdit, isBoilerReply, isEditReceipt, isPhotoScopeClarify, mentionedDay, photoOutcome, resolvePhotoIntent, stripBoilerReply, stripEditClaim, wantsPageSync, wantsPhotos, wantsTripEdit, type Trip } from './lib/trip'

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

type Bubble = { role: 'user' | 'assistant'; text: string; pending?: boolean; error?: boolean }

const OWN_KEY_HINT = /改用自己的(?:模型)?密钥|次已经用完|免费额度|请求太频繁/
const ERROR_BUBBLE = /^(出错了：|密钥没通过)/

const EXAMPLES = [
  '深圳周边3天2晚、一家三口，偏亲子与海边，住较场尾',
  '京都、奈良5天4晚、两人，偏寺院、樱花、居酒屋、咖啡和人文，住町屋',
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
  const [generating, setGenerating] = useState(false)
  const [pageWait, setPageWait] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone')
  const [mobileView, setMobileView] = useState<'chat' | 'preview'>('chat')
  const [askWriting, setAskWriting] = useState<Record<number, boolean>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [shareCard, setShareCard] = useState<ShareCard>({ url: '', title: '', description: '', image: '' })
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState('')
  const [shareLinkOpen, setShareLinkOpen] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const exportEpoch = useRef(0)
  const [imageExport, setImageExport] = useState<{ url: string; filename: string; blob: Blob } | null>(null)
  const shareSnippetRef = useRef<HTMLTextAreaElement>(null)
  const shareFoldRef = useRef<HTMLDetailsElement>(null)
  const [skillLabel, setSkillLabel] = useState('')
  const [amapKey, setAmapKey] = useState(() => loadSetting('ct.amap', ''))
  const [tiandituKey, setTiandituKey] = useState(() => loadSetting('ct.tianditu', ''))
  const [searchKey, setSearchKey] = useState(() => loadSetting('ct.search', ''))
  const [searchProvider, setSearchProvider] = useState(() => loadSetting('ct.searchPv', 'bocha'))
  const [searchFallbackKey, setSearchFallbackKey] = useState(() => loadSetting('ct.searchFb', ''))
  const [searchFallbackProvider, setSearchFallbackProvider] = useState(() => loadSetting('ct.searchFbPv', 'tavily'))
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [planDraft, setPlanDraft] = useState('')
  const [planAnswers, setPlanAnswers] = useState<string[]>([])
  const [planningPersona, setPlanningPersona] = useState('')
  const [prefOffer, setPrefOffer] = useState<{ text: string; prefs: string[]; picked: boolean[] } | null>(null)
  const [authUser, setAuthUser] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [authScreen, setAuthScreen] = useState<AuthScreen | null>(null)
  const [authSuccess, setAuthSuccess] = useState<AuthSuccess | null>(null)
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [rainOn, setRainOn] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadingRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runIdRef = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)
  const shareLinkRef = useRef<HTMLInputElement>(null)
  const researchRef = useRef<{ done?: boolean; query?: string; brief?: string; sources?: ResearchBrief['sources']; hotelsByTier?: ResearchBrief['hotelsByTier']; openHours?: ResearchBrief['openHours'] }>({})
  const authTokenRef = useRef(loadSetting(TOKEN_KEY, ''))
  const [sessionId, setSessionId] = useState('')
  const [sessionList, setSessionList] = useState<SessionMeta[]>([])
  const [hydrated, setHydrated] = useState(false)
  const createdRef = useRef(Date.now())
  const seedRef = useRef('')
  const [seedList, setSeedList] = useState<Array<{ id: string; title: string }>>([])
  const [serverCfg, setServerCfg] = useState<ServerConfig>({ model: null, amap: false, tianditu: false, search: false, dailyLimit: 0 })
  const [ownKey, setOwnKey] = useState(() => loadSetting('ct.ownKey', '') === '1')
  const [quotaLeft, setQuotaLeft] = useState<number | null>(null)
  const [quotaUnlimited, setQuotaUnlimited] = useState(false)
  const serverModel = Boolean(serverCfg.model) && !ownKey
  const [keyDialogOpen, setKeyDialogOpen] = useState(false)

  useEffect(() => {
    void fetchServerConfig().then(setServerCfg)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('app-locked', Boolean(authUser))
    return () => document.documentElement.classList.remove('app-locked')
  }, [authUser])

  // 手机键盘顶起时用 visualViewport 校正壳高度，避免底栏/输入被裁切
  useEffect(() => {
    if (!authUser) return
    const root = document.documentElement
    const vv = window.visualViewport
    const sync = () => {
      const h = vv?.height ?? window.innerHeight
      root.style.setProperty('--app-vh', `${Math.round(h)}px`)
    }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      root.style.removeProperty('--app-vh')
    }
  }, [authUser])

  useEffect(() => {
    try { localStorage.setItem('ct.ownKey', ownKey ? '1' : '') } catch { /* ignore */ }
  }, [ownKey])

  function switchToOwnKey() {
    setOwnKey(true)
    setKeyDialogOpen(true)
  }

  // 额度提示保持原话，只把「改用自己的模型密钥」这句变成行内可点按钮
  function renderQuotaText(text: string): ReactNode {
    const re = /(；?\s*)(?:或点[上下方]*「改用自己的(?:模型)?密钥」[^。；]*|也可改用自己的模型密钥继续)/g
    const nodes: ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    let k = 0
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) nodes.push(<Fragment key={k++}>{text.slice(last, m.index)}</Fragment>)
      nodes.push(
        <Fragment key={k++}>
          {m[1] ? '；' : null}也可「
          <button type="button" className="link-btn bubble-link-inline" onClick={switchToOwnKey}>改用自己的模型密钥</button>
          」继续
        </Fragment>,
      )
      last = m.index + m[0].length
    }
    if (last < text.length) nodes.push(<Fragment key={k++}>{text.slice(last)}</Fragment>)
    return <>{nodes}</>
  }

  useEffect(() => {
    const openFromUrl = () => {
      if (new URLSearchParams(window.location.search).get('tag') === '1') setKeyDialogOpen(true)
    }
    openFromUrl()
    window.addEventListener('popstate', openFromUrl)
    return () => window.removeEventListener('popstate', openFromUrl)
  }, [])

  useEffect(() => {
    if (!keyDialogOpen) return
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLInputElement>('.key-sheet input')?.focus()
    }, 40)
    return () => window.clearTimeout(timer)
  }, [keyDialogOpen])

  useEffect(() => {
    if (!keyDialogOpen && !shareOpen && !deleteConfirm) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setKeyDialogOpen(false)
      setShareOpen(false)
      setDeleteConfirm(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyDialogOpen, shareOpen, deleteConfirm])

  function refreshQuota() {
    if (!serverCfg.model) return
    void fetchQuotaLeft(authTokenRef.current).then((q) => {
      setQuotaLeft(q.left)
      setQuotaUnlimited(q.unlimited)
    })
  }

  useEffect(() => {
    if (authUser) refreshQuota()
    else {
      setQuotaLeft(null)
      setQuotaUnlimited(false)
    }
  }, [authUser, serverCfg.model])

  function chatAuth() {
    if (serverModel) return { provider: '', model: '', apiKey: '', authToken: authTokenRef.current }
    return { provider: providerId, model, apiKey: sanitizeApiKey(apiKey), customBaseUrl }
  }

  useEffect(() => {
    fetch('/seed/list.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setSeedList(Array.isArray(list) ? list : []))
      .catch(() => setSeedList([]))
  }, [])

  const provider = getProvider(providerId)
  const today = todayAdvice(trip, { rain: rainOn })
  const model = providerId === 'custom' ? (customModel || 'gpt-4o') : modelId
  const canConfirm = Boolean(planDraft && !trip)
  const tripDays = Array.isArray(trip?.days) ? (trip.days as unknown[]).length : null
  // 生成中的气泡每来一个字都会变。问答只跟已经写完的对话走，避免点选被冲掉
  const settledBubbles = useMemo(
    () => bubbles.filter((b) => !b.pending),
    [bubbles],
  )
  const settledKey = settledBubbles.map((b) => `${b.role}\n${b.text}`).join('\n---\n')
  const askItems = useMemo(() => {
    const answered = settledBubbles
      .filter((b) => b.role === 'user')
      .slice(-6)
      .flatMap((b) => answeredAskKeys(b.text))
    const lastUser = [...settledBubbles].reverse().find((b) => b.role === 'user' && b.text.trim())
    // 刚交过答就先收起卡片。下一句是用户新的原话时，才允许再问
    if (lastUser && answeredAskKeys(lastUser.text).length) return []
    if (canConfirm) return omitAnsweredAsks(extractAskItems(planDraft, { loose: true }), answered)
    if (!trip) return []
    const last = [...settledBubbles].reverse().find((b) => b.role === 'assistant' && String(b.text || '').trim())
    return last ? omitAnsweredAsks(extractAskItems(last.text), answered) : []
  }, [canConfirm, planDraft, trip, settledKey])
  const planQuestions = askItems
  const pickedByQuestion = useRef<Record<string, string>>({})

  useEffect(() => {
    localStorage.setItem('ct.provider', providerId)
    localStorage.setItem('ct.model', modelId)
    localStorage.setItem('ct.key', apiKey)
    localStorage.setItem('ct.base', customBaseUrl)
    localStorage.setItem('ct.customModel', customModel)
    localStorage.setItem('ct.amap', amapKey)
    localStorage.setItem('ct.tianditu', tiandituKey)
    localStorage.setItem('ct.search', searchKey)
    localStorage.setItem('ct.searchPv', searchProvider)
    localStorage.setItem('ct.searchFb', searchFallbackKey)
    localStorage.setItem('ct.searchFbPv', searchFallbackProvider)
  }, [providerId, modelId, apiKey, customBaseUrl, customModel, amapKey, tiandituKey, searchKey, searchProvider, searchFallbackKey, searchFallbackProvider])

  useEffect(() => {
    if (!generating) return
    let raf = 0
    const place = () => {
      raf = 0
      const box = loadingRef.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      const top = Math.max(rect.top, 0)
      const bottom = Math.min(rect.bottom, window.innerHeight)
      const y = bottom > top ? (top + bottom) / 2 - rect.top : rect.height / 2
      box.style.setProperty('--loading-y', `${Math.round(y)}px`)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place)
    }
    place()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [generating])

  const askKey = askItems.map((item) => item.question).join('\n')
  useEffect(() => {
    setPlanAnswers(askItems.map((item) => pickedByQuestion.current[item.question] || ''))
    setAskWriting({})
  }, [askKey])
  useEffect(() => {
    const el = logRef.current
    if (!el) return
    // 手机上用瞬间滚动，避免 smooth 与手势抢滚动造成抖动；问答出现时滚到底露出确认按钮
    const smooth = !window.matchMedia('(max-width: 900px)').matches
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [bubbles, busy, askKey])
  // 选中结果只从这里写回，不能写进 setPlanAnswers 的更新函数。
  // 开发模式会把更新函数调两遍：第一遍刚写入 ref，第二遍会把它当成「再点一次」取消掉。
  useEffect(() => {
    askItems.forEach((item, i) => {
      pickedByQuestion.current[item.question] = planAnswers[i] || ''
    })
  }, [planAnswers, askKey])

  useEffect(() => {
    if (loadSetting('ct.keyBad', '') && sanitizeApiKey(apiKey)) {
      setError('上次这个密钥没通过，浏览器还记着旧的。请到官网复制新的，粘贴到下方后再发。')
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
    let alive = true
    const token = authTokenRef.current
    if (!token) {
      clearWorkspaceForGuest()
      setAuthReady(true)
      return
    }
    void fetchSession(token).then(async (remote) => {
      if (!alive) return
      if (!remote) {
        authTokenRef.current = ''
        try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
        clearWorkspaceForGuest()
        setAuthReady(true)
        return
      }
      setAuthUser(remote.username)
      await hydrateForUser(remote.username)
      if (alive) setAuthReady(true)
    })
    return () => { alive = false }
  }, [])

  function rememberSessionId(id: string) {
    try { localStorage.setItem(sessionPointerKey(), id) } catch { /* ignore */ }
  }

  function resetWorkspace(s?: SessionData) {
    abortRef.current?.abort()
    setBubbles(s?.bubbles || [])
    setTrip(s?.trip || null)
    setHtml(s?.trip && s.html ? s.html : WELCOME_HTML)
    setPlanDraft(s?.planDraft || '')
    pickedByQuestion.current = {}
    setPlanAnswers([])
    setPlanningPersona(s?.persona || '')
    researchRef.current = (s?.research || {}) as typeof researchRef.current
    setPrefOffer(null)
    setVersions(s?.versions || [])
    setVersionSel(-1)
    setReport({ errors: [], warnings: [] })
    setError('')
    setAttachments([])
    setInput('')
    createdRef.current = s?.createdAt || Date.now()
    seedRef.current = s?.seedId || ''
  }

  // 按当前登录账号装载历史；未登录不读库，避免串到上一账号
  async function hydrateForUser(username: string) {
    // 先停自动保存并清空界面，再切库，避免把上一账号的对话写进新库
    setHydrated(false)
    resetWorkspace()
    setSessionId('')
    setSessionList([])
    setSessionOwner(username)
    const id = loadSetting(sessionPointerKey(), '')
    const saved = id ? await loadSession(id).catch(() => null) : null
    if (saved) {
      resetWorkspace(saved)
      setSessionId(saved.id)
    } else {
      const fresh = newSessionId()
      rememberSessionId(fresh)
      setSessionId(fresh)
    }
    setSessionList(await listSessions().catch(() => []))
    setHydrated(true)
  }

  function clearWorkspaceForGuest() {
    setHydrated(false)
    resetWorkspace()
    setSessionId('')
    setSessionList([])
    setSessionOwner('')
  }

  async function persistNow() {
    // 未登录或还没切到账号库时不写，免得写进别人的空间
    if (!hydrated || !sessionId || !authUser) return
    const forUser = authUser.trim().toLowerCase()
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
      versions,
      ...(seedRef.current ? { seedId: seedRef.current } : {}),
    }
    if (isEmptySession(data) && !sessionList.some((s) => s.id === sessionId)) return
    data.title = sessionTitle(data)
    try {
      // 异步间隙若已换账号，丢掉这次写入
      if (sessionOwner() !== forUser) return
      await saveSession(data)
      if (sessionOwner() !== forUser) return
      setSessionList(await listSessions())
      // 旧版把版本放在 localStorage，进了会话就不再要它
      localStorage.removeItem('ct.versions')
    } catch { /* 存不下就只留在内存里 */ }
  }

  useEffect(() => {
    if (!hydrated || !sessionId || busy) return
    const timer = window.setTimeout(() => void persistNow(), 400)
    return () => window.clearTimeout(timer)
  }, [hydrated, sessionId, busy, bubbles, trip, html, planDraft, planningPersona, versions])

  async function newTrip() {
    if (busy) return
    await persistNow()
    const id = newSessionId()
    resetWorkspace()
    rememberSessionId(id)
    setSessionId(id)
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

  function askDropTrip(id: string) {
    if (busy) return
    const meta = sessionList.find((s) => s.id === id)
    setDeleteConfirm({ id, title: meta?.title || '这趟行程' })
  }

  async function confirmDropTrip() {
    const target = deleteConfirm
    if (!target || busy) return
    setDeleteConfirm(null)
    const { id } = target
    // 先换掉当前会话，免得还没触发的自动保存把刚删的又写回去
    if (id === sessionId) {
      resetWorkspace()
      const fresh = newSessionId()
      rememberSessionId(fresh)
      setSessionId(fresh)
      setMobileView('chat')
    }
    await removeSession(id).catch(() => {})
    setSessionList(await listSessions().catch(() => []))
    showToast('已删除')
  }

  const previewDoc = useMemo(() => repairMobileChecklist(html), [html])

  function showToast(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(''), 2400)
  }

  async function applyTrip(next: Trip, opts?: { themeId?: string; keepThemeId?: string; fallback?: boolean; fast?: boolean; recordVersion?: boolean; skipPhotos?: boolean; skipTransport?: boolean; replacePhotos?: boolean; fillGaps?: boolean; photoMode?: 'fill_gaps' | 'replace'; photoNames?: string[]; photoKinds?: string[]; photoHint?: string; photoDays?: number[]; photoQuery?: string }) {
    const out = await renderTripPage(next, {
      ...opts,
      amapKey: amapKey.trim() || undefined,
      tiandituKey: tiandituKey.trim() || undefined,
      searchKey: searchKey.trim() || undefined,
      searchProvider,
      searchFallbackKey: searchFallbackKey.trim() || undefined,
      searchFallbackProvider,
      authToken: authTokenRef.current,
    })
    setTrip(out.trip)
    setHtml(out.html)
    setReport({ errors: out.errors || [], warnings: out.warnings || [] })
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      switchMobileView('preview')
    }
    if (opts?.recordVersion !== false && out.trip && Array.isArray((out.trip as unknown as { days?: unknown[] }).days) && ((out.trip as unknown as { days?: unknown[] }).days as unknown[]).length) {
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
    const out = await applyTrip(trip, { themeId: next, skipPhotos: true })
    showToast(out.fallback ? '换皮未通过校验，已回退陶土模具' : `已换皮：${out.themeName || next}`)
    return out
  }

  async function loadSeed(id: string) {
    try {
      const res = await fetch(`/seed/trip.json?id=${encodeURIComponent(id)}`)
      if (!res.ok) {
        showToast('没有找到本地示例行程表')
        return
      }
      // 同一个示例只占一个会话：载入过就切过去，没载入过才另开
      const opened = sessionList.find((s) => s.seedId === id)
      if (opened) {
        await switchTrip(opened.id)
        showToast('这个示例之前载入过，已切过去')
        return
      }
      const data = await res.json()
      if (trip || planDraft || bubbles.length) await newTrip()
      seedRef.current = id
      const out = await applyTrip(data, { skipPhotos: true })
      setPlanDraft('')
      setPlanAnswers([])
      setAskWriting({})
      setPlanningPersona('')
      showToast(out.themeName ? `已载入示例行程（${out.themeName}）` : '已载入示例行程表')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveAsSeed() {
    if (!trip) return
    try {
      const res = await fetch('/api/seed/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {}),
        },
        body: JSON.stringify({ trip }),
      })
      const out = await res.json()
      if (!res.ok) throw new Error(out.error || '保存失败')
      const list = await fetch('/seed/list.json').then((r) => (r.ok ? r.json() : []))
      setSeedList(Array.isArray(list) ? list : [])
      showToast(`已存为第 ${out.order} 个示例行程`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function ensureResearch(query: string) {
    if (researchRef.current.done && researchRef.current.query === query) return researchRef.current
    if (!amapKey.trim() && !tiandituKey.trim() && !searchKey.trim() && !searchFallbackKey.trim() && !serverCfg.amap && !serverCfg.tianditu && !serverCfg.search) {
      researchRef.current = {
        done: true,
        query,
        brief: '无地图/搜索 Key：出页仍按坐标做本地距离与打车估价；坐标与酒店价多为模型参考，出行前请以官方渠道核实。',
        sources: [{ name: '本地路网估算', scope: '无 Key 时按坐标估算交通', realtime: false }],
        hotelsByTier: undefined,
      }
      return researchRef.current
    }
    try {
      const research = await fetchResearch({
        query,
        amapKey: amapKey.trim(),
        tiandituKey: tiandituKey.trim(),
        searchKey: searchKey.trim(),
        searchProvider,
        searchFallbackKey: searchFallbackKey.trim(),
        searchFallbackProvider,
        authToken: authTokenRef.current,
      })
      researchRef.current = {
        done: true,
        query,
        brief: research.brief || '',
        openHours: research.openHours || [],
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
      ...chatAuth(),
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
            next[next.length - 1] = { role: 'assistant', text: live ? acc : pendingText, pending: true }
          }
          return next
        })
      },
    })
    try { localStorage.removeItem('ct.keyBad') } catch { /* ignore */ }
    if (serverModel) refreshQuota()
    return { acc, signal: ac.signal }
  }

  function rememberKeyFailed() {
    try { localStorage.setItem('ct.keyBad', '1') } catch { /* ignore */ }
  }

  function showFail(msg: string) {
    const auth = isAuthFail(msg) && !serverModel
    if (auth) rememberKeyFailed()
    // 只留对话里一处报错，不再同时打下方红条（颜色与 .err 一致）
    setError('')
    const chat = auth ? '密钥没通过。请在下方重新粘贴完整模型密钥后再发。' : `出错了：${msg}`
    setBubbles((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      const bubble: Bubble = { role: 'assistant', text: chat, error: true }
      if (last?.pending) next[next.length - 1] = bubble
      else next.push(bubble)
      return next
    })
  }

  async function runPlan(text: string, fresh = false, autoFill = false) {
    const picked = planningPersona && !detectPersona(text)
      ? `规划人格：${personaLabel(planningPersona)}。按此人格写大纲。\n${text}`
      : text
    const research = await ensureResearch(text)
    const history: ChatMessage[] = buildPlanMessages({ brief: research.brief, bubbles: fresh ? [] : bubbles, planDraft: fresh ? '' : planDraft, text: picked })
    const first = await streamTo(history, 'plan', '正在写按天的大纲…', true)
    if (first.signal.aborted) return
    const nextPlan = first.acc.trim()
    if (!nextPlan) throw new Error('模型没有返回计划')
    const found = detectPersona(nextPlan)
    if (found) setPlanningPersona(found)
    setPlanDraft(nextPlan)
    const nextAsks = extractAskItems(nextPlan)
    setPlanAnswers(nextAsks.map((item) => pickedByQuestion.current[item.question] || ''))
    setAskWriting({})
    setBubbles((prev) => {
      const next = [...prev]
      next[next.length - 1] = {
        role: 'assistant',
        text: nextPlan
          + (autoFill
            ? ''
            : extractAskItems(nextPlan).length
              ? '\n\n选好下面的选项，点「确认并生成」，会直接做出行程页。'
              : '\n\n没有要确认的选项。点「确认生成」做出行程页。'),
      }
      return next
    })
    return nextPlan
  }

  function showWait(text: string) {
    setPageWait(text)
    setBubbles((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.pending) next[next.length - 1] = { ...last, text }
      return next
    })
  }

  function invalidateExport() {
    exportEpoch.current += 1
    setImageBusy(false)
    setError((prev) => (/^导出超时|^预览尚未就绪/.test(prev) ? '' : prev))
  }

  async function runFill(plan: string, fresh = false, userText = '') {
    const runId = runIdRef.current
    invalidateExport()
    setGenerating(true)
    showWait('正在按确认的安排填写行程')
    try {
    const research = researchRef.current
    const history: ChatMessage[] = buildFillMessages({ brief: research.brief, bubbles: fresh ? [] : bubbles, plan })
    let acc = ''
    try {
      const filled = await streamTo(history, 'fill', '正在按确认的安排填写行程')
      if (filled.signal.aborted || runIdRef.current !== runId) return
      acc = filled.acc
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (isAuthFail(msg) || /连不上|密钥不完整|次已经用完|需要先登录/.test(msg)) throw err
    }
    const parsed = extractTrip(acc)
    const firstAsk = fresh
      ? userText
      : (bubbles.find((b) => b.role === 'user' && b.text.trim() && b.text.trim() !== '确认生成')?.text || userText || '')
    // 模型若吐了空 days，不能挡住大纲兜底；用用户原话里的「5日4晚」也能排出天数
    const nextTrip = (parsed && parsed.days?.length ? parsed : null) || tripFromPlan(plan, firstAsk)
    if (!nextTrip || !Array.isArray(nextTrip.days) || !nextTrip.days.length) {
      throw new Error('还没有按天的安排。请再说一次目的地和几天几晚，或先写出 D1 / D2。')
    }
    const dateSource = [userText, ...bubbles.filter((b) => b.role === 'user').map((b) => b.text)].join('\n')
    stampUndatedTrip(nextTrip, dateSource)
    const persona = detectPersona(plan) || planningPersona
    if (persona && !nextTrip.persona) nextTrip.persona = persona
    if (research.hotelsByTier && !nextTrip.hotelHints) nextTrip.hotelHints = research.hotelsByTier
    if (research.sources?.length && !Array.isArray(nextTrip.dataSources)) {
      nextTrip.dataSources = research.sources
    }
    if (research.openHours?.length) nextTrip.openHours = research.openHours
    showWait('正在先排出每天的线路')
    let out = await applyTrip(nextTrip, { fast: true, recordVersion: false })
    const qualityOf = (page: { quality?: string[] }) => page.quality || []
    if ((out.errors.length || qualityOf(out).length) && parsed) {
      showWait(out.errors.length ? '页面校验未过，正在修表' : '还有店名或规划没写清，正在补')
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
            ].filter(Boolean).join('\n'),
          },
        ]
        const fixedRun = await streamTo(repair, 'fill', '正在补全行程表')
        if (fixedRun.signal.aborted || runIdRef.current !== runId) return
        const fixed = extractTrip(fixedRun.acc)
        if (fixed) {
          stampUndatedTrip(fixed, dateSource)
          if (research.hotelsByTier && !fixed.hotelHints) fixed.hotelHints = research.hotelsByTier
          out = await applyTrip(fixed, { fast: true, recordVersion: false })
        }
      } catch {
        /* 修表失败也保留已出的页 */
      }
    }
    setGenerating(false)
    showWait('正在核对路况、门票和图片')
    try {
      out = await applyTrip(out.trip)
    } catch {
      /* 路况和图片没补上时，保留已经能看的行程 */
    }
    const gaps = qualityOf(out)
    const note = !parsed
      ? '这版是按你确认的大纲直接出的，细节可以继续打磨。要改哪一天，直接告诉我。'
      : out.errors.length
        ? '已出页，但还有两处要你定一下：' + out.errors.slice(0, 2).join('；')
        : gaps.length
          ? '已出页。质检还缺：' + gaps.slice(0, 2).join('；') + (gaps.length > 2 ? `等 ${gaps.length} 处` : '') + '。直接说店名或第几天，我来补。'
          : (out.fallback ? '这版版式没过检查，已换回陶土宣纸，内容不受影响。' : `已出页。要改某一天，直接说改哪个点；问时间、距离、累不累，我先回答。`)
    if (runIdRef.current !== runId) return
    finishBubble(note)
    } finally {
      if (runIdRef.current === runId) {
        setGenerating(false)
        setPageWait('')
      }
    }
  }

  function recentChat(extra: { role: 'user' | 'assistant'; text: string }[] = [], opts?: { limit?: number; day?: number | null }): ChatMessage[] {
    return buildChatMessages({ digest: digestTrip(trip, { day: opts?.day }), bubbles, extra, limit: opts?.limit })
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
    finishBubble(stripBoilerReply(acc) || acc.trim())
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
      : [{ role: 'user' as const, content: ask }]
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
    })
    // 验货：新名必须在渲染后的 HTML 里找得到，否则"进了表没上页"，不许说已写入
    const unseen = findUnseenInHtml(touched, out.html)
    finishBubble([
      stripBoilerReply(reply),
      '已写入页面：' + applied.join('；'),
      failed.length ? '未改成：' + failed.join('；') : '',
      unseen.length ? `页面上没找到「${unseen.join('、')}」（补丁已进表，疑似模具没渲染该字段，请截图告诉我）` : '',
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

  async function runPhotos(text: string, append = false, fromTrip?: Trip | null, priorAsk = '') {
    const base = fromTrip || trip
    if (!base) return
    const req = resolvePhotoIntent(text, base, { priorAsk })
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
    const fillGaps = req.mode === 'fill_gaps'
    const replace = req.mode === 'replace'
    const out = await applyTrip(base, {
      keepThemeId: keepThemeId || undefined,
      skipPhotos: false,
      replacePhotos: replace,
      fillGaps,
      photoMode: req.mode,
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
    const didVerb = fillGaps ? '已对号入座补上' : '已全部重搜覆盖'
    const lines = [
      outcome.changed.length ? `${scope}${didVerb}：${outcome.changed.join('、')}。` : '',
      outcome.missing.length
        ? `${scope}仍缺合格图：${outcome.missing.join('、')}（公开图库里没有对得上的，已保留原样）。可以直接给我一个能打开的图片链接，或换个更通用的地名让我再搜。`
        : '',
    ].filter(Boolean)
    const msg = lines.length
      ? lines.join('\n')
      : changedPhotos
        ? (fillGaps ? '已检查各格：真图保留，空位/占位/明显坏图已对号入座替换。' : '已按你的要求把范围内图片全部重新搜索覆盖。')
        : fillGaps
          ? `${scope}检查完毕：没有空位、占位或明显错误的图需要替换。`
          : `${scope}全部重搜后仍没有可用新图，原图保留。可换个地名或直接给我图片链接。`
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
    const count = planQuestions.length
    setPlanAnswers((prev) => {
      const next = Array.from({ length: count }, (_, i) => prev[i] || '')
      const cur = next[index] || ''
      next[index] = toggle && cur === value ? '' : value
      return next
    })
    if (toggle) {
      setAskWriting((prev) => {
        if (!prev[index]) return prev
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
  }

  function switchMobileView(next: 'chat' | 'preview') {
    setMobileView(next)
    if (next === 'chat') {
      window.requestAnimationFrame(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
  }

  // 没有行程页时只留对话，底栏的会话/预览要等进入预览后再出现
  useEffect(() => {
    if (!trip && mobileView !== 'chat') setMobileView('chat')
  }, [trip, mobileView])

  async function submitPlanAnswers() {
    if (!planQuestions.length) return
    if (planAnswers.some((a) => !String(a || '').trim())) {
      showToast('每道待确认都选好或写好后，再确认')
      return
    }
    const reply = formatAskAnswers(askItems, planAnswers)
    if (trip) {
      if (busy) return
      await run(reply, true)
      return
    }
    if (!planDraft) return
    if (!requireModelKey()) return
    // 大纲还没确认就先去填整页，会把选项锁死，也白等一轮长生成。确认时停掉那一轮。
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const plan = `${planDraft.trim()}\n\n${reply}`
    setError('')
    setBusy(true)
    setBubbles((prev) => [...prev, { role: 'user', text: reply }, { role: 'assistant', text: '正在按你的选择生成行程页…', pending: true }])
    try {
      setPlanDraft(plan)
      await runFill(plan, false, reply)
    } catch (err) {
      if (runIdRef.current === runId) showFail(err instanceof Error ? err.message : String(err))
    } finally {
      if (runIdRef.current === runId) setBusy(false)
    }
  }

  function requireModelKey() {
    if (serverModel) {
      if (authTokenRef.current) return true
      showToast('登录后就能直接用，不用填密钥')
      openAuth('login')
      return false
    }
    const key = sanitizeApiKey(apiKey)
    const broken = keyLooksUnusable(key)
    if (broken) {
      setError(broken)
      if (broken === '请先粘贴模型密钥') setKeyDialogOpen(true)
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
        added.push(...await readAttachments(f, authTokenRef.current))
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

  function acceptAuth(result: { token: string; username: string }) {
    authTokenRef.current = result.token
    setAuthUser(result.username)
    try { localStorage.setItem(TOKEN_KEY, result.token) } catch { /* ignore */ }
    try { localStorage.removeItem('ct.account') } catch { /* ignore */ }
    setAuthReady(true)
    setAuthError('')
    // 换账号立刻切到该账号自己的行程库（新用户是空的）
    void hydrateForUser(result.username)
  }

  function openAuth(screen: AuthScreen) {
    setAuthError('')
    setAuthSuccess(null)
    setAuthScreen(screen)
  }

  function closeAuth() {
    if (authBusy) return
    setAuthSuccess(null)
    setAuthScreen(null)
    setAuthError('')
  }

  async function submitAuth(input: AuthInput) {
    if (authBusy) return
    setAuthError('')
    setAuthBusy(true)
    try {
      if (authScreen === 'register') {
        const result = await registerAccount({ account: input.account, code: input.code, password: input.password })
        if (!result.token) throw new Error('注册没有完成，请再试一次')
        acceptAuth(result)
        setAuthSuccess({ kind: 'register', username: result.username })
      } else {
        const result = await loginAccount({ account: input.account, password: input.password })
        if (!result.token) throw new Error('登录没有完成，请再试一次')
        acceptAuth(result)
        setAuthSuccess({ kind: 'login', username: result.username })
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : '账号请求失败')
    } finally {
      setAuthBusy(false)
    }
  }

  async function signOut() {
    const token = authTokenRef.current
    authTokenRef.current = ''
    setAuthUser('')
    setAuthScreen(null)
    setAuthSuccess(null)
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
    clearWorkspaceForGuest()
    if (token) void logoutAccount(token)
  }

  function openingText() {
    return bubbles.find((b) => b.role === 'user' && !b.pending && b.text.trim())?.text || ''
  }

  async function judgeTurn(text: string): Promise<Turn> {
    const opening = openingText()
    const fallback = localTurn(opening, text, tripDays)
    const ac = new AbortController()
    const timer = window.setTimeout(() => ac.abort(), 8000)
    let acc = ''
    try {
      await streamChat({
        ...chatAuth(),
        messages: buildRouteMessages({ opening, head: tripHead(trip, planDraft), said: userPack(bubbles), text }),
        mode: 'route',
        signal: ac.signal,
        onDelta: (delta) => { acc += delta },
      })
      return parseTurn(acc) || fallback
    } catch {
      return fallback
    } finally {
      window.clearTimeout(timer)
    }
  }

  // 新任务另开一趟会话，旧行程留在列表里；跟着人走的偏好人数没变就沿用，人数变了才问
  async function startNewTask(text: string, plan: PrefPlan) {
    await persistNow()
    const id = newSessionId()
    const persona = planningPersona
    resetWorkspace()
    setPlanningPersona(persona)
    rememberSessionId(id)
    setSessionId(id)
    if (plan.mode === 'ask') {
      setBubbles([{ role: 'user', text }, { role: 'assistant', text: '这是一趟新行程，同行人数变了。上一趟提过下面这些偏好，这趟还要吗？' }])
      setPrefOffer({ text, prefs: plan.prefs, picked: plan.prefs.map(() => true) })
      return
    }
    setBubbles([{ role: 'user', text }])
    await generateNewTask(text, plan.prefs, plan.mode === 'carry')
  }

  async function generateNewTask(text: string, prefs: string[], auto = false) {
    const line = carryLine(prefs)
    const note = line && auto ? `已沿用上一趟的偏好：${prefs.join('；')}。这趟不需要的话直接说去掉。` : ''
    setBubbles((prev) => [
      ...prev,
      ...(line && !auto ? [{ role: 'user' as const, text: line }] : []),
      ...(note ? [{ role: 'assistant' as const, text: note }] : []),
      { role: 'assistant' as const, text: '', pending: true },
    ])
    const runId = runIdRef.current
    setGenerating(true)
    try {
      const plan = await runPlan([text, line].filter(Boolean).join('\n'), true, false)
      if (runIdRef.current !== runId || !plan) return
      // 还有待确认就先让人选。选完再填页，避免未答题就跑一整轮慢生成。
      if (extractAskItems(plan).length === 0) await runFill(plan, true, [text, line].filter(Boolean).join('\n'))
    } finally {
      if (runIdRef.current === runId) setGenerating(false)
    }
  }

  async function settlePrefs(useThem: boolean) {
    const offer = prefOffer
    if (!offer || busy || !requireModelKey()) return
    setPrefOffer(null)
    setError('')
    setBusy(true)
    try {
      await generateNewTask(offer.text, useThem ? offer.prefs.filter((_, i) => offer.picked[i]) : [])
    } catch (err) {
      showFail(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function run(prompt: string, sameTask = false) {
    const text = prompt.trim()
    if (busy) return
    const runId = ++runIdRef.current
    if (prefOffer) setPrefOffer(null)
    const pics = attachments.filter((a) => a.kind === 'image')
    const docs = attachments.filter((a) => a.kind === 'text')
    if (!text && !attachments.length) return
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
    const lastAssistant = [...bubbles].reverse().find((b) => b.role === 'assistant' && !b.pending && String(b.text || '').trim())?.text || ''
    // 上一轮在问「换哪一天」，用户回「全部都换」→ 强制走配图，并带上追问上下文做指代消解
    const photoFollowup = Boolean(trip && isPhotoScopeClarify(lastAssistant) && wantsPhotos(text, lastAssistant))
    const doLook = Boolean(pics.length && wantsVision(text, Boolean(trip)))
    const confirmPlan = Boolean(!trip && planDraft && isConfirm(text))
    const routed = Boolean((trip || planDraft) && text && !pics.length && !confirmPlan && !(trip && restyleOnly))
    const keyReady = serverModel ? Boolean(authTokenRef.current) : Boolean(sanitizeApiKey(apiKey))
    const preset: Turn | null = sameTask
      ? { ...localTurn('', '', null), action: 'edit' }
      : photoFollowup
        ? { ...localTurn(openingText(), text, tripDays), action: 'photos' }
        : null
    const offline = routed && !keyReady ? (preset || localTurn(openingText(), text, tripDays)) : null
    const offlineNew = Boolean(offline && isNewTask(offline, text))
    const localEdit = (() => {
      if (!trip || !offline || offlineNew || offline.action !== 'edit' || !wantsTripEdit(text)) return false
      const local = inferLocalEdit(text, recentForLocal)
      return Boolean(local.replaceDays.length || local.changes.length || local.adds.length)
    })()
    const free = Boolean((pics.length && !doLook) || (trip && restyleOnly) || (trip && offline && !offlineNew && offline.action === 'photos') || localEdit || photoFollowup)
    if (!free && !requireModelKey()) return
    setError('')
    setInput('')
    setBusy(true)
    if (trip && restyleOnly) {
      setBubbles((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '正在换皮…', pending: true }])
      try {
        const out = await restyle(themeFromText(text))
        finishBubble(out?.fallback ? '换皮未过校验，已回退陶土模具。' : `已换皮：${out?.themeName || '下一套'}（没走模型）。`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
      return
    }
    const attachNote = attachments.length ? `（附件：${attachments.map((a) => a.name).join('、')}）` : ''
    setBubbles((prev) => [
      ...prev,
      { role: 'user' as const, text: [text, attachNote].filter(Boolean).join(' ') },
      { role: 'assistant' as const, text: '', pending: true },
    ])
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
      if (confirmPlan) {
        await runFill(planDraft, false, ask)
        return
      }
      if (!routed) {
        await runPlan(ask)
        setAttachments((prev) => prev.filter((a) => a.kind !== 'text'))
        return
      }
      const judged = preset || offline || await judgeTurn(text)
      // 模型若把「全部都换」判成 ask/edit，本机纠回 photos
      const turn = photoFollowup || (trip && wantsPhotos(text) && judged.action === 'ask')
        ? { ...judged, action: 'photos' as const }
        : judged
      if (isNewTask(turn, text)) {
        await startNewTask(ask, planPrefs(turn, [...turn.task.places, ...tripNames(trip)]))
        setAttachments((prev) => prev.filter((a) => a.kind !== 'text'))
        return
      }
      if (!trip) {
        await runPlan(ask)
      } else if (turn.action === 'replan') {
        setGenerating(true)
        try {
          const plan = await runPlan(ask, false, false)
          if (runIdRef.current !== runId || !plan) return
          if (extractAskItems(plan).length === 0) await runFill(plan, false, ask)
        } finally {
          if (runIdRef.current === runId) setGenerating(false)
        }
      } else if (turn.action === 'photos') {
        await runPhotos(pack, false, trip, lastAssistant)
      } else if (turn.action === 'ask') {
        await runTalk(ask)
      } else {
        const edited = await runEdit(ask, restyleAsked)
        if (wantsPhotos(text)) await runPhotos(pack, true, edited, lastAssistant)
      }
      setAttachments((prev) => prev.filter((a) => a.kind !== 'text'))
    } catch (err) {
      if (runIdRef.current !== runId || abortRef.current?.signal.aborted) return
      showFail(err instanceof Error ? err.message : String(err))
    } finally {
      if (runIdRef.current === runId) setBusy(false)
    }
  }

  const shareSnippet = useMemo(() => formatShareSnippet(trip), [trip])
  const preferSnippetShare = needsMobileImageSheet()

  useEffect(() => {
    if (!shareOpen) {
      setShareLinkOpen(false)
      setShareUrl('')
      setShareError('')
      setShareBusy(false)
      return
    }
    // 手机默认走文案/长图；桌面仍自动生成链接
    if (!preferSnippetShare) setShareLinkOpen(true)
  }, [shareOpen, preferSnippetShare])

  useEffect(() => {
    if (!shareOpen || !shareLinkOpen) return
    const frame = requestAnimationFrame(() => {
      const fold = shareFoldRef.current
      const last = fold?.lastElementChild
      const scroller = fold?.closest('.share-sheet')
      if (!last || !scroller) return
      const limit = scroller.getBoundingClientRect().bottom
      if (last.getBoundingClientRect().bottom > limit - 8) {
        last.scrollIntoView({ block: 'end' })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [shareOpen, shareLinkOpen, shareUrl, shareBusy, shareError])

  useEffect(() => {
    if (!shareOpen || !html.trim()) return
    let cancel = false
    setShareUrl('')
    setShareCard({ url: '', title: '', description: '', image: '' })
    setShareError('')
    setShareBusy(true)
    publishShare(html, authTokenRef.current)
      .then((card) => { if (!cancel) { setShareCard(card); setShareUrl(card.url) } })
      .catch((err) => { if (!cancel) setShareError(err instanceof Error ? err.message : '链接生成失败') })
      .finally(() => { if (!cancel) setShareBusy(false) })
    return () => { cancel = true }
  }, [shareOpen, html])

  useEffect(() => () => {
    if (imageExport?.url) URL.revokeObjectURL(imageExport.url)
  }, [imageExport])

  const shareQr = useMemo(() => (
    shareUrl
      ? renderSVG(shareUrl, { ecc: 'M', border: 2, pixelSize: 4, blackColor: '#0e1530', whiteColor: '#ffffff' })
      : ''
  ), [shareUrl])

  async function onCopySnippet() {
    if (!shareSnippet) {
      setShareError('还没有行程可分享，请先生成一页')
      return
    }
    setShareError('')
    const ok = await copyText(shareSnippet)
    if (ok) {
      shareSnippetRef.current?.focus()
      shareSnippetRef.current?.select()
      showToast('文案已复制，打开微信粘贴发给好友即可')
    } else {
      shareSnippetRef.current?.focus()
      shareSnippetRef.current?.select()
      setShareError('没有复制成功，请长按上方文案手动复制')
    }
  }

  async function onShareToWeChat() {
    if (!html.trim()) {
      setShareError('还没有行程可分享，请先生成一页')
      return
    }
    setShareError('')
    let card = shareUrl
      ? { ...shareCard, url: shareUrl, title: shareCard.title || trip?.title || '行程' }
      : null
    if (!card) {
      setShareBusy(true)
      try {
        const published = await publishShare(html, authTokenRef.current)
        card = { ...published, title: published.title || trip?.title || '行程' }
        setShareCard(published)
        setShareUrl(published.url)
      } catch (err) {
        setShareError(err instanceof Error ? err.message : '链接生成失败')
        return
      } finally {
        setShareBusy(false)
      }
    }
    if (shareReach(card.url) === 'local') {
      setShareError('这是本机地址，好友的微信打不开这张卡片。请用手机能访问的网址打开后再发。')
      setShareLinkOpen(true)
      return
    }
    // 微信不再给裸 IP 出链接气泡。发「卡片图 + 完整行程链接」：
    // 图上带二维码，文字里也带 H5，好友能打开整页行程。
    setShareBusy(true)
    try {
      if (card.image) void fetch(card.image, { method: 'GET', cache: 'reload' }).catch(() => {})
      const file = await buildWechatShareCard(card)
      const caption = wechatShareCaption(card)
      const withFile = await shareJpegFile(file, { title: card.title || '行程', text: caption })
      if (withFile === 'shared' || withFile === 'aborted') return
      const linkOnly = await shareH5Card(card)
      if (linkOnly === 'shared' || linkOnly === 'aborted') return
      const ok = await copyText(caption)
      downloadBlob(file, file.name)
      if (ok) showToast('卡片图已保存（含二维码），链接已复制。发图后也可再粘贴链接')
      else {
        setShareLinkOpen(true)
        setShareError('卡片图已下载。请发图给好友；完整行程链接在下方可复制')
      }
      if (!/MicroMessenger/i.test(navigator.userAgent)) {
        window.location.href = 'weixin://'
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : '卡片生成失败')
    } finally {
      setShareBusy(false)
    }
  }

  async function onShareLongImage() {
    setShareOpen(false)
    await onImage()
  }

  function shareClip() {
    const title = shareCard.title || trip?.title || ''
    const description = shareCard.description && shareCard.description !== title ? shareCard.description : ''
    return [title, description, shareUrl].filter(Boolean).join('\n')
  }

  async function onCopyLink() {
    if (!shareUrl) return
    setShareError('')
    const ok = await copyText(shareClip(), shareLinkRef.current)
    if (ok) showToast('摘要和链接已复制，可以粘贴到微信')
    else {
      shareLinkRef.current?.focus()
      shareLinkRef.current?.select()
      setShareError('没有复制成功，请长按上方链接手动复制')
    }
  }

  async function onSendLink() {
    if (!shareUrl) return
    setShareError('')
    const result = await shareH5Card({
      ...shareCard,
      url: shareUrl,
      title: shareCard.title || trip?.title || '行程',
    })
    if (result === 'aborted') return
    if (result === 'unavailable') setShareError('没有发出去')
  }

  function closeImageExport() {
    setImageExport((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  async function onImage() {
    if (imageBusy) return
    if (generating) {
      showToast('预览还在生成，等这一页出来再导出')
      return
    }
    if (!html.trim()) {
      showToast('请先生成行程再导出')
      return
    }
    const epoch = exportEpoch.current
    setImageBusy(true)
    setError((prev) => (/^导出超时|^预览尚未就绪/.test(prev) ? '' : prev))
    try {
      showToast('正在导出长图…')
      const { blob, filename } = await exportImage(html, device)
      if (exportEpoch.current !== epoch) return
      if (needsMobileImageSheet()) {
        setImageExport((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url)
          return { url: URL.createObjectURL(blob), filename, blob }
        })
        showToast('长图已生成，请保存或分享')
      } else {
        downloadBlob(blob, filename)
        showToast('长图已开始下载')
      }
    } catch (err) {
      if (exportEpoch.current !== epoch) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      showToast(msg)
    } finally {
      if (exportEpoch.current === epoch) setImageBusy(false)
    }
  }

  async function onShareImage() {
    if (!imageExport) return
    const file = new File([imageExport.blob], imageExport.filename, { type: 'image/jpeg' })
    const result = await shareJpegFile(file)
    if (result === 'shared' || result === 'aborted') return
    showToast('请长按上方图片，保存到相册')
  }

  function onSaveImage() {
    if (!imageExport) return
    downloadBlob(imageExport.blob, imageExport.filename)
    const opened = window.open(imageExport.url, '_blank', 'noopener')
    if (!opened) showToast('请长按上方图片，保存到相册')
  }

  const signedIn = Boolean(authUser)
  // 没有本地 token 时不必显示「正在确认」——那只是等 useEffect 把 authReady 翻成 true
  const authChecking = !authReady && Boolean(authTokenRef.current)

  return (
    <div className={signedIn ? `shell mobile-${mobileView}` : 'shell gate'}>
      {!signedIn ? (
        <>
          <AlpineScene />
          <div className="gate-mark">
            <BrandLogo large size={28} />
          </div>
          <main className="gate-main">
            <h1 className="gate-title">出发之前，<br />路线已经画好。</h1>
            <p className="gate-lede">说“去哪、几个人、玩几天，行程就画好了”。</p>
            {authChecking ? (
              <p className="gate-status">正在确认登录…</p>
            ) : (
              <AccountDialog
                inline
                screen={authScreen === 'register' ? 'register' : 'login'}
                success={null}
                username=""
                error={authError}
                busy={authBusy}
                onClose={closeAuth}
                onScreen={openAuth}
                onSubmit={(input) => void submitAuth(input)}
                onRequestCode={(input) => requestAuthCode(input)}
                onSignOut={() => void signOut()}
              />
            )}
          </main>
        </>
      ) : (
      <>
      <aside className="pane" id="tm-chat-pane">
        <header className="brand">
          <BrandLogo size={24} title={skillLabel || undefined} />
          <button type="button" className="account-chip" aria-label={`账号 ${authUser}`} title={authUser} onClick={() => openAuth('account')}>
            {(authUser || '?').slice(0, 1).toUpperCase()}
          </button>
        </header>

        <div className="session-bar">
          <FieldSelect
            compact
            aria-label="历史行程"
            value={sessionId}
            disabled={busy || !hydrated}
            onChange={(id) => void switchTrip(id)}
            options={[
              ...(!sessionList.some((s) => s.id === sessionId) ? [{ value: sessionId, label: '新行程' }] : []),
              ...sessionList.map((s) => ({
                value: s.id,
                label: `${s.title}（${new Date(s.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}${s.stage === 'plan' ? '，大纲' : ''}）`,
              })),
            ]}
          />
          <button type="button" className="icon-btn" aria-label="新建行程" title="新建行程" disabled={busy || !hydrated} onClick={() => void newTrip()}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
          {sessionList.some((s) => s.id === sessionId) && (
            <button type="button" className="icon-btn" aria-label="删除这个行程" title="删除这个行程" disabled={busy} onClick={() => askDropTrip(sessionId)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>
            </button>
          )}
        </div>

        {trip && (
          <div className="today-card">
            <div className="plan-ask-k">{today.headline}</div>
            <p>{today.detail}</p>
            {today.inTrip && (
              <button type="button" className="ghost" onClick={() => setRainOn((on) => !on)}>
                {rainOn ? '雨停了，按原计划' : '今天下雨，改雨备'}
              </button>
            )}
          </div>
        )}

        {/* 对话气泡 + 问答卡同一滚动区，避免手机上问答把「确认并生成」顶出屏外却滚不到 */}
        <div className="pane-main" ref={logRef}>
          <div className="log">
            {!trip && bubbles.length === 0 && (
              <div className="empty">
                <h2>这趟想怎么走？</h2>
                <div className="persona-list" role="radiogroup" aria-label="出行方式">
                  {PERSONAS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={planningPersona === p.id}
                      className={planningPersona === p.id ? 'is-picked' : ''}
                      disabled={busy}
                      onClick={() => setPlanningPersona(planningPersona === p.id ? '' : p.id)}
                    >
                      <b>{p.label}</b>
                      <span>{p.hint.replace(' · ', '，')}</span>
                    </button>
                  ))}
                </div>
                <p className="empty-k">也可以直接这样说</p>
                <div className="example-list">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" title={ex} disabled={busy} onClick={() => setInput(ex)}>{ex}</button>
                  ))}
                </div>
                {seedList.length > 0 && (
                  <div className="seed-entry">
                    <label className="seed-entry-label">
                      <span>看看示例行程</span>
                      <select
                        className="seed-pick"
                        value=""
                        disabled={busy}
                        aria-label="载入示例行程"
                        onChange={(e) => { if (e.target.value) void loadSeed(e.target.value) }}
                      >
                        <option value="">选一份示例</option>
                        {seedList.map((s, i) => (
                          <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>
            )}
            {bubbles.map((b, i) => {
              const text = b.text || ''
              const actionable = b.role === 'assistant' && !b.pending && OWN_KEY_HINT.test(text)
              const isError = b.role === 'assistant' && !b.pending && (b.error || ERROR_BUBBLE.test(text) || OWN_KEY_HINT.test(text))
              return (
                <div key={i} className={`bubble ${b.role}${isError ? ' error' : ''}`}>
                  {b.pending && <div className="who">正在生成</div>}
                  <div className="txt">{actionable ? renderQuotaText(text) : (text || (b.pending ? '正在处理…' : ''))}</div>
                </div>
              )
            })}
          </div>

          {prefOffer && (
            <div className="plan-ask pref-pick">
              <div className="plan-ask-k">上一趟的偏好，勾选要沿用的</div>
              <div className="pref-list">
                {prefOffer.prefs.map((p, i) => (
                  <label key={p} className={prefOffer.picked[i] ? 'on' : ''}>
                    <input
                      type="checkbox"
                      checked={prefOffer.picked[i]}
                      disabled={busy}
                      onChange={() => setPrefOffer({ ...prefOffer, picked: prefOffer.picked.map((v, j) => (j === i ? !v : v)) })}
                    />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
              <div className="plan-ask-bar">
                <button type="button" className="go" disabled={busy || !prefOffer.picked.some(Boolean)} onClick={() => void settlePrefs(true)}>沿用所选并生成</button>
                <button type="button" className="ghost" disabled={busy} onClick={() => void settlePrefs(false)}>都不用，直接生成</button>
              </div>
            </div>
          )}

          {error && (
            <div className="err">
              {OWN_KEY_HINT.test(error) ? (
                <>
                  {error
                    .replace(/；?\s*或点[上下方]*「改用自己的(?:模型)?密钥」[^。；]*/g, '')
                    .replace(/；?\s*也可改用自己的模型密钥继续/g, '')
                    .replace(/[。；]\s*$/, '')}
                  。也可「
                  <button type="button" className="link-btn err-link" onClick={switchToOwnKey}>改用自己的模型密钥</button>
                  」继续。
                </>
              ) : error}
            </div>
          )}
          {report.errors.length > 0 && (
            <div className="err">校验：{report.errors.slice(0, 3).join('；')}</div>
          )}

          {askItems.length > 0 && (
            <div className="plan-ask">
              <div className="plan-ask-k">{trip ? '选完点确认，会更新当前行程' : '选完点确认，会直接生成行程'}</div>
              {askItems.map((item, i) => {
                const choices = choicesForQuestion(item.source)
                const picked = planAnswers[i] || ''
                const writing = Boolean(askWriting[i]) || (picked && !choices.includes(picked))
                return (
                  <div key={item.question} className={`plan-q${writing ? ' is-writing' : ''}`}>
                    <p>{i + 1}. {item.question}</p>
                    <div className="plan-q-ops">
                      <span className="plan-q-ans">答案</span>
                      {choices.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={picked === opt ? 'on' : ''}
                          onClick={() => setAnswer(i, opt, true)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {choices.length > 0 && !writing && (
                      <button
                        type="button"
                        className="plan-q-write"
                        onClick={() => setAskWriting((prev) => ({ ...prev, [i]: true }))}
                      >
                        自行填写
                      </button>
                    )}
                    {(writing || choices.length === 0) && (
                      <input
                        value={picked}
                        placeholder={ASK_WRITE_HINT}
                        onChange={(e) => setAnswer(i, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
              <p className="plan-ask-hint">已选 {planAnswers.filter((a) => String(a || '').trim()).length}/{askItems.length}。点错选项可再点一次取消。{busy ? '这一页还在生成，可以先选，出来后再点确认。' : ''}</p>
              <div className="plan-ask-bar">
                <button
                  type="button"
                  className="go"
                  disabled={planAnswers.some((a) => !String(a || '').trim())}
                  onClick={() => void submitPlanAnswers()}
                >
                  {trip ? '确认并更新' : '确认并生成'}
                </button>
              </div>
            </div>
          )}

          {!trip && bubbles.length > 0 && (
            <div className="persona-row" role="radiogroup" aria-label="出行方式">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={planningPersona === p.id}
                  title={p.hint}
                  className={planningPersona === p.id ? 'is-picked' : ''}
                  onClick={() => setPlanningPersona(planningPersona === p.id ? '' : p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底栏停靠：主操作始终可见；矮屏也不裁切「生成/确认」 */}
        <div className={`pane-dock${askItems.length > 0 || prefOffer ? ' has-cta' : ''}`}>
          {prefOffer && (
            <div className="pane-dock-cta" role="region" aria-label="沿用偏好">
              <button type="button" className="go" disabled={busy || !prefOffer.picked.some(Boolean)} onClick={() => void settlePrefs(true)}>沿用所选并生成</button>
              <button type="button" className="ghost" disabled={busy} onClick={() => void settlePrefs(false)}>都不用</button>
            </div>
          )}
          {!prefOffer && askItems.length > 0 && (
            <div className="pane-dock-cta" role="region" aria-label="确认问答">
              <span className="pane-dock-meta">
                已选 {planAnswers.filter((a) => String(a || '').trim()).length}/{askItems.length}
              </span>
              <button
                type="button"
                className="go"
                disabled={planAnswers.some((a) => !String(a || '').trim()) || busy}
                onClick={() => void submitPlanAnswers()}
              >
                {trip ? '确认并更新' : '确认并生成'}
              </button>
            </div>
          )}
          {!prefOffer && askItems.length === 0 && canConfirm && !busy && (
            <div className="pane-dock-cta" role="region" aria-label="确认生成">
              <button type="button" className="go" onClick={() => void confirmPage()}>确认生成</button>
            </div>
          )}

          <form
            className={`composer${dragOver ? ' drop' : ''}${askItems.length > 0 || prefOffer ? ' is-secondary' : ''}`}
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
            <div className="composer-row">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={trip || planDraft ? '想改哪里，直接说' : '说出去哪、几个人、玩几天'}
                rows={3}
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
                {/* 桌面仍可在输入区旁点确认；手机主按钮在 dock-cta */}
                {canConfirm && askItems.length === 0 && !busy && (
                  <button type="button" className="go composer-confirm-desk" onClick={() => void confirmPage()}>
                    确认生成
                  </button>
                )}
                <button type="submit" className="go" disabled={busy}>
                  {busy ? '生成中' : trip || planDraft ? '发送' : '生成行程'}
                </button>
              </div>
            </div>
          </form>

          {serverModel && (
            <footer className="pane-foot">
              <p className="model-line">
                本agent已接入DeepSeek模型，{authUser
                  ? (quotaUnlimited ? '不限次数' : `今天还能用 ${quotaLeft ?? serverCfg.dailyLimit} 次`)
                  : `每人每天 ${serverCfg.dailyLimit} 次`}
                <button type="button" className="link-btn" onClick={switchToOwnKey}>改用自己的模型密钥</button>
              </p>
            </footer>
          )}

          {trip && (
            <nav className="mobile-tabs" aria-label="手机视图切换">
              <button
                type="button"
                className={`tab-chat${mobileView === 'chat' ? ' on' : ''}`}
                aria-pressed={mobileView === 'chat'}
                aria-controls="tm-chat-pane"
                onClick={() => switchMobileView('chat')}
              >
                会话
              </button>
              <button
                type="button"
                className={`tab-preview${mobileView === 'preview' ? ' on' : ''}`}
                aria-pressed={mobileView === 'preview'}
                aria-controls="tm-preview-pane"
                onClick={() => switchMobileView('preview')}
              >
                预览
              </button>
            </nav>
          )}
        </div>
      </aside>

      <main className="stage" id="tm-preview-pane">
        <div className="toolbar">
          <div className="seg">
            <button type="button" className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')}>手机</button>
            <button type="button" className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')}>桌面</button>
          </div>
          {pageWait && !generating && <p className="page-enrich" role="status">{pageWait}</p>}
          {trip && <div className="actions">
            <button type="button" onClick={() => void restyle()}>换皮</button>
            {versions.length > 1 && (
              <>
                <FieldSelect
                  light
                  compact
                  aria-label="行程版本"
                  value={String(versionSel)}
                  options={[
                    { value: '-1', label: '回到上一版' },
                    ...versions.map((v, i) => ({ value: String(i), label: `${i + 1}. ${v.label}` })),
                  ]}
                  onChange={(v) => setVersionSel(Number(v))}
                />
                <button
                  type="button"
                  onClick={() => rollbackVersion(versionSel)}
                >
                  回退（共{versions.length}版）
                </button>
              </>
            )}
            {import.meta.env.DEV && <button type="button" className="save-seed" onClick={() => void saveAsSeed()}>存为示例</button>}
            <button type="button" onClick={() => setShareOpen(true)}>分享</button>
            <button type="button" className="export-image" disabled={imageBusy || generating} onClick={() => void onImage()}>{imageBusy ? '导出中…' : '导出图片'}</button>
            <button type="button" className="primary export-h5" onClick={() => { exportH5(html); showToast('H5 已下载') }}>导出 H5</button>
          </div>}
        </div>
        <div className={`frame ${device}`}>
          <iframe ref={iframeRef} title="行程预览" srcDoc={previewDoc} sandbox="allow-scripts allow-popups" />
          {generating && (
            <div className="page-loading" role="status" ref={loadingRef}>
              <div className="page-loading-box">
                <span className="page-loading-spin" aria-hidden="true" />
                <p>{pageWait || '行程正在生成，请稍后'}</p>
              </div>
            </div>
          )}
        </div>

        {trip && (
          <nav className="mobile-tabs" aria-label="手机视图切换">
            <button
              type="button"
              className={`tab-chat${mobileView === 'chat' ? ' on' : ''}`}
              aria-pressed={mobileView === 'chat'}
              aria-controls="tm-chat-pane"
              onClick={() => switchMobileView('chat')}
            >
              会话
            </button>
            <button
              type="button"
              className={`tab-preview${mobileView === 'preview' ? ' on' : ''}`}
              aria-pressed={mobileView === 'preview'}
              aria-controls="tm-preview-pane"
              onClick={() => switchMobileView('preview')}
            >
              预览
            </button>
          </nav>
        )}
      </main>
      </>
      )}

      {deleteConfirm && (
        <div className="modal" onClick={() => setDeleteConfirm(null)}>
          <div className="sheet" role="dialog" aria-labelledby="delete-dialog-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dialog-close" aria-label="关闭" onClick={() => setDeleteConfirm(null)}>
              <span aria-hidden="true">×</span>
            </button>
            <h2 id="delete-dialog-title">删除行程？</h2>
            <p>删除「{deleteConfirm.title}」后，对话、页面和版本都会删掉，不能恢复。</p>
            <div className="sheet-actions">
              <button type="button" className="ghost" onClick={() => setDeleteConfirm(null)}>取消</button>
              <button type="button" className="primary" onClick={() => void confirmDropTrip()}>确认删除</button>
            </div>
          </div>
        </div>
      )}

      {keyDialogOpen && (
        <div className="modal" onClick={() => setKeyDialogOpen(false)}>
          <div className="sheet key-sheet" role="dialog" aria-labelledby="key-dialog-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dialog-close" aria-label="关闭" onClick={() => setKeyDialogOpen(false)}>
              <span aria-hidden="true">×</span>
            </button>
            <h2 id="key-dialog-title">模型密钥</h2>
            <div className="controls">
            {serverCfg.model && (
              <button type="button" className="ghost" onClick={() => { setOwnKey(false); setKeyDialogOpen(false) }}>改回服务端模型（登录即用）</button>
            )}
            <label>
              <span>服务商</span>
              <FieldSelect
                aria-label="服务商"
                value={providerId}
                options={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(id) => {
                  const next = getProvider(id)
                  setProviderId(next.id)
                  setModelId(next.models[0].id)
                }}
              />
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
                <FieldSelect
                  aria-label="模型"
                  value={modelId}
                  options={provider.models.map((m) => ({ value: m.id, label: m.name }))}
                  onChange={setModelId}
                />
              </label>
            )}
            <label>
              <span>API Key</span>
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
              <div className="err">这里填模型密钥（{provider.keyHint}），不是网页地址</div>
            )}
            {!looksLikePageUrl(apiKey) && keyMismatchHint(providerId, apiKey) && (
              <div className="err">{keyMismatchHint(providerId, apiKey)}</div>
            )}
            </div>
          {!(serverCfg.amap && serverCfg.tianditu && serverCfg.search) && (
            <div className="controls key-sources">
              <h2 className="key-section-title">数据来源（可选）</h2>
              {!serverCfg.tianditu && (
                <label>
                  <span>地图（推荐·天地图）：个人可申请，国内稳定；补距离/耗时/公交</span>
                  <input type="password" value={tiandituKey} onChange={(e) => setTiandituKey(e.target.value)} placeholder="天地图控制台 · 服务端 Key" autoComplete="off" />
                </label>
              )}
              {!serverCfg.amap && (
                <label>
                  <span>地图（可选·高德）：能力更全，需企业认证时可不填</span>
                  <input type="password" value={amapKey} onChange={(e) => setAmapKey(e.target.value)} placeholder="高德 Web 服务 Key（可选）" autoComplete="off" />
                </label>
              )}
              {!serverCfg.search && (
                <>
                  <div className="controls-row">
                    <label>
                      <span>联网搜索</span>
                      <FieldSelect
                        aria-label="联网搜索"
                        value={searchProvider}
                        options={[
                          { value: 'bocha', label: '博查（国内推荐）' },
                          { value: 'tavily', label: 'Tavily' },
                          { value: 'serper', label: 'Serper' },
                        ]}
                        onChange={setSearchProvider}
                      />
                    </label>
                    <label>
                      <span>搜索 Key</span>
                      <input type="password" value={searchKey} onChange={(e) => setSearchKey(e.target.value)} placeholder="选填" autoComplete="off" />
                    </label>
                  </div>
                  <div className="controls-row">
                    <label>
                      <span>备用搜索</span>
                      <FieldSelect
                        aria-label="备用搜索"
                        value={searchFallbackProvider}
                        options={[
                          { value: 'tavily', label: 'Tavily' },
                          { value: 'serper', label: 'Serper' },
                          { value: 'bocha', label: '博查' },
                        ]}
                        onChange={setSearchFallbackProvider}
                      />
                    </label>
                    <label>
                      <span>备用 Key</span>
                      <input type="password" value={searchFallbackKey} onChange={(e) => setSearchFallbackKey(e.target.value)} placeholder="主源失败时用" autoComplete="off" />
                    </label>
                  </div>
                  <p className="plan-ask-hint">补充航班、酒店片区、当季活动等公开信息。大陆网络优先博查；主源失败会自动换备用。</p>
                </>
              )}
              {!amapKey.trim() && !tiandituKey.trim() && !searchKey.trim() && !searchFallbackKey.trim() && !serverCfg.amap && !serverCfg.tianditu && !serverCfg.search && (
                <p className="plan-ask-hint">不填也能用：出页按坐标估算距离与打车价；景点坐标/酒店价仍多为模型参考，请以官方渠道核实。</p>
              )}
            </div>
          )}
            <button type="button" className="go" onClick={() => setKeyDialogOpen(false)}>完成</button>
          </div>
        </div>
      )}

      {imageExport && (
        <div className="modal" onClick={closeImageExport}>
          <div className="sheet image-sheet" role="dialog" aria-labelledby="image-export-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dialog-close" aria-label="关闭" onClick={closeImageExport}>
              <span aria-hidden="true">×</span>
            </button>
            <h2 id="image-export-title">保存长图</h2>
            <p className="share-lead">手机浏览器不会直接下载。长按图片保存到相册，或点分享发到微信。</p>
            <div className="image-export-preview">
              <img src={imageExport.url} alt={imageExport.filename} />
            </div>
            <div className="sheet-actions">
              {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                <button type="button" className="primary" onClick={() => void onShareImage()}>分享</button>
              )}
              <button type="button" onClick={onSaveImage}>保存</button>
            </div>
          </div>
        </div>
      )}
      {shareOpen && (
        <div className="modal" onClick={() => setShareOpen(false)}>
          <div className={`sheet share-sheet${shareLinkOpen ? ' is-link-open' : ''}`} role="dialog" aria-labelledby="share-title" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="dialog-close" aria-label="关闭" onClick={() => setShareOpen(false)}>
              <span aria-hidden="true">×</span>
            </button>
            <h2 id="share-title">分享行程</h2>
            <p className="share-lead">
              {preferSnippetShare
                ? '点「发到微信」会生成卡片图（含完整行程二维码），并附上 H5 链接。好友扫码或点链接即可打开整页。发朋友圈用「分享长图」。'
                : '点「发到微信」发送卡片图 + 完整行程链接。图上有二维码，好友能打开整页行程。'}
            </p>
            {shareError && <p className="share-note">{shareError}</p>}

            {shareSnippet ? (
              <>
                <textarea
                  ref={shareSnippetRef}
                  className="share-snippet"
                  readOnly
                  value={shareSnippet}
                  aria-label="行程分享文案"
                  rows={preferSnippetShare ? 10 : 8}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="sheet-actions">
                  <button type="button" className="primary" disabled={shareBusy || !html.trim()} onClick={() => void onShareToWeChat()}>
                    {shareBusy ? '准备卡片…' : '发到微信'}
                  </button>
                  <button type="button" onClick={() => void onCopySnippet()}>复制文案</button>
                  <button type="button" disabled={imageBusy || generating || !html.trim()} onClick={() => void onShareLongImage()}>
                    {imageBusy ? '出图中…' : '分享长图'}
                  </button>
                </div>
              </>
            ) : (
              <p className="share-note">还没有行程可分享，请先生成一页。</p>
            )}

            <details
              className="share-link-fold"
              ref={shareFoldRef}
              open={shareLinkOpen}
              onToggle={(e) => setShareLinkOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary>还要 H5 链接 / 二维码</summary>
              {shareBusy && <p className="share-status">正在生成链接…</p>}
              {shareUrl && (
                <>
                  {shareReach(shareUrl) === 'local' && (
                    <p className="share-note">这是本机地址，手机上的微信打不开。请用手机能访问的网址打开后再分享。</p>
                  )}
                  {shareReach(shareUrl) !== 'local' && shareUrl.startsWith('http://') && (
                    <p className="share-note">当前是 http 链接。要发给外面的朋友，建议配置公网 https 域名。</p>
                  )}
                  <div
                    className="share-qr"
                    role="img"
                    aria-label="用微信扫码打开"
                    dangerouslySetInnerHTML={{ __html: shareQr }}
                  />
                  <input
                    ref={shareLinkRef}
                    className="share-link"
                    readOnly
                    value={shareUrl}
                    aria-label="分享链接"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <div className="sheet-actions">
                    <button type="button" className="primary" onClick={() => void onCopyLink()}>复制链接</button>
                    {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                      <button type="button" onClick={() => void onSendLink()}>发送链接</button>
                    )}
                    <button type="button" onClick={() => { exportH5(html); showToast('H5 已下载') }}>下载 H5</button>
                  </div>
                </>
              )}
            </details>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
      {signedIn && (authScreen || authSuccess) && (
        <AccountDialog
          screen={authScreen || 'login'}
          success={authSuccess}
          username={authUser}
          error={authError}
          busy={authBusy}
          onClose={closeAuth}
          onScreen={openAuth}
          onSubmit={(input) => void submitAuth(input)}
          onRequestCode={(input) => requestAuthCode(input)}
          onSignOut={() => void signOut()}
        />
      )}
    </div>
  )
}
