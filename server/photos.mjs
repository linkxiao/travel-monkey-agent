import fs from 'node:fs'

const UA = {
  'User-Agent': 'TravelMonkey/1.0 (local travel-plan-viz; https://127.0.0.1:5177)',
}

const ALIASES = {
  清水寺: ['清水寺', 'Kiyomizu-dera'],
  二年坂: ['三年坂', 'Ninenzaka', 'Sannenzaka'],
  三年坂: ['三年坂', 'Sannenzaka'],
  八坂: ['八坂神社', 'Yasaka Shrine'],
  祇园: ['祇園', 'Gion Kyoto'],
  祇園: ['祇園', 'Gion Kyoto'],
  金阁寺: ['金閣寺', 'Kinkaku-ji'],
  银阁寺: ['銀閣寺', 'Ginkaku-ji'],
  伏见稻荷: ['伏見稲荷大社', 'Fushimi Inari-taisha'],
  岚山: ['嵐山', 'Arashiyama'],
  竹林: ['嵐山竹林', 'Arashiyama bamboo'],
  天龙寺: ['天龍寺', 'Tenryu-ji'],
  渡月桥: ['渡月橋', 'Togetsukyo'],
}

const REJECT_TEXT = /书法|行书|楷书|草书|篆书|字画|画作|条幅|立轴|横轴|题跋|印章|印谱|拓片|青铜|文物|斧钺|斧头|钱币|邮票|旗帜|纹章|示意图|平面图|logo|icon|svg|flag|calligraphy|painting|seal|artifact|bronze|axe|coin|map\b|diagram|poster/i
const REJECT_CAT = /calligraphy|paintings|seals|bronzes|coins|stamps|flags|icons|maps|diagrams|posters|书法|绘画|印章|青铜|钱币|邮票/i
const PHOTO_HINT = /摄影|photograph|landscape|temple|mountain|寺|庙|山|峰|院落|民宿|酒店|hotel|风景|外景|建筑|building|pagoda|shrine|village|courtyard|星空|银河|夜空|夜景|milky|night sky/i

const CITY_WORDS = [
  '深圳', '大鹏', '较场尾', '盐田', '南山', '福田', '宝安', '龙岗', '坪山', '光明',
  '东莞', '惠州', '珠海', '广州', '中山', '汕头', '潮州',
  '西安', '陕西', '礼泉', '乾县', '昭陵', '咸阳', '汉中', '成都', '剑阁', '广元',
  '京都', '奈良', '大阪', '东京', '杭州', '苏州', '北京', '上海',
  '四川', '甘肃', '敦煌', '青海', '厦门', '青岛', '大理', '丽江', '桂林',
  '武汉', '长沙', '重庆', '南京', '天津', '昆明', '三亚', '海口',
  '甘南', '扎尕那', '玛曲', '迭部', '郎木寺', '若尔盖',
]
const DEST_WORDS = CITY_WORDS

const nameCache = new Map()
const probeCache = new Map()
const binCache = new Map()

const DISK_CACHE_FILE = new URL('./.cache-photo.json', import.meta.url)
function loadDiskCache() {
  try {
    const raw = fs.readFileSync(DISK_CACHE_FILE, 'utf8')
    const obj = JSON.parse(raw)
    Object.entries(obj || {}).slice(-300).forEach(([k, v]) => { if (v) nameCache.set(k, v) })
  } catch { /* first run */ }
}
let diskSaveTimer = null
function saveDiskCache() {
  clearTimeout(diskSaveTimer)
  diskSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(new URL('./', import.meta.url), { recursive: true })
      const obj = {}
      ;[...nameCache.entries()].filter(([, v]) => v).slice(-300).forEach(([k, v]) => { obj[k] = v })
      fs.writeFileSync(DISK_CACHE_FILE, JSON.stringify(obj))
    } catch { /* cache is best-effort */ }
  }, 2000)
}

function cachedPhoto(core, kind) {
  const prefix = `${core}|${kind}|`
  let hit = ''
  for (const [key, url] of nameCache) {
    if (url && key.startsWith(prefix)) hit = url
  }
  return hit
}
loadDiskCache()

