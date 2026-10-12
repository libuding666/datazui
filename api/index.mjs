/**
 * Vercel Serverless Function 入口（固定名 api/index.mjs）
 *
 * ⚠️ 为什么不用 api/[...path].mjs catch-all：
 * Vercel 平台目前对 catch-all 函数文件名（[...path] / [[...path]]）有 bug，
 * 只能匹配单段路径——/api/brags 正常，但 /api/admin/session 这类多段路径
 * 会在边缘层直接 404 NOT_FOUND（X-Vercel-Error: NOT_FOUND），请求到不了函数。
 * 所以这里用固定文件名，配合 vercel.json 把 /api/(.*) 全部 rewrite 到本函数，
 * 原始路径通过 ?path=$1 传进来，由下面的 resolveUrl() 拼回真实 req.url。
 *
 * 本地开发不走这个文件，用的是 server/index.mjs。
 * maxDuration 等参数配在 vercel.json。
 */

import { createApp } from '../server/app.mjs'
import { ensureReady, explainDbError } from '../server/db.mjs'
import { connSummary } from '../server/config.mjs'

// 模块级复用：同一实例的多次请求共享 app 与连接池
const app = createApp()

/** 个别情况下 Vercel 会剥掉 /api 前缀，补回来保证 Express 能匹配上 */
function normalizeUrl(url = '/') {
  if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) return url
  return `/api${url.startsWith('/') ? url : `/${url}`}`
}

/**
 * 还原真实请求路径。
 *
 * rewrite（/api/(.*) → /api/index?path=$1）会让函数收到的 req.url 变成
 * /api/index?path=admin/session&...，这里把 path 参数摘出来拼回 /api/xxx，
 * 其余查询参数原样保留。兜底：如果 req.url 本身就是原始路径（没有 path
 * 参数，比如直接访问 /api/index），就只做前缀归一化。
 */
function resolveUrl(req) {
  let u
  try {
    u = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    return normalizeUrl(req.url)
  }
  const rest = u.searchParams.get('path')
  if (rest === null || rest === '') return normalizeUrl(u.pathname + u.search)
  u.searchParams.delete('path')
  return normalizeUrl(`/${rest}`) + (u.search === '' ? '' : u.search)
}

export default async function handler(req, res) {
  req.url = resolveUrl(req)

  try {
    // 冷启动只做一次：建表 + 补种子数据
    await ensureReady()
  } catch (error) {
    const hint = explainDbError(error)
    console.error('[api] 数据库未就绪:', error?.code ?? '', error?.message, hint && `→ ${hint}`)
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: 'DB_UNAVAILABLE',
        message: '数据库未就绪，请检查 Vercel 环境变量中的 MySQL 配置',
        detail: `${connSummary()} · ${error?.code ?? error?.message}${hint ? ` · ${hint}` : ''}`,
      }),
    )
    return
  }

  return app(req, res)
}
