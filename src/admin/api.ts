/**
 * 后台 API 客户端
 *
 * 口令（DZ_ADMIN_TOKEN）存在 localStorage，随请求头 x-dz-admin 一起发送。
 * 服务端没配口令时后台整体关闭，这里会收到 503 ADMIN_DISABLED。
 */

const TOKEN_KEY = 'datazui.admin.token'

export class AdminError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code = '') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function readToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* 隐私模式忽略 */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* 忽略 */
  }
}

async function req<T>(path: string, init: RequestInit = {}, token = readToken()): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-dz-admin': token,
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new AdminError('网络不通，检查一下连接', 0, 'NETWORK')
  }

  if (!response.ok) {
    let message = `服务返回 ${response.status}`
    let code = ''
    try {
      const body = (await response.json()) as { message?: string; error?: string }
      if (body?.message) message = body.message
      if (body?.error) code = body.error
    } catch {
      /* 非 JSON */
    }
    throw new AdminError(message, response.status, code)
  }

  return (await response.json()) as T
}

// ── 类型 ────────────────────────────────────────────────────────────────────

export type AdminOverview = {
  total: number
  seeds: number
  posts: number
  postsToday: number
  slaps: number
  slapsToday: number
  slapsWeek: number
  slapsAvg: number
}

export type AdminBrag = {
  id: string
  text: string
  tag: string
  scene: string
  author: string | null
  anonymous: boolean
  slaps: number
  createdAt: number
  seed: boolean
  claimed: boolean
}

export type AdminStats = {
  overview: AdminOverview
  byTag: { tag: string; count: number; slaps: number }[]
  byScene: { scene: string; count: number }[]
  trend: { day: string; label: string; count: number }[]
  top: AdminBrag[]
  recent: AdminBrag[]
}

export type AdminList = {
  items: AdminBrag[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export type ListQuery = {
  q?: string
  tag?: string
  kind?: '' | 'seed' | 'user'
  page?: number
  pageSize?: number
}

// ── 接口 ────────────────────────────────────────────────────────────────────

export const adminApi = {
  /** 用给定口令探一次，用于登录 */
  login: (token: string) =>
    req<{ ok: boolean }>('/api/admin/session', { method: 'GET' }, token),

  /** 校验已存的口令是否还有效 */
  session: () => req<{ ok: boolean }>('/api/admin/session'),

  stats: () => req<AdminStats>('/api/admin/stats'),

  list: (query: ListQuery = {}) => {
    const params = new URLSearchParams()
    if (query.q) params.set('q', query.q)
    if (query.tag) params.set('tag', query.tag)
    if (query.kind) params.set('kind', query.kind)
    if (query.page) params.set('page', String(query.page))
    if (query.pageSize) params.set('pageSize', String(query.pageSize))
    const qs = params.toString()
    return req<AdminList>(`/api/admin/brags${qs ? `?${qs}` : ''}`)
  },

  remove: (id: string) =>
    req<{ ok: boolean }>(`/api/admin/brags/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
