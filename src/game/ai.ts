import type { Card } from './cards'
import { equity } from './equity'
import type { Action, Difficulty, Game, Seat, SeatStyle, TurnOptions } from './poker'
import { act, actsAfter, awaitingHuman, blindPositions, buttonDistance, roleOf, turnOptions } from './poker'
import { hashKey, mulberry32 } from './rng'

type Brain = {
  aggression: number
  bluff: number
  callMargin: number
  noise: number
  cBet: number
  threeBet: number
  slowPlay: number
  positional: boolean
  observant: boolean
}

const STYLES: Record<SeatStyle, { aggression: number; bluff: number; callMargin: number }> = {
  tight: { aggression: 0.35, bluff: 0.05, callMargin: 0.07 },
  loose: { aggression: 0.45, bluff: 0.14, callMargin: -0.03 },
  aggro: { aggression: 0.68, bluff: 0.22, callMargin: -0.01 },
}

/** 位置对开池门槛的加减：越晚行动越可以拿更差的牌入池 */
const POSITION_EDGE: Record<string, number> = {
  early: -0.06,
  middle: 0,
  late: 0.04,
  button: 0.07,
  blind: 0,
}

const BASE: Brain = {
  aggression: 0,
  bluff: 0,
  callMargin: 0,
  noise: 0.1,
  cBet: 0.58,
  threeBet: 0.16,
  slowPlay: 0.14,
  positional: true,
  observant: true,
}

function brainOf(style: SeatStyle, level: Difficulty): Brain {
  const s = STYLES[style] ?? STYLES.tight
  const brain: Brain = {
    ...BASE,
    aggression: s.aggression,
    bluff: s.bluff,
    callMargin: s.callMargin,
  }
  if (level === 'easy') {
    return {
      ...brain,
      aggression: Math.min(0.9, s.aggression + 0.12),
      callMargin: -0.1,
      noise: 0.4,
      cBet: 0.28,
      threeBet: 0,
      slowPlay: 0,
      positional: false,
      observant: false,
    }
  }
  if (level === 'sharp') {
    return {
      ...brain,
      aggression: Math.min(0.85, s.aggression + 0.1),
      callMargin: s.callMargin + 0.02,
      noise: 0.04,
      cBet: 0.72,
      threeBet: 0.26,
      slowPlay: 0.22,
    }
  }
  return brain
}

