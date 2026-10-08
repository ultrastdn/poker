import { describe, expect, it } from 'vitest'
import { decide } from '@/game/ai'
import type { Card, Suit } from '@/game/cards'
import { cardKey, standardDeck } from '@/game/cards'
import { equity } from '@/game/equity'
import { compareScore, evaluate } from '@/game/evaluate'
import type { Game } from '@/game/poker'
import { act, blindPositions, newGame, potTotal, settle, startHand, turnOptions } from '@/game/poker'
import { mulberry32, shuffle } from '@/game/rng'

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
      suit: token.slice(1).toLowerCase() as Suit,
    }))
}

describe('hand ranking', () => {
  const cases: [string, number][] = [
    ['AS KS QS JS TS 2H 3D', 8],
    ['AS 2S 3S 4S 5S KH QD', 8],
    ['7S 7H 7D 7C KS 2D 3H', 7],
    ['QS QH QD 8C 8S 2D 3H', 6],
    ['AS KS 5S 2S 9S 3H 4D', 5],
    ['9S 8H 7D 6C 5S 2D 3H', 4],
    ['AS 2H 3D 4C 5S KH QD', 4],
    ['3S 3H 3D KC QS 2D 9H', 3],
    ['KS KH 2D 2C 7S 5H 4D', 2],
    ['KS KH 2D 9C 7S 5H 4D', 1],
    ['AS KH 9D 7C 5S 3H 2D', 0],
  ]

  it.each(cases)('classifies %s as category %i', (spec, category) => {
    expect(evaluate(cards(spec)).category).toBe(category)
  })

  it('kickers separate identical pairs', () => {
    const nine = evaluate(cards('KS KH QD JC 9H 2D 3C'))
    const eight = evaluate(cards('KS KH QD JC 8H 2D 3C'))
    expect(compareScore(nine.score, eight.score)).toBeGreaterThan(0)
  })

  it('two pair keeps the higher pair first', () => {
    const withNine = evaluate(cards('AS AH 2D 2C 9H 8S 6D'))
    const withSix = evaluate(cards('AS AH 2D 2C 5H 4S 6D'))
    expect(withNine.name).toBe('两对')
    expect(withSix.name).toBe('两对')
    expect(compareScore(withNine.score, withSix.score)).toBeGreaterThan(0)
  })

  it('a six-high straight beats the wheel', () => {
    const six = evaluate(cards('2S 3H 4D 5C 6S KH QD'))
    const wheel = evaluate(cards('AS 2H 3D 4C 5S KH QD'))
    expect(compareScore(six.score, wheel.score)).toBeGreaterThan(0)
  })

  it('splits the pot when hands tie exactly', () => {
    const first = evaluate(cards('AS KS QD JC 9H 2D 3C'))
    const second = evaluate(cards('AC KH QD JC 9H 2D 3C'))
    expect(compareScore(first.score, second.score)).toBe(0)
  })
})

describe('deck', () => {
  it('holds 52 distinct cards', () => {
    const deck = standardDeck()
    expect(deck).toHaveLength(52)
    expect(new Set(deck.map(cardKey)).size).toBe(52)
  })

  it('shuffles the same way for the same seed', () => {
    const first = shuffle(standardDeck(), mulberry32(7)).map(cardKey).join(',')
    const second = shuffle(standardDeck(), mulberry32(7)).map(cardKey).join(',')
    expect(first).toBe(second)
  })
})

describe('side pots', () => {
  it('awards each layer to the best eligible hand', () => {
    const g = newGame({ names: ['a', 'b', 'c'], stack: 100, sb: 5, bb: 10, seed: 3 })
    g.board = cards('2H 5D 9C JS 4H')
    const plan = [
      { hole: 'QD QC', committed: 100, stack: 0 },
      { hole: 'KD KC', committed: 60, stack: 40 },
      { hole: 'AS AC', committed: 30, stack: 70 },
    ]
    plan.forEach((entry, id) => {
      g.seats[id].hole = cards(entry.hole)
      g.seats[id].committed = entry.committed
      g.seats[id].stack = entry.stack
    })

    settle(g)

    expect(g.pots.map((pot) => pot.amount)).toEqual([90, 60, 40])
    expect(g.seats.map((seat) => seat.stack)).toEqual([40, 100, 160])
    expect(g.winners.map((winner) => `${winner.name}:${winner.amount}`).sort()).toEqual([
      'a:40',
      'b:60',
      'c:90',
    ])
  })

  it('gives the whole pot to the last player standing', () => {
    const g = newGame({ names: ['a', 'b', 'c'], stack: 100, sb: 5, bb: 10, seed: 4 })
    g.board = cards('2H 5D 9C JS 4H')
    g.seats[0].committed = 30
    g.seats[0].stack = 70
    g.seats[1].committed = 25
    g.seats[1].stack = 75
    g.seats[1].folded = true
    g.seats[2].committed = 10
    g.seats[2].stack = 90
    g.seats[2].folded = true

    settle(g)

    expect(g.showdownSeen).toBe(false)
    expect(g.winners).toHaveLength(1)
    expect(g.winners[0].amount).toBe(65)
    expect(g.seats[0].stack).toBe(135)
  })
})

