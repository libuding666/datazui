/**
 * 端到端验证：页面交互 + MySQL 落库
 *
 *   node scripts/verify.mjs [url] [outDir]
 *
 * 除视觉与交互外，会直接查库确认：
 *   打嘴 → brags.slaps +1 且 slap_log 有新流水
 *   投稿 → brags 新增一行（is_seed=0，匿名 author NULL）
 *   删除 → 该行被移除
 */

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import mysql from 'mysql2/promise'
import { config, connSummary } from '../server/config.mjs'

const URL = process.argv[2] ?? 'http://127.0.0.1:4173/'
const OUT = process.argv[3] ?? '.shots'
mkdirSync(OUT, { recursive: true })

const problems = []
const ok = (m) => console.log(`  ✓ ${m}`)
const log = (m) => console.log(m)
const check = (cond, passMsg, failMsg) => {
  if (cond) ok(passMsg)
  else {
    problems.push(failMsg)
    console.log(`  ✗ ${failMsg}`)
  }
}

const db = await mysql.createConnection({
  ...config.db,
  charset: config.db.charset,
  // 连云数据库必须带上 TLS，否则读到的是另一个库却毫无报错
  ssl: config.dbSsl,
  connectTimeout: 15_000,
})

const countPosts = async () => {
  const [[row]] = await db.query('SELECT COUNT(*) AS n FROM brags WHERE is_seed = 0')
  return Number(row.n)
}
const getSlaps = async (id) => {
  const [[row]] = await db.query('SELECT slaps FROM brags WHERE id = ?', [id])
  return row ? Number(row.slaps) : null
}

log('\n▸ 起始状态')
log(`  核对数据库：${connSummary()}`)
const { total: total0, slaps: slaps0 } = (await (await fetch(`${URL}api/stats`)).json())
const posts0 = await countPosts()
log(`  brags 总数 ${total0}，打嘴累计 ${slaps0}，用户投稿 ${posts0}`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })

// ── 移动端：完整交互 + 落库校验 ─────────────────────────────────────────────

log('\n▸ 移动端 390×844')
const ctxMobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  locale: 'zh-CN',
})
const page = await ctxMobile.newPage()

page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[mobile] console.error: ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[mobile] pageerror: ${e.message}`))

await page.goto(URL, { waitUntil: 'load', timeout: 30_000 })
await page.waitForTimeout(1500)

const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? 0)
check(rootLen > 500, `页面渲染正常（#root ${rootLen} 字符）`, `页面疑似白屏（#root 仅 ${rootLen} 字符）`)

const cards = await page.locator('article').count()
check(cards === total0, `卡片数 ${cards} 与库中语录数一致`, `卡片数 ${cards} 与库中 ${total0} 不一致`)

// 离线提示不应出现
const offline = await page.getByText(/连不上|离线/).count()
check(offline === 0, '未出现离线提示（接口连通）', '页面出现离线提示，接口可能未连通')

await page.screenshot({ path: `${OUT}/mobile-01-top.png` })

// 打嘴 → 库中 +1
const firstCard = page.locator('article').first()
const firstId = await firstCard.getAttribute('data-brag-id')
const slapBtn = firstCard.getByRole('button', { name: /打他嘴/ })
const uiBefore = (await slapBtn.innerText()).trim()
const dbBefore = await getSlaps(firstId)
await slapBtn.click()
await slapBtn.click()
await slapBtn.click()
// TiDB 跨境写入有延迟，轮询等落库，不要死等固定时长
let dbAfter = dbBefore
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(500)
  dbAfter = await getSlaps(firstId)
  if (dbAfter - dbBefore >= 3) break
}
const uiAfter = (await slapBtn.innerText()).trim()
const delta = dbAfter - dbBefore
check(delta === 3, `打嘴 3 次 → 库中 ${firstId} 从 ${dbBefore} 增至 ${dbAfter}`, `打嘴未落库：${dbBefore} → ${dbAfter}（期望 +3）`)
const [[flow]] = await db.query(
  "SELECT COUNT(*) AS n FROM slap_log WHERE brag_id = ? AND created_at >= CURDATE()",
  [firstId],
)
check(Number(flow.n) >= 3, `slap_log 记录到 ${flow.n} 条今日流水`, `slap_log 流水缺失（${flow.n}）`)
check(uiBefore !== uiAfter, `按钮计数更新 ${uiBefore} → ${uiAfter}`, '按钮计数没有更新')
await page.screenshot({ path: `${OUT}/mobile-02-slap.png` })

// 横向溢出
const ov = await page.evaluate(() => ({
  w: document.documentElement.scrollWidth,
  c: document.documentElement.clientWidth,
}))
check(ov.w <= ov.c + 2, `无横向溢出（${ov.w}/${ov.c}）`, `横向溢出 ${ov.w} > ${ov.c}`)

