import * as React from 'react'
import { CaretLeft, CaretRight, Refresh, Search, Trash, UserFilled, Wrench } from '@appica/icons-react'
import { Badge } from '@appica/ui-react/badge'
import { Button } from '@appica/ui-react/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@appica/ui-react/card'
import { Chip } from '@appica/ui-react/chip'
import { Input } from '@appica/ui-react/input'
import {
  Pagination,
  PaginationItem,
  PaginationLink,
  PaginationList,
} from '@appica/ui-react/pagination'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@appica/ui-react/table'
import { useToastManager } from '@appica/ui-react/toast'
import { BRAG_TAGS } from '../data/brags'
import { compactNumber, relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { TagIcon } from '../components/TagIcon'
import { AdminError, adminApi, type AdminBrag, type AdminList } from './api'

type Kind = '' | 'seed' | 'user'

const KINDS: { value: Kind; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'seed', label: '内置' },
  { value: 'user', label: '用户投稿' },
]

/** 生成分页页码，超过 7 页时折叠中间部分 */
function pageNumbers(current: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | 'gap')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(pages - 1, current + 1)
  if (start > 2) out.push('gap')
  for (let i = start; i <= end; i += 1) out.push(i)
  if (end < pages - 1) out.push('gap')
  out.push(pages)
  return out
}

