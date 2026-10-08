import type { Difficulty, SeatStyle } from './poker'

export type TableSize = 2 | 6 | 9

export type Roster = { name: string; style: SeatStyle }

export const TABLE_SIZES: TableSize[] = [2, 6, 9]

/** 座位 0 固定是人类 */
const ROSTERS: Record<TableSize, Roster[]> = {
  2: [
    { name: '你', style: 'tight' },
    { name: '老赵', style: 'aggro' },
  ],
  6: [
    { name: '你', style: 'tight' },
    { name: '阿哲', style: 'loose' },
    { name: '老赵', style: 'aggro' },
    { name: '小薇', style: 'tight' },
    { name: 'Kay', style: 'aggro' },
    { name: '老陈', style: 'loose' },
  ],
  9: [
    { name: '你', style: 'tight' },
    { name: '阿哲', style: 'loose' },
    { name: '老赵', style: 'aggro' },
    { name: '小薇', style: 'tight' },
    { name: 'Kay', style: 'aggro' },
    { name: '老陈', style: 'loose' },
    { name: 'Lin', style: 'tight' },
    { name: '大头', style: 'aggro' },
    { name: '阿May', style: 'loose' },
  ],
}

export function rosterOf(size: TableSize): Roster[] {
  return ROSTERS[size]
}

export type SeatSpot = { left: string; top: string }

const RX = 42
const RY = 40

/** 座位 0 落在底部中央（玩家区），其余按顺时针均分到椭圆边线上 */
export function seatLayout(size: TableSize): SeatSpot[] {
  return Array.from({ length: size }, (_, index) => {
    const angle = ((90 + (index * 360) / size) * Math.PI) / 180
    return {
      left: `${Math.round((50 + RX * Math.cos(angle)) * 10) / 10}%`,
      top: `${Math.round((50 + RY * Math.sin(angle)) * 10) / 10}%`,
    }
  })
}

export function isCrowded(size: TableSize): boolean {
  return size >= 9
}

export const DIFFICULTIES: Difficulty[] = ['easy', 'standard', 'sharp']

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '轻松',
  standard: '常规',
  sharp: '犀利',
}