describe('betting rounds', () => {
  it('leaves the big blind with the closing option', () => {
    let g = newGame({ names: ['you', 'sb', 'bb'], stack: 200, sb: 5, bb: 10, seed: 5 })
    g = startHand(g)
    const blinds = blindPositions(g)
    expect(g.target).toBe(10)
    expect(g.actor).toBe(0)

    g = act(g, { type: 'call' })
    expect(g.actor).toBe(blinds.sb)
    g = act(g, { type: 'call' })
    expect(g.actor).toBe(blinds.bb)

    g = act(g, { type: 'check' })
    expect(g.phase).toBe('flop')
    expect(g.board).toHaveLength(3)
  })

  it('enforces the minimum raise of one big blind', () => {
    let g = newGame({ names: ['a', 'b', 'c'], stack: 500, sb: 5, bb: 10, seed: 6 })
    g = startHand(g)
    const opened = turnOptions(g)
    expect(opened?.toCall).toBe(10)
    expect(opened?.raiseMin).toBe(20)
    expect(opened?.raiseMax).toBe(500)

    g = act(g, { type: 'raise', to: 60 })
    const facing = turnOptions(g)
    expect(facing?.toCall).toBe(55)
    expect(facing?.raiseMin).toBe(70)
  })

  it('lets a short all-in stand without reopening the betting', () => {
    let g = newGame({ names: ['a', 'b', 'c'], stack: 100, sb: 5, bb: 10, seed: 7 })
    g = startHand(g)
    g = act(g, { type: 'raise', to: 50 })
    const shortId = g.actor
    expect(turnOptions(g)?.toCall).toBe(45)

    g.seats[shortId].stack = 20
    expect(turnOptions(g)?.toCall).toBe(20)

    g = act(g, { type: 'call' })
    expect(g.seats[shortId].allIn).toBe(true)
    expect(g.seats[shortId].wager).toBe(25)

    g = act(g, { type: 'call' })
    expect(g.phase).toBe('flop')
    expect(g.actor).not.toBe(shortId)
  })

  it('runs the board out once everyone is all-in', () => {
    let g = newGame({ names: ['a', 'b', 'c'], stack: 100, sb: 5, bb: 10, seed: 8 })
    g = startHand(g)
    g = act(g, { type: 'raise', to: 100 })
    g = act(g, { type: 'call' })
    g = act(g, { type: 'call' })

    expect(g.board).toHaveLength(5)
    expect(g.handOver).toBe(true)
    expect(g.phase).toBe('showdown')
    expect(g.showdownSeen).toBe(true)
    expect(g.seats.every((seat) => seat.allIn && seat.reveal)).toBe(true)
    expect(potTotal(g.seats)).toBe(300)
    expect(g.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(300)
  })
})

describe('equity', () => {
  it('prices aces above junk and drops with more opponents', () => {
    const aces = equity({ hole: cards('AS AH'), board: [], opponents: 1 })
    const junk = equity({ hole: cards('7H 2D'), board: [], opponents: 1 })
    const acesThreeWay = equity({ hole: cards('AS AH'), board: [], opponents: 4 })
    expect(aces).toBeGreaterThan(0.7)
    expect(junk).toBeLessThan(aces)
    expect(acesThreeWay).toBeLessThan(aces)
  })

  it('reads a made flush as a near-certain winner', () => {
    const flush = equity({
      hole: cards('AS KS'),
      board: cards('QS JS 9S 4H 2D'),
      opponents: 1,
    })
    expect(flush).toBeGreaterThan(0.9)
  })
})

describe('full hands', () => {
  it('keeps chips, cards and legality consistent over 60 hands', () => {
    let g: Game = newGame({
      names: ['你', '阿哲', '老赵', '小薇', 'Kay'],
      stack: 500,
      sb: 5,
      bb: 10,
      seed: 20261008,
    })

    for (let hand = 0; hand < 60; hand++) {
      g = startHand(g)
      const baseline = g.seats.map((seat) => seat.stack + seat.committed)
      let steps = 0

      while (!g.handOver) {
        steps += 1
        expect(g.actor).toBeGreaterThanOrEqual(0)
        expect(g.seats.map((seat) => seat.stack + seat.committed)).toEqual(baseline)
        const opts = turnOptions(g)
        expect(opts).toBeDefined()
        if (!opts) break
        expect(opts.toCall).toBeGreaterThanOrEqual(0)
        expect(opts.raiseMin).toBeLessThanOrEqual(opts.raiseMax)
        g = act(g, decide(g))
        if (steps > 240) throw new Error(`hand ${hand} did not close`)
        expect(g.seats.every((seat) => seat.stack >= 0)).toBe(true)
      }

      expect(g.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(
        baseline.reduce((sum, value) => sum + value, 0),
      )
      if (g.showdownSeen) expect(g.board).toHaveLength(5)
      const seen = new Set([
        ...g.board.map(cardKey),
        ...g.seats.flatMap((seat) => seat.hole.map(cardKey)),
      ])
      expect(seen.size).toBe(g.board.length + g.seats.length * 2)
      expect(g.winners.reduce((sum, winner) => sum + winner.amount, 0)).toBe(potTotal(g.seats))
    }
  })
})
