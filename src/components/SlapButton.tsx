import * as React from 'react'
import { HandClick } from '@appica/icons-react'
import { Button } from '@appica/ui-react/button'
import { compactNumber } from '../lib/format'
import { cn } from '../lib/cn'

type Burst = { key: number; offset: number; tilt: number; text: string }

const WORDS = ['啪！', '打！', '嘴！', '别吹了']

type Props = {
  count: number
  onSlap: () => void
}

export function SlapButton({ count, onSlap }: Props) {
  const [bursts, setBursts] = React.useState<Burst[]>([])
  const [pop, setPop] = React.useState(false)
  const seq = React.useRef(0)

  const fire = () => {
    onSlap()

    seq.current += 1
    const key = seq.current
    setBursts((prev) => [
      ...prev.slice(-2),
      {
        key,
        offset: Math.round((Math.random() - 0.5) * 26),
        tilt: Math.round((Math.random() - 0.5) * 24),
        text: WORDS[Math.floor(Math.random() * WORDS.length)],
      },
    ])

    setPop(false)
    window.requestAnimationFrame(() => setPop(true))
    window.setTimeout(() => setPop(false), 440)
  }

  return (
    <div className="relative shrink-0">
      {bursts.map((burst) => (
        <span
          key={burst.key}
          aria-hidden="true"
          onAnimationEnd={() => setBursts((prev) => prev.filter((item) => item.key !== burst.key))}
          className="dz-rise pointer-events-none absolute bottom-full left-1/2 z-20 text-[15px] font-black text-primary select-none"
          style={{ marginLeft: `${burst.offset}px`, rotate: `${burst.tilt}deg` }}
        >
          {burst.text}
        </span>
      ))}

      <Button
        variant="soft"
        size="sm"
        onClick={fire}
        className="gap-2 font-bold"
        aria-label={`打他嘴，这条已被打 ${count} 次`}
      >
        <HandClick data-icon="start" className="text-primary" />
        打他嘴
        <span
          className={cn(
            'rounded-md bg-primary-subtle px-1.5 py-0.5 text-[12px] tabular-nums text-primary-strong',
            pop && 'dz-pop',
          )}
        >
          {compactNumber(count)}
        </span>
      </Button>
    </div>
  )
}
