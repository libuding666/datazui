/**
 * MySQL 访问层
 *
 * 表结构：
 *   brags     吹牛语录（内置 seed + 用户投稿）
 *   slap_log  打嘴流水，便于后续做趋势/防刷统计
 *
 * 之所以把内置语录也落库，是为了让「打嘴次数」有唯一权威计数：
 * 用户每一次打嘴都直接 UPDATE brags.slaps，而不是前端各存各的增量。
 *
 * 兼容两种运行形态：
 *   - 本地常驻服务：连接池 10，允许自动建库
 *   - Serverless（Vercel）：连接池 2，不建库，表结构每实例懒加载一次
 */

import { createRequire } from 'node:module'

import mysql from 'mysql2/promise'

import { config } from './config.mjs'

// 用 require 读 JSON：比 fs 读路径更容易被打包器（@vercel/nft / esbuild）正确追踪
const require = createRequire(import.meta.url)
const SEED_ROWS = require('../shared/seed-brags.json')

const DDL = [
  `CREATE TABLE IF NOT EXISTS brags (
     id          VARCHAR(64)  NOT NULL COMMENT '主键：seed-N 内置 / u-xxx 用户投稿',
     content     VARCHAR(200) NOT NULL COMMENT '吹牛原话',
     tag         VARCHAR(32)  NOT NULL COMMENT '归类',
     scene       VARCHAR(32)  NOT NULL COMMENT '出处 / 场合',
     author      VARCHAR(32)  NULL     COMMENT '昵称，NULL 表示匿名',
     slaps       INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计被打嘴次数',
     is_seed     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = 内置语录',
     owner_token CHAR(36)     NULL     COMMENT '投稿浏览器标识，仅用于删除鉴权，不对外展示',
     created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     KEY idx_tag (tag),
     KEY idx_created (created_at),
     KEY idx_slaps (slaps),
     KEY idx_owner (owner_token)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='打他嘴 · 吹牛语录'`,

  `CREATE TABLE IF NOT EXISTS slap_log (
     id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
     brag_id    VARCHAR(64) NOT NULL COMMENT '被打嘴的语录',
     created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (id),
     KEY idx_brag (brag_id),
     KEY idx_created (created_at)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='打他嘴 · 打嘴流水'`,
]

// ── 连接 ────────────────────────────────────────────────────────────────────

let pool = null

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: config.db.charset,
      ssl: config.dbSsl,
      waitForConnections: true,
      connectionLimit: config.poolSize,
      maxIdle: config.poolSize,
      idleTimeout: 30_000,
      queueLimit: 0,
      enableKeepAlive: true,
      connectTimeout: 15_000,
      dateStrings: false,
    })
  }
  return pool
}

export async function ping() {
  const db = getPool()
  await db.query('SELECT 1')
  return true
}

/**
 * 连云数据库踩的坑就那几个，这里翻译成人话，省得对着 code 猜。
 * 返回空字符串表示没有额外建议。
 */
export function explainDbError(error) {
  const code = error?.code ?? ''
  const message = String(error?.message ?? '')

  if (/SSL|TLS|secure transport/i.test(message) || code === 'ER_SECURE_TRANSPORT_REQUIRED') {
    return '目标数据库要求加密连接：设 DZ_DB_SSL=true 再试'
  }
  if (code === 'ER_ACCESS_DENIED_ERROR') {
    return '账号或密码不对。注意 TiDB Cloud 的用户名必须带实例前缀（形如 xxxxx.root），Supabase 则是 postgres.xxxxx'
  }
  if (code === 'ER_DBACCESS_DENIED_ERROR' || code === 'ER_BAD_DB_ERROR') {
    return '库不存在或没有访问权限：确认 DZ_DB_NAME 拼写；云实例一般允许建库，也可手动先建好'
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return '主机名解析不了：检查 DZ_DB_HOST 是否从控制台整段复制（区域信息不能自己拼）'
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return '连不上目标端口：检查 DZ_DB_PORT（TiDB Cloud 是 4000，不是 3306）、地址白名单与网络'
  }
  if (code === 'ER_CON_COUNT_ERROR' || /too many connections/i.test(message)) {
    return '连接数打满：调小 DZ_DB_POOL，或确认没有并发跑多个本地服务实例'
  }
  return ''
}

