/**
 * Serverless 入口冒烟测试
 *
 *   node --env-file-if-exists=.env scripts/verify-serverless.mjs
 *
 * 直接把 api/[...path].mjs 的 default 导出挂在一个原生 http server 上，
 * 等价于 Vercel 调用 Function 的方式，用来验证：
 *   - Express app 以 app(req, res) 形式能正常工作
 *   - /api 前缀被剥掉时能自动补回
 *   - 完整增删改查链路可用
 * 不需要 Vercel 账号，本地即可跑。
 */

import http from 'node:http'
import { closePool } from '../server/db.mjs'

const handler = (await import('../api/[...path].mjs')).default

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
