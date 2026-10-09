import type { Card } from './cards'
import { cardKey, standardDeck } from './cards'
import { evaluate } from './evaluate'

export type DrawInfo = {
  /** 能把当前牌型提升一档的未现牌张数 */
  outs: number
  /** 还剩几张公共牌要发（翻牌后=2，转牌后=1） */
  streetsLeft: number
  /** 到河牌为止至少命中一张补牌的概率（0-1） */
  hitProbability: number
}

/**
 * 补牌：任意一张能把英雄从「听牌」直接做成顺子/同花或更强牌型的未现牌。
 * 已达顺子及以上视为成牌、不再听牌，补牌数记 0；成对/两对这类靠对子提升的
 * 细颗粒「隐藏补牌」不计入，只呈现玩家最关心的顺子与同花听牌。
 */
export function countOuts(hole: readonly Card[], board: readonly Card[]): number {
  if (hole.length !== 2 || board.length < 3) return 0
  const base = evaluate([...hole, ...board]).category
  if (base >= 4) return 0
  const seen = new Set([...hole, ...board].map(cardKey))
  let outs = 0
  for (const card of standardDeck()) {
    if (seen.has(cardKey(card))) continue
    if (evaluate([...hole, ...board, card]).category >= 4) outs += 1
  }
  return outs
}

/** 至少命中一张补牌的概率：1 - 连发 streetsLeft 张全落空的概率 */
export function hitProbability(outs: number, streetsLeft: number, remaining: number): number {
  if (outs <= 0 || streetsLeft <= 0 || remaining <= 0) return 0
  let miss = 1
  for (let i = 0; i < streetsLeft; i++) {
    const left = remaining - i
    if (left <= 0) break
    miss *= Math.max(0, left - outs) / left
  }
  return Math.min(1, Math.max(0, 1 - miss))
}

export function drawInfo(hole: readonly Card[], board: readonly Card[]): DrawInfo {
  const streetsLeft = Math.max(0, 5 - board.length)
  const remaining = 52 - hole.length - board.length
  const outs = countOuts(hole, board)
  return {
    outs,
    streetsLeft,
    hitProbability: hitProbability(outs, streetsLeft, remaining),
  }
}
