/**
 * 数据库初始化脚本
 *
 *   npm run db:init
 *
 * 建库 → 建表 → 同步内置语录（幂等，可反复执行）。
 */

import { initDatabase, listBrags, stats, closePool, explainDbError } from '../server/db.mjs'
import { connSummary } from '../server/config.mjs'

async function main() {
  console.log(`\n▸ 连接 ${connSummary()}`)

  const result = await initDatabase({ verbose: true, force: true })

  const overview = await stats()
  const items = await listBrags(null)

  console.log('\n▸ brags 表内容')
  console.table(
    items
      .slice()
      .sort((a, b) => b.slaps - a.slaps)
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        tag: item.tag,
        scene: item.scene,
        打嘴: item.slaps,
        类型: item.seed ? '内置' : '投稿',
        原话: item.text.length > 18 ? `${item.text.slice(0, 18)}…` : item.text,
      })),
  )

  console.log('\n▸ 汇总')
  console.log(`   语录总数 ${overview.total}（内置 ${overview.seeds} / 投稿 ${overview.posts}）`)
  console.log(`   累计打嘴 ${overview.slaps} 次，今日 ${overview.slapsToday} 次`)
  console.log(`   本次同步：新增 ${result.inserted} 条，更新 ${result.updated} 条\n`)

  await closePool()
}

main().catch(async (error) => {
  console.error('\n✗ 初始化失败：', error.message)
  const hint = explainDbError(error)
  console.error(`  连接目标：${connSummary()}`)
  console.error(`  ${hint || '请确认数据库已启动，且账号密码与 .env 一致。'}\n`)
  await closePool().catch(() => {})
  process.exit(1)
})