function coreName(name) {
  return String(name || '').split(/[·・（(\/／|,，+|＋、\s]/)[0].trim()
}

function queriesFor(name, hints = []) {
  const core = coreName(name)
  const extra = []
  for (const [key, aliases] of Object.entries(ALIASES)) {
    if (core.includes(key) || String(name).includes(key)) extra.push(...aliases)
  }
  const withHint = hints.slice(0, 3).map((h) => `${core} ${h}`)
  return [...new Set([...withHint, core, name, ...extra].filter(Boolean))]
}

const PHOTO_HOST_SUFFIXES = [
  'wikimedia.org', 'wikipedia.org',
  'xhscdn.com',
  'meituan.net', 'meituan.com',
  'dpfile.com',
  'bdstatic.com', 'bcebos.com',
  'googleusercontent.com', 'ggpht.com', 'gstatic.com',
  'autonavi.com', 'amap.com',
  'qpic.cn', 'qcloud.com', 'myqcloud.com', 'aliyuncs.com',
  'tripcdn.com', 'c-ctrip.com',
]

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function isAllowedPhotoHost(url) {
  if (!/^https?:\/\//i.test(url || '')) return false
  const host = hostnameOf(url)
  if (!host) return false
  if (PHOTO_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return true
  if (host === 'ci.xiaohongshu.com') return true
  if (/^(imgsa|img\d*|gips\d*|pics\d*|t1[0-2])\.baidu\.com$/.test(host)) return true
  if (host.endsWith('autonavi.com') || host.includes('amap.com')) return true
  if (host.endsWith('alicdn.com') || host.endsWith('taobaocdn.com')) return true
  return false
}

function refererFor(url) {
  const host = hostnameOf(url)
  if (host.includes('xhscdn') || host.includes('xiaohongshu')) return 'https://www.xiaohongshu.com/'
  if (host.includes('meituan') || host.includes('dpfile') || host.includes('dianping')) return 'https://www.dianping.com/'
  if (host.includes('baidu') || host.includes('bdstatic') || host.includes('bcebos')) return 'https://image.baidu.com/'
  if (host.includes('autonavi') || host.includes('amap')) return 'https://www.amap.com/'
  return ''
}

function imageHeaders(url) {
  const host = hostnameOf(url)
  // 维基会拒绝伪装成浏览器的脚本请求，回一页 HTML，代理只能当成缺图。
  const wiki = host === 'wikimedia.org' || host.endsWith('.wikimedia.org') || host === 'wikipedia.org' || host.endsWith('.wikipedia.org')
  const headers = {
    'User-Agent': wiki ? UA['User-Agent'] : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  }
  const referer = refererFor(url)
  if (referer) headers.Referer = referer
  return headers
}

export function isLocalPhoto(url) {
  return typeof url === 'string' && (url.startsWith('travel-assets/') || url.startsWith('/travel-assets/'))
}

/** 占位图 / 空链：缺图补图时应当成「没有真图」覆盖掉 */
export function isPlaceholderPhoto(url) {
  if (!url || typeof url !== 'string') return true
  const u = url.trim()
  if (!u) return true
  return /placehold\.co|placeholder\.com|via\.placeholder|dummyimage\.com|picsum\.photos|\/no[-_]?image|default[-_]?photo|图片加载中|text=图片|data:image\/svg/i.test(u)
}

export function proxiedPhoto(url) {
  if (!url || typeof url !== 'string') return ''
  if (isLocalPhoto(url)) return url.startsWith('/') ? url : `/${url}`
  if (url.startsWith('/travel-photo?')) return url
  if (isAllowedPhotoHost(url)) return `/travel-photo?u=${encodeURIComponent(url)}`
  return ''
}

function fileTitleOf(url) {
  try {
    const u = new URL(url)
    const raw = u.pathname.split('/Special:FilePath/')[1] || u.pathname.split('/').pop() || ''
    return decodeURIComponent(raw).replace(/\?.*$/, '')
  } catch {
    return ''
  }
}

function fold(text) {
  return String(text || '').replace(/頭/g, '头').replace(/國/g, '国').replace(/區/g, '区').replace(/東/g, '东').replace(/臺/g, '台').replace(/灣/g, '湾').replace(/觀/g, '观').replace(/廟/g, '庙').replace(/縣/g, '县').replace(/陝/g, '陕')
}

function nameLooksGeneric(name) {
  const core = coreName(name)
  return !core || core.length < 2 || /^(小院|农家|客栈|民宿|酒店|饭店|餐厅|寺|庙|山|景点|午餐|晚餐|早餐|住宿|住店|市区|回市|就近|店内)$/.test(core)
}

function titleMatchesName(title, name) {
  const t = fold(String(title || '').replace(/^File:/i, ''))
  const core = fold(coreName(name))
  if (!core || core.length < 2) return false
  return t.includes(core)
}

function poiNameMatches(poiName, query) {
  const p = fold(String(poiName || ''))
  const q = fold(String(query || '').replace(/[（(].*$/, '').replace(/酒店$|饭店$|民宿$|宾馆$/, ''))
  if (!p || !q || q.length < 2) return false
  if (p.includes(q) || (q.length >= 4 && q.includes(p))) return true
  const tokens = q.split(/[·・\s]/).map((t) => t.replace(/酒店$|饭店$|民宿$/, '')).filter((t) => t.length >= 2)
  if (tokens.length >= 2) return tokens.every((t) => p.includes(t))
  return false
}

const HINT_STOP = /行程|旅行|旅游|古道|之旅|计划|确认|参考|长亭|Travel Monkey|网页|助手/

function placeTokens(text) {
  const raw = String(text || '')
  const found = CITY_WORDS.filter((w) => raw.includes(w))
  const areas = raw.match(/[\u4e00-\u9fff]{2,6}(?:市|区|县|镇|湾|半岛)?/g) || []
  return [...found, ...areas.filter((w) => !HINT_STOP.test(w) && (CITY_WORDS.includes(w) || /[市县区镇]$/.test(w) || w.length >= 3 && CITY_WORDS.some((c) => w.includes(c))))]
}

export function destHints(trip, except = '', day = null) {
  const extras = []
  extras.push(...placeTokens(trip?.title))
  extras.push(...placeTokens(except))
  for (const area of trip?.hotelAreas || []) extras.push(...placeTokens(area.area))
  if (day) {
    extras.push(...placeTokens(day.theme))
    extras.push(...placeTokens(day.date))
  } else {
    for (const d of trip?.days || []) extras.push(...placeTokens(d.theme))
  }
  const known = CITY_WORDS.filter((w) => extras.includes(w) || String(trip?.title || '').includes(w) || (trip?.hotelAreas || []).some((a) => String(a.area || '').includes(w)))
  return [...new Set([...known, ...extras])].filter(Boolean).slice(0, 12)
}

function cityHintsOf(hints) {
  return (hints || []).filter((h) => CITY_WORDS.includes(h) || /[市县区镇]$/.test(String(h)))
}

function foreignCityPenalty(blob, hints) {
  const local = new Set(cityHintsOf(hints).map((h) => fold(h)))
  if (!local.size) return 0
  const hit = CITY_WORDS.find((c) => blob.includes(fold(c)) && !local.has(fold(c)) && ![...local].some((l) => l.includes(fold(c)) || fold(c).includes(l)))
  return hit ? -80 : 0
}

function clearPhotos(target) {
  delete target.photo
  delete target.photos
  delete target.gallery
}

function mentioned(name, needles) {
  if (!needles?.length) return false
  const n = fold(String(name || ''))
  const core = fold(coreName(name))
  return needles.some((q) => {
    const qq = fold(String(q || ''))
    const qcore = fold(coreName(q))
    if (!qq || qq.length < 2 || !core) return false
    if (n === qq || core === qcore) return true
    if (n.includes(qq) || qq.includes(core)) return Math.min(core.length, qcore.length) >= 3
    return false
  })
}

async function getJson(url) {
  try {
    const res = await fetch(url, {
      headers: { ...UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text()
    if (!res.ok || text.startsWith('<')) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

function looksLikeImageUrl(url) {
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(url || ''))
}

async function probeOnce(url, range) {
  const headers = imageHeaders(url)
  if (range) headers.Range = range
  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
    redirect: 'follow',
  })
  const type = res.headers.get('content-type') || ''
  return res.ok && type.startsWith('image/') && !/svg/i.test(type)
}

export async function probeImage(url) {
  if (!url) return false
  if (isLocalPhoto(url)) return true
  if (probeCache.has(url)) return probeCache.get(url)
  if (!isAllowedPhotoHost(url)) {
    probeCache.set(url, false)
    return false
  }
  const host = hostnameOf(url)
  if (host.includes('autonavi') || host.includes('amap.com')) {
    probeCache.set(url, true)
    return true
  }
  try {
    if (await probeOnce(url, 'bytes=0-64')) {
      probeCache.set(url, true)
      return true
    }
    if (await probeOnce(url, '')) {
      probeCache.set(url, true)
      return true
    }
    const ok = looksLikeImageUrl(url)
    probeCache.set(url, ok)
    return ok
  } catch {
    const ok = looksLikeImageUrl(url)
    probeCache.set(url, ok)
    return ok
  }
}

function filePathUrl(fileTitle) {
  const file = String(fileTitle || '').replace(/^File:/i, '')
  if (!file) return ''
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1600`
}

function metaBlob(info) {
  const meta = info?.extmetadata || {}
  return [
    info?.canonicaltitle,
    meta.ObjectName?.value,
    meta.ImageDescription?.value,
    meta.Categories?.value,
    meta.Assessments?.value,
  ].filter(Boolean).join(' ')
}

function scoreRecord({ title, text, name, hints }) {
  const blob = fold(`${title} ${text}`)
  if (REJECT_TEXT.test(blob) || REJECT_CAT.test(blob)) return -100
  if (!titleMatchesName(title, name) && !titleMatchesName(text, name)) {
    return nameLooksGeneric(name) ? -80 : -20
  }
  const cities = cityHintsOf(hints)
  let score = 10
  if (PHOTO_HINT.test(blob)) score += 8
  const destHit = cities.some((h) => blob.includes(fold(h)))
  if (destHit) score += 8
  else if (cities.length && nameLooksGeneric(name)) return -40
  score += foreignCityPenalty(blob, hints)
  if (/\.(svg)(\?|$)/i.test(title)) score -= 40
  return score
}

async function commonsMeta(fileTitle) {
  const data = await getJson(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|mime|size&titles='
    + encodeURIComponent(fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`),
  )
  const page = Object.values(data?.query?.pages || {})[0]
  const info = page?.imageinfo?.[0]
  if (!info || /svg/i.test(info.mime || '')) return null
  return { title: page.title || fileTitle, text: metaBlob(info), mime: info.mime }
}

async function fromWikipediaSearch(query, name, hints) {
  for (const lang of ['zh', 'en']) {
    const search = await getJson(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=2&srsearch=${encodeURIComponent(query)}`,
    )
    for (const hit of (search?.query?.search || []).slice(0, 2)) {
      const title = hit.title || ''
      const snippet = String(hit.snippet || '').replace(/<[^>]+>/g, '')
      if (!titleMatchesName(title, name) && !titleMatchesName(snippet, name)) continue
      const summary = await getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
      if (scoreRecord({ title: summary?.title || title, text: summary?.extract || '', name, hints }) < 10) continue
      const src = summary?.originalimage?.source || summary?.thumbnail?.source
      if (src && !REJECT_TEXT.test(src) && await probeImage(src)) return src
    }
  }
  return ''
}

async function fromCommons(query, name, hints) {
  const data = await getJson(
    'https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=10&format=json&srsearch='
    + encodeURIComponent(`"${coreName(name)}" ${query}`),
  )
  const ranked = []
  for (const hit of (data?.query?.search || []).slice(0, 4)) {
    const meta = await commonsMeta(hit.title)
    const text = `${hit.snippet || ''} ${meta?.text || ''}`
    const score = scoreRecord({ title: hit.title, text, name, hints })
    if (score < 10) continue
    ranked.push({ title: hit.title, score })
  }
  ranked.sort((a, b) => b.score - a.score)
  for (const item of ranked.slice(0, 3)) {
    const url = filePathUrl(item.title)
    if (url && await probeImage(url)) return url
  }
  return ''
}

function destPhrase(hints) {
  return cityHintsOf(hints).slice(0, 2).join(' ')
}

function isSceneQuery(name) {
  return /星空|夜观|夜景|银河|观星|日出|日落|云海|雪景|雾凇|晚霞|花海/.test(String(name || ''))
}

function kindFlavor(kind) {
  if (kind === 'stay' || kind === 'hotel') return '民宿 客栈 酒店 院子 环境'
  if (kind === 'food' || kind === 'dining') return '餐厅 美食 环境'
  if (kind === 'spot') return '景点 风景 实拍'
  return '实拍'
}

function baiduQueries(name, hints, kind) {
  const core = coreName(name)
  const where = destPhrase(hints) || ''
  if (isSceneQuery(name)) {
    return [
      `${where} ${core}`.trim(),
      `${core} ${where} 实拍`,
    ].map((q) => q.replace(/\s+/g, ' ').trim()).filter((q, i, all) => q && all.indexOf(q) === i)
  }
  const flavor = kindFlavor(kind)
  return [
    `${core} ${where} ${flavor}`,
    `${core} ${where} 实拍`,
  ].map((q) => q.replace(/\s+/g, ' ').trim()).filter((q, i, all) => q && all.indexOf(q) === i)
}

function dianpingQueries(name, hints) {
  const core = coreName(name)
  const where = destPhrase(hints) || ''
  return [`"${core}" ${where} site:dianping.com/shop`].map((q) => q.replace(/\s+/g, ' ').trim())
}

function isPublicShopPage(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^(www|m)\./, '')
    const path = u.pathname
    if (host.endsWith('dianping.com') && /\/shop\/\d+/.test(path)) return true
    if (host.endsWith('xiaohongshu.com') && /\/explore\/[a-z0-9]+/i.test(path)) return true
    if (host.endsWith('xiaohongshu.com') && /\/discovery\/item\//.test(path)) return true
    return false
  } catch {
    return false
  }
}

function scoreWeb(item, name, hints, kind = '') {
  const blob = fold(`${item.title || ''} ${item.text || ''} ${item.domain || ''} ${item.url || ''} ${item.link || ''}`)
  if (REJECT_TEXT.test(blob) || REJECT_CAT.test(blob)) return -100
  const core = fold(coreName(name))
  const cities = cityHintsOf(hints)
  const destHit = cities.some((h) => blob.includes(fold(h)))
  const lodging = kind === 'stay' || kind === 'hotel' || kind === 'food' || kind === 'dining'
  if (!core || !blob.includes(core)) {
    return -50
  }
  if (lodging && cities.length && !destHit) return -40
  let score = 12
  if (/\/shop\/\d+/.test(blob)) score += 16
  if (/\/explore\/|\/discovery\/item\//.test(blob)) score += 12
  if (/xiaohongshu|xhscdn|小红书/.test(blob)) score += 10
  if (/dianping|dpfile|meituan|大众点评/.test(blob)) score += 10
  if (/baidu|bdstatic|bcebos/.test(blob)) score += 2
  if (destHit) score += 10
  score += foreignCityPenalty(blob, hints)
  if (/探店|店图|民宿|客栈|酒店|餐厅|环境|客房|院子|实拍/.test(blob)) score += 6
  return score
}

function pickImageUrl(item) {
  const candidates = [item.url, item.thumb].filter(Boolean).map((u) => String(u).replace(/^http:\/\//i, 'https://'))
  return candidates.find((u) => isAllowedPhotoHost(u)) || ''
}

async function serperImages(query, key) {
  const res = await fetch('https://google.serper.dev/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': key },
    body: JSON.stringify({ q: query, num: 10, gl: 'cn', hl: 'zh-cn' }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json()
  return (data.images || []).map((x) => ({
    url: x.imageUrl,
    thumb: x.thumbnailUrl,
    title: x.title || '',
    text: `${x.title || ''} ${x.source || ''} ${x.link || ''}`,
    domain: x.source || '',
  }))
}

async function tavilyImages(query, key) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: 6,
      include_images: true,
      search_depth: 'basic',
    }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json()
  const fromField = (data.images || []).map((item) => {
    if (typeof item === 'string') return { url: item, title: query, text: query, domain: hostnameOf(item) }
    return { url: item.url, title: item.description || query, text: item.description || '', domain: hostnameOf(item.url) }
  })
  const fromHits = (data.results || []).flatMap((hit) => (hit.images || []).map((url) => ({
    url,
    title: hit.title || query,
    text: `${hit.title || ''} ${hit.content || ''}`,
    domain: hostnameOf(url),
  })))
  return fromField.concat(fromHits)
}

async function baiduImages(query) {
  const url = 'https://image.baidu.com/search/acjson?tn=resultjson_com&ipn=rj&ct=201326592&fp=result&ie=utf-8&oe=utf-8&word='
    + encodeURIComponent(query) + '&pn=0&rn=12'
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: 'https://image.baidu.com/',
        Accept: 'application/json,text/plain,*/*',
      },
      signal: AbortSignal.timeout(8000),
    })
    const text = await res.text()
    if (!res.ok || text.startsWith('<')) return []
    const data = JSON.parse(text.replace(/\\'/g, "'"))
    return (data.data || []).filter((x) => x && (x.middleURL || x.thumbURL)).map((x) => ({
      url: x.middleURL || x.hoverURL || x.thumbURL,
      thumb: x.thumbURL,
      title: x.fromPageTitle || x.alt || query,
      text: `${x.fromPageTitle || ''} ${x.fromURLHost || ''}`,
      domain: x.fromURLHost || '',
    }))
  } catch {
    return []
  }
}

async function searchWebImages(query, search) {
  if (search?.searchKey && search.searchProvider === 'serper') {
    try { return await serperImages(query, search.searchKey) } catch { return [] }
  }
  if (search?.searchKey) {
    try { return await tavilyImages(query, search.searchKey) } catch { return [] }
  }
  return baiduImages(query)
}

async function searchWebPages(query, search) {
  if (!search?.searchKey) return []
  try {
    if (search.searchProvider === 'serper') {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-KEY': search.searchKey },
        body: JSON.stringify({ q: query, num: 6, gl: 'cn', hl: 'zh-cn' }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()
      return (data.organic || []).map((x) => ({ title: x.title || '', url: x.link || '', text: x.snippet || '' }))
    }
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: search.searchKey, query, max_results: 6, search_depth: 'basic' }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return (data.results || []).map((x) => ({ title: x.title || '', url: x.url || '', text: x.content || '' }))
  } catch {
    return []
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function extractOgImages(html) {
  const found = []
  const meta = html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi)
  for (const tag of meta) {
    const content = String(tag[0]).match(/content=["']([^"']+)["']/i)
    if (content?.[1]) found.push(decodeHtml(content[1]))
  }
  const jsonBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const block of jsonBlocks) {
    try {
      const data = JSON.parse(block[1])
      const nodes = Array.isArray(data) ? data : [data]
      for (const node of nodes) {
        const image = node?.image
        if (typeof image === 'string') found.push(image)
        else if (Array.isArray(image)) image.forEach((it) => found.push(typeof it === 'string' ? it : it?.url))
        else if (image?.url) found.push(image.url)
      }
    } catch {
      /* ignore broken json-ld */
    }
  }
  return [...new Set(found.map((u) => String(u || '').replace(/^http:\/\//i, 'https://')).filter((u) => isAllowedPhotoHost(u)))]
}

async function ogImagesFromPage(pageUrl) {
  if (!isPublicShopPage(pageUrl)) return []
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    const html = await res.text()
    if (!res.ok || !html) return []
    if (/登录|請先登入|请先登录|captcha/i.test(html) && html.length < 2000) return []
    return extractOgImages(html)
  } catch {
    return []
  }
}

async function pickRanked(ranked, min = 10) {
  ranked.sort((a, b) => b.score - a.score)
  for (const item of ranked.filter((it) => it.score >= min).slice(0, 5)) {
    if (await probeImage(item.url)) return item.url
  }
  return ''
}

async function fromBaiduImages(name, hints, kind) {
  const ranked = []
  for (const query of baiduQueries(name, hints, kind).slice(0, 2)) {
    const items = await baiduImages(query)
    for (const item of items) {
      const url = pickImageUrl(item)
      if (!url) continue
      const score = scoreWeb({ ...item, url, link: item.domain }, name, hints, kind)
      if (score < 10) continue
      ranked.push({ url, score })
    }
    if (ranked.length >= 4) break
  }
  return pickRanked(ranked)
}

function pageSearch(search) {
  const provider = search?.searchProvider || ''
  if (provider === 'tavily' || provider === 'serper') return search
  if (!search?.searchFallbackKey) return { ...search, searchKey: '' }
  return {
    ...search,
    searchKey: search.searchFallbackKey,
    searchProvider: search.searchFallbackProvider || 'tavily',
  }
}

async function fromWiki(name, hints) {
  const q = coreName(name) || name
  const url = await fromWikipediaSearch(q, name, hints)
  if (url) return url
  return fromCommons(q, name, hints)
}

async function fromDianping(name, hints, search, kind) {
  if (!search?.searchKey || kind === 'route' || kind === 'depart') return ''
  const ranked = []
  for (const query of dianpingQueries(name, hints)) {
    const pages = await searchWebPages(query, search)
    for (const page of pages.slice(0, 4)) {
      if (!/dianping\.com\/shop\/\d+/.test(page.url || '')) continue
      if (scoreWeb({ ...page, link: page.url }, name, hints, kind) < 16) continue
      const images = await ogImagesFromPage(page.url)
      for (const url of images) {
        ranked.push({
          url,
          score: scoreWeb({ title: page.title, text: page.text, url, link: page.url, domain: hostnameOf(page.url) }, name, hints, kind) + 8,
        })
      }
    }
  }
  return pickRanked(ranked, 16)
}

function cityForAmap(hints) {
  return cityHintsOf(hints)[0] || ''
}

function photoUrlsOfPoi(poi) {
  const raw = []
  for (const pic of poi.photos || []) {
    if (typeof pic === 'string') raw.push(pic)
    else if (pic && pic.url) raw.push(pic.url)
  }
  return raw.map((u) => String(u || '').replace(/^http:\/\//i, 'https://')).filter(Boolean)
}

async function fromAmapPoi(name, amapKey, hints = [], kind = '') {
  if (!amapKey || !name) return ''
  try {
    const url = new URL('https://restapi.amap.com/v3/place/text')
    url.searchParams.set('key', amapKey)
    url.searchParams.set('keywords', String(name).slice(0, 32))
    url.searchParams.set('offset', '5')
    url.searchParams.set('extensions', 'all')
    const city = cityForAmap(hints)
    if (city) url.searchParams.set('city', city)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    const pois = data?.pois || []
    const pool = pois.filter((poi) => poiNameMatches(poi.name, name))
    for (const poi of pool) {
      for (const src of photoUrlsOfPoi(poi)) {
        if (!isAllowedPhotoHost(src)) continue
        if (await probeImage(src) || hostnameOf(src).includes('autonavi') || hostnameOf(src).includes('amap')) return src
      }
    }
  } catch {
    /* skip */
  }
  return ''
}

function photoQueryName(name, kind) {
  let n = String(name || '').replace(/[（(]参考[)）]/g, '').trim()
  if (/参考$/.test(n) || /\s(经济|中档|高端)$/.test(n)) {
    n = n.replace(/\s*(经济|中档|高端)?\s*参考$/g, '').replace(/\s*(经济|中档|高端)$/g, '').trim()
    if ((kind === 'stay' || kind === 'hotel') && n) n = `${n} 酒店`
  }
  return n
}

function routePhotoQuery(name) {
  const cleaned = String(name || '')
    .replace(/约?\d+(\.\d+)?\s*小时/g, '')
    .replace(/高铁|动车|火车|大巴|巴士|自驾|步行|换乘/g, ' ')
  const parts = cleaned.split(/[→➡➜至到\-—–]/).map((s) => s.replace(/[（(].*$/, '').trim()).filter((s) => s.length >= 2)
  return parts[parts.length - 1] || parts[0] || name
}

function isRestName(name) {
  return /午休|茶歇|休息|歇脚/.test(String(name || ''))
}

function restPhotoQuery(day, slot) {
  const name = String(slot?.name || '')
  const extra = name.replace(/午后茶歇|午休|茶歇|休息|歇脚|[·・\s]/g, '').trim()
  if (extra.length >= 2) return extra
  const lunch = (day?.dining || []).find((m) => /午/.test(String(m.meal || '')))
  if (/午休/.test(name) && lunch?.place) return String(lunch.place)
  const slots = day?.slots || []
  const idx = slots.indexOf(slot)
  for (let i = idx - 1; i >= 0; i -= 1) {
    const n = String(slots[i].name || '')
    if (slots[i].kind === 'spot' && n && !isRestName(n)) {
      const part = n.split(/[+＋]/)[0]
      return /茶歇/.test(name) ? `${part} 茶馆` : part
    }
  }
  return extra || name
}

function destFromDay(day) {
  const blob = [
    day?.theme,
    ...(day?.slots || []).map((s) => s.name),
    ...(day?.dining || []).map((m) => m.place),
  ].join(' ')
  return CITY_WORDS.find((c) => blob.includes(c)) || ''
}

function queryForSlot(slot, day, needles = [], hint = '', override = '') {
  const name = String(slot?.name || '')
  const extra = String(hint || '').trim()
  const place = photoQueryName(name, slot.kind)
  const dest = destFromDay(day)
  // 用户点名要搜什么就搜什么，优先级最高
  const asked = String(override || '').trim()
  if (asked) return { name: asked, kind: 'spot' }
  if (isSceneQuery(name) || isSceneQuery(extra)) {
    return { name: [place, dest, extra].filter(Boolean).join(' '), kind: 'spot' }
  }
  if (slot.kind === 'route' || slot.kind === 'depart') return { name: routePhotoQuery(name), kind: 'spot' }
  if (isRestName(name)) return { name: restPhotoQuery(day, slot), kind: 'spot' }
  // 「一方小院」「农家」这类泛名单搜必然搜不到，带上当天地名再搜，搜不到才留空
  if (nameLooksGeneric(place) && dest) return { name: `${dest} ${place}`, kind: slot.kind }
  return { name: extra && isSceneQuery(extra) ? `${place} ${extra}` : place, kind: slot.kind }
}

export async function findPhoto(name, hints = [], search = {}, kind = '') {
  const qName = photoQueryName(name, kind)
  if (!qName || skipPhotoName(qName, kind) || (nameLooksGeneric(qName) && !cityHintsOf(hints).length)) return ''
  const core = coreName(qName) || qName
  // 地名对上就用，不跟提示词顺序、搜索源版本绑死
  if (!search.skipCache) {
    const hit = cachedPhoto(core, kind)
    if (hit) return hit
  }
  if (search.cacheOnly) return ''
  let url = ''
  const lodging = kind === 'stay' || kind === 'hotel' || kind === 'food' || kind === 'dining'
  try {
    if (isSceneQuery(qName)) {
      url = await fromBaiduImages(qName, hints, kind)
      if (!url) url = await fromWiki(qName, hints)
    } else {
      // 高德店图对得上店名，先查它；点评和维基只在没图时再找
      url = await fromAmapPoi(qName, search.amapKey, hints, kind)
      if (!url && lodging) url = await fromDianping(qName, hints, pageSearch(search), kind)
      if (!url) url = await fromBaiduImages(qName, hints, kind)
      if (!url) url = await fromWiki(qName, hints)
    }
  } catch {
    url = ''
  }
  // 没搜到不落盘。空结果一旦记下，这一进程里同名景点会一直是占位图
  if (!url) return ''
  const key = `${core}|${kind}|${hints.slice(0, 4).join(',')}|${search.searchProvider || 'baidu'}|${search.amapKey ? 'amap' : 'noamap'}|${search.searchKey ? 'search' : 'nosearch'}|v16`
  nameCache.set(key, url)
  saveDiskCache()
  return url
}

async function currentIsKeepable(url, name, hints) {
  if (!url || isPlaceholderPhoto(url)) return false
  if (isLocalPhoto(url)) return true
  const raw = url.startsWith('/travel-photo?') ? new URL(url, 'http://127.0.0.1').searchParams.get('u') : url
  if (!raw || !isAllowedPhotoHost(raw) || isPlaceholderPhoto(raw)) return false
  if (!await probeImage(raw)) return false
  const host = hostnameOf(raw)
  if (!/wikimedia|wikipedia/.test(host)) {
    return !REJECT_TEXT.test(raw)
  }
  const title = fileTitleOf(raw)
  let text = title
  if (title) {
    const meta = await commonsMeta(title)
    if (meta) text = `${meta.title} ${meta.text}`
  }
  return scoreRecord({ title, text, name, hints }) >= 10
}

function skipPhotoName(name, kind) {
  if (kind === 'depart') return true
  const n = String(name || '').replace(/[（(]参考[)）]/g, '').trim()
  return /^(待定|待定景点|当日住宿|当日特色餐饮|当日线路|当日晚餐|景点附近|住宿店内|时令家常|返程|住宿|住店|回市区|市区|就近|店内|民宿简餐)$/.test(n)
}

async function resolveUrl(current, name, hints, search, kind, opts = {}) {
  const qName = photoQueryName(name, kind)
  if (!qName || skipPhotoName(qName, kind) || skipPhotoName(name, kind)) return ''
  // 用户自己给的图（粘贴/上传，落在 travel-assets 下）除非点名要换，否则一律保留
  if (isLocalPhoto(current) && !opts.replace) return current
  const lodging = kind === 'stay' || kind === 'hotel' || kind === 'food' || kind === 'dining'
  if (!opts.replace && !lodging && await currentIsKeepable(current, qName, hints)) return current
  return findPhoto(qName, hints, { ...search, skipCache: !!opts.replace }, kind)
}

async function mapPool(items, limit, fn) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) {
      const idx = i
      i += 1
      try {
        await fn(items[idx], idx)
      } catch {
        /* 一格搜图失败不影响其余格子 */
      }
    }
  }))
}

/**
 * 审计一格：空 / 占位 / 打不开 / 和店名明显对不上 → 算缺图，需要批量补。
 * 用户上传的本地图一律视为真图。
 */
export async function auditPhotoGap(url, name, hints, kind) {
  if (skipPhotoName(name, kind) || skipPhotoName(photoQueryName(name, kind), kind)) {
    return { gap: false, reason: 'skip' }
  }
  if (!url || isPlaceholderPhoto(url)) return { gap: true, reason: 'empty_or_placeholder' }
  if (isLocalPhoto(url)) return { gap: false, reason: 'local' }
  const qName = photoQueryName(name, kind)
  if (await currentIsKeepable(url, qName, hints)) return { gap: false, reason: 'real' }
  return { gap: true, reason: 'bad_or_mismatch' }
}

export async function enrichTripPhotos(trip, opts = {}) {
  const search = {
    searchKey: opts.searchKey || '',
    searchProvider: opts.searchProvider || 'tavily',
    searchFallbackKey: opts.searchFallbackKey || '',
    searchFallbackProvider: opts.searchFallbackProvider || 'tavily',
    amapKey: opts.amapKey || '',
    cacheOnly: !!opts.cacheOnly,
  }
  const only = Array.isArray(opts.photoNames) ? opts.photoNames.filter(Boolean) : []
  const kinds = Array.isArray(opts.photoKinds) ? opts.photoKinds.filter(Boolean) : []
  const onlyDays = Array.isArray(opts.photoDays) ? opts.photoDays.map(Number).filter((n) => Number.isFinite(n) && n >= 1) : []
  const askedQuery = String(opts.photoQuery || '').trim()
  // fillGaps / 默认出页：先审计再只补坏格；replacePhotos 必须带范围，防止误刷整趟
  const fillGaps = !!opts.fillGaps || opts.photoMode === 'fill_gaps'
  const replacePhotos = !!opts.replacePhotos && !fillGaps
  const scoped = only.length > 0 || kinds.length > 0 || onlyDays.length > 0
  if (replacePhotos && !scoped) return trip
  // 无任何旗标时仍走整趟软补（首次出页）——与 fillGaps 同一套审计逻辑
  const softFill = fillGaps || !replacePhotos
  const jobs = []
  ;(trip.days || []).forEach((day, di) => {
    // 点名了天就只动那几天，别把别人的图冲掉
    if (onlyDays.length && !onlyDays.includes(di + 1)) return
    for (const slot of day.slots || []) {
      jobs.push({ type: 'slot', slot, day })
    }
    for (const meal of day.dining || []) {
      jobs.push({ type: 'dining', meal, day })
    }
  })
  // 只点了天时不碰住宿栏（那是整程的，不属于某一天）；fillGaps 整趟审计时也不扫酒店栏
  if ((!onlyDays.length || only.length) && !fillGaps) {
    for (const area of trip.hotelAreas || []) {
      for (const opt of area.options || []) {
        jobs.push({ type: 'hotel', opt, area })
      }
    }
  }
  // 只说了天、没点格子也没说种类：这几天的格子全收；fillGaps 同理（按天审计全部可配图格）
  const dayOnly = onlyDays.length > 0 && !only.length && !kinds.length
  const auditAllInDays = fillGaps && dayOnly

  await mapPool(jobs, 6, async (job) => {
    if (job.type === 'slot') {
      const nameHit = mentioned(job.slot.name, only)
      const kindHit = kinds.includes(job.slot.kind)
      if (scoped && !dayOnly && !nameHit && !kindHit) return
      if (auditAllInDays && job.slot.kind === 'depart') return
      const prev = job.slot.photo || (Array.isArray(job.slot.photos) ? job.slot.photos[0] : '')
      // 用户自己贴的图：只有点名这一格才让换，按天/按种类的批量换图一律绕开
      if (isLocalPhoto(prev) && !nameHit) return
      const replacing = !!(replacePhotos && (dayOnly || nameHit || kindHit))
      const hints = destHints(trip, job.slot.name, job.day)
      // 软补 / fill_gaps：先审计，真图跳过；硬换：范围内直接重搜
      if (softFill) {
        const audit = await auditPhotoGap(prev, String(job.slot.name || ''), hints, String(job.slot.kind || 'spot'))
        if (!audit.gap) return
      }
      if (replacing || softFill) clearPhotos(job.slot)
      // 用户自己给了检索词，只用在他点名的那一格上，别套到全天
      const override = askedQuery && (nameHit || (!only.length && job.slot.kind === 'spot')) ? askedQuery : ''
      const query = queryForSlot(job.slot, job.day, only, opts.photoHint, override)
      const found = await resolveUrl('', query.name, hints, search, query.kind, { replace: replacing })
      const view = found ? (proxiedPhoto(found) || (isAllowedPhotoHost(found) ? found : '')) : ''
      if (view) {
        job.slot.photo = view
        job.slot.photos = [view]
      } else if (prev && !isPlaceholderPhoto(prev)) {
        job.slot.photo = prev
        job.slot.photos = [prev]
      } else {
        clearPhotos(job.slot)
      }
      return
    }
    if (job.type === 'dining') {
      if (only.length && !mentioned(job.meal.place || job.meal.meal, only)) return
      if (kinds.length && !only.length) return
      if (dayOnly && askedQuery) return
      const prev = job.meal.photo || ''
      if (isLocalPhoto(prev) && !mentioned(job.meal.place || job.meal.meal, only)) return
      if (softFill) {
        const audit = await auditPhotoGap(prev, job.meal.place || job.meal.meal, destHints(trip, job.meal.place || job.meal.meal, job.day), 'food')
        if (!audit.gap) return
      }
      const replacingMeal = !!(replacePhotos && mentioned(job.meal.place || job.meal.meal, only))
      const found = await resolveUrl((softFill || replacingMeal) ? '' : prev, job.meal.place || job.meal.meal, destHints(trip, job.meal.place || job.meal.meal, job.day), search, 'food', { replace: replacingMeal })
      if (found) job.meal.photo = proxiedPhoto(found) || (isAllowedPhotoHost(found) ? found : '')
      else if (prev && !isPlaceholderPhoto(prev)) job.meal.photo = prev
      else delete job.meal.photo
      if (!job.meal.photo) delete job.meal.photo
      return
    }
    if (fillGaps) return
    if (only.length && !mentioned(job.opt.name, only)) return
    if (kinds.length && !only.length) return
    const hotelName = String(job.opt.name || '')
    if (!hotelName || /参考$|同片区|待定/.test(hotelName) || hotelName === String(job.area?.area || '')) {
      delete job.opt.photo
      delete job.opt.photos
      return
    }
    const prev = job.opt.photo || ''
    if (isLocalPhoto(prev) && !mentioned(hotelName, only)) return
    const found = await resolveUrl(prev, hotelName, [...destHints(trip, hotelName), job.area?.area].filter(Boolean), search, 'stay', { replace: !!(replacePhotos && mentioned(hotelName, only)) })
    if (found) job.opt.photo = proxiedPhoto(found) || (isAllowedPhotoHost(found) ? found : '')
    else if (prev) job.opt.photo = prev
    else delete job.opt.photo
    if (!job.opt.photo) delete job.opt.photo
  })
  return trip
}

export async function handlePhotoProxy(req, res) {
  const src = new URL(req.url || '', 'http://127.0.0.1').searchParams.get('u') || ''
  if (!isAllowedPhotoHost(src)) {
    res.statusCode = 400
    res.end('bad photo host')
    return
  }
  try {
    if (!binCache.has(src)) {
      const upstream = await fetch(src, { headers: imageHeaders(src), signal: AbortSignal.timeout(15000), redirect: 'follow' })
      const type = upstream.headers.get('content-type') || ''
      if (!upstream.ok || !type.startsWith('image/')) throw new Error('not image')
      const buf = Buffer.from(await upstream.arrayBuffer())
      binCache.set(src, { type, buf })
    }
    const img = binCache.get(src)
    res.setHeader('Content-Type', img.type)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(img.buf)
  } catch {
    res.statusCode = 404
    res.end('photo missing')
  }
}
