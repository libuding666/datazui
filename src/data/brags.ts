/**
 * 「打他嘴」数据定义
 *
 * 数据的唯一事实来源是 MySQL（见 server/），本文件只保留：
 *   - 类型定义与归类／场合元数据（纯前端 UI 需要）
 *   - 内置语录作为「服务不可用时的离线兜底」
 *
 * 内置语录放在 shared/seed-brags.json，前后端共用同一份，避免两边不同步。
 */

import SEED_ROWS from '../../shared/seed-brags.json'

export const BRAG_TAGS = ['遥遥领先', '全球第一', '完全自研', '没有对手', '重新定义', '友商不行'] as const

export type BragTag = (typeof BRAG_TAGS)[number]

export type Brag = {
  id: string
  /** 吹牛原话 */
  text: string
  /** 归类 */
  tag: BragTag
  /** 出处／场合 */
  scene: string
  /** 昵称，null 表示匿名 */
  author: string | null
  /** 累计被打嘴次数 */
  slaps: number
  /** 时间戳（ms） */
  createdAt: number
  /** 本人发布的（由服务端根据 owner token 判定） */
  mine?: boolean
  /** 内置语录 */
  seed?: boolean
}

export const SCENES = [
  '发布会',
  '直播间',
  '朋友圈',
  '融资路演',
  '年会',
  '采访',
  '测评区',
  '内部信',
  '峰会演讲',
  '官宣海报',
  '详情页',
  '饭局',
  '通稿',
  '评论区',
] as const

export const MAX_LEN = 80

const HOUR = 3_600_000

/** 离线兜底用的内置语录（正常情况由接口下发） */
export const SEED_BRAGS: Brag[] = SEED_ROWS.map((row, index) => ({
  id: `seed-${index + 1}`,
  text: row.text,
  tag: row.tag as BragTag,
  scene: row.scene,
  author: null,
  slaps: row.slaps,
  createdAt: Date.now() - row.hoursAgo * HOUR,
  seed: true,
}))

/** 归类 → 图标名 + 说明，用于筛选栏与卡片徽标 */
export const TAG_META: Record<BragTag, { icon: string; hint: string }> = {
  遥遥领先: { icon: 'rocket', hint: '不知道领先在哪，但就是领先' },
  全球第一: { icon: 'trophy', hint: '全球范围，自封的' },
  完全自研: { icon: 'wrench', hint: '从螺丝到宇宙，全自研' },
  没有对手: { icon: 'crown', hint: '对手不存在，所以没有对手' },
  重新定义: { icon: 'sparkles', hint: '把已有的东西再定义一遍' },
  友商不行: { icon: 'mask', hint: '不提名字，但你知道我说谁' },
}
