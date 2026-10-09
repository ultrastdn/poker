import { describe, expect, it } from 'vitest'
import { decide } from '@/game/ai'
import type { Card, Suit } from '@/game/cards'
import { advise, judgeDecision } from '@/game/coach'
import { dailySeed, dayKey } from '@/game/daily'
import { callEV, oddsInfo, oddsRatio, requiredEquity } from '@/game/odds'
import { countOuts, drawInfo, hitProbability } from '@/game/outs'
import type { Decision, HandRecord } from '@/game/poker'
import { act, awaitingHuman, newGame, startHand, turnOptions } from '@/game/poker'
import { playerStats } from '@/game/stats'

const c = (rank: number, suit: Suit): Card => ({ rank, suit })

function rec(over: Partial<HandRecord> = {}): HandRecord {
  return {
    handNo: 1,
    outcome: 'even',
    invested: 0,
    payout: 0,
    net: 0,
    heroCards: [],
    heroHand: '',
    winnerName: '',
    winnerHand: '',
    showdown: false,
    position: 'button',
    vpip: false,
    pfr: false,
    aggressions: 0,
    calls: 0,
    decisions: [],
    ...over,
  }
}

describe('odds', () => {
  it('computes required equity to break even on a call', () => {
    expect(requiredEquity(10, 30)).toBeCloseTo(0.25, 5)
    expect(requiredEquity(0, 30)).toBe(0)
  })

  it('computes call EV and pot odds ratio', () => {
    expect(callEV(0.5, 10, 30)).toBeCloseTo(10, 5)
    expect(callEV(0.2, 10, 30)).toBeCloseTo(-2, 5)
    expect(oddsRatio(10, 30)).toBeCloseTo(3, 5)
  })

  it('flags plus-EV calls by comparing equity to required', () => {
    expect(oddsInfo(0.4, 10, 30).plusEV).toBe(true)
    expect(oddsInfo(0.15, 10, 30).plusEV).toBe(false)
    // 无需跟注时永远视为不亏
    expect(oddsInfo(0.1, 0, 30).plusEV).toBe(true)
  })
})

describe('outs', () => {
  it('counts 9 outs for a flush draw on the flop', () => {
    const hole = [c(14, 'H'), c(2, 'H')]
    const board = [c(9, 'H'), c(7, 'H'), c(3, 'S')]
    expect(countOuts(hole, board)).toBe(9)
  })

  it('counts 8 outs for an open-ended straight draw', () => {
    const hole = [c(8, 'S'), c(9, 'H')]
    const board = [c(10, 'D'), c(7, 'C'), c(2, 'S')]
    expect(countOuts(hole, board)).toBe(8)
  })

  it('reports 0 outs when already holding a made straight-or-better', () => {
    const hole = [c(12, 'H'), c(11, 'H')]
    const board = [c(13, 'H'), c(10, 'H'), c(9, 'H')]
    expect(countOuts(hole, board)).toBe(0)
  })

  it('reports 0 outs before the flop', () => {
    expect(countOuts([c(14, 'S'), c(13, 'S')], [])).toBe(0)
  })

  it('estimates hit probability over remaining streets', () => {
    // 9 张补牌、翻牌后还有 2 张要发、剩 47 张未见 ≈ 35%
    expect(hitProbability(9, 2, 47)).toBeCloseTo(0.35, 1)
    expect(hitProbability(0, 2, 47)).toBe(0)
    const info = drawInfo([c(14, 'H'), c(2, 'H')], [c(9, 'H'), c(7, 'H'), c(3, 'S')])
    expect(info.outs).toBe(9)
    expect(info.streetsLeft).toBe(2)
    expect(info.hitProbability).toBeGreaterThan(0.3)
  })
})

