/** 给需登录接口带上 Bearer；token 空则不加 */
export function authHeaders(token?: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  const t = String(token || '').trim()
  if (t) headers.Authorization = `Bearer ${t}`
  return headers
}
