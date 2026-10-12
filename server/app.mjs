/**
 * Express 应用（纯路由，不负责任何启动行为）
 *
 * 同一个 app 被两处复用：
 *   - server/index.mjs  本地服务（额外挂静态资源、端口顺延）
 *   - api/index.mjs Vercel Serverless Function
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import express from 'express'

import { config, connSummary } from './config.mjs'
import {
  listBrags,
  insertBrag,
  slapBrag,
  deleteBrag,
  stats,
  ping,
  adminOverview,
  adminTagBreakdown,
  adminSceneBreakdown,
  adminTrend,
  adminTopBrags,
  adminRecentPosts,
  adminListBrags,
  adminDeleteBrag,
} from './db.mjs'

const BRAG_TAGS = new Set(['遥遥领先', '全球第一', '完全自研', '没有对手', '重新定义', '友商不行'])
const DEFAULT_SCENE = '其他'
const MIN_LEN = 4

// ── 工具 ────────────────────────────────────────────────────────────────────

/** 投稿浏览器标识，用于判定「我的」与删除权限；不写进响应体 */
function ownerOf(req) {
  const raw = req.get('x-dz-owner')
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length >= 8 && trimmed.length <= 64 ? trimmed : null
}

function newId() {
  return `u-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}

function wrap(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

/** 口令用等长比较，避免时序侧信道 */
function tokenMatches(input, expected) {
  if (typeof input !== 'string' || !expected) return false
  const a = Buffer.from(input)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** 后台接口守卫：未配置口令直接关闭后台 */
function requireAdmin(req, res, next) {
  if (!config.adminToken) {
    return res.status(503).json({
      error: 'ADMIN_DISABLED',
      message: '后台未启用：请在环境变量中设置 DZ_ADMIN_TOKEN',
    })
  }
  if (!tokenMatches(req.get('x-dz-admin'), config.adminToken)) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: '管理口令不对' })
  }
  next()
}

// ── 应用 ────────────────────────────────────────────────────────────────────

export function createApp({ staticDir } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', true)
  app.use(express.json({ limit: '32kb' }))

  app.get(
    '/api/health',
    wrap(async (_req, res) => {
      try {
        await ping()
        res.json({ ok: true, db: 'up', connection: connSummary() })
      } catch (error) {
        res.status(503).json({ ok: false, db: 'down', message: error.message })
      }
    }),
  )

  app.get(
    '/api/stats',
    wrap(async (_req, res) => {
      res.json(await stats())
    }),
  )

  app.get(
    '/api/brags',
    wrap(async (req, res) => {
      res.json({ items: await listBrags(ownerOf(req)) })
    }),
  )

  app.post(
    '/api/brags',
    wrap(async (req, res) => {
      const body = req.body ?? {}

      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (text.length < MIN_LEN) {
        return res.status(400).json({ error: 'TOO_SHORT', message: `吹牛原话至少 ${MIN_LEN} 个字` })
      }
      if (text.length > config.maxContentLength) {
        return res.status(400).json({ error: 'TOO_LONG', message: '吹牛原话太长了' })
      }

      const tag = typeof body.tag === 'string' ? body.tag : ''
      if (!BRAG_TAGS.has(tag)) {
        return res.status(400).json({ error: 'BAD_TAG', message: '归类不在允许范围内' })
      }

      const scene =
        typeof body.scene === 'string' && body.scene.trim()
          ? body.scene.trim().slice(0, 32)
          : DEFAULT_SCENE

      const author =
        typeof body.author === 'string' && body.author.trim()
          ? body.author.trim().slice(0, config.maxAuthorLength)
          : null

      const brag = await insertBrag({
        id: newId(),
        text,
        tag,
        scene,
        author,
        ownerToken: ownerOf(req),
      })

      res.status(201).json({ item: brag })
    }),
  )

  app.post(
    '/api/brags/:id/slap',
    wrap(async (req, res) => {
      const slaps = await slapBrag(req.params.id)
      if (slaps === null) {
        return res.status(404).json({ error: 'NOT_FOUND', message: '这条语录已经不在了' })
      }
      res.json({ id: req.params.id, slaps })
    }),
  )

  app.delete(
    '/api/brags/:id',
    wrap(async (req, res) => {
      const result = await deleteBrag(req.params.id, ownerOf(req))
      if (result.ok) return res.json({ ok: true })

      const map = {
        not_found: [404, 'NOT_FOUND', '这条语录已经不在了'],
        seed_readonly: [403, 'SEED_READONLY', '内置语录不能删'],
        forbidden: [403, 'FORBIDDEN', '只能删自己发的'],
      }
    const [status, error, message] = map[result.reason] ?? [400, 'BAD_REQUEST', '删不掉']
    res.status(status).json({ error, message })
  }),
)

// ── 后台管理（需要 x-dz-admin 口令）──────────────────────────────────────────

/** 校验口令是否仍然有效，前端用来判断登录态 */
app.get('/api/admin/session', requireAdmin, (_req, res) => {
  res.json({ ok: true })
})

/** 一次性返回后台首页所有统计，省掉多次往返 */
app.get(
  '/api/admin/stats',
  requireAdmin,
  wrap(async (_req, res) => {
    const [overview, byTag, byScene, trend, top, recent] = await Promise.all([
      adminOverview(),
      adminTagBreakdown(),
      adminSceneBreakdown(8),
      adminTrend(14),
      adminTopBrags(5),
      adminRecentPosts(6),
    ])
    res.json({ overview, byTag, byScene, trend, top, recent })
  }),
)

app.get(
  '/api/admin/brags',
  requireAdmin,
  wrap(async (req, res) => {
    const { q, tag, kind, page, pageSize } = req.query
    res.json(
      await adminListBrags({
        q: typeof q === 'string' ? q : '',
        tag: typeof tag === 'string' ? tag : '',
        kind: typeof kind === 'string' ? kind : '',
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 12,
      }),
    )
  }),
)

app.delete(
  '/api/admin/brags/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const result = await adminDeleteBrag(req.params.id)
    if (!result.ok) {
      return res.status(404).json({ error: 'NOT_FOUND', message: '这条语录已经不在了' })
    }
    res.json({ ok: true })
  }),
)

  // 本地开发才需要自己托管前端；Vercel 由平台直接发 dist
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1h' }))

    // 后台入口：/admin 与 /admin/ 都指向 admin.html
    app.get(['/admin', '/admin/'], (_req, res) => {
      const file = path.join(staticDir, 'admin.html')
      if (fs.existsSync(file)) return res.sendFile(file)
      res.redirect('/')
    })

    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'))
    })
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: '没有这个接口' })
  })

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    const isDbDown =
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'PROTOCOL_CONNECTION_LOST' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ENOTFOUND' ||
      error?.fatal
    console.error('[api] error:', error?.code ?? '', error?.message)
    res.status(isDbDown ? 503 : 500).json({
      error: isDbDown ? 'DB_UNAVAILABLE' : 'INTERNAL',
      message: isDbDown ? '数据库暂时连不上' : '服务器开小差了',
    })
  })

  return app
}