export function BragManager({ onChanged }: { onChanged: () => void }) {
  const toast = useToastManager()

  const [q, setQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [tag, setTag] = React.useState('')
  const [kind, setKind] = React.useState<Kind>('')
  const [page, setPage] = React.useState(1)

  const [data, setData] = React.useState<AdminList | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [pendingDelete, setPendingDelete] = React.useState('')
  const [busyId, setBusyId] = React.useState('')
  const [reloadKey, setReloadKey] = React.useState(0)

  // 搜索防抖
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [q])

  // 条件变化回到第一页
  React.useEffect(() => {
    setPage(1)
  }, [debouncedQ, tag, kind])

  // 拉数据
  React.useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')

    adminApi
      .list({ q: debouncedQ, tag, kind, page, pageSize: 12 })
      .then((result) => {
        if (!alive) return
        setData(result)
        // 删除后当前页可能空了，自动回退一页
        if (result.items.length === 0 && result.page > 1) setPage(result.page - 1)
      })
      .catch((err) => {
        if (!alive) return
        setError((err as AdminError).message || '加载失败')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [debouncedQ, tag, kind, page, reloadKey])

  const refresh = () => setReloadKey((n) => n + 1)

  async function remove(brag: AdminBrag) {
    setBusyId(brag.id)
    try {
      await adminApi.remove(brag.id)
      toast.add({
        title: '已删除',
        description: brag.text.slice(0, 24),
      })
      setPendingDelete('')
      refresh()
      onChanged()
    } catch (err) {
      toast.add({ title: '删除失败', description: (err as AdminError).message })
    } finally {
      setBusyId('')
    }
  }

  const pages = data?.pages ?? 1
  const nums = pageNumbers(data?.page ?? 1, pages)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4 text-primary" />
              语录管理
            </CardTitle>
            <CardDescription>
              共 {data?.total ?? 0} 条
              {loading ? ' · 加载中…' : ''}
              {error ? ` · ${error}` : ''}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <Refresh data-icon="start" />
            刷新
          </Button>
        </div>
      </CardHeader>

      {/* 筛选 */}
      <div className="flex flex-col gap-3 px-6 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:w-64">
            <Input
              value={q}
              placeholder="搜原话关键词…"
              onChange={(event) => setQ(event.target.value)}
              startSlot={<Search />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map((item) => (
              <Chip
                key={item.value || 'all'}
                type="button"
                variant={kind === item.value ? 'secondary' : 'outline'}
                onClick={() => setKind(item.value)}
                className={cn(kind === item.value && 'font-semibold')}
              >
                {item.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip
            type="button"
            size="sm"
            variant={tag === '' ? 'primary' : 'soft'}
            onClick={() => setTag('')}
          >
            全部归类
          </Chip>
          {BRAG_TAGS.map((item) => (
            <Chip
              key={item}
              type="button"
              size="sm"
              variant={tag === item ? 'primary' : 'soft'}
              onClick={() => setTag(tag === item ? '' : item)}
            >
              <TagIcon tag={item} data-icon="start" />
              {item}
            </Chip>
          ))}
        </div>
      </div>

      {/* 表格 */}
      <div className="px-6">
        <Table>
          <TableCaption className="sr-only">吹牛语录管理列表</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>原话</TableHead>
              <TableHead>归类 / 场合</TableHead>
              <TableHead className="text-end">打嘴</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className="text-end">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.items ?? []).map((brag) => (
              <TableRow key={brag.id} data-brag-id={brag.id}>
                <TableCell className="max-w-[280px] min-w-[180px]">
                  <span className="line-clamp-2 text-[13px] font-medium text-foreground-intense">
                    {brag.text}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant="soft" size="sm">
                      <TagIcon tag={brag.tag as never} data-icon="start" />
                      {brag.tag}
                    </Badge>
                    <span className="text-[11px] text-foreground-subtle">{brag.scene}</span>
                  </div>
                </TableCell>
                <TableCell className="text-end text-[13px] font-bold tabular-nums text-primary-strong">
                  {compactNumber(brag.slaps)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <Badge variant={brag.seed ? 'outline' : 'primary-outline'} size="sm">
                      {brag.seed ? '内置' : '投稿'}
                    </Badge>
                    <span className="text-[11px] text-foreground-subtle">
                      {brag.anonymous ? '匿名' : brag.author}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-[11px] whitespace-nowrap text-foreground-subtle">
                  {relativeTime(brag.createdAt)}
                </TableCell>
                <TableCell className="text-end">
                  {pendingDelete === brag.id ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPendingDelete('')}
                        disabled={busyId === brag.id}
                      >
                        取消
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        data-testid="confirm-delete"
                        onClick={() => void remove(brag)}
                        disabled={busyId === brag.id}
                      >
                        {busyId === brag.id ? '删除中…' : '确认删除'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-foreground-subtle hover:text-error-emphasis"
                      aria-label={`删除：${brag.text.slice(0, 16)}`}
                      onClick={() => setPendingDelete(brag.id)}
                    >
                      <Trash />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {!loading && (data?.items.length ?? 0) === 0 ? (
          <p className="py-10 text-center text-xs text-foreground-subtle">
            没有符合条件的语录
          </p>
        ) : null}
      </div>

      {/* 分页 */}
      {pages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4 pb-6">
          <span className="text-[11px] text-foreground-subtle">
            第 {data?.page ?? 1} / {pages} 页
          </span>
          <Pagination>
            <PaginationList>
              <PaginationItem>
                <PaginationLink
                  href="#!"
                  aria-label="上一页"
                  className="px-0"
                  disabled={(data?.page ?? 1) <= 1}
                  onClick={(event) => {
                    event.preventDefault()
                    setPage((p) => Math.max(1, p - 1))
                  }}
                >
                  <CaretLeft />
                </PaginationLink>
              </PaginationItem>

              {nums.map((item, index) =>
                item === 'gap' ? (
                  <PaginationItem key={`gap-${index}`}>
                    <span className="px-2 text-foreground-subtle">…</span>
                  </PaginationItem>
                ) : (
                  <PaginationItem key={item}>
                    <PaginationLink
                      href="#!"
                      active={item === (data?.page ?? 1)}
                      onClick={(event) => {
                        event.preventDefault()
                        setPage(item)
                      }}
                    >
                      {item}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationLink
                  href="#!"
                  aria-label="下一页"
                  className="px-0"
                  disabled={(data?.page ?? 1) >= pages}
                  onClick={(event) => {
                    event.preventDefault()
                    setPage((p) => Math.min(pages, p + 1))
                  }}
                >
                  <CaretRight />
                </PaginationLink>
              </PaginationItem>
            </PaginationList>
          </Pagination>
        </div>
      ) : (
        <div className="pb-6" />
      )}

      <div className="flex items-center gap-1.5 px-6 pb-6 text-[11px] text-foreground-subtle">
        <UserFilled className="size-3.5" />
        后台可删除任何语录，包括内置的；前台访客只能删自己投稿的那条。
      </div>
    </Card>
  )
}
