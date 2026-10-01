import type { Trip } from './trip'

export async function renderTripPage(trip: Trip, opts?: {
  themeId?: string
  keepThemeId?: string
  fallback?: boolean
  skipPhotos?: boolean
  skipTransport?: boolean
  replacePhotos?: boolean
  photoNames?: string[]
  photoKinds?: string[]
  photoHint?: string
  photoDays?: number[]
  photoQuery?: string
  amapKey?: string
  searchKey?: string
  searchProvider?: string
}) {
  let res: Response
  try {
    res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trip,
        themeId: opts?.themeId,
        keepThemeId: opts?.keepThemeId,
        fallback: opts?.fallback,
        skipPhotos: opts?.skipPhotos,
        skipTransport: opts?.skipTransport,
        replacePhotos: opts?.replacePhotos,
        photoNames: opts?.photoNames,
        photoKinds: opts?.photoKinds,
        photoHint: opts?.photoHint,
        photoDays: opts?.photoDays,
        photoQuery: opts?.photoQuery,
        amapKey: opts?.amapKey,
        searchKey: opts?.searchKey,
        searchProvider: opts?.searchProvider,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`连不上本机渲染接口（${msg}）。请确认开发服务还在跑，然后刷新再试。`)
  }
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `渲染失败 ${res.status}`)
  return data as { html: string; trip: Trip; errors: string[]; warnings: string[]; themeId?: string; themeName?: string; fallback?: boolean }
}