// 投稿 → 入库
const TEXT = '我们这个方案，在业内已经是断层式领先了。'
await page.getByRole('button', { name: '补一句吹牛' }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/mobile-03-composer.png` })

await page.locator('textarea').first().fill(TEXT)
await page.getByRole('button', { name: '完全自研' }).click()
await page.getByRole('button', { name: '发布会', exact: true }).click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/mobile-04-composer-filled.png` })

await page.getByRole('button', { name: '发到墙上' }).click()
await page.waitForTimeout(1500)

const posts1 = await countPosts()
check(posts1 === posts0 + 1, `投稿已入库（用户投稿 ${posts0} → ${posts1}）`, `投稿未入库（${posts0} → ${posts1}）`)

const [rows] = await db.query(
  'SELECT id, content, tag, scene, author, is_seed FROM brags WHERE is_seed = 0 ORDER BY created_at DESC LIMIT 1',
)
const newRow = rows[0]
check(newRow?.content === TEXT, `库中内容正确：${newRow?.content}`, `库中内容不符：${newRow?.content}`)
check(newRow?.tag === '完全自研' && newRow?.scene === '发布会', `归类/场合正确（${newRow?.tag} / ${newRow?.scene}）`, `归类/场合不符（${newRow?.tag} / ${newRow?.scene}）`)
check(newRow?.author === null, '默认匿名（author 为 NULL）', `匿名失败，author=${newRow?.author}`)
check(Number(newRow?.is_seed) === 0, '标记为用户投稿（is_seed=0）', `is_seed 标记错误：${newRow?.is_seed}`)

const posted = await page.getByText(TEXT).first().isVisible().catch(() => false)
check(posted, '新语录已上墙显示', '提交后墙上没有看到新语录')
await page.screenshot({ path: `${OUT}/mobile-05-posted.png` })

// 删除自己的投稿 → 库中移除
const myCard = page.locator('article', { hasText: TEXT }).first()
await myCard.getByRole('button', { name: '删掉这条' }).click()
await page.waitForTimeout(1200)
const posts2 = await countPosts()
check(posts2 === posts0, `删除已同步到库（用户投稿回到 ${posts2}）`, `删除未同步（${posts2}）`)
await page.screenshot({ path: `${OUT}/mobile-06-deleted.png` })

// 昵称分支 + 深色
await page.getByRole('button', { name: '补一句吹牛' }).click()
await page.waitForTimeout(600)
await page.getByRole('switch').click()
await page.waitForTimeout(400)
const nick = await page.getByText('昵称').first().isVisible().catch(() => false)
check(nick, '关闭匿名后出现昵称输入', '关闭匿名后没有昵称输入')
await page.screenshot({ path: `${OUT}/mobile-07-nickname.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

await page.getByRole('button', { name: /切换到深色模式/ }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/mobile-08-dark.png` })
await page.screenshot({ path: `${OUT}/mobile-09-full.png`, fullPage: true })
await ctxMobile.close()

// ── 桌面端：仅视觉 ──────────────────────────────────────────────────────────

log('\n▸ 桌面端 1280×900')
const ctxDesktop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
})
const dpage = await ctxDesktop.newPage()
dpage.on('pageerror', (e) => problems.push(`[desktop] pageerror: ${e.message}`))
await dpage.goto(URL, { waitUntil: 'load', timeout: 30_000 })
await dpage.waitForTimeout(1500)

const dCards = await dpage.locator('article').count()
check(dCards === total0, `桌面端卡片数 ${dCards} 正确`, `桌面端卡片数 ${dCards} 异常`)
const dov = await dpage.evaluate(() => ({
  w: document.documentElement.scrollWidth,
  c: document.documentElement.clientWidth,
}))
check(dov.w <= dov.c + 2, `桌面端无横向溢出（${dov.w}/${dov.c}）`, `桌面端横向溢出 ${dov.w} > ${dov.c}`)
await dpage.screenshot({ path: `${OUT}/desktop-01-top.png` })
await dpage.screenshot({ path: `${OUT}/desktop-02-full.png`, fullPage: true })
await ctxDesktop.close()

await browser.close()

log('\n▸ 结束状态')
const stats2 = await (await fetch(`${URL}api/stats`)).json()
log(`  brags 总数 ${stats2.total}，打嘴累计 ${stats2.slaps}，今日打嘴 ${stats2.slapsToday}，用户投稿 ${stats2.posts}`)
await db.end()

log('')
if (problems.length) {
  console.log(`===== 发现 ${problems.length} 个问题 =====`)
  for (const p of problems) console.log('-', p)
  process.exitCode = 1
} else {
  console.log('✅ 全部通过')
}
