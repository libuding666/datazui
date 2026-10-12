/** 堆叠效果截图：滚动到几个位置截屏，人工核对牌面层次 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173'
const OUT = process.argv[3] ?? '.shots-stack'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })

for (const [name, viewport, isMobile] of [
  ['desktop', { width: 1440, height: 900 }, false],
  ['mobile', { width: 390, height: 844 }, true],
]) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, locale: 'zh-CN' })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForTimeout(1500)

  // 滚到第 3、5 张卡的位置，让堆叠发生
  for (const step of [0, 1, 2]) {
    const tops = await page.evaluate(() =>
      [...document.querySelectorAll('.dz-stack-item')].map((el) => el.getBoundingClientRect().top + window.scrollY),
    )
    const target = tops[Math.min(2 + step * 2, tops.length - 1)] - 90
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), target)
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${OUT}/${name}-stack-${step}.png` })
  }
  await ctx.close()
  console.log(`✓ ${name} 截图完成`)
}

await browser.close()
