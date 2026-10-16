export type HotelHint = { name?: string; address?: string; cost?: string; tier?: string }

export type ResearchBrief = {
  dest?: string
  brief?: string
  sources?: Array<{ name: string; scope?: string; realtime?: boolean }>
  hotelsByTier?: { 经济?: HotelHint[]; 中档?: HotelHint[]; 高端?: HotelHint[] }
  openHours?: Array<{ name: string; open?: string; closedWeekdays?: number[] }>
  error?: string
}

export async function fetchResearch(opts: {
  query: string
  amapKey?: string
  tiandituKey?: string
  searchKey?: string
  searchProvider?: string
  searchFallbackKey?: string
  searchFallbackProvider?: string
}): Promise<ResearchBrief> {
  const res = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || `调研失败 ${res.status}`)
  return data
}
