import { describe, expect, it } from 'vitest'
import { decide } from '@/game/ai'
import type { Card, Suit } from '@/game/cards'
import type { Difficulty, Game, SeatRole } from '@/game/poker'
import { act, blindPositions, newGame, roleOf, startHand, turnOptions } from '@/game/poker'

const RANKS: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

function cards(spec: string): Card[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => ({
      rank: RANKS[token[0].toUpperCase()],
      suit: token.slice(1).toUpperCase() as Suit,
    }))
}

function seatIds(size: number): string[] {
  return Array.from({ length: size }, (_, id) => `S${id}`)
}

type Spot = {
  size: number
  difficulty: Difficulty
  actor: number
  hole: string
  raiser?: number
  raiseTo?: number
  board?: string
  fold?: number[]
  matched?: boolean
}

/**
 * 造一个干净的待决策局面：盲注已下、可指定加注者与公共牌，其余座位默认存活。
 * decide 只读被行动座位的手牌，对手手牌由胜率模拟随机生成。
 */
function spot(input: Spot): Game {
  const g = newGame({
    names: seatIds(input.size),
    stack: 500,
    sb: 5,
    bb: 10,
    seed: 99,
    difficulty: input.difficulty,
  })
  const board = input.board ? cards(input.board) : []
  g.phase =
    board.length === 0
      ? 'preflop'
      : board.length === 3
        ? 'flop'
        : board.length === 4
          ? 'turn'
          : 'river'
  g.board = board
  g.handOver = false
  g.actor = input.actor
  g.raiseCount = 0
  g.aggressor = -1
  g.preflopAggressor = -1

  const blinds = blindPositions(g)
  for (const seat of g.seats) {
    seat.hole = []
    seat.wager = 0
    seat.committed = 0
    seat.acted = false
    seat.allIn = false
    seat.folded = input.fold?.includes(seat.id) ?? false
    seat.stack = 500
    // 样本充足的中性读牌，让“读对手”这一项在两组对照里保持一致
    g.reads[seat.id] = { dealt: 40, played: 12, raised: 6, folded: 20 }
  }
  g.seats[blinds.sb].wager = g.sbAmount
  g.seats[blinds.sb].committed = g.sbAmount
  g.seats[blinds.bb].wager = g.bbAmount
  g.seats[blinds.bb].committed = g.bbAmount
  g.target = g.bbAmount

  if (input.raiser !== undefined && input.raiseTo !== undefined) {
    const raiser = g.seats[input.raiser]
    raiser.wager = input.raiseTo
    raiser.committed = input.raiseTo
    g.target = input.raiseTo
    g.preflopAggressor = input.raiser
    // 引擎在换街时清空本街进攻权，翻牌后的持续下注场景里“本街还没人下注”
    if (board.length === 0) {
      g.aggressor = input.raiser
      g.raiseCount = 1
    }
  }

  const actor = g.seats[input.actor]
  actor.hole = cards(input.hole)
  if (input.matched) {
    actor.wager = g.target
    actor.committed = g.target
    actor.stack = 500 - g.target
  } else {
    actor.stack = 500 - actor.wager
  }
  return g
}

/** 按座位号取该桌某个角色的第一个座位 */
function seatWithRole(size: number, role: SeatRole): number {
  const g = spot({ size, difficulty: 'sharp', actor: 0, hole: '7H 2D' })
  const found = g.seats.find((seat) => roleOf(g, seat.id) === role)
  if (!found) throw new Error(`该桌型没有 ${role} 位`)
  return found.id
}

type Tally = { raise: number; call: number; check: number; fold: number; total: number }

/** 同一位置同一手牌，换着牌局序号取样，统计动作占比 */
function rates(input: Spot): Tally {
  const total = 60
  const tally: Tally = { raise: 0, call: 0, check: 0, fold: 0, total }
  for (let handNo = 1; handNo <= total; handNo++) {
    const g = spot(input)
    g.handNo = handNo
    const action = decide(g)
    tally[action.type] += 1
  }
  return tally
}

const BUTTON = seatWithRole(6, 'button')
const EARLY = seatWithRole(6, 'early')
const MIDDLE = seatWithRole(6, 'middle')
const LATE = seatWithRole(6, 'late')
const BLIND = seatWithRole(6, 'blind')

