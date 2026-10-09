import type { Difficulty } from './poker'
import type { TableSize } from './tables'

/** 定义一张牌桌的静态参数，换桌时据此重建对局 */
export type TableConfig = {
  size: TableSize
  difficulty: Difficulty
  stack: number
  sb: number
  bb: number
}

/** 可随时开关的体验设置，不需要换桌即刻生效 */
export type Settings = {
  /** 教练模式：实时显示建议动作 */
  coach: boolean
  /** 音效 */
  sound: boolean
  /** 行动计时器 + 时间银行 */
  timer: boolean
}

export const DEFAULT_CONFIG: TableConfig = {
  size: 6,
  difficulty: 'standard',
  stack: 500,
  sb: 5,
  bb: 10,
}

export const DEFAULT_SETTINGS: Settings = { coach: true, sound: true, timer: false }

export const STACK_PRESETS = [500, 1000, 2000]

export const BLIND_PRESETS: { sb: number; bb: number }[] = [
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 25, bb: 50 },
]

/** 每个决策点的基础思考秒数 */
export const DECISION_SECONDS = 20
/** 时间银行总额外秒数，用完不再补充 */
export const TIME_BANK = 30
