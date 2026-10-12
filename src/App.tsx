import * as React from 'react'
import { Ghost, HandClick, InfoCircleFilled, Plus } from '@appica/icons-react'
import { BackgroundPattern } from '@appica/ui-react/background-pattern'
import { Button } from '@appica/ui-react/button'
import type { Brag, BragTag } from './data/brags'
import { compactNumber } from './lib/format'
import { useWall } from './lib/useWall'
import { BragCard } from './components/BragCard'
import { StackItem } from './components/CardStack'
import { Composer } from './components/Composer'
import { FilterBar, type SortKey } from './components/FilterBar'
import { Hero } from './components/Hero'
import { SiteHeader } from './components/SiteHeader'

export default function App() {
  const { brags, status, slap, publish, remove } = useWall()

  const [tag, setTag] = React.useState<BragTag | null>(null)
  const [sort, setSort] = React.useState<SortKey>('hot')
  const [onlyMine, setOnlyMine] = React.useState(false)
  const [composerOpen, setComposerOpen] = React.useState(false)

  const mineCount = React.useMemo(() => brags.filter((item) => item.mine).length, [brags])

  const visible = React.useMemo<Brag[]>(() => {
    const list = brags.filter((item) => {
      if (tag && item.tag !== tag) return false
      if (onlyMine && !item.mine) return false
      return true
    })

    return list.sort((a, b) =>
      sort === 'hot' ? b.slaps - a.slaps || b.createdAt - a.createdAt : b.createdAt - a.createdAt,
    )
  }, [brags, tag, onlyMine, sort])

  const maxSlaps = React.useMemo(() => Math.max(1, ...brags.map((item) => item.slaps)), [brags])
  const totalSlaps = React.useMemo(() => brags.reduce((sum, item) => sum + item.slaps, 0), [brags])

  return (
    <div id="top" className="relative min-h-dvh bg-background text-foreground">
      {/* 背景图案 */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          maskImage: 'radial-gradient(120% 70% at 50% 0%, #000 10%, transparent 78%)',
          WebkitMaskImage: 'radial-gradient(120% 70% at 50% 0%, #000 10%, transparent 78%)',
        }}
        aria-hidden="true"
      >
        <BackgroundPattern
          variant="grid"
          cellSize={30}
          className="h-full w-full opacity-60 [--pattern-color:var(--border-strong)]"
        />
      </div>

      <div className="relative z-10">
        <SiteHeader onCompose={() => setComposerOpen(true)} />

        {status === 'offline' ? <OfflineBar /> : null}

        <main className="mx-auto max-w-2xl px-4">
          <Hero total={brags.length} slapped={totalSlaps} onCompose={() => setComposerOpen(true)} />

          <div id="wall" className="scroll-mt-16" />

          <FilterBar
            tag={tag}
            onTag={setTag}
            sort={sort}
            onSort={setSort}
            onlyMine={onlyMine}
            onOnlyMine={setOnlyMine}
            mineCount={mineCount}
          />

          {/* 卡片堆叠墙：每张卡片滚动时钉住，后面的卡片像一副牌一样盖上来 */}
          <section className="py-5" aria-label="吹牛语录墙">
            {visible.length === 0 ? (
              <EmptyState
                onReset={() => {
                  setTag(null)
                  setOnlyMine(false)
                }}
                onCompose={() => setComposerOpen(true)}
              />
            ) : (
              visible.map((brag, index) => (
                <StackItem key={brag.id} index={index}>
                  <BragCard
                    brag={brag}
                    heat={brag.slaps / maxSlaps}
                    onSlap={slap}
                    onDelete={remove}
                  />
                </StackItem>
              ))
            )}
          </section>

          <footer className="border-t border-border py-8 pb-28 text-center sm:pb-12">
            <p className="text-xs leading-relaxed text-foreground-subtle">
              打他嘴 · 收录 {brags.length} 条吹牛，累计被打嘴{' '}
              <b className="font-bold tabular-nums text-foreground-muted">{compactNumber(totalSlaps)}</b> 次
            </p>
            <p className="mt-1.5 text-[11px] text-foreground-subtle">
              语录为网络语感戏仿，纯属玩笑，请勿对号入座。
            </p>
          </footer>
        </main>
      </div>

      {/* 移动端悬浮发布 */}
      <Button
        size="icon-lg"
        className="fixed right-4 z-40 size-14 rounded-full shadow-xl sm:hidden"
        style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        aria-label="补一句吹牛"
        onClick={() => setComposerOpen(true)}
      >
        <Plus className="size-6" />
      </Button>

      <Composer open={composerOpen} onOpenChange={setComposerOpen} onPublish={publish} />
    </div>
  )
}

/** 接口失联时的提示：打嘴与投稿会先留在本机，联网后刷新即可 */
function OfflineBar() {
  return (
    <div className="border-b border-border" style={{ background: 'var(--secondary-soft)' }}>
      <div
        className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-2 text-[12px] leading-snug font-medium"
        style={{ color: 'var(--secondary-intense)' }}
        role="status"
      >
        <InfoCircleFilled className="size-3.5 shrink-0" />
        <span>接口暂时连不上，正在展示本机缓存；打嘴和投稿会先存在本地，联网后刷新即可。</span>
      </div>
    </div>
  )
}

function EmptyState({ onReset, onCompose }: { onReset: () => void; onCompose: () => void }) {
  return (
    <div className="border-border bg-background-subtle flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      <span className="bg-background-muted text-foreground-subtle grid size-12 place-items-center rounded-full">
        <Ghost className="size-6" />
      </span>
      <p className="text-foreground-intense text-sm font-semibold">这一类暂时还没人吹</p>
      <p className="text-foreground-muted max-w-xs text-xs leading-relaxed">
        要么换个分类看看，要么你现在就吹一个——反正匿名，谁也不知道是你。
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <Button variant="soft" size="sm" onClick={onReset}>
          看全部
        </Button>
        <Button size="sm" onClick={onCompose}>
          <HandClick data-icon="start" />
          我来吹一个
        </Button>
      </div>
    </div>
  )
}
