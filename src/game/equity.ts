import type { Card } from './cards'
import { cardKey, standardDeck } from './cards'
import { compareScore, evaluate } from './evaluate'
import { hashKey, mulberry32, pick } from './rng'

export type EquityInput = {
  hole: Card[]
  board: Card[]
  opponents: number
  trials?: number
}

const cache = new Map<string, number>()

function knownKey(hole: Card[], board: Card[], opponents: number): string {
  return [hole.map(cardKey).join(''), board.map(cardKey).join(''), opponents].join('|')
}

export function equity(input: EquityInput): number {
  const { hole, board, opponents } = input
  if (hole.length !== 2 || opponents < 1) return 0
  const key = knownKey(hole, board, opponents)
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const trials = input.trials ?? 90
  const seen = new Set([...hole, ...board].map(cardKey))
  const remaining = standardDeck().filter((card) => !seen.has(cardKey(card)))
  const needHole = opponents * 2
  const needBoard = 5 - board.length
  const rng = mulberry32(hashKey([key]))

  let wins = 0
  let ties = 0
  for (let t = 0; t < trials; t++) {
    const drawn = pick(remaining, needHole + needBoard, rng)
    const fullBoard = board.concat(drawn.slice(needHole))
    const mine = evaluate(hole.concat(fullBoard)).score
    let beaten = false
    let tied = false
    for (let o = 0; o < opponents; o++) {
      const theirHole = drawn.slice(o * 2, o * 2 + 2)
      const theirs = evaluate(theirHole.concat(fullBoard)).score
      const diff = compareScore(theirs, mine)
      if (diff > 0) {
        beaten = true
        break
      }
      if (diff === 0) tied = true
    }
    if (!beaten) {
      if (tied) ties += 1
      else wins += 1
    }
  }

  const value = Math.round(((wins + ties * 0.5) / trials) * 100) / 100
  cache.set(key, value)
  return value
}
