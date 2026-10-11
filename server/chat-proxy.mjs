import dns from 'node:dns'
import { applySkillSystem } from './skill-prompt.mjs'
import { attachImages, loadImageForModel, MAX_IMAGES } from './images.mjs'

dns.setDefaultResultOrder('ipv4first')

const TARGETS = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  xai: 'https://api.x.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  kimi: 'https://api.moonshot.cn/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  siliconflow: 'https://api.siliconflow.cn/v1',
}

function send(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`)
}

function looksLikePageUrl(value) {
  const s = String(value || '').trim()
  return /^https?:\/\//i.test(s) || /127\.0\.0\.1|localhost/i.test(s)
}

function parseUpstreamError(text) {
  const raw = String(text || '').trim()
  const chunks = raw.match(/\{[\s\S]*?\}(?=\s*\{|$)/g) || [raw]
  const messages = []
  for (const chunk of chunks) {
    try {
      const obj = JSON.parse(chunk)
      const msg = obj.error?.message || obj.message
      if (msg && !messages.includes(msg)) messages.push(msg)
    } catch {
      /* keep raw */
    }
  }
  return messages[0] || raw
}

// 这家这个型号根本不长眼睛时，上游的话往往很含糊（甚至只说 400），得翻译成「换个认图的模型」
const BLIND_MODELS = /deepseek-(chat|reasoner)|^deepseek-v3|^deepseek-r1|text-embedding|moonshot-v1-(8|32|128)k/i

function looksBlind(text) {
  return /image|vision|multimodal|multi-modal|image_url|不支持.*(图|视觉)|visual input|does not support.*(image|vision)|invalid.*content.*type/i.test(String(text || ''))
}

const VISION_PICKS = '可换成认图的模型：gpt-4o / claude-sonnet / gemini-2.x / qwen-vl-max / glm-4v / step-1v。'

function formatError(err, provider, hadImages) {
  const parts = [err && err.message ? err.message : String(err)]
  let cur = err && err.cause
  for (let i = 0; i < 3 && cur; i += 1) {
    if (cur.code) parts.push(cur.code)
    else if (cur.message && cur.message !== parts[0]) parts.push(cur.message)
    cur = cur.cause
  }
  const text = parseUpstreamError(parts.filter(Boolean).join(' · '))
  if (hadImages && looksBlind(text)) {
    return `当前模型看不了图片（上游原话：${text.slice(0, 160)}）。${VISION_PICKS}`
  }
  if (/5177|127\.0\.0\.1|localhost/i.test(text) && /api key|authentication/i.test(text)) {
    return 'API Key 填错了：当前值像是本机网页地址（127.0.0.1:5177），不是模型密钥。请在「API Key」填 sk- 开头的密钥，不要填网页地址。'
  }
  if (/authentication|invalid.*api key|incorrect api key|invalid_api_key/i.test(text)) {
    if (provider === 'deepseek') return 'DeepSeek 不认当前密钥。请到 platform.deepseek.com 复制一份新的完整 Key，粘贴到上方后再发。'
    if (provider === 'openrouter') return 'OpenRouter 不认当前密钥。请确认是 sk-or- 开头的完整 Key，或把服务商改成 Key 对应的那一家。'
    if (provider) return `${provider} 不认当前密钥。请重新粘贴该服务商的完整 Key 后再发。`
    return '当前密钥无效。请重新粘贴完整 Key 后再发。'
  }
  if (/governor/i.test(text)) {
    return `${text}（网络管家/公司代理拦截了模型接口，可换网络或关代理后再试）`
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|UND_ERR|ETIMEDOUT|ConnectTimeout/i.test(text)) {
    return `连不上模型服务：${text}。请检查网络，或换一个服务商再试。`
  }
  if (text === 'fetch failed') {
    return '连不上模型服务（fetch failed）。多半是网络抖动或代理断开，请再试一次。'
  }
  return text
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

async function fetchUpstream(url, init, tries = 2) {
  let last
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(120000) })
    } catch (err) {
      last = err
      if (i === tries - 1) throw err
    }
  }
  throw last
}

function takeText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
  }
  return ''
}

async function streamOpenAI({ baseUrl, apiKey, model, messages, provider, mode }, res) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'http://localhost:5177'
    headers['X-Title'] = 'Travel Monkey'
  }
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const fillish = mode === 'fill' || mode === 'edit'
  const payload = {
    model,
    messages,
    temperature: mode === 'route' ? 0 : fillish ? 0.2 : 0.7,
    max_tokens: mode === 'route' ? 600 : fillish ? 16384 : 8192,
  }

  let upstream
  try {
    upstream = await fetchUpstream(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, stream: true }),
    })
  } catch (err) {
    return completeOpenAI(url, headers, payload, res, err, mode)
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text()
    if (upstream.status >= 500 || /governor/i.test(errText)) {
      return completeOpenAI(url, headers, payload, res, new Error(errText.slice(0, 400) || `HTTP ${upstream.status}`), mode)
    }
    throw new Error(errText.slice(0, 800) || `HTTP ${upstream.status}`)
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let gotDelta = false
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() || ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data)
        const delta = takeText(json.choices?.[0]?.delta?.content) || takeText(json.choices?.[0]?.delta?.text)
        if (delta) {
          gotDelta = true
          send(res, { delta })
        }
      } catch {
        /* ignore keepalives */
      }
    }
  }
  if (!gotDelta) {
    await completeOpenAI(url, headers, payload, res, null, mode)
  }
}

async function completeOpenAI(url, headers, payload, res, streamErr, mode) {
  const upstream = await fetchUpstream(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...payload, stream: false }),
  })
  const raw = await upstream.text()
  if (!upstream.ok) {
    const prefix = streamErr ? `流式失败（${formatError(streamErr)}），非流式也失败：` : ''
    throw new Error(prefix + (raw.slice(0, 600) || `HTTP ${upstream.status}`))
  }
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error((streamErr ? `流式失败后回退失败：` : '') + raw.slice(0, 400))
  }
  const content = takeText(json.choices?.[0]?.message?.content) || takeText(json.choices?.[0]?.message?.text)
  if (!content) {
    if (mode === 'fill') return
    const why = json.choices?.[0]?.finish_reason
    if (why === 'length') throw new Error('模型输出被截断，请再点一次确认出页。')
    throw new Error(streamErr ? formatError(streamErr) : '模型没有返回内容')
  }
  send(res, { delta: content })
}

async function streamAnthropic({ apiKey, model, messages }, res) {
  const system = messages.filter((m) => m.role === 'system').map((m) => takeText(m.content)).join('\n\n')
  const converted = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
  const upstream = await fetchUpstream('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      stream: true,
      system: system || undefined,
      messages: converted,
    }),
  })
  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text()
    throw new Error(errText.slice(0, 800) || `HTTP ${upstream.status}`)
  }
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() || ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data) continue
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta' && json.delta?.text) send(res, { delta: json.delta.text })
      } catch {
        /* ignore */
      }
    }
  }
}

export async function handleChat(req, res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  let provider = ''
  let hadImages = false
  try {
    const body = await readBody(req)
    provider = body.provider || ''
    const { model, messages: rawMessages, customBaseUrl, mode } = body
    const apiKey = String(body.apiKey || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/["'`]/g, '').replace(/\s+/g, '')
    if (!apiKey) throw new Error('请先填写 API Key')
    if (looksLikePageUrl(apiKey)) {
      throw new Error('API Key 不能填网页地址。请填模型服务商发的 sk- 密钥，不要填 http://127.0.0.1:5177/')
    }
    if (/\*{2,}|…|\.{3}/.test(apiKey) || apiKey.length < 20) {
      throw new Error('密钥不完整。请从官网重新复制一整段，不要用打码或截断的片段。')
    }
    if (!model) throw new Error('请选择模型')
    if (!rawMessages?.length) throw new Error('消息为空')
    const modeName = ['plan', 'talk', 'edit', 'look', 'route'].includes(mode) ? mode : 'fill'

    const wanted = (Array.isArray(body.images) ? body.images : []).filter(Boolean)
    if (wanted.length > MAX_IMAGES) {
      throw new Error(`一次最多发 ${MAX_IMAGES} 张图给模型，先挑几张再问。`)
    }
    if (wanted.length && BLIND_MODELS.test(String(model))) {
      throw new Error(`「${model}」这个型号不认图片，发过去也看不见。${VISION_PICKS}`)
    }
    const images = wanted.map((u) => loadImageForModel(u))
    hadImages = images.length > 0
    const messages = attachImages(applySkillSystem(rawMessages, modeName), images, provider)

    if (provider === 'anthropic') {
      await streamAnthropic({ apiKey, model, messages }, res)
    } else {
      const baseUrl = provider === 'custom'
        ? String(customBaseUrl || '').replace(/\/$/, '')
        : TARGETS[provider]
      if (!baseUrl) throw new Error('未知服务商或未填写自定义 Base URL')
      await streamOpenAI({ baseUrl, apiKey, model, messages, provider, mode: modeName }, res)
    }
    send(res, { done: true })
    res.end()
  } catch (err) {
    send(res, { error: formatError(err, provider, hadImages) })
    res.end()
  }
}
