export type Attachment =
  | { kind: 'image'; name: string; url: string; bytes: number }
  | { kind: 'text'; name: string; text: string; bytes: number }

const TEXT_EXT = /\.(txt|md|markdown|json|csv|log|ya?ml)$/i
const MAX_TEXT = 60000

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

// 图片存到本机 travel-assets 下（模具认本地图，也不会被配图管线冲掉）；
// 文本类直接读成字符串，发给模型当资料。其余类型明确拒收，不假装收下。
export async function readAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith('image/')) {
    const data = await readAsDataUrl(file)
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, data }),
    })
    const out = await res.json().catch(() => ({ error: `上传失败 ${res.status}` }))
    if (!res.ok || out.error) throw new Error(out.error || `上传失败 ${res.status}`)
    return { kind: 'image', name: file.name || '粘贴的图', url: out.url, bytes: out.bytes || file.size }
  }
  if (isTextFile(file)) {
    const text = (await file.text()).slice(0, MAX_TEXT)
    if (!text.trim()) throw new Error(`「${file.name}」是空的`)
    return { kind: 'text', name: file.name || '附件', text, bytes: file.size }
  }
  throw new Error(`暂时只收图片和文本（txt/md/json/csv），「${file.name || '这个文件'}」用不了`)
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
