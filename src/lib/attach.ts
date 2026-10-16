import { readZip } from './zip.ts'
import { authHeaders } from './http.ts'

export type Attachment =
  | { kind: 'image'; name: string; url: string; bytes: number }
  | { kind: 'text'; name: string; text: string; bytes: number }

const TEXT_EXT = /\.(txt|md|markdown|json|csv|tsv|log|ya?ml|ini|conf|html?|xml|srt|vtt)$/i
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i
const MAX_TEXT = 60000
const MAX_ZIP_TEXT = 200000

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(new Error(`读不了「${file.name}」`))
    fr.readAsDataURL(file)
  })
}

function isTextFile(file: File) {
  return file.type.startsWith('text/')
    || file.type === 'application/json'
    || TEXT_EXT.test(file.name || '')
}

function isZipFile(file: File) {
  return /\.zip$/i.test(file.name || '')
    || file.type === 'application/zip'
    || file.type === 'application/x-zip-compressed'
}

function toDataUrl(bytes: Uint8Array, mime: string) {
  let s = ''
  // 一次 btoa 整个大数组会爆栈，分块来
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${mime};base64,${btoa(s)}`
}

async function upload(name: string, data: string, fallbackBytes: number, authToken?: string): Promise<Attachment> {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: authHeaders(authToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name, data }),
  })
  const out = await res.json().catch(() => ({ error: `上传失败 ${res.status}` }))
  if (!res.ok || out.error) throw new Error(out.error || `上传失败 ${res.status}`)
  return { kind: 'image', name: name || '粘贴的图', url: out.url, bytes: out.bytes || fallbackBytes }
}

// zip 当成「一包资料」：里面的文本读成资料，图片照常存进 travel-assets。
// 一个压缩包可能产出多条附件，所以统一返回数组。
async function readZipAttachments(file: File, authToken?: string): Promise<Attachment[]> {
  const entries = await readZip(file, { maxEntries: 20 })
  if (!entries.length) throw new Error(`「${file.name}」里没有能用的文件（只认文本和图片）。`)
  const out: Attachment[] = []
  const skipped: string[] = []
  const utf8 = new TextDecoder('utf-8', { fatal: false })
  let textBudget = MAX_ZIP_TEXT

  for (const entry of entries) {
    const short = entry.name.split('/').pop() || entry.name
    const ext = (short.split('.').pop() || '').toLowerCase()
    if (IMAGE_EXT.test(short)) {
      const mime = MIME_BY_EXT[ext] || 'image/png'
      out.push(await upload(short, toDataUrl(entry.bytes, mime), entry.bytes.length, authToken))
      continue
    }
    if (TEXT_EXT.test(short) && textBudget > 0) {
      const text = utf8.decode(entry.bytes).slice(0, Math.min(MAX_TEXT, textBudget))
      if (!text.trim()) continue
      textBudget -= text.length
      out.push({ kind: 'text', name: `${file.name} › ${entry.name}`, text, bytes: entry.bytes.length })
      continue
    }
    skipped.push(short)
  }
  if (!out.length) {
    throw new Error(`「${file.name}」里都是用不了的格式（${skipped.slice(0, 3).join('、')}），只认文本和图片。`)
  }
  return out
}

// 图片存到本机 travel-assets 下（模具认本地图，也不会被配图管线冲掉）；
// 文本类直接读成字符串，发给模型当资料；zip 拆开后按上面两条处理。
// 其余类型明确拒收，不假装收下。
export async function readAttachments(file: File, authToken?: string): Promise<Attachment[]> {
  if (file.type.startsWith('image/')) {
    return [await upload(file.name, await readAsDataUrl(file), file.size, authToken)]
  }
  if (isZipFile(file)) return readZipAttachments(file, authToken)
  if (isTextFile(file)) {
    const text = (await file.text()).slice(0, MAX_TEXT)
    if (!text.trim()) throw new Error(`「${file.name}」是空的`)
    return [{ kind: 'text', name: file.name || '附件', text, bytes: file.size }]
  }
  throw new Error(`暂时只收图片、文本（txt/md/json/csv…）和 zip，「${file.name || '这个文件'}」用不了`)
}

export function filesFromPaste(e: React.ClipboardEvent): File[] {
  const dt = e.clipboardData
  if (!dt) return []
  const out: File[] = []
  for (const item of Array.from(dt.items || [])) {
    if (item.kind !== 'file') continue
    const f = item.getAsFile()
    if (f) out.push(f)
  }
  if (!out.length) out.push(...Array.from(dt.files || []))
  return out
}

// 「用这张图」是要贴到格子上，「这是哪」是要模型看一眼，两条路完全不同：
// 贴图不花钱不走网络，认图要烧 token。说不清时默认贴图（本机那条会再问一句，成本更低）。
const PLACE_IT = new RegExp([
  /(用|换成|换上|替换成?|改成|配上|配成|贴上?|放进|放到|加到|设为)\s*(这|那)\s*(张|幅|个)?\s*(图|照片|截图)?/,
  /(这|那)\s*(张|幅)\s*(图|照片|截图)?\s*(给|放|贴|配|用)/,
  /(图|照片|截图)\s*(放进|放到|贴到|用在|给)/,
  /第\s*\d{1,2}\s*格/,
].map((r) => r.source).join('|'))

const LOOK_AT = new RegExp([
  /(这|那|图|照片|截图|附件)[^。？?]{0,8}(是哪|是什么|是啥|哪里|哪儿|什么地方|哪个|什么景点|认得|认不认|识别|认一下|看得出)/,
  /(看|瞧|读|认|识别|分析|解读|描述)\s*(一下|看|下)?\s*(这|那|图|照片|截图|附件)/,
  /(图|照片|截图|附件)\s*(里|中|上)/,
  /根据\s*(这|图|照片|截图|附件)/,
  /照着?\s*(这|图|照片)\s*(张|幅)?\s*(图|照片)?\s*(规划|安排|做|排)/,
].map((r) => r.source).join('|'))

// 带图这一轮，是要模型看图说话，还是把图贴进页面？
export function wantsVision(text: string, hasTrip: boolean) {
  const t = String(text || '').trim()
  if (PLACE_IT.test(t)) return false // 明说往哪儿放，就别花钱问模型
  if (LOOK_AT.test(t)) return true
  // 剩下的看有没有页面：有页面就当贴图（本机会再问哪一格，不烧 token）；
  // 没页面时图根本没地方贴，只能是让我看一眼。
  return !hasTrip
}

export function prettyBytes(n: number) {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

// 文本附件拼进给模型的话里，标清来源，别和用户自己打的字混在一起
export function attachmentsToPrompt(list: Attachment[]) {
  return list
    .filter((a): a is Extract<Attachment, { kind: 'text' }> => a.kind === 'text')
    .map((a) => `附件「${a.name}」内容如下（用户提供的资料，按它来，不要自己编）：\n${a.text}`)
    .join('\n\n')
}
