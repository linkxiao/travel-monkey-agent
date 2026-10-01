// 极简 ZIP 读取：只为「把一包资料拖进来」这一件事，不引第三方库。
// 解压用浏览器自带的 DecompressionStream('deflate-raw')，只认 stored(0) 和 deflate(8)。

export type ZipEntry = { name: string; bytes: Uint8Array }

const EOCD = 0x06054b50
const EOCD64_LOC = 0x07064b50

function findEocd(view: DataView) {
  // 末尾可能跟着注释，最多 64KB，从后往前找签名
  const max = Math.min(view.byteLength, 0xffff + 22)
  for (let i = 22; i <= max; i += 1) {
    const at = view.byteLength - i
    if (at < 0) break
    if (view.getUint32(at, true) === EOCD) return at
  }
  return -1
}

async function inflateRaw(bytes: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('这个浏览器不支持内置解压，zip 读不了。可以把里面的文件直接拖进来。')
  }
  // 源流必须声明成 BufferSource：DecompressionStream 的 writable 就是这个类型，
  // 写成 Uint8Array 会在 pipeThrough 处对不上（TS2345）。
  // subarray 切出来的视图可能挂在 SharedArrayBuffer 类型上，BufferSource 不收，拷一份到普通 ArrayBuffer
  const src = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(new Uint8Array(bytes))
      c.close()
    },
  })
  const out = src.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(out).arrayBuffer())
}

// 跳过目录项、macOS 的资源副本、以及点开头的隐藏文件
function isNoise(name: string) {
  if (!name || name.endsWith('/')) return true
  if (/^__MACOSX\//i.test(name)) return true
  return name.split('/').some((part) => part.startsWith('.'))
}

export async function readZip(file: File, opts?: { maxEntries?: number }): Promise<ZipEntry[]> {
  const buf = await file.arrayBuffer()
  const view = new DataView(buf)
  const all = new Uint8Array(buf)
  const eocd = findEocd(view)
  if (eocd < 0) throw new Error(`「${file.name}」不像个 zip（找不到结尾记录），可能是下载没完整。`)
  if (view.byteLength >= 20 && findEocdIsZip64(view, eocd)) {
    throw new Error(`「${file.name}」是 zip64（超大包），这里读不了。请解开后把文件拖进来。`)
  }

  let at = view.getUint32(eocd + 16, true)
  const count = view.getUint16(eocd + 10, true)
  const limit = opts?.maxEntries ?? 50
  const out: ZipEntry[] = []
  const utf8 = new TextDecoder('utf-8')

  for (let i = 0; i < count && at + 46 <= view.byteLength; i += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) break
    const method = view.getUint16(at + 10, true)
    const compressed = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const localAt = view.getUint32(at + 42, true)
    const name = utf8.decode(all.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen

    if (isNoise(name)) continue
    if (out.length >= limit) break
    if (view.getUint32(localAt, true) !== 0x04034b50) continue
    const lNameLen = view.getUint16(localAt + 26, true)
    const lExtraLen = view.getUint16(localAt + 28, true)
    const start = localAt + 30 + lNameLen + lExtraLen
    const raw = all.subarray(start, start + compressed)

    if (method === 0) out.push({ name, bytes: raw })
    else if (method === 8) out.push({ name, bytes: await inflateRaw(raw) })
    // 其余压缩方式（如 bzip2/lzma）少见，静默跳过，由调用方汇报「没取到东西」
  }
  return out
}

function findEocdIsZip64(view: DataView, eocd: number) {
  const at = eocd - 20
  return at >= 0 && view.getUint32(at, true) === EOCD64_LOC
}