/** 本地开发：库不存在时自动建库；云数据库账号通常没这个权限，失败就跳过 */
async function ensureDatabase() {
  if (!config.allowCreateDatabase) return false
  const root = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    charset: config.db.charset,
    ssl: config.dbSsl,
    connectTimeout: 15_000,
  })
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\`
       DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await root.end()
  return true
}

// ── 初始化 ──────────────────────────────────────────────────────────────────

/**
 * 建库建表 + 同步内置语录，幂等，可反复执行。
 * Serverless 下每个实例只会真正执行一次（见 ensureReady）。
 */
export async function initDatabase({ verbose = false, force = false } = {}) {
  const log = verbose ? (...args) => console.log(...args) : () => {}

  try {
    const created = await ensureDatabase()
    if (created) log(`[db] database ready: ${config.db.database}`)
  } catch (error) {
    // 云数据库不允许建库：只要库已存在就没问题
    log(`[db] 跳过建库（${error.code ?? error.message}），直接使用已有库 ${config.db.database}`)
  }

  const db = getPool()
  for (const ddl of DDL) {
    await db.query(ddl)
  }
  log('[db] tables ready: brags, slap_log')

  return seedBrags({ verbose, force })
}

let bootPromise = null

/**
 * Serverless 冷启动入口：确保表结构与种子数据就绪。
 * 同一个实例内只跑一次，避免每次请求都打 DDL。
 */
export function ensureReady() {
  if (!bootPromise) {
    bootPromise = initDatabase({ force: false }).catch((error) => {
      bootPromise = null // 下次请求再试，避免一次失败永久卡死
      throw error
    })
  }
  return bootPromise
}

/**
 * 把内置语录写入 brags。
 *
 * - 已存在的 seed 行只更新文案/归类/场合，**不动 slaps**，
 *   否则每次重启都会把用户打出来的热度清零。
 * - force=false（线上冷启动）时先数一下，数量对得上就整段跳过，省掉 16 行写入。
 */
export async function seedBrags({ verbose = false, force = false } = {}) {
  const db = getPool()

  const [[countRow]] = await db.query('SELECT COUNT(*) AS n FROM brags WHERE is_seed = 1')
  const existingSeeds = Number(countRow?.n ?? 0)
  if (!force && existingSeeds >= SEED_ROWS.length) {
    return { inserted: 0, updated: 0, skipped: true, total: SEED_ROWS.length }
  }

  const ids = SEED_ROWS.map((_, index) => `seed-${index + 1}`)
  const [before] = await db.query('SELECT id FROM brags WHERE id IN (?)', [ids])
  const existing = new Set(before.map((row) => row.id))

  const values = SEED_ROWS.map((row, index) => [
    ids[index],
    row.text,
    row.tag,
    row.scene,
    row.slaps,
    row.hoursAgo,
  ])

  // created_at 由 hoursAgo 反推，让内置语录在时间上自然铺开
  const [result] = await db.query(
    `INSERT INTO brags (id, content, tag, scene, slaps, is_seed, created_at)
     VALUES ${values.map(() => '(?, ?, ?, ?, ?, 1, NOW() - INTERVAL ? HOUR)').join(', ')}
     ON DUPLICATE KEY UPDATE
       content = VALUES(content),
       tag     = VALUES(tag),
       scene   = VALUES(scene)`,
    values.flat(),
  )

  const touched = result.affectedRows
  const inserted = ids.filter((id) => !existing.has(id)).length
  const updated = Math.max(0, touched - inserted * 2)
  if (verbose) console.log(`[db] seed rows: ${SEED_ROWS.length}`)

  return { inserted, updated, skipped: false, total: SEED_ROWS.length }
}

// ── 行映射 ──────────────────────────────────────────────────────────────────

const SELECT_COLUMNS = `
  id,
  content AS text,
  tag,
  scene,
  author,
  slaps,
  is_seed,
  owner_token,
  UNIX_TIMESTAMP(created_at) * 1000 AS createdAt
`

/** DB row → 前端 Brag（隐藏 owner_token，只暴露 mine 布尔） */
export function toBrag(row, ownerToken) {
  const mine = Boolean(row.owner_token) && row.owner_token === ownerToken
  return {
    id: row.id,
    text: row.text,
    tag: row.tag,
    scene: row.scene,
    author: row.author ?? null,
    slaps: Number(row.slaps ?? 0),
    createdAt: Number(row.createdAt ?? Date.now()),
    seed: Number(row.is_seed) === 1,
    ...(mine ? { mine: true } : {}),
  }
}

// ── 查询 ────────────────────────────────────────────────────────────────────

export async function listBrags(ownerToken) {
  const db = getPool()
  const [rows] = await db.query(
    `SELECT ${SELECT_COLUMNS} FROM brags ORDER BY created_at DESC, id DESC`,
  )
  return rows.map((row) => toBrag(row, ownerToken))
}

export async function getBrag(id, ownerToken) {
  const db = getPool()
  const [rows] = await db.query(`SELECT ${SELECT_COLUMNS} FROM brags WHERE id = ? LIMIT 1`, [id])
  return rows.length ? toBrag(rows[0], ownerToken) : null
}

export async function insertBrag({ id, text, tag, scene, author, ownerToken }) {
  const db = getPool()
  await db.query(
    `INSERT INTO brags (id, content, tag, scene, author, slaps, is_seed, owner_token)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
    [id, text, tag, scene, author, ownerToken],
  )
  return getBrag(id, ownerToken)
}

