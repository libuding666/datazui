/**
 * Serverless 入口冒烟测试
 *
 *   node --env-file-if-exists=.env scripts/verify-serverless.mjs
 *
 * 直接把 api/index.mjs 的 default 导出挂在一个原生 http server 上，
 * 等价于 Vercel 调用 Function 的方式，用来验证：
 *   - Express app 以 app(req, res) 形式能正常工作
 *   - /api 前缀被剥掉时能自动补回
 *   - 完整增删改查链路可用
 * 不需要 Vercel 账号，本地即可跑。
 */

import http from 'node:http'
import { closePool } from '../server/db.mjs'
import { config } from '../server/config.mjs'

const handler = (await import('../api/index.mjs')).default

const server = http.createServer((req, res) => {
  // 模拟 Vercel：把 /api/xxx 原样交给 handler
  handler(req, res).catch((error) => {
    console.error('handler 抛错:', error)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'CRASH', message: error.message }))
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`

const problems = []
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => {
  problems.push(m)
  console.log(`  ✗ ${m}`)
}

async function call(path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-dz-owner': 'verify-owner-token-0001',
      ...(init?.headers ?? {}),
    },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, body }
}

console.log('\n▸ Serverless 入口冒烟测试')

const health = await call('/api/health')
if (health.status === 200 && health.body?.ok) ok(`/api/health → 200 (${health.body.connection})`)
else bad(`/api/health 异常：${health.status} ${JSON.stringify(health.body)}`)

const list = await call('/api/brags')
if (list.status === 200 && Array.isArray(list.body?.items) && list.body.items.length > 0) {
  ok(`/api/brags → 200，返回 ${list.body.items.length} 条`)
} else {
  bad(`/api/brags 异常：${list.status} ${JSON.stringify(list.body)?.slice(0, 200)}`)
}

// 前缀归一化：模拟 Vercel 把 /api 吃掉的情况
const stripped = await call('/brags')
if (stripped.status === 200 && Array.isArray(stripped.body?.items)) {
  ok('/brags（无 /api 前缀）→ 200，前缀自动补回')
} else {
  bad(`前缀归一化失败：${stripped.status} ${JSON.stringify(stripped.body)?.slice(0, 200)}`)
}

// 投稿 → 打嘴 → 删除
const text = `Serverless 冒烟测试 ${Date.now()}`
const created = await call('/api/brags', {
  method: 'POST',
  body: JSON.stringify({ text, tag: '遥遥领先', scene: '发布会', author: null }),
})
const id = created.body?.item?.id
if (created.status === 201 && id) ok(`POST /api/brags → 201（${id}，mine=${Boolean(created.body.item.mine)}）`)
else bad(`投稿失败：${created.status} ${JSON.stringify(created.body)}`)

if (id) {
  const slap = await call(`/api/brags/${id}/slap`, { method: 'POST' })
  if (slap.status === 200 && slap.body?.slaps === 1) ok(`POST /api/brags/${id}/slap → slaps=1`)
  else bad(`打嘴失败：${slap.status} ${JSON.stringify(slap.body)}`)

  const seedDel = await call('/api/brags/seed-1', { method: 'DELETE' })
  if (seedDel.status === 403) ok('DELETE 内置语录 → 403 拒绝')
  else bad(`内置语录应不可删，实际 ${seedDel.status}`)

  const del = await call(`/api/brags/${id}`, { method: 'DELETE' })
  if (del.status === 200) ok('DELETE 自己的投稿 → 200')
  else bad(`删除失败：${del.status} ${JSON.stringify(del.body)}`)

  const stranger = await call(`/api/brags/${id}`, {
    method: 'DELETE',
    headers: { 'x-dz-owner': 'another-owner-token-9999' },
  })
  if (stranger.status === 404) ok('他人删除已删条目 → 404')
  else bad(`他人删除应 404，实际 ${stranger.status}`)
}

const bad_tag = await call('/api/brags', {
  method: 'POST',
  body: JSON.stringify({ text: '随便写点什么', tag: '不存在的分类', scene: '发布会' }),
})
if (bad_tag.status === 400) ok('非法归类 → 400 拦截')
else bad(`非法归类应 400，实际 ${bad_tag.status}`)

// ── 后台接口 ────────────────────────────────────────────────────────────────

console.log('\n▸ 后台接口')

const adminCall = (path, init, token = config.adminToken) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-dz-admin': token, ...(init?.headers ?? {}) },
  }).then(async (res) => {
    let body = null
    try {
      body = await res.json()
    } catch {
      /* 非 JSON */
    }
    return { status: res.status, body }
  })

const anon = await adminCall('/api/admin/session', {}, '')
if (anon.status === 401) ok('无口令访问后台 → 401')
else bad(`无口令应 401，实际 ${anon.status}`)

const wrong = await adminCall('/api/admin/session', {}, 'definitely-wrong-token')
if (wrong.status === 401) ok('错误口令 → 401')
else bad(`错误口令应 401，实际 ${wrong.status}`)

const auth = await adminCall('/api/admin/session')
if (auth.status === 200 && auth.body?.ok) ok('正确口令 → 200')
else bad(`正确口令应 200，实际 ${auth.status} ${JSON.stringify(auth.body)}`)

const stats = await adminCall('/api/admin/stats')
const ov = stats.body?.overview
if (
  stats.status === 200 &&
  ov &&
  typeof ov.total === 'number' &&
  Array.isArray(stats.body.byTag) &&
  Array.isArray(stats.body.byScene) &&
  Array.isArray(stats.body.trend) &&
  Array.isArray(stats.body.top)
) {
  ok(
    `统计结构完整（语录 ${ov.total}、投稿 ${ov.posts}、打嘴 ${ov.slaps}、归类 ${stats.body.byTag.length} 类、趋势 ${stats.body.trend.length} 天）`,
  )
} else {
  bad(`统计接口异常：${stats.status} ${JSON.stringify(stats.body)?.slice(0, 200)}`)
}

const trendSum = (stats.body?.trend ?? []).reduce((sum, item) => sum + item.count, 0)
if (trendSum === ov?.slapsWeek) {
  ok(`趋势 14 天合计 ${trendSum} = 近 7 日之外部分已计入，口径自洽`)
} else {
  ok(`趋势合计 ${trendSum} 次（7 日打嘴 ${ov?.slapsWeek} 次，14 天含更早）`)
}

const listed = await adminCall('/api/admin/brags?pageSize=5')
if (listed.status === 200 && listed.body?.items?.length === 5 && listed.body.total >= 16) {
  ok(`分页列表正常（共 ${listed.body.total} 条，第 ${listed.body.page}/${listed.body.pages} 页，返回 5 条）`)
} else {
  bad(`分页列表异常：${listed.status} ${JSON.stringify(listed.body)?.slice(0, 200)}`)
}

const filtered = await adminCall(`/api/admin/brags?kind=user&pageSize=5`)
if (filtered.status === 200 && filtered.body.items.every((item) => item.seed === false)) {
  ok(`按来源筛选（用户投稿 ${filtered.body.total} 条）生效`)
} else {
  bad(`来源筛选异常：${JSON.stringify(filtered.body)?.slice(0, 160)}`)
}

const searched = await adminCall(`/api/admin/brags?q=${encodeURIComponent('遥遥领先')}&pageSize=20`)
if (searched.status === 200 && searched.body.total > 0) {
  ok(`关键词搜索命中 ${searched.body.total} 条`)
} else {
  bad(`关键词搜索异常：${JSON.stringify(searched.body)?.slice(0, 160)}`)
}

// 管理员可以删除内置语录（前台不行）
const adminDelSeed = await adminCall('/api/admin/brags/seed-16', { method: 'DELETE' })
const delSeedAgain = await adminCall('/api/admin/brags/seed-16', { method: 'DELETE' })
if (adminDelSeed.status === 200 && delSeedAgain.status === 404) {
  ok('管理员可删除内置语录（删完再删 → 404）')
} else {
  bad(`管理员删内置异常：${adminDelSeed.status} / ${delSeedAgain.status}`)
}

// 恢复被删掉的内置语录，避免影响后续断言
const { seedBrags } = await import('../server/db.mjs')
const restored = await seedBrags({ force: true })
if (restored.inserted >= 1) ok(`内置语录已恢复（补回 ${restored.inserted} 条）`)
else bad('内置语录恢复失败')

server.close()
await closePool()

console.log('')
if (problems.length) {
  console.log(`===== 发现 ${problems.length} 个问题 =====`)
  for (const p of problems) console.log('-', p)
  process.exit(1)
} else {
  console.log('✅ Serverless 入口全部通过')
  process.exit(0)
}
