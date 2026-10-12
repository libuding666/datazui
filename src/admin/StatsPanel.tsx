import * as React from 'react'
import {
  ChartBar,
  ChartDonut,
  ChartLine,
  Clock,
  Flame,
  Gauge,
  HandClick,
  Mask,
  Trophy,
  Users,
} from '@appica/icons-react'
import { Badge } from '@appica/ui-react/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@appica/ui-react/card'
import { Separator } from '@appica/ui-react/separator'
import { Sparkline, SparklineChart } from '@appica/ui-react/sparkline'
import { TagIcon } from '../components/TagIcon'
import { compactNumber, relativeTime } from '../lib/format'
import type { AdminBrag, AdminStats } from './api'

// ── 统计卡 ──────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-background-subtle p-3.5">
      <div className="flex items-center gap-1.5 text-foreground-subtle">
        <span className="[&>svg]:size-3.5">{icon}</span>
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className="mt-2 text-2xl leading-none font-black tabular-nums text-foreground-intense">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-[11px] text-foreground-subtle">{hint}</div> : null}
    </div>
  )
}

// ── 横向条形 ────────────────────────────────────────────────────────────────

function BarRows({
  rows,
}: {
  rows: { key: string; label: string; count: number; icon?: React.ReactNode }[]
}) {
  const max = Math.max(1, ...rows.map((row) => row.count))

  if (!rows.length) {
    return <p className="py-6 text-center text-xs text-foreground-subtle">暂无数据</p>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="flex w-24 shrink-0 items-center gap-1.5 truncate text-xs text-foreground-muted">
            <span className="[&>svg]:size-3.5">{row.icon}</span>
            <span className="truncate">{row.label}</span>
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-background-muted">
            <span
              className="block h-full rounded-full bg-primary/70"
              style={{ width: `${Math.max(4, Math.round((row.count / max) * 100))}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-end text-xs font-semibold tabular-nums text-foreground-intense">
            {row.count}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── 榜单行 ──────────────────────────────────────────────────────────────────

function RankRow({ rank, brag }: { rank: number; brag: AdminBrag }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span
        className={
          rank <= 3
            ? 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-black text-primary-foreground'
            : 'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-background-muted text-[11px] font-bold text-foreground-muted'
        }
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug font-semibold text-foreground-intense">
          {brag.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-foreground-subtle">
          <Badge variant="soft" size="sm">
            <TagIcon tag={brag.tag as never} data-icon="start" />
            {brag.tag}
          </Badge>
          <span>{brag.scene}</span>
          <span>·</span>
          <span>{relativeTime(brag.createdAt)}</span>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[12px] font-bold tabular-nums text-primary-strong">
        <HandClick className="size-3.5" />
        {compactNumber(brag.slaps)}
      </span>
    </div>
  )
}

// ── 主面板 ──────────────────────────────────────────────────────────────────

export function StatsPanel({ stats }: { stats: AdminStats }) {
  const { overview: o, byTag, byScene, trend, top } = stats

  const trendTotal = trend.reduce((sum, item) => sum + item.count, 0)
  const peak = trend.reduce((best, item) => (item.count > best.count ? item : best), trend[0])
  const activeDays = trend.filter((item) => item.count > 0).length

  return (
    <div className="flex flex-col gap-4">
      {/* 概览 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={<ChartBar />}
          label="语录总数"
          value={String(o.total)}
          hint={`内置 ${o.seeds} · 投稿 ${o.posts}`}
        />
        <StatCard
          icon={<Users />}
          label="用户投稿"
          value={String(o.posts)}
          hint={o.postsToday > 0 ? `今日新增 ${o.postsToday}` : '今日暂无新增'}
        />
        <StatCard
          icon={<HandClick />}
          label="累计打嘴"
          value={compactNumber(o.slaps)}
          hint={`今日 ${o.slapsToday}`}
        />
        <StatCard
          icon={<Gauge />}
          label="近 7 日打嘴"
          value={compactNumber(o.slapsWeek)}
          hint={`日均 ${Math.round(o.slapsWeek / 7)}`}
        />
        <StatCard
          icon={<Flame />}
          label="单条均量"
          value={String(o.slapsAvg)}
          hint="被打嘴次数 / 条"
        />
        <StatCard
          icon={<Trophy />}
          label="最热一条"
          value={top[0] ? compactNumber(top[0].slaps) : '—'}
          hint={top[0] ? top[0].tag : '暂无'}
        />
      </div>

      {/* 趋势 */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ChartLine className="size-4 text-primary" />
                近 14 天打嘴趋势
              </CardTitle>
              <CardDescription>
                共 {trendTotal} 次，峰值 {peak?.label ?? '—'}（{peak?.count ?? 0} 次），有记录 {activeDays} 天
              </CardDescription>
            </div>
            <div className="text-end">
              <div className="text-[11px] text-foreground-subtle">今日</div>
              <div className="text-xl font-black tabular-nums text-primary">
                {o.slapsToday}
              </div>
            </div>
          </div>
        </CardHeader>

        <div className="px-6 pb-5">
          <Sparkline
            data={trend.map((item) => item.count)}
            color="var(--primary)"
            className="w-full"
          >
            <SparklineChart
              variant="column"
              height={96}
              tooltip
              aria-label={`近 14 天打嘴趋势，共 ${trendTotal} 次`}
            />
          </Sparkline>
          <div className="mt-2 flex justify-between text-[10px] tabular-nums text-foreground-subtle">
            <span>{trend[0]?.label}</span>
            <span>{trend[Math.floor(trend.length / 2)]?.label}</span>
            <span>{trend[trend.length - 1]?.label}</span>
          </div>
        </div>
      </Card>

      {/* 分布 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartDonut className="size-4 text-primary" />
              归类分布
            </CardTitle>
            <CardDescription>哪一类吹牛最多</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <BarRows
              rows={byTag.map((item) => ({
                key: item.tag,
                label: item.tag,
                count: item.count,
                icon: <TagIcon tag={item.tag as never} />,
              }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mask className="size-4 text-primary" />
              场合分布
            </CardTitle>
            <CardDescription>这些话都是在哪儿吹的</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <BarRows
              rows={byScene.map((item) => ({
                key: item.scene,
                label: item.scene,
                count: item.count,
              }))}
            />
          </div>
        </Card>
      </div>

      {/* 最热榜 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-primary" />
            最热语录 Top 5
          </CardTitle>
          <CardDescription>被打嘴最多的五条</CardDescription>
        </CardHeader>
        <div className="px-6 pb-4">
          {top.length === 0 ? (
            <p className="py-6 text-center text-xs text-foreground-subtle">暂无数据</p>
          ) : (
            top.map((brag, index) => (
              <React.Fragment key={brag.id}>
                {index > 0 ? <Separator /> : null}
                <RankRow rank={index + 1} brag={brag} />
              </React.Fragment>
            ))
          )}
        </div>
      </Card>

      {/* 最新投稿 */}
      {stats.recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-primary" />
              最新投稿
            </CardTitle>
            <CardDescription>最近 6 条用户投稿</CardDescription>
          </CardHeader>
          <div className="px-6 pb-4">
            {stats.recent.map((brag, index) => (
              <React.Fragment key={brag.id}>
                {index > 0 ? <Separator /> : null}
                <RankRow rank={index + 1} brag={brag} />
              </React.Fragment>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