export function styleLabel(style: SeatStyle): string {
  if (style === 'tight') return '紧手'
  if (style === 'aggro') return '激进'
  return '松手'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function roundTo(value: number, unit: number): number {
  return Math.max(unit, Math.round(value / unit) * unit)
}

function draw(game: Game, seat: Seat, channel: string): number {
  return mulberry32(
    hashKey([
      channel,
      String(game.handNo),
      String(seat.id),
      String(game.phase),
      String(game.raiseCount),
      String(game.aggressor),
      String(game.actor),
      seat.hole.map((c) => `${c.rank}${c.suit}`).join(''),
      game.board.map((c) => `${c.rank}${c.suit}`).join(''),
    ]),
  )()
}

/** 0（干燥）到 1（湿润）：连张越多越高，对子面与三同花面压低 */
function wetness(board: readonly Card[]): number {
  if (board.length < 3) return 0
  const ranks = [...new Set(board.map((c) => c.rank))].sort((a, b) => a - b)
  const paired = ranks.length < board.length
  let linked = 0
  for (let i = 0; i < ranks.length - 1; i++) {
    if (ranks[i + 1] - ranks[i] <= 2) linked += 1
  }
  const broadway = ranks.filter((rank) => rank >= 10).length
  const suitCount = new Map<string, number>()
  for (const card of board) suitCount.set(card.suit, (suitCount.get(card.suit) ?? 0) + 1)
  const flushy = Math.max(...[...suitCount.values()]) >= 3

  let value = linked / (ranks.length - 1)
  if (broadway >= 3) value += 0.25
  if (flushy) value -= 0.2
  if (paired) value -= 0.35
  return clamp(value, 0, 1)
}

/** 对手的入池率，样本不足时返回 null */
function pipOf(game: Game, id: number): number | null {
  const read = game.reads[id]
  if (!read || read.dealt < 8) return null
  return read.played / read.dealt
}

function trialsFor(boardSize: number, opponents: number): number {
  if (boardSize === 0) return opponents >= 4 ? 60 : 85
  if (boardSize <= 4) return 105
  return 120
}

type Ctx = {
  game: Game
  seat: Seat
  opts: TurnOptions
  brain: Brain
  eq: number
  play: number
  fair: number
  roll: number
  opponents: number
  potOdds: number
  commitStack: boolean
  inPosition: boolean
  preflop: boolean
  tightRaiser: boolean
  looseRaiser: boolean
  wet: number
}

function openTo(ctx: Ctx): Action {
  const bb = ctx.game.bbAmount
  const blinds = blindPositions(ctx.game)
  const limpers = ctx.game.seats.filter(
    (other) =>
      other.id !== ctx.seat.id &&
      other.id !== blinds.sb &&
      other.id !== blinds.bb &&
      !other.folded &&
      other.wager >= bb,
  ).length
  return { type: 'raise', to: clamp((3 + limpers) * bb, ctx.opts.raiseMin, ctx.opts.raiseMax) }
}

function threeBetTo(ctx: Ctx): Action {
  const bb = ctx.game.bbAmount
  const multiple = ctx.inPosition ? 3 : 4
  const wanted = roundTo(ctx.opts.callTo * multiple, bb)
  return { type: 'raise', to: clamp(Math.max(wanted, 3 * bb), ctx.opts.raiseMin, ctx.opts.raiseMax) }
}

function betTo(ctx: Ctx, fraction: number): Action {
  const potAfterCall = ctx.opts.potNow + ctx.opts.toCall
  const size = roundTo(potAfterCall * fraction, ctx.game.bbAmount)
  return {
    type: 'raise',
    to: clamp(ctx.opts.callTo + size, ctx.opts.raiseMin, ctx.opts.raiseMax),
  }
}

function valueFreq(ctx: Ctx, edge: number): number {
  const bonus = ctx.eq >= edge ? clamp((ctx.eq - edge) * 2.4, 0, 0.4) : 0
  return clamp(ctx.brain.aggression + bonus + (ctx.inPosition ? 0.06 : -0.04), 0, 0.97)
}

function firstIn(ctx: Ctx): Action {
  const { game, opts, brain, eq, fair, roll } = ctx
  const gate = fair + (brain.positional ? 0.03 - POSITION_EDGE[roleOf(game, ctx.seat.id)] : 0.08)

  if (opts.canRaise && eq >= gate && roll < valueFreq(ctx, gate)) return openTo(ctx)
  if (opts.toCall === 0) return { type: 'check' }
  if (opts.toCall <= game.sbAmount && eq >= fair - 0.06) return { type: 'call' }
  if (eq >= gate) return { type: 'call' }
  if (eq >= fair - 0.02 && roll < brain.bluff + 0.2) return { type: 'call' }
  return { type: 'fold' }
}

function facingNobody(ctx: Ctx): Action {
  const { opts, brain, eq, fair, roll } = ctx
  const fresh = ctx.game.raiseCount === 0
  const cbettor = ctx.game.preflopAggressor === ctx.seat.id
  const monster = eq >= fair + 0.38
  const value = eq >= fair + 0.2

  if (!opts.canRaise) return { type: 'check' }

  if (monster && roll < brain.slowPlay && ctx.inPosition) return { type: 'check' }

  if (value && roll < valueFreq(ctx, fair + 0.2)) return betTo(ctx, sizing(ctx))

  if (fresh && cbettor && ctx.opponents <= 4) {
    const scale = (1 - ctx.wet * 0.45) * (ctx.opponents >= 3 ? 0.6 : 1)
    if (roll < brain.cBet * scale) return betTo(ctx, ctx.wet > 0.55 ? 0.66 : 0.4)
    return { type: 'check' }
  }

  if (fresh && roll < brain.bluff * (ctx.opponents <= 2 ? 1 : 0.35)) return betTo(ctx, 0.5)
  return { type: 'check' }
}

function facingBet(ctx: Ctx): Action {
  const { game, opts, brain, eq, play, fair, roll, potOdds } = ctx
  const reRaised = game.raiseCount >= 2
  const tightPenalty = ctx.tightRaiser ? 0.05 : 0
  const looseBonus = ctx.looseRaiser ? 0.03 : 0

  const valueGate = potOdds + 0.18 + (reRaised ? 0.05 : 0) + tightPenalty - looseBonus
  if (opts.canRaise && !ctx.commitStack && play >= valueGate) {
    if (roll < valueFreq(ctx, valueGate)) return ctx.preflop ? threeBetTo(ctx) : betTo(ctx, sizing(ctx))
  }

  if (
    ctx.preflop &&
    game.raiseCount === 1 &&
    opts.canRaise &&
    !ctx.commitStack &&
    ctx.inPosition &&
    eq >= fair - 0.04 &&
    roll < brain.threeBet * (ctx.tightRaiser ? 1.5 : ctx.looseRaiser ? 0.4 : 1)
  ) {
    return threeBetTo(ctx)
  }

  if (ctx.commitStack) return play >= potOdds - 0.01 ? { type: 'call' } : { type: 'fold' }

  const callGate = potOdds + brain.callMargin + tightPenalty - looseBonus - (ctx.inPosition ? 0.03 : 0)
  if (play >= callGate) return { type: 'call' }
  if (opts.toCall <= game.sbAmount && eq >= fair) return { type: 'call' }
  if (roll < brain.noise * 0.4) return { type: 'call' }
  return { type: 'fold' }
}

function sizing(ctx: Ctx): number {
  const base = 0.55 + ctx.wet * 0.35 + (ctx.opponents >= 3 ? 0.2 : 0)
  if (ctx.eq >= ctx.fair + 0.4 && ctx.wet < 0.4) return Math.min(1, base + 0.2)
  return clamp(base, 0.33, 1)
}

export function decide(game: Game): Action {
  const seat = game.seats[game.actor]
  const opts = turnOptions(game)
  if (!seat || !opts) return { type: 'fold' }

  const brain = brainOf(seat.style, game.difficulty)
  const opponents = Math.max(1, game.seats.filter((s) => s.id !== seat.id && !s.folded).length)
  const fair = 1 / (opponents + 1)
  const raw = equity({
    hole: seat.hole,
    board: game.board,
    opponents,
    trials: trialsFor(game.board.length, opponents),
  })
  const raiser = game.aggressor >= 0 && game.aggressor !== seat.id ? game.aggressor : -1
  const pip = brain.observant && raiser >= 0 ? pipOf(game, raiser) : null
  const positional = roleOf(game, seat.id)
  const commitStack = opts.toCall >= seat.stack
  // 账面全押胜率要按“能不能兑现”打折：离按钮越远、人越多，折得越狠；全押时全额兑现
  const aheadOfRaiser =
    raiser >= 0
      ? buttonDistance(game.seats, game.dealer, seat.id) <=
        buttonDistance(game.seats, game.dealer, raiser)
      : positional === 'button' || positional === 'late'
  const realize = commitStack
    ? 1
    : clamp((aheadOfRaiser ? 0.95 : 0.86) * (opponents >= 3 ? 0.9 : 1), 0.6, 1)

  const ctx: Ctx = {
    game,
    seat,
    opts,
    brain,
    eq: clamp(raw + (draw(game, seat, 'read') - 0.5) * brain.noise, 0, 1),
    play: clamp(raw * realize + (draw(game, seat, 'read') - 0.5) * brain.noise, 0, 1),
    fair,
    roll: draw(game, seat, 'act'),
    opponents,
    potOdds: opts.toCall > 0 ? opts.toCall / (opts.potNow + opts.toCall) : 0,
    commitStack,
    inPosition: raiser >= 0 ? actsAfter(game, seat.id, raiser) : positional === 'button',
    preflop: game.phase === 'preflop',
    tightRaiser: pip !== null && pip < 0.24,
    looseRaiser: pip !== null && pip > 0.42,
    wet: wetness(game.board),
  }

  if (ctx.preflop && game.raiseCount === 0) return firstIn(ctx)
  return ctx.opts.toCall === 0 ? facingNobody(ctx) : facingBet(ctx)
}

/** 玩家提前离桌后由机器人立刻打完这手，不必逐个等待观战 */
export function fastForward(game: Game): Game {
  let g = game
  for (let step = 0; step < 400 && !g.handOver && !awaitingHuman(g); step++) {
    if (g.actor < 0) break
    g = act(g, decide(g))
  }
  return g
}