describe('coach advice', () => {
  it('does not fold premium pocket aces facing a bet', () => {
    const advice = advise({
      hole: [c(14, 'S'), c(14, 'H')],
      board: [],
      opponents: 1,
      pot: 30,
      toCall: 20,
      canRaise: true,
      preflop: true,
    })
    expect(advice.action).not.toBe('fold')
    expect(advice.equity).toBeGreaterThan(0.6)
  })

  it('folds a weak hand that cannot meet the pot-odds and fair-share bar', () => {
    const advice = advise({
      hole: [c(7, 'S'), c(2, 'D')],
      board: [],
      opponents: 1,
      pot: 20,
      toCall: 20,
      canRaise: true,
      preflop: true,
    })
    expect(advice.action).toBe('fold')
    expect(advice.required).toBeCloseTo(0.5, 1)
  })

  it('checks rather than bets a marginal hand postflop with no bet faced', () => {
    const advice = advise({
      hole: [c(7, 'S'), c(2, 'D')],
      board: [c(13, 'H'), c(9, 'C'), c(4, 'S')],
      opponents: 1,
      pot: 30,
      toCall: 0,
      canRaise: true,
      preflop: false,
    })
    expect(advice.action).toBe('check')
  })

  it('judges folding a strong hand as too tight', () => {
    const decision: Decision = {
      phase: 'preflop',
      board: [],
      opponents: 1,
      pot: 30,
      toCall: 20,
      canRaise: true,
      raiseMin: 40,
      raiseMax: 500,
      action: { type: 'fold' },
    }
    const { advice, verdict } = judgeDecision([c(14, 'S'), c(14, 'H')], decision)
    expect(advice.action).not.toBe('fold')
    expect(verdict).toBe('tight')
  })

  it('marks matching the advice as good', () => {
    const decision: Decision = {
      phase: 'preflop',
      board: [],
      opponents: 1,
      pot: 20,
      toCall: 20,
      canRaise: true,
      raiseMin: 40,
      raiseMax: 500,
      action: { type: 'fold' },
    }
    const { verdict } = judgeDecision([c(7, 'S'), c(2, 'D')], decision)
    expect(verdict).toBe('good')
  })
})

describe('player stats', () => {
  it('aggregates VPIP / PFR / AF and per-position results', () => {
    const stats = playerStats([
      rec({ vpip: true, pfr: true, aggressions: 2, calls: 1, position: 'button', net: 30 }),
      rec({ vpip: true, aggressions: 0, calls: 2, position: 'early', net: -10 }),
      rec({ position: 'late', net: 5 }),
    ])
    expect(stats.hands).toBe(3)
    expect(stats.vpip).toBeCloseTo(66.67, 1)
    expect(stats.pfr).toBeCloseTo(33.33, 1)
    expect(stats.af).toBeCloseTo(2 / 3, 3)
    expect(stats.byPosition.button.net).toBe(30)
    expect(stats.byPosition.early.net).toBe(-10)
    expect(stats.byPosition.late.net).toBe(5)
    expect(stats.byPosition.blind.hands).toBe(0)
  })
})

describe('daily hand seed', () => {
  it('formats a local day key', () => {
    expect(dayKey(new Date(2026, 9, 8))).toBe('2026-10-08')
    expect(dayKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })

  it('is stable within a day and differs across days', () => {
    expect(dailySeed(new Date(2026, 9, 8, 1))).toBe(dailySeed(new Date(2026, 9, 8, 23)))
    expect(dailySeed(new Date(2026, 9, 8))).not.toBe(dailySeed(new Date(2026, 9, 9)))
  })
})

describe('decision capture for review', () => {
  it('records hero decisions and folds them into the hand record', () => {
    let g = newGame({ names: ['你', '老赵'], stack: 500, sb: 5, bb: 10, seed: 42 })
    g = startHand(g)
    // 单挑桌翻牌前按钮/小盲（座位 0，人类）先行动，跟注补齐小盲
    expect(awaitingHuman(g)).toBe(true)
    g = act(g, { type: 'call' })
    expect(g.decisions).toHaveLength(1)
    expect(g.decisions[0].phase).toBe('preflop')
    expect(g.decisions[0].toCall).toBe(5)

    let guard = 0
    while (!g.handOver && guard++ < 600) {
      if (awaitingHuman(g)) {
        const opts = turnOptions(g)
        g = act(g, opts && opts.toCall > 0 ? { type: 'call' } : { type: 'check' })
      } else {
        g = act(g, decide(g))
      }
    }

    expect(g.history).toHaveLength(1)
    const record = g.history[0]
    expect(record.decisions.length).toBeGreaterThanOrEqual(1)
    expect(typeof record.position).toBe('string')
    // 翻牌前跟注补齐了小盲 → 记为主动入池但未加注
    expect(record.vpip).toBe(true)
    expect(record.pfr).toBe(false)
    expect(record.calls).toBeGreaterThanOrEqual(1)
  })
})
