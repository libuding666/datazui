import * as React from 'react'
import { Flame, Quote, X } from '@appica/icons-react'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import { Separator } from '@appica/ui-react/separator'
import type { Brag } from '../data/brags'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { SlapButton } from './SlapButton'
import { TagIcon } from './TagIcon'

type Props = {
  brag: Brag
  /** 相对热度 0~1，用于顶部进度条 */
  heat: number
  onSlap: (id: string) => void
  onDelete?: (id: string) => void
}

function heatLabel(slaps: number): { text: string; variant: 'warning' | 'primary-outline' } | null {
  if (slaps >= 450) return { text: '炸了', variant: 'warning' }
  if (slaps >= 300) return { text: '很热', variant: 'primary-outline' }
  return null
}

export function BragCard({ brag, heat, onSlap, onDelete }: Props) {
  const [shaking, setShaking] = React.useState(false)

  const handleSlap = React.useCallback(() => {
    onSlap(brag.id)
    setShaking(false)
    window.requestAnimationFrame(() => setShaking(true))
    window.setTimeout(() => setShaking(false), 480)
  }, [brag.id, onSlap])

  const tier = heatLabel(brag.slaps)
  const anonymous = !brag.author

  return (
    <article
      data-brag-id={brag.id}
      className={cn(
        'dz-slide-up group relative overflow-hidden rounded-2xl border border-border bg-background-subtle',
        'transition-shadow duration-300 hover:border-border-strong hover:shadow-lg',
        shaking && 'dz-shake',
      )}
    >
      {/* 热度条 */}
      <div className="absolute inset-x-0 top-0 h-[3px] bg-border-muted" aria-hidden="true">
        <div
          className="h-full bg-linear-to-r from-primary-muted to-primary transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(6, Math.round(heat * 100))}%` }}
        />
      </div>

      <Quote
        aria-hidden="true"
        className="pointer-events-none absolute top-5 right-3 size-9 text-primary/15"
      />

      <div className="px-4 pt-6 pb-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="soft">
            <TagIcon tag={brag.tag} data-icon="start" />
            {brag.tag}
          </Badge>
          <span className="text-[11px] text-foreground-subtle">{brag.scene}</span>

          {tier ? (
            <Badge variant={tier.variant} size="sm">
              <Flame data-icon="start" />
              {tier.text}
            </Badge>
          ) : null}

          {brag.mine ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-foreground-subtle hover:text-error-emphasis"
              aria-label="删掉这条"
              onClick={() => onDelete?.(brag.id)}
            >
              <X />
            </Button>
          ) : null}
        </div>

        <p className="mt-3.5 text-[16.5px] leading-[1.6] font-semibold text-foreground-intense sm:text-[17.5px]">
          {brag.text}
        </p>

        <Separator className="my-4" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                anonymous
                  ? 'border border-border bg-background-muted text-foreground-subtle'
                  : 'bg-secondary text-secondary-foreground',
              )}
              aria-hidden="true"
            >
              {anonymous ? '匿' : brag.author!.slice(0, 1)}
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[12.5px] font-medium text-foreground-muted">
                {anonymous ? '匿名网友' : brag.author}
              </div>
              <div className="text-[11px] text-foreground-subtle">{relativeTime(brag.createdAt)}</div>
            </div>
          </div>

          <SlapButton count={brag.slaps} onSlap={handleSlap} />
        </div>
      </div>
    </article>
  )
}