/** +1 打嘴：计数与流水同时落，返回最新次数 */
export async function slapBrag(id) {
  const db = getPool()
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    const [result] = await conn.query('UPDATE brags SET slaps = slaps + 1 WHERE id = ?', [id])
    if (result.affectedRows === 0) {
      await conn.rollback()
      return null
    }
    await conn.query('INSERT INTO slap_log (brag_id) VALUES (?)', [id])
    const [rows] = await conn.query('SELECT slaps FROM brags WHERE id = ? LIMIT 1', [id])
    await conn.commit()
    return Number(rows[0]?.slaps ?? 0)
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

/** 删除：内置语录拒绝，用户投稿校验 owner */
export async function deleteBrag(id, ownerToken) {
  const db = getPool()
  const [rows] = await db.query('SELECT is_seed, owner_token FROM brags WHERE id = ? LIMIT 1', [id])
  if (!rows.length) return { ok: false, reason: 'not_found' }
  if (Number(rows[0].is_seed) === 1) return { ok: false, reason: 'seed_readonly' }
  if (!ownerToken || rows[0].owner_token !== ownerToken) return { ok: false, reason: 'forbidden' }

  await db.query('DELETE FROM brags WHERE id = ?', [id])
  await db.query('DELETE FROM slap_log WHERE brag_id = ?', [id])
  return { ok: true }
}

export async function stats() {
  const db = getPool()
  const [[row]] = await db.query(
    `SELECT
       COUNT(*)                          AS total,
       SUM(is_seed = 1)                  AS seeds,
       SUM(is_seed = 0)                  AS posts,
       COALESCE(SUM(slaps), 0)           AS slaps
     FROM brags`,
  )
  const [[today]] = await db.query(
    `SELECT COUNT(*) AS slapsToday FROM slap_log WHERE created_at >= CURDATE()`,
  )
  return {
    total: Number(row.total ?? 0),
    seeds: Number(row.seeds ?? 0),
    posts: Number(row.posts ?? 0),
    slaps: Number(row.slaps ?? 0),
    slapsToday: Number(today.slapsToday ?? 0),
  }
}

// ── 后台统计与管理 ──────────────────────────────────────────────────────────

const ADMIN_COLUMNS = `
  id,
  content AS text,
  tag,
  scene,
  author,
  slaps,
  is_seed,
  owner_token,
  UNIX_TIMESTAMP(created_at) * 1000 AS createdAt
`

/** 后台用：带上「是否已认领」（有 owner_token）以及是否匿名 */
function toAdminBrag(row) {
  return {
    id: row.id,
    text: row.text,
    tag: row.tag,
    scene: row.scene,
    author: row.author ?? null,
    anonymous: !row.author,
    slaps: Number(row.slaps ?? 0),
    createdAt: Number(row.createdAt ?? Date.now()),
    seed: Number(row.is_seed) === 1,
    claimed: Boolean(row.owner_token),
  }
}

/** 概览数字：总数 / 投稿 / 今日新增 / 打嘴总量 / 今日与近 7 日打嘴 / 均量 */
export async function adminOverview() {
  const db = getPool()

  const [[row]] = await db.query(
    `SELECT
       COUNT(*)                                              AS total,
       SUM(CASE WHEN is_seed = 1 THEN 1 ELSE 0 END)          AS seeds,
       SUM(CASE WHEN is_seed = 0 THEN 1 ELSE 0 END)          AS posts,
       COALESCE(SUM(slaps), 0)                               AS slaps,
       SUM(CASE WHEN created_at >= CURDATE() THEN 1 ELSE 0 END) AS postsToday
     FROM brags`,
  )
  const [[today]] = await db.query(
    'SELECT COUNT(*) AS n FROM slap_log WHERE created_at >= CURDATE()',
  )
  const [[week]] = await db.query(
    `SELECT COUNT(*) AS n FROM slap_log WHERE created_at >= CURDATE() - INTERVAL 6 DAY`,
  )

  const total = Number(row.total ?? 0)
  const slaps = Number(row.slaps ?? 0)

  return {
    total,
    seeds: Number(row.seeds ?? 0),
    posts: Number(row.posts ?? 0),
    postsToday: Number(row.postsToday ?? 0),
    slaps,
    slapsToday: Number(today.n ?? 0),
    slapsWeek: Number(week.n ?? 0),
    slapsAvg: total ? Math.round((slaps / total) * 10) / 10 : 0,
  }
}

/** 归类分布 */
export async function adminTagBreakdown() {
  const db = getPool()
  const [rows] = await db.query(
    `SELECT tag, COUNT(*) AS count, COALESCE(SUM(slaps), 0) AS slaps
       FROM brags
      GROUP BY tag
      ORDER BY count DESC, tag ASC`,
  )
  return rows.map((row) => ({
    tag: row.tag,
    count: Number(row.count),
    slaps: Number(row.slaps),
  }))
}

/** 场合分布 Top N */
export async function adminSceneBreakdown(limit = 8) {
  const db = getPool()
  const n = Math.min(Math.max(Number(limit) || 8, 3), 20)
  const [rows] = await db.query(
    `SELECT scene, COUNT(*) AS count
       FROM brags
      GROUP BY scene
      ORDER BY count DESC, scene ASC
      LIMIT ${n}`,
  )
  return rows.map((row) => ({ scene: row.scene, count: Number(row.count) }))
}

/** 最近 N 天打嘴趋势（缺口补 0） */
export async function adminTrend(days = 14) {
  const db = getPool()
  const n = Math.min(Math.max(Number(days) || 14, 7), 60)

  const [rows] = await db.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS count
       FROM slap_log
      WHERE created_at >= CURDATE() - INTERVAL ${n - 1} DAY
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
  )
  const map = new Map(rows.map((row) => [String(row.day), Number(row.count)]))

  const out = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`
    out.push({
      day: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: map.get(key) ?? 0,
    })
  }
  return out
}

/** 最热语录 Top N */
export async function adminTopBrags(limit = 5) {
  const db = getPool()
  const n = Math.min(Math.max(Number(limit) || 5, 3), 20)
  const [rows] = await db.query(
    `SELECT ${ADMIN_COLUMNS} FROM brags ORDER BY slaps DESC, created_at DESC LIMIT ${n}`,
  )
  return rows.map(toAdminBrag)
}

/** 最新用户投稿 */
export async function adminRecentPosts(limit = 8) {
  const db = getPool()
  const n = Math.min(Math.max(Number(limit) || 8, 3), 30)
  const [rows] = await db.query(
    `SELECT ${ADMIN_COLUMNS} FROM brags WHERE is_seed = 0 ORDER BY created_at DESC LIMIT ${n}`,
  )
  return rows.map(toAdminBrag)
}

/** 语录列表：关键词 / 归类 / 来源筛选 + 分页 */
export async function adminListBrags({ q = '', tag = '', kind = '', page = 1, pageSize = 12 } = {}) {
  const db = getPool()

  const where = []
  const params = []
  if (typeof q === 'string' && q.trim()) {
    where.push('content LIKE ?')
    params.push(`%${q.trim()}%`)
  }
  if (typeof tag === 'string' && tag.trim()) {
    where.push('tag = ?')
    params.push(tag.trim())
  }
  if (kind === 'seed') where.push('is_seed = 1')
  if (kind === 'user') where.push('is_seed = 0')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const size = Math.min(Math.max(Number(pageSize) || 12, 5), 50)
  const [[countRow]] = await db.query(`SELECT COUNT(*) AS n FROM brags ${clause}`, params)
  const total = Number(countRow?.n ?? 0)
  const pages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(Number(page) || 1, 1), pages)
  const offset = (current - 1) * size

  const [rows] = await db.query(
    `SELECT ${ADMIN_COLUMNS} FROM brags ${clause}
      ORDER BY created_at DESC, id DESC
      LIMIT ${size} OFFSET ${offset}`,
    params,
  )

  return { items: rows.map(toAdminBrag), total, page: current, pageSize: size, pages }
}

/** 后台删除：内置语录也允许删 */
export async function adminDeleteBrag(id) {
  const db = getPool()
  const [result] = await db.query('DELETE FROM brags WHERE id = ?', [id])
  if (result.affectedRows === 0) return { ok: false, reason: 'not_found' }
  await db.query('DELETE FROM slap_log WHERE brag_id = ?', [id])
  return { ok: true }
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
