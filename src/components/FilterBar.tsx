import { Clock, Filter, Flame, UserFilled } from '@appica/icons-react'
import { Chip } from '@appica/ui-react/chip'
import { Separator } from '@appica/ui-react/separator'
import { BRAG_TAGS, type BragTag } from '../data/brags'

export type SortKey = 'hot' | 'new'

type Props = {
  tag: BragTag | null
  onTag: (tag: BragTag | null) => void
  sort: SortKey
  onSort: (sort: SortKey) => void
  onlyMine: boolean
  onOnlyMine: (value: boolean) => void
  mineCount: number
}

export function FilterBar({ tag, onTag, sort, onSort, onlyMine, onOnlyMine, mineCount }: Props) {
  return (
    <div className="sticky top-14 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-4">
        <div className="dz-noscroll flex items-center gap-2 overflow-x-auto py-2.5">
          <Filter className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />

          <Chip variant={tag === null ? 'primary' : 'soft'} onClick={() => onTag(null)} className="shrink-0">
            全部
          </Chip>

          {BRAG_TAGS.map((item) => (
            <Chip
              key={item}
              variant={tag === item ? 'primary' : 'soft'}
              onClick={() => onTag(tag === item ? null : item)}
              className="shrink-0"
            >
              {item}
            </Chip>
          ))}

          {mineCount > 0 ? (
            <Chip
              variant={onlyMine ? 'primary' : 'outline'}
              onClick={() => onOnlyMine(!onlyMine)}
              className="shrink-0"
            >
              <UserFilled data-icon="start" />
              我发的 {mineCount}
            </Chip>
          ) : null}

          <Separator orientation="vertical" className="mx-1 h-5 shrink-0" />

          <Chip
            variant="outline"
            onClick={() => onSort(sort === 'hot' ? 'new' : 'hot')}
            className="shrink-0"
            aria-label={`当前按${sort === 'hot' ? '最热' : '最新'}排序，点击切换`}
          >
            {sort === 'hot' ? <Flame data-icon="start" /> : <Clock data-icon="start" />}
            {sort === 'hot' ? '最热' : '最新'}
          </Chip>
        </div>
      </div>
    </div>
  )
}