describe('ai uses position', () => {
  const button = BUTTON
  const early = EARLY

  it('opens a middling hand much wider on the button than early', () => {
    const btn = rates({ size: 6, difficulty: 'sharp', actor: button, hole: 'TD 8S' })
    const gun = rates({ size: 6, difficulty: 'sharp', actor: early, hole: 'TD 8S' })

    expect(btn.raise).toBeGreaterThan(gun.raise + 20)
    expect(gun.raise).toBeLessThan(5)
  })

  it('easy bots leave position out of the decision', () => {
    const sharpGap =
      rates({ size: 6, difficulty: 'sharp', actor: button, hole: 'TD 8S' }).raise -
      rates({ size: 6, difficulty: 'sharp', actor: early, hole: 'TD 8S' }).raise
    const easyGap =
      rates({ size: 6, difficulty: 'easy', actor: button, hole: 'TD 8S' }).raise -
      rates({ size: 6, difficulty: 'easy', actor: early, hole: 'TD 8S' }).raise

    expect(sharpGap).toBeGreaterThan(20)
    expect(easyGap).toBeLessThan(sharpGap / 2)
  })

  it('stays sane with three live opponents on a nine-handed table', () => {
    const aces = rates({
      size: 9,
      difficulty: 'sharp',
      actor: 4,
      hole: 'AS AH',
      fold: [2, 3, 6, 7, 8],
    })
    const junk = rates({
      size: 9,
      difficulty: 'sharp',
      actor: 4,
      hole: '7H 2D',
      raiser: 5,
      raiseTo: 30,
      fold: [2, 3, 6, 7, 8],
    })

    expect(aces.fold).toBe(0)
    expect(aces.raise / aces.total).toBeGreaterThan(0.4)
    expect(junk.raise).toBe(0)
    expect(junk.fold / junk.total).toBeGreaterThan(0.7)
  })
})

describe('ai reads the street', () => {
  const raiser = BUTTON
  const middle = MIDDLE
  // 单挑到底：翻牌前只剩加注者跟一个跟注者，才是标准的持续下注场景
  const headsUpAfterRaise = [0, 1, 2, 4]

  it('continuation-bets as the preflop aggressor and checks behind otherwise', () => {
    const barrels = rates({
      size: 6,
      difficulty: 'sharp',
      actor: raiser,
      hole: '9S 8H',
      raiser,
      raiseTo: 30,
      board: 'KS 7D 2C',
      fold: headsUpAfterRaise,
    })
    const behind = rates({
      size: 6,
      difficulty: 'sharp',
      actor: middle,
      hole: '9S 8H',
      raiser,
      raiseTo: 30,
      board: 'KS 7D 2C',
      matched: true,
      fold: headsUpAfterRaise,
    })

    expect(barrels.raise / barrels.total).toBeGreaterThan(0.35)
    expect(behind.raise / behind.total).toBeLessThan(0.2)
    expect(behind.check / behind.total).toBeGreaterThan(0.6)
  })

  it('bets bigger on a connected board than on a dry one', () => {
    const sizes = (board: string): number[] => {
      const out: number[] = []
      for (let handNo = 1; handNo <= 60; handNo++) {
        const g = spot({
          size: 6,
          difficulty: 'sharp',
          actor: raiser,
          hole: 'AD 5C',
          raiser,
          raiseTo: 30,
          board,
          fold: headsUpAfterRaise,
        })
        g.handNo = handNo
        const action = decide(g)
        if (action.type === 'raise') out.push(action.to - 30)
      }
      return out
    }

    const dry = sizes('KS 7D 2C')
    const wet = sizes('JS TD 9C')
    const average = (list: number[]): number =>
      list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length)

    expect(dry.length).toBeGreaterThan(10)
    expect(wet.length).toBeGreaterThan(10)
    expect(average(wet)).toBeGreaterThan(average(dry) * 1.2)
  })

  it('defends the blinds looser on easy than on sharp', () => {
    const spot3 = (difficulty: Difficulty): Tally =>
      rates({
        size: 6,
        difficulty,
        actor: BLIND,
        hole: 'QD JC',
        raiser: LATE,
        raiseTo: 30,
        fold: [2, 3, 5],
      })

    const sharp = spot3('sharp')
    const easy = spot3('easy')
    const continued = (tally: Tally): number => tally.call + tally.raise

    expect(continued(easy)).toBeGreaterThan(continued(sharp))
  })
})

describe('ai legality', () => {
  const cases: [number, Difficulty][] = [
    [2, 'sharp'],
    [6, 'standard'],
    [9, 'easy'],
    [9, 'sharp'],
  ]

  it.each(cases)('plays %i-handed on %s without an illegal action', (size, difficulty) => {
    let g = newGame({
      names: seatIds(size),
      styles: Array.from(
        { length: size },
        (_, id) => (['tight', 'loose', 'aggro'] as const)[id % 3],
      ),
      stack: 500,
      sb: 5,
      bb: 10,
      seed: 4242,
      difficulty,
    })

    for (let hand = 0; hand < 25; hand++) {
      g = startHand(g)
      let steps = 0
      while (!g.handOver) {
        steps += 1
        expect(steps).toBeLessThan(240)
        const opts = turnOptions(g)
        const action = decide(g)
        if (opts) {
          if (action.type === 'raise') {
            expect(opts.canRaise).toBe(true)
            expect(action.to).toBeGreaterThan(g.target)
            expect(action.to).toBeLessThanOrEqual(opts.raiseMax)
            expect(action.to).toBeGreaterThanOrEqual(opts.raiseMin)
          }
          if (action.type === 'check') expect(opts.checkAvailable).toBe(true)
          if (opts.toCall > 0) expect(action.type).not.toBe('check')
        }
        g = act(g, action)
      }
      expect(g.seats.every((seat) => seat.stack >= 0)).toBe(true)
    }
  })
})
