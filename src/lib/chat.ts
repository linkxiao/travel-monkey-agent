export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function streamChat(opts: {
  provider: string
  model: string
  apiKey: string
  customBaseUrl?: string
  messages: ChatMessage[]
  mode?: 'plan' | 'fill' | 'talk' | 'edit' | 'look'
  images?: string[]
  onDelta: (text: string) => void
  signal?: AbortSignal
}) {
  let res: Response
  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: opts.provider,
        model: opts.model,
        apiKey: opts.apiKey,
        customBaseUrl: opts.customBaseUrl,
        messages: opts.messages,
        mode: opts.mode || 'fill',
        images: opts.images || [],
      }),
      signal: opts.signal,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`连不上本机聊天接口（${msg}）。请确认终端里 npm run dev 还在跑，然后刷新页面再试。`)
  }
  if (!res.ok || !res.body) {
    throw new Error(`本机聊天接口失败 ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data) continue
      const json = JSON.parse(data) as { delta?: string; error?: string; done?: boolean }
      if (json.error) throw new Error(json.error)
      if (json.delta) opts.onDelta(json.delta)
    }
  }
}
