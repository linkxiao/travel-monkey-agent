export type ProviderKind = 'openai' | 'anthropic'

export type ModelOption = {
  id: string
  name: string
}

export type Provider = {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  keyHint: string
  models: ModelOption[]
}

export const PROVIDERS: Provider[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter（一键覆盖主流）',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyHint: 'sk-or-v1-...',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-opus-4.1', name: 'Claude Opus 4.1' },
      { id: 'openai/gpt-5', name: 'GPT-5' },
      { id: 'openai/gpt-4.1', name: 'GPT-4.1' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'x-ai/grok-4', name: 'Grok 4' },
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek/deepseek-reasoner', name: 'DeepSeek R1' },
      { id: 'qwen/qwen3-max', name: 'Qwen3 Max' },
      { id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
      { id: 'z-ai/glm-4.5', name: 'GLM-4.5' },
      { id: 'mistralai/mistral-large', name: 'Mistral Large' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'sk-...',
    models: [
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gpt-4.1', name: 'GPT-4.1' },
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'o3', name: 'o3' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyHint: 'sk-ant-...',
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyHint: 'AIza...',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keyHint: 'xai-...',
    models: [
      { id: 'grok-4', name: 'Grok 4' },
      { id: 'grok-3', name: 'Grok 3' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keyHint: 'sk-...',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1' },
    ],
  },
  {
    id: 'qwen',
    name: '阿里云通义千问',
    kind: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyHint: 'sk-...',
    models: [
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen3-max', name: 'Qwen3 Max' },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi / Moonshot',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyHint: 'sk-...',
    models: [
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2' },
      { id: 'moonshot-v1-128k', name: 'Moonshot 128K' },
    ],
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    kind: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyHint: 'sk-...',
    models: [
      { id: 'glm-4.5', name: 'GLM-4.5' },
      { id: 'glm-4-flash', name: 'GLM-4 Flash' },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    kind: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyHint: 'sk-...',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B' },
      { id: 'moonshotai/Kimi-K2-Instruct', name: 'Kimi K2' },
    ],
  },
  {
    id: 'custom',
    name: '自定义 OpenAI 兼容',
    kind: 'openai',
    baseUrl: '',
    keyHint: '任意兼容 /v1 的 Key',
    models: [{ id: 'custom-model', name: '自定义模型名' }],
  },
]

export function getProvider(id: string) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0]
}

export function sanitizeApiKey(value: string) {
  return String(value || '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, '')
}

export function keyLooksUnusable(value: string) {
  const key = sanitizeApiKey(value)
  if (!key) return '请先粘贴模型密钥'
  if (/^https?:\/\//i.test(key) || /127\.0\.0\.1|localhost/i.test(key)) {
    return '这里应填密钥，不要填网页地址'
  }
  if (/\*{2,}|…|\.{3}/.test(key)) return '这是打码后的片段，请从官网重新复制完整 Key'
  if (key.length < 20) return '密钥不完整，请重新粘贴一整段'
  return ''
}

export function isAuthFail(text: string) {
  return /不认当前密钥|认证失败|invalid[_ ]?api[_ ]?key|authentication fails|incorrect api key/i.test(String(text || ''))
}

export function keyMismatchHint(providerId: string, apiKey: string) {
  const key = sanitizeApiKey(apiKey)
  if (!key || /^https?:\/\//i.test(key) || /127\.0\.0\.1|localhost/i.test(key)) return ''
  if (providerId === 'openrouter' && !/^sk-or-/.test(key)) {
    return '当前是 OpenRouter，密钥应是 sk-or- 开头。DeepSeek/通义/Kimi 的 sk- 请先把左侧服务商改成对应一家。'
  }
  if (providerId === 'anthropic' && !/^sk-ant-/.test(key)) {
    return '当前是 Anthropic，密钥应是 sk-ant- 开头。'
  }
  if (providerId === 'google' && !/^AIza/.test(key)) {
    return '当前是 Google Gemini，密钥应是 AIza 开头。'
  }
  if (providerId === 'xai' && !/^xai-/.test(key)) {
    return '当前是 xAI，密钥应是 xai- 开头。'
  }
  if (providerId !== 'openrouter' && providerId !== 'custom' && /^sk-or-/.test(key)) {
    return '这是 OpenRouter 的 Key，请把左侧服务商改回 OpenRouter，或换成当前服务商自己的密钥。'
  }
  return ''
}
