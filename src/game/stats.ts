import type { HandRecord, SeatRole } from './poker'

export type PositionStat = {
  hands: number
  net: number
}

export type PlayerStats = {
  hands: number
  /** 主动入池率 VPIP（%）：翻牌前跟注或加注的手占比 */
  vpip: number
  /** 翻牌前加注率 PFR（%） */
  pfr: number
  /** 激进系数 AF = 加注次数 / 跟注次数 */
  af: number
  /** 按位置的盈亏与手数分布 */
  byPosition: Record<SeatRole, PositionStat>
}

export const POSITION_ORDER: SeatRole[] = ['button', 'blind', 'early', 'middle', 'late']

export const POSITION_LABELS: Record<SeatRole, string> = {
  button: '按钮',
  blind: '盲注',
  early: '前位',
  middle: '中位',
  late: '后位',
}

function emptyPositions(): Record<SeatRole, PositionStat> {
  return {
    button: { hands: 0, net: 0 },
    blind: { hands: 0, net: 0 },
    early: { hands: 0, net: 0 },
    middle: { hands: 0, net: 0 },
    late: { hands: 0, net: 0 },
  }
}

export function playerStats(history: readonly HandRecord[]): PlayerStats {
  const byPosition = emptyPositions()
  let vpipCount = 0
  let pfrCount = 0
  let aggressions = 0
  let calls = 0

  for (const record of history) {
    if (record.vpip) vpipCount += 1
    if (record.pfr) pfrCount += 1
    aggressions += record.aggressions
    calls += record.calls
    const bucket = byPosition[record.position]
    if (bucket) {
      bucket.hands += 1
      bucket.net += record.net
    }
  }

  const hands = history.length
  return {
    hands,
    vpip: hands > 0 ? (vpipCount / hands) * 100 : 0,
    pfr: hands > 0 ? (pfrCount / hands) * 100 : 0,
    af: aggressions / Math.max(1, calls),
    byPosition,
  }
}
