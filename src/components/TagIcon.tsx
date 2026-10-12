import { Crown, Mask, Rocket, Sparkles, Trophy, Wrench } from '@appica/icons-react'
import type { BragTag } from '../data/brags'

const MAP: Record<BragTag, typeof Rocket> = {
  遥遥领先: Rocket,
  全球第一: Trophy,
  完全自研: Wrench,
  没有对手: Crown,
  重新定义: Sparkles,
  友商不行: Mask,
}

export function TagIcon({ tag }: { tag: BragTag }) {
  const Icon = MAP[tag] ?? Rocket
  return <Icon />
}
