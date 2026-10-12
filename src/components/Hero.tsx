import { Button } from '@appica/ui-react/button'
import { Badge } from '@appica/ui-react/badge'
import { Flame, HandClick } from '@appica/icons-react'

type Props = {
  total: number
  slapped: number
  onCompose: () => void
}

export function Hero({ total, slapped, onCompose }: Props) {
  return (
    <section className="relative pt-8 pb-5 sm:pt-12">
      <Badge variant="primary-outline" className="mb-4">
        <Flame data-icon="start" />
        今日全网吹牛浓度超标
      </Badge>

      <h1 className="dz-display text-[2rem] text-foreground-intense sm:text-[3rem]">
        这年头，
        <span className="relative inline-block text-primary">
          啥都遥遥领先
          <svg
            aria-hidden="true"
            viewBox="0 0 200 10"
            preserveAspectRatio="none"
            className="absolute -bottom-1 left-0 h-2 w-full text-primary/45"
          >
            <path
              d="M2 7 C 46 2, 92 9, 138 4 S 186 6, 198 3"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </h1>

      <p className="mt-4 max-w-lg text-sm leading-relaxed text-foreground-muted sm:text-[15px]">
        发布会、直播间、朋友圈、融资路演——人人都领先，行行都第一。
        这是一面吹牛语录墙：看见吹上头的，上去<b className="font-bold text-foreground-strong">打一嘴</b>
        ；刚听到新的，就<b className="font-bold text-foreground-strong">匿名补一句</b>。
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-foreground-subtle">
        <span>
          已收录 <b className="text-sm font-black tabular-nums text-foreground-strong">{total}</b> 条吹牛
        </span>
        <span>
          累计打嘴 <b className="text-sm font-black tabular-nums text-primary">{slapped}</b> 次
        </span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2.5">
        <Button size="lg" onClick={onCompose} className="w-full sm:w-auto">
          <HandClick data-icon="start" />
          我也来补一句
        </Button>
        <Button variant="outline" size="lg" render={<a href="#wall" />} className="w-full sm:w-auto">
          先看看墙
        </Button>
      </div>
    </section>
  )
}
