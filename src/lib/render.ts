import type { Trip } from './trip'
import { authHeaders } from './http.ts'

export async function renderTripPage(trip: Trip, opts?: {
  themeId?: string
  keepThemeId?: string
  fallback?: boolean
  fast?: boolean
  skipPhotos?: boolean
  skipTransport?: boolean
  replacePhotos?: boolean
  fillGaps?: boolean
  photoMode?: 'fill_gaps' | 'replace'
  photoNames?: string[]
  photoKinds?: string[]
  photoHint?: string
  photoDays?: number[]
  photoQuery?: string
  amapKey?: string
  tiandituKey?: string
  searchKey?: string
  searchProvider?: string
  searchFallbackKey?: string
  searchFallbackProvider?: string
  authToken?: string
}) {
  let res: Response
  try {
    res = await fetch('/api/render', {
      method: 'POST',
      headers: authHeaders(opts?.authToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        trip,
        themeId: opts?.themeId,
        keepThemeId: opts?.keepThemeId,
        fallback: opts?.fallback,
        fast: opts?.fast,
        skipPhotos: opts?.skipPhotos,
        skipTransport: opts?.skipTransport,
        replacePhotos: opts?.replacePhotos,
        fillGaps: opts?.fillGaps,
        photoMode: opts?.photoMode,
        photoNames: opts?.photoNames,
        photoKinds: opts?.photoKinds,
        photoHint: opts?.photoHint,
        photoDays: opts?.photoDays,
        photoQuery: opts?.photoQuery,
        amapKey: opts?.amapKey,
        tiandituKey: opts?.tiandituKey,
        searchKey: opts?.searchKey,
        searchProvider: opts?.searchProvider,
        searchFallbackKey: opts?.searchFallbackKey,
        searchFallbackProvider: opts?.searchFallbackProvider,
      }),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`连不上渲染服务（${msg}）。请确认开发服务还在跑，然后刷新再试。`)
  }
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `渲染失败 ${res.status}`)
  return data as { html: string; trip: Trip; errors: string[]; warnings: string[]; quality?: string[]; themeId?: string; themeName?: string; fallback?: boolean }
}
