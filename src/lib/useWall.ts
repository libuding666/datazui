import * as React from 'react'
import { SEED_BRAGS, type Brag, type BragTag } from '../data/brags'

/**
 * 数据层：以 MySQL 为唯一事实来源（经 /api），本地只做两件事——
 *   1. 缓存上一条响应，断网时还能看到墙
 *   2. 持有一个 owner token，供服务端判定「这条是我发的」、进而允许删除
 *
 * 所有写操作都是「先改本地、再打接口」的乐观更新；接口失败则回滚并切到离线态。
 */

const OWNER_KEY = 'datazui.owner.v1'
const CACHE_KEY = 'datazui.cache.v1'

export type WallStatus = 'loading' | 'online' | 'offline'

export type PublishInput = {
  text: string
  tag: BragTag
  scene: string
  /** 空字符串或 null 视为匿名 */
  author: string | null
}

export type WallApi = {
  brags: Brag[]
  status: WallStatus
  slap: (id: string) => void
  publish: (input: PublishInput) => void
  remove: (id: string) => void
  refresh: () => void
}

// ── 本地存储 ────────────────────────────────────────────────────────────────

function randomToken(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `o-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** 每台浏览器一份，稳定不变，用来认领自己的投稿 */
function getOwnerToken(): string {
  try {
    let token = window.localStorage.getItem(OWNER_KEY)
    if (!token) {
      token = randomToken()
      window.localStorage.setItem(OWNER_KEY, token)
    }
    return token
  } catch {
    return 'dz-fallback-owner-token'
  }
}

function readCache(): Brag[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { items?: unknown }
    if (!Array.isArray(parsed.items)) return null
    const items = parsed.items.filter(
      (item): item is Brag => Boolean(item) && typeof (item as Brag).text === 'string',
    )
    return items.length ? items : null
  } catch {
    return null
  }
}

function writeCache(items: Brag[]) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ items, savedAt: Date.now() }))
  } catch {
    /* 配额满 / 隐私模式：忽略 */
  }
}

// ── 接口 ────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-dz-owner': getOwnerToken(),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError('网络不通，先本地记着', 0)
  }

  if (!response.ok) {
    let message = `服务返回 ${response.status}`
    try {
      const body = (await response.json()) as { message?: string }
      if (body?.message) message = body.message
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}

// ── Hook ────────────────────────────────────────────────────────────────────

let seq = 0

export function useWall(): WallApi {
  const [brags, setBrags] = React.useState<Brag[]>(() => readCache() ?? SEED_BRAGS)
  const [status, setStatus] = React.useState<WallStatus>('loading')

  const load = React.useCallback(async () => {
    try {
      const data = await api<{ items: Brag[] }>('/api/brags')
      setBrags(data.items)
      writeCache(data.items)
      setStatus('online')
    } catch {
      setStatus('offline')
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const slap = React.useCallback((id: string) => {
    setBrags((prev) => prev.map((brag) => (brag.id === id ? { ...brag, slaps: brag.slaps + 1 } : brag)))
    void api<{ slaps: number }>(`/api/brags/${encodeURIComponent(id)}/slap`, { method: 'POST' })
      .then((data) => {
        setStatus('online')
        // 以服务端计数为准（多端并发时更准）
        setBrags((prev) =>
          prev.map((brag) => (brag.id === id ? { ...brag, slaps: Number(data.slaps) } : brag)),
        )
      })
      .catch(() => {
        setStatus('offline')
        setBrags((prev) =>
          prev.map((brag) => (brag.id === id ? { ...brag, slaps: Math.max(0, brag.slaps - 1) } : brag)),
        )
      })
  }, [])

  const publish = React.useCallback((input: PublishInput) => {
    seq += 1
    const tempId = `local-${Date.now().toString(36)}-${seq.toString(36)}`
    const optimistic: Brag = {
      id: tempId,
      text: input.text.trim(),
      tag: input.tag,
      scene: input.scene || '其他',
      author: input.author?.trim() ? input.author.trim() : null,
      slaps: 0,
      createdAt: Date.now(),
      mine: true,
    }
    setBrags((prev) => [optimistic, ...prev])

    void api<{ item: Brag }>('/api/brags', {
      method: 'POST',
      body: JSON.stringify({
        text: optimistic.text,
        tag: optimistic.tag,
        scene: optimistic.scene,
        author: optimistic.author,
      }),
    })
      .then((data) => {
        setStatus('online')
        setBrags((prev) => {
          const next = prev.map((brag) => (brag.id === tempId ? data.item : brag))
          writeCache(next)
          return next
        })
      })
      .catch(() => {
        // 落库失败：保留本地这条，标记离线，下次联网时用户可再发
        setStatus('offline')
        setBrags((prev) => {
          writeCache(prev)
          return prev
        })
      })
  }, [])

  const remove = React.useCallback((id: string) => {
    let removed: Brag | undefined
    setBrags((prev) => {
      removed = prev.find((brag) => brag.id === id)
      return prev.filter((brag) => brag.id !== id)
    })

    // 本地临时条目还没落库，直接删掉即可
    if (id.startsWith('local-')) return

    void api<{ ok: boolean }>(`/api/brags/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(() => {
        setStatus('online')
      })
      .catch(() => {
        setStatus('offline')
        if (removed) {
          const snapshot = removed
          setBrags((prev) => [snapshot, ...prev])
        }
      })
  }, [])

  return { brags, status, slap, publish, remove, refresh: load }
}
