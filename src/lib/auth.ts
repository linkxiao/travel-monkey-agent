export const TOKEN_KEY = 'ct.token'

export type AuthResult = {
  token: string
  username: string
}

async function postAuth(path: string, body: Record<string, unknown>, token = ''): Promise<AuthResult & { ok?: boolean; error?: string; channel?: string; via?: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) throw new Error(data.error || '账号请求失败')
  return data
}

export async function requestAuthCode(body: { purpose: 'register'; account: string }) {
  return postAuth('/code', body)
}

export async function registerAccount(body: { account: string; code: string; password: string }) {
  return postAuth('/register', body)
}

export async function loginAccount(body: { account: string; password: string }) {
  return postAuth('/login', body)
}

export async function logoutAccount(token: string) {
  try {
    await postAuth('/logout', {}, token)
  } catch {
    /* 本地先退出，服务端会话过期也会失效 */
  }
}

export async function fetchSession(token: string): Promise<{ username: string } | null> {
  try {
    const res = await fetch('/api/auth/session', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) return null
    return { username: String(data.username || '') }
  } catch {
    return null
  }
}
