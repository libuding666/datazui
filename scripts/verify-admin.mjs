/**
 * 后台管理端到端验证
 *
 *   npm run verify:admin
 *
 * 覆盖：登录拦截 → 错误口令 → 正确口令 → 统计渲染 → 搜索 → 后台删除落库
 */

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'
import mysql from 'mysql2/promise'
import { config, connSummary } from '../server/config.mjs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const OUT = process.argv[3] ?? '.shots-admin'
mkdirSync(OUT, { recursive: true })

const TOKEN = config.adminToken
const problems = []
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => {
  problems.push(m)
  console.log(`  ✗ ${m}`)
}
const check = (cond, pass, fail) => (cond ? ok(pass) : bad(fail))
const log = (m) => console.log(m)

if (!TOKEN) {
  console.error('✗ 没有配置 DZ_ADMIN_TOKEN，无法验证后台。请在 .env 里设置后重试。')
  process.exit(1)
}

const db = await mysql.createConnection({
  ...config.db,
  charset: config.db.charset,
  ssl: config.dbSsl,
  connectTimeout: 15_000,
})

const countRows = async (id) => {
  const [[row]] = await db.query('SELECT COUNT(*) AS n FROM brags WHERE id = ?', [id])
  return Number(row.n)
}

/** 每个视口造一条独立的测试投稿，方便各自验证删除 */
async function seedTestPost(suffix) {
  const text = `后台验证用投稿 ${suffix} ${Date.now()}`
  const res = await fetch(`${BASE}/api/brags`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dz-owner': 'admin-verify-owner-0001' },
    body: JSON.stringify({ text, tag: '友商不行', scene: '直播间', author: null }),
  }).then((r) => r.json())
  return { text, id: res?.item?.id }
}

log(`\n▸ 目标数据库：${connSummary()}`)

const browser = await chromium.launch({ channel: 'msedge', headless: true })

async function run(name, viewport, isMobile) {
  log(`\n▸ ${name} ${viewport.width}×${viewport.height}`)

  const { text: TEXT, id: newId } = await seedTestPost(name)
  check(Boolean(newId), `已造出测试投稿（${newId}）`, '测试投稿创建失败')
  if (!newId) return

  const ctx = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 2,
    locale: 'zh-CN',
  })
  const page = await ctx.newPage()

  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // 错误口令步骤会触发一次 401 请求，浏览器必然记录 console 错误，属预期行为
    if (/status of 401/.test(m.text())) return
    problems.push(`[${name}] console.error: ${m.text()}`)
  })
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`))

  await page.goto(`${BASE}/admin`, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForTimeout(1200)

  // 1. 未登录 → 登录页
  const loginVisible = await page
    .getByText('输入管理口令')
    .first()
    .isVisible()
    .catch(() => false)
  check(loginVisible, '未登录时展示登录页', '没有出现登录页')
  await page.screenshot({ path: `${OUT}/${name}-01-login.png` })

  // 2. 错误口令
  await page.locator('input[type="password"]').first().fill('definitely-wrong')
  await page.getByRole('button', { name: '进入后台' }).click()
  await page.waitForTimeout(1200)
  const stillLogin = await page
    .getByText('输入管理口令')
    .first()
    .isVisible()
    .catch(() => false)
  check(stillLogin, '错误口令被拒绝，仍停留在登录页', '错误口令竟然进去了')
  await page.screenshot({ path: `${OUT}/${name}-02-wrong.png` })

  // 3. 正确口令
  await page.locator('input[type="password"]').first().fill(TOKEN)
  await page.getByRole('button', { name: '进入后台' }).click()
  await page.waitForTimeout(2000)

  const dashVisible = await page
    .getByText('语录管理')
    .first()
    .isVisible()
    .catch(() => false)
  check(dashVisible, '正确口令进入后台', '正确口令没有进入后台')

  // 4. 统计区块
  for (const label of [
    '语录总数',
    '用户投稿',
    '累计打嘴',
    '近 7 日打嘴',
    '单条均量',
    '最热一条',
    '近 14 天打嘴趋势',
    '归类分布',
    '场合分布',
    '最热语录 Top 5',
  ]) {
    const visible = await page
      .getByText(label, { exact: false })
      .first()
      .isVisible()
      .catch(() => false)
    check(visible, `统计区块「${label}」已渲染`, `统计区块「${label}」缺失`)
  }

  // 趋势图有 SVG 柱子
  const svgCount = await page.locator('svg').count()
  check(svgCount > 0, `页面渲染了 ${svgCount} 个 SVG 图形`, '页面没有 SVG 图形')

  // 概览数字与库一致
  const [[dbCount]] = await db.query('SELECT COUNT(*) AS n FROM brags')
  const headerText = await page
    .locator('header')
    .innerText()
    .catch(() => '')
  check(
    headerText.includes(String(Number(dbCount.n))),
    `顶栏统计与库一致（${Number(dbCount.n)} 条）`,
    `顶栏统计与库不一致：${headerText.replace(/\n/g, ' ')}`,
  )

  await page.screenshot({ path: `${OUT}/${name}-03-dashboard.png` })
  await page.screenshot({ path: `${OUT}/${name}-04-dashboard-full.png`, fullPage: true })

  // 5. 搜索
  await page.getByPlaceholder('搜原话关键词…').first().fill(TEXT.slice(0, 12))
  await page.waitForTimeout(1400)
  const hitRows = await page.locator('tbody tr').count()
  check(hitRows === 1, `搜索命中 1 行`, `搜索命中 ${hitRows} 行，期望 1 行`)
  const hitText = await page.locator('tbody tr').first().innerText()
  check(hitText.includes('后台验证用投稿'), '搜索结果内容正确', `搜索结果不对：${hitText.slice(0, 40)}`)
  await page.screenshot({ path: `${OUT}/${name}-05-search.png` })

  // 6. 后台删除（两步确认）
  await page.locator('tbody tr').first().getByRole('button', { name: /^删除：/ }).click()
  await page.waitForTimeout(400)
  const confirmBtn = page.getByTestId('confirm-delete')
  check(await confirmBtn.isVisible(), '出现二次确认按钮', '没有出现二次确认')
  await page.screenshot({ path: `${OUT}/${name}-06-confirm.png` })

  await confirmBtn.click()
  await page.waitForTimeout(1800)

  const remain = await countRows(newId)
  check(remain === 0, `后台删除已落库（${newId} 已不存在）`, `删除未落库，仍能查到 ${newId}`)

  // 删除成功的 Toast 里带原文，不能全页找文本；只看表格行数
  const rowsAfter = await page.locator('tbody tr').count()
  check(rowsAfter === 0, '列表里已看不到该条（表格 0 行）', `删除后表格还有 ${rowsAfter} 行`)
  await page.screenshot({ path: `${OUT}/${name}-07-deleted.png` })

  // 7. 退出登录
  const logout = page.getByRole('button', { name: '退出' })
  if (await logout.isVisible().catch(() => false)) {
    await logout.click()
    await page.waitForTimeout(1000)
    const backToLogin = await page
      .getByText('输入管理口令')
      .first()
      .isVisible()
      .catch(() => false)
    check(backToLogin, '退出后回到登录页', '退出后没有回到登录页')
  }

  await ctx.close()
}

await run('desktop', { width: 1440, height: 900 }, false)
await run('mobile', { width: 390, height: 844 }, true)

await browser.close()
await db.end()

log('')
if (problems.length) {
  console.log(`===== 发现 ${problems.length} 个问题 =====`)
  for (const p of problems) console.log('-', p)
  process.exit(1)
} else {
  console.log('✅ 后台验证全部通过')
  process.exit(0)
}
