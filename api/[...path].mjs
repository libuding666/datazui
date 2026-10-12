/**
 * Vercel Serverless Function 入口
 *
 * 文件名 [...path].mjs 是 catch-all：/api/health、/api/brags/:id/slap 等
 * 所有 /api/* 请求都会进到这里，再交给同一个 Express app 分发——
 * 这样函数数量始终是 1 个，实例能复用、冷启动更少。
 *
 * 本地开发不会走这个文件，用的是 server/index.mjs。
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

export default async function handler(req, res) {
  req.url = normalizeUrl(req.url)

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
