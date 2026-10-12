/**
 * 本地模拟 Vercel rewrite 行为，验证 api/index.mjs 的路径还原逻辑
 *   node --env-file-if-exists=.env scripts/verify-api-index.mjs
 * 用完即删（或留作回归），不进 package.json。
 */
import http from 'node:http'
import handler from '../api/index.mjs'
import { config } from '../server/config.mjs'

const server = http.createServer((req, res) => handler(req, res))
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const problems = []
const check = (cond, pass, fail) => console.log(`  ${cond ? '✓' : '✗'} ${cond ? pass : fail}`) || (!cond && problems.push(fail))

// 1. rewrite 形态：多段路径 + 附加查询参数
const r1 = await fetch(`${base}/api/index?path=admin/session`, {
  headers: { 'x-dz-admin': 'wrong-token' },
}).then((r) => r.json())
check(r1?.error === 'UNAUTHORIZED', '多段路径 /api/admin/session 经 path 参数还原成功（401 鉴权拦截）', `还原失败: ${JSON.stringify(r1)}`)

// 2. 多段路径 + 原始查询参数保留（admin/brags 分页 + 搜索）
const r2 = await fetch(`${base}/api/index?path=admin/brags&page=1&pageSize=3&q=${encodeURIComponent('遥遥领先')}`, {
  headers: { 'x-dz-admin': config.adminToken },
}).then((r) => r.json())
check(r2?.items?.length > 0 && r2?.total > 0, '多段路径 /api/admin/brags 的分页与搜索查询参数完整保留', `参数丢失: ${JSON.stringify(r2).slice(0, 120)}`)

// 3. 单段路径 + 查询参数
const r3 = await fetch(`${base}/api/index?path=brags&limit=1`).then((r) => r.json())
check(Array.isArray(r3?.items) && r3.items.length > 0, '单段路径 /api/brags 正常', `失败: ${JSON.stringify(r3).slice(0, 120)}`)

// 4. 兜底形态：直接访问 /api/index（无 path 参数）→ 归一化后应得到 JSON 404
const r4 = await fetch(`${base}/api/index`).then((r) => r.json())
check(r4?.error === 'NOT_FOUND', '直接访问 /api/index 走兜底归一化（返回业务 404）', `失败: ${JSON.stringify(r4)}`)

// 5. 打嘴接口（POST 多段路径）
const r5 = await fetch(`${base}/api/index?path=brags/seed-1/slap`, { method: 'POST' }).then((r) => r.json())
check(typeof r5?.slaps === 'number' && r5?.slaps > 0, 'POST 多段路径 /api/brags/:id/slap 正常（打嘴数已 +1）', `失败: ${JSON.stringify(r5)}`)

server.close()
if (problems.length) {
  console.log(`\n✗ ${problems.length} 个问题`)
  process.exit(1)
}
console.log('\n✅ api/index.mjs 路径还原全部通过')
process.exit(0)
