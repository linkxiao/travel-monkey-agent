import { emptyProfile, type Profile } from './profile.ts'

export async function fetchAccount(code: string): Promise<{ found: boolean; profile: Profile | null } | null> {
  try {
    const res = await fetch(`/api/account?code=${encodeURIComponent(code)}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.ok) return null
    return { found: Boolean(data.found), profile: data.profile || emptyProfile() }
  } catch {
    return null
  }
}

export async function pushAccount(code: string, profile: Profile) {
  try {
    await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, profile }),
    })
  } catch {
    /* 服务端暂时写不进时，这一页里的画像还在 */
  }
}
