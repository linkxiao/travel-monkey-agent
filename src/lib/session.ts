// 会话存 IndexedDB：localStorage 只有约 5MB，装不下多趟行程的整页 HTML 和版本。
// 两个表：sessions 存全量，meta 只存列表要用的几项，切换列表不用把每趟的 HTML 都读出来。
// 库名按账号隔离：同浏览器换账号不会看到别人的对话和行程。
import type { Trip } from './trip.ts'

export type SessionBubble = { role: 'user' | 'assistant'; text: string }

export type SessionResearch = {
  done?: boolean
  query?: string
  brief?: string
  sources?: unknown
  hotelsByTier?: unknown
}

export type SessionData = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  bubbles: SessionBubble[]
  trip: Trip | null
  html: string
  planDraft: string
  persona: string
  research: SessionResearch
  versions: Array<{ label: string; trip: Trip; html: string }>
  seedId?: string
}

export type SessionStage = 'empty' | 'plan' | 'page'

export type SessionMeta = { id: string; title: string; updatedAt: number; stage: SessionStage; seedId?: string }

const DB_VERSION = 1
const FULL = 'sessions'
const META = 'meta'

let owner = ''

function normalizeOwner(username: string) {
  return String(username || '').trim().toLowerCase()
}

/** 切换当前读写所属账号；空字符串表示未登录，禁止读写历史 */
export function setSessionOwner(username: string) {
  owner = normalizeOwner(username)
}

export function sessionOwner() {
  return owner
}

function dbName() {
  // 未登录用独立空库名也不写；读写前会再拦一道
  return owner ? `travel-monkey:u:${owner}` : 'travel-monkey:anon'
}

export function sessionPointerKey() {
  return owner ? `ct.session:${owner}` : 'ct.session'
}

export function newSessionId() {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function sessionStage(s: Pick<SessionData, 'trip' | 'planDraft' | 'bubbles'>): SessionStage {
  if (s.trip) return 'page'
  if (s.planDraft || s.bubbles.length) return 'plan'
  return 'empty'
}

export function sessionTitle(s: Pick<SessionData, 'trip' | 'bubbles'>) {
  const title = String(s.trip?.title || '').trim()
  if (title) return title.slice(0, 24)
  const first = s.bubbles.find((b) => b.role === 'user' && b.text.trim())
  return first ? first.text.replace(/\s+/g, ' ').trim().slice(0, 18) : '新行程'
}

export function isEmptySession(s: Pick<SessionData, 'trip' | 'planDraft' | 'bubbles'>) {
  return sessionStage(s) === 'empty'
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!owner) return Promise.resolve(null)
  return new Promise((resolve) => {
    const req = indexedDB.open(dbName(), DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(FULL)) db.createObjectStore(FULL, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    // 无痕模式或被禁用时存不了，退化成只在内存里，不挡正常使用
    req.onerror = () => resolve(null)
  })
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function result<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveSession(s: SessionData) {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction([FULL, META], 'readwrite')
  tx.objectStore(FULL).put(s)
  tx.objectStore(META).put({ id: s.id, title: s.title, updatedAt: s.updatedAt, stage: sessionStage(s), seedId: s.seedId } satisfies SessionMeta)
  await done(tx)
  db.close()
}

export async function loadSession(id: string): Promise<SessionData | null> {
  const db = await openDb()
  if (!db) return null
  const got = await result(db.transaction(FULL, 'readonly').objectStore(FULL).get(id))
  db.close()
  return (got as SessionData | undefined) || null
}

export async function listSessions(): Promise<SessionMeta[]> {
  const db = await openDb()
  if (!db) return []
  const all = await result(db.transaction(META, 'readonly').objectStore(META).getAll())
  db.close()
  return (all as SessionMeta[]).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function removeSession(id: string) {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction([FULL, META], 'readwrite')
  tx.objectStore(FULL).delete(id)
  tx.objectStore(META).delete(id)
  await done(tx)
  db.close()
}
