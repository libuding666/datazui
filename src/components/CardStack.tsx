import * as React from 'react'
import { cn } from '../lib/cn'

/**
 * 语录墙的卡片堆叠容器
 *
 * 每张卡片 position: sticky 钉在头部下方，并按层深逐级下移一点，
 * 后一张卡片滑上来盖住前一张——像一副牌。被盖住的卡片轻微缩小、
 * 变暗（is-covered），顶边露出一层层牌边，形成「堆叠」的层次感。
 *
 * 覆盖判定：下一张卡片的顶边已经到达自己的钉住线，即说明自己被压住了。
 */

/** 最多保留几层错位（再深就统一钉在同一高度，避免堆出屏） */
const MAX_STEPS = 4

export function StackItem({ index, children }: { index: number; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [covered, setCovered] = React.useState(false)

  React.useEffect(() => {
    let raf = 0

    const update = () => {
      raf = 0
      const el = ref.current
      if (!el) return
      const next = el.nextElementSibling
      if (!next) {
        setCovered(false)
        return
      }
      // computed top 就是钉住线（sticky 不改变 top 的计算值）
      const pinTop = Number.parseFloat(getComputedStyle(el).top) || 0
      setCovered(next.getBoundingClientRect().top <= pinTop + 4)
    }

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [index])

  return (
    <div
      ref={ref}
      className="dz-stack-item"
      style={{
        top: `calc(var(--dz-stack-top) + ${Math.min(index, MAX_STEPS)} * var(--dz-stack-step))`,
        zIndex: index + 1,
      }}
    >
      <div className={cn('dz-stack-card', covered && 'is-covered')}>{children}</div>
    </div>
  )
}
