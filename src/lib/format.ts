/** 相对时间：刚刚 / 12 分钟前 / 3 小时前 / 2 天前 / 月-日 */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`

  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`

  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`

  const date = new Date(ts)
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

/** 3268 → 3.2k */
export function compactNumber(value: number): string {
  if (value < 1000) return String(value)
  if (value < 10_000) return `${(value / 1000).toFixed(1)}k`
  return `${Math.round(value / 1000)}k`
}

/** 根据打嘴次数给出「吹牛指数」0-100 */
export function bullIndex(slaps: number): number {
  return Math.min(100, Math.round((Math.log10(slaps + 1) / Math.log10(601)) * 100))
}
