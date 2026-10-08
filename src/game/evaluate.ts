import type { Card } from './cards'

export type Score = number[]

export const HAND_NAMES = [
  '高牌',
  '一对',
  '两对',
  '三条',
  '顺子',
  '同花',
  '葫芦',
  '四条',
  '同花顺',
]

export const HAND_NAMES_EN = [
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
]

function combos(cards: readonly Card[], size: number): Card[][] {
  const out: Card[][] = []
  const current: Card[] = []
  const walk = (start: number) => {
    if (current.length === size) {
      out.push(current.slice())
      return
    }
    for (let i = start; i < cards.length; i++) {
      current.push(cards[i])
      walk(i + 1)
      current.pop()
    }
  }
  walk(0)
  return out
}

function straightHigh(sortedDesc: number[]): number {
  const unique: number[] = []
  for (const rank of sortedDesc) {
    if (unique.length === 0 || unique[unique.length - 1] !== rank) unique.push(rank)
  }
  if (unique.length !== 5) return 0
  if (unique[0] - unique[4] === 4) return unique[0]
  if (unique[0] === 14 && unique[1] === 5) return 5
  return 0
}

export function score5(cards: readonly Card[]): Score {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a)
  const flush = cards.every((c) => c.suit === cards[0].suit)
  const straight = straightHigh(ranks)

  const counts = new Map<number, number>()
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1)
  const groups = [...counts.entries()]
    .sort((a, b) => (a[1] === b[1] ? b[0] - a[0] : b[1] - a[1]))
    .map((entry) => entry[0])
  const sizes = [...counts.entries()]
    .sort((a, b) => (a[1] === b[1] ? b[0] - a[0] : b[1] - a[1]))
    .map((entry) => entry[1])

  if (flush && straight > 0) return [8, straight]
  if (sizes[0] === 4) return [7, groups[0], groups[1]]
  if (sizes[0] === 3 && sizes[1] === 2) return [6, groups[0], groups[1]]
  if (flush) return [5, ...ranks]
  if (straight > 0) return [4, straight]
  if (sizes[0] === 3) return [3, groups[0], groups[1], groups[2]]
  if (sizes[0] === 2 && sizes[1] === 2) return [2, groups[0], groups[1], groups[2]]
  if (sizes[0] === 2) return [1, groups[0], groups[1], groups[2], groups[3]]
  return [0, ...ranks]
}

export function compareScore(a: Score, b: Score): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export type Hand = {
  score: Score
  category: number
  name: string
  nameEn: string
  best: Card[]
}

export function evaluate(cards: readonly Card[]): Hand {
  if (cards.length < 5) {
    const partial = [...cards].sort((a, b) => b.rank - a.rank)
    const score = partial.map((c) => c.rank)
    return {
      score,
      category: -1,
      name: '等待公共牌',
      nameEn: 'Incomplete',
      best: partial,
    }
  }

  let bestScore: Score = []
  let best: Card[] = []
  for (const combo of combos(cards, 5)) {
    const score = score5(combo)
    if (bestScore.length === 0 || compareScore(score, bestScore) > 0) {
      bestScore = score
      best = combo
    }
  }
  const category = bestScore[0]
  return {
    score: bestScore,
    category,
    name: HAND_NAMES[category],
    nameEn: HAND_NAMES_EN[category],
    best,
  }
}
