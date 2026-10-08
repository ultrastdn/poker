import { equity } from './equity'
import type { Action, Game, SeatStyle } from './poker'
import { turnOptions } from './poker'
import { hashKey, mulberry32 } from './rng'

type Style = {
  aggression: number
  bluff: number
  callMargin: number
}

const STYLES: Record<string, Style> = {
  tight: { aggression: 0.35, bluff: 0.05, callMargin: 0.07 },
  loose: { aggression: 0.45, bluff: 0.14, callMargin: -0.03 },
  aggro: { aggression: 0.68, bluff: 0.22, callMargin: -0.01 },
}

export function styleLabel(style: SeatStyle): string {
  if (style === 'tight') return '紧手'
  if (style === 'aggro') return '激进'
  return '松手'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function decide(game: Game): Action {
  const seat = game.seats[game.actor]
  const opts = turnOptions(game)
  if (!seat || !opts) return { type: 'fold' }

  const opponents = Math.max(1, game.seats.filter((s) => s.id !== seat.id && !s.folded).length)
  const eq = equity({ hole: seat.hole, board: game.board, opponents })
  const style = STYLES[seat.style] ?? STYLES.tight
  const roll = mulberry32(
    hashKey([
      String(game.handNo),
      String(seat.id),
      String(opts.toCall),
      seat.hole.map((c) => `${c.rank}${c.suit}`).join(''),
      game.board.map((c) => `${c.rank}${c.suit}`).join(''),
    ]),
  )()
  const potOdds = opts.toCall > 0 ? opts.toCall / (opts.potNow + opts.toCall) : 0
  const commitStack = opts.toCall >= seat.stack

  const raiseTo = (fraction: number): Action => {
    const potAfterCall = opts.potNow + opts.toCall
    const size = Math.max(game.bbAmount, Math.round((potAfterCall * fraction) / game.bbAmount) * game.bbAmount)
    return { type: 'raise', to: clamp(opts.callTo + size, opts.raiseMin, opts.raiseMax) }
  }

  if (opts.toCall === 0) {
    if (opts.canRaise && eq >= 0.6 && roll < style.aggression) return raiseTo(0.65)
    if (opts.canRaise && eq >= 0.42 && roll < style.bluff) return raiseTo(0.5)
    return { type: 'check' }
  }

  const need = potOdds + style.callMargin
  if (opts.canRaise && !commitStack && eq >= need + 0.2 && roll < style.aggression) {
    return raiseTo(0.8)
  }
  if (opts.canRaise && !commitStack && eq >= 0.5 && roll < style.bluff * 0.6) return raiseTo(0.9)
  if (commitStack) return eq >= 0.46 ? { type: 'call' } : { type: 'fold' }
  if (eq >= need) return { type: 'call' }
  if (opts.toCall <= game.sbAmount && eq >= 0.16) return { type: 'call' }
  if (roll < 0.1) return { type: 'call' }
  return { type: 'fold' }
}
