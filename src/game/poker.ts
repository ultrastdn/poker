import type { Card } from './cards'
import { cardLabel, formatCards, standardDeck } from './cards'
import type { Hand } from './evaluate'
import { compareScore, evaluate } from './evaluate'
import { freshSeed, hashKey, mulberry32, shuffle } from './rng'

export type Phase = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export type SeatStyle = 'tight' | 'loose' | 'aggro'

export type Difficulty = 'easy' | 'standard' | 'sharp'

export type SeatRole = 'button' | 'blind' | 'early' | 'middle' | 'late'

export type SeatRead = {
  dealt: number
  played: number
  raised: number
  folded: number
}

export type Seat = {
  id: number
  name: string
  human: boolean
  style: SeatStyle
  stack: number
  hole: Card[]
  wager: number
  committed: number
  folded: boolean
  allIn: boolean
  acted: boolean
  won: number
  reveal: boolean
}

export type Pot = {
  amount: number
  candidates: number[]
}

export type Winner = {
  id: number
  name: string
  amount: number
  hand: string
  cards: Card[]
}

export type LogKind = 'hand' | 'action' | 'street' | 'result'
export type LogLine = { id: number; kind: LogKind; text: string }

export type HandOutcome = 'win' | 'lose' | 'fold' | 'even'

export type HandRecord = {
  handNo: number
  outcome: HandOutcome
  invested: number
  payout: number
  net: number
  heroCards: Card[]
  heroHand: string
  winnerName: string
  winnerHand: string
  showdown: boolean
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }

export type Game = {
  seats: Seat[]
  deck: Card[]
  board: Card[]
  phase: Phase
  dealer: number
  handNo: number
  startingStack: number
  sbAmount: number
  bbAmount: number
  target: number
  actor: number
  aggressor: number
  preflopAggressor: number
  raiseCount: number
  difficulty: Difficulty
  reads: SeatRead[]
  pots: Pot[]
  winners: Winner[]
  history: HandRecord[]
  showdownSeen: boolean
  log: LogLine[]
  logSeq: number
  seed: number
  handOver: boolean
}

export type TurnOptions = {
  actorId: number
  name: string
  toCall: number
  callTo: number
  checkAvailable: boolean
  raiseMin: number
  raiseMax: number
  canRaise: boolean
  potNow: number
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const alive = (seat: Seat): boolean => !seat.folded
const able = (seat: Seat): boolean => !seat.folded && !seat.allIn && seat.stack > 0

function orderedSeats(seats: readonly Seat[], from: number): Seat[] {
  const n = seats.length
  const out: Seat[] = []
  for (let i = 0; i < n; i++) out.push(seats[(from + i) % n])
  return out
}

function seatAt(seats: readonly Seat[], index: number): number {
  const n = seats.length
  return ((index % n) + n) % n
}

export function blindPositions(g: Game): { sb: number; bb: number } {
  const n = g.seats.length
  if (n === 2) return { sb: g.dealer, bb: seatAt(g.seats, g.dealer + 1) }
  return { sb: seatAt(g.seats, g.dealer + 1), bb: seatAt(g.seats, g.dealer + 2) }
}

/** 距按钮几个座位：0=按钮，1=小盲，2=大盲，最大=切位 */
export function buttonDistance(seats: readonly Seat[], dealer: number, id: number): number {
  const n = seats.length
  return ((id - dealer) % n + n) % n
}

export function roleOf(g: Game, id: number): SeatRole {
  const distance = buttonDistance(g.seats, g.dealer, id)
  if (distance === 0) return 'button'
  const upright = g.seats.length - 3
  if (distance === 1 || distance === 2) return 'blind'
  const placed = distance - 3
  if (placed < Math.max(1, Math.ceil(upright / 3))) return 'early'
  if (placed >= upright - Math.max(1, Math.floor(upright / 3))) return 'late'
  return 'middle'
}

/** 本街第一个行动者：翻牌前是枪口位，翻牌后是按钮左边 */
export function streetFirstSeat(g: Game): number {
  if (g.phase === 'preflop') return seatAt(g.seats, blindPositions(g).bb + 1)
  return seatAt(g.seats, g.dealer + 1)
}

/** 本街的行动次序：越大越晚行动（越有位置） */
export function positionIndex(g: Game, id: number): number {
  return seatAt(g.seats, id - streetFirstSeat(g))
}

export function actsAfter(g: Game, id: number, other: number): boolean {
  return positionIndex(g, id) > positionIndex(g, other)
}

function nextSeatWhere(seats: readonly Seat[], from: number, test: (seat: Seat) => boolean): number {
  for (const seat of orderedSeats(seats, seatAt(seats, from))) {
    if (test(seat)) return seat.id
  }
  return -1
}

export function potTotal(seats: readonly Seat[]): number {
  return seats.reduce((sum, seat) => sum + seat.committed, 0)
}

function labelOf(seats: readonly Seat[], id: number): string {
  return seats[id]?.name ?? ''
}

function pushLog(g: Game, kind: LogKind, text: string): void {
  g.logSeq += 1
  g.log.push({ id: g.logSeq, kind, text })
  if (g.log.length > 40) g.log.shift()
}

export function newGame(config: {
  names: string[]
  styles?: SeatStyle[]
  stack?: number
  sb?: number
  bb?: number
  seed?: number
  difficulty?: Difficulty
}): Game {
  const startingStack = config.stack ?? 1500
  const sbAmount = config.sb ?? 10
  const bbAmount = config.bb ?? 20
  const seed = config.seed ?? freshSeed()
  const seats: Seat[] = config.names.map((name, id) => ({
    id,
    name,
    human: id === 0,
    style: config.styles?.[id] ?? 'tight',
    stack: startingStack,
    hole: [],
    wager: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
    won: 0,
    reveal: false,
  }))
  const game: Game = {
    seats,
    deck: [],
    board: [],
    phase: 'idle',
    dealer: seats.length - 1,
    handNo: 0,
    startingStack,
    sbAmount,
    bbAmount,
    target: 0,
    actor: -1,
    aggressor: -1,
    preflopAggressor: -1,
    raiseCount: 0,
    difficulty: config.difficulty ?? 'standard',
    reads: seats.map(() => ({ dealt: 0, played: 0, raised: 0, folded: 0 })),
    pots: [],
    winners: [],
    history: [],
    showdownSeen: false,
    log: [],
    logSeq: 0,
    seed,
    handOver: false,
  }
  return game
}

function postBlind(seat: Seat, amount: number): number {
  const paid = Math.min(amount, seat.stack)
  seat.stack -= paid
  seat.wager += paid
  seat.committed += paid
  if (seat.stack === 0) seat.allIn = true
  return paid
}

export function startHand(game: Game): Game {
  const g = clone(game)
  g.handNo += 1
  g.deck = shuffle(standardDeck(), mulberry32(hashKey([String(g.seed), String(g.handNo)])))
  g.board = []
  g.pots = []
  g.winners = []
  g.log = []
  g.logSeq = 0
  g.showdownSeen = false
  g.handOver = false
  g.phase = 'preflop'
  g.target = 0

  g.dealer = seatAt(g.seats, g.dealer + 1)
  g.aggressor = -1
  g.preflopAggressor = -1
  g.raiseCount = 0

  for (const seat of g.seats) {
    seat.hole = []
    seat.wager = 0
    seat.committed = 0
    seat.folded = false
    seat.allIn = false
    seat.acted = false
    seat.won = 0
    seat.reveal = false
    if (seat.stack <= 0) {
      seat.stack = g.startingStack
      pushLog(g, 'hand', `${seat.name} 补码 ${g.startingStack}`)
    }
    g.reads[seat.id].dealt += 1
  }

  const { sb: sbIndex, bb: bbIndex } = blindPositions(g)
  const sbSeat = g.seats[sbIndex]
  const bbSeat = g.seats[bbIndex]

  pushLog(
    g,
    'hand',
    `第 ${g.handNo} 手 · 按钮 ${g.seats[g.dealer].name} · 盲注 ${g.sbAmount}/${g.bbAmount}`,
  )
  postBlind(sbSeat, g.sbAmount)
  postBlind(bbSeat, g.bbAmount)
  pushLog(g, 'action', `${sbSeat.name} 小盲 ${sbSeat.wager}`)
  pushLog(g, 'action', `${bbSeat.name} 大盲 ${bbSeat.wager}`)

  g.target = Math.max(sbSeat.wager, bbSeat.wager)
  for (const seat of g.seats) {
    seat.hole = [g.deck.shift() as Card, g.deck.shift() as Card]
  }
  g.actor = nextSeatWhere(g.seats, bbIndex + 1, able)
  if (g.actor < 0) g.actor = nextSeatWhere(g.seats, bbIndex, able)
  return g
}

function seatStackFor(seat: Seat): number {
  return seat.wager + seat.stack
}

export function turnOptions(g: Game): TurnOptions | null {
  if (g.actor < 0 || g.handOver) return null
  const seat = g.seats[g.actor]
  if (!seat || !able(seat)) return null
  const potNow = potTotal(g.seats)
  const toCall = Math.max(0, Math.min(g.target - seat.wager, seat.stack))
  const maxTo = seatStackFor(seat)
  const raiseMinTo = Math.min(Math.max(g.target + g.bbAmount, g.target + 1), maxTo)
  const canRaise = maxTo > g.target
  return {
    actorId: seat.id,
    name: seat.name,
    toCall,
    callTo: seat.wager + toCall,
    checkAvailable: g.target <= seat.wager,
    raiseMin: raiseMinTo,
    raiseMax: maxTo,
    canRaise,
    potNow,
  }
}

function putChips(seat: Seat, amount: number): void {
  const paid = Math.min(Math.max(0, amount), seat.stack)
  seat.stack -= paid
  seat.wager += paid
  seat.committed += paid
  if (seat.stack === 0) seat.allIn = true
}

function streetComplete(g: Game): boolean {
  return g.seats.every((seat) => !able(seat) || (seat.acted && seat.wager >= g.target))
}

function openSeatForStreet(g: Game): number {
  return nextSeatWhere(g.seats, seatAt(g.seats, g.dealer + 1), able)
}

function collectStreet(g: Game): void {
  for (const seat of g.seats) {
    seat.wager = 0
    seat.acted = false
  }
  g.target = 0
  g.aggressor = -1
  g.raiseCount = 0
}

function dealCount(g: Game, count: number): Card[] {
  g.deck.shift()
  const dealt = g.deck.splice(0, count)
  g.board.push(...dealt)
  return dealt
}

function countAble(seats: readonly Seat[]): number {
  return seats.filter(able).length
}

function nextStreet(g: Game): void {
  collectStreet(g)
  if (g.phase === 'preflop') {
    g.phase = 'flop'
    const dealt = dealCount(g, 3)
    pushLog(g, 'street', `翻牌 ${formatCards(dealt)}`)
  } else if (g.phase === 'flop') {
    g.phase = 'turn'
    const dealt = dealCount(g, 1)
    pushLog(g, 'street', `转牌 ${cardLabel(dealt[0])}`)
  } else if (g.phase === 'turn') {
    g.phase = 'river'
    const dealt = dealCount(g, 1)
    pushLog(g, 'street', `河牌 ${cardLabel(dealt[0])}`)
  } else {
    settle(g)
    return
  }

  if (countAble(g.seats) <= 1) {
    pushLog(g, 'action', '全部押注，直接发完公共牌')
    nextStreet(g)
    return
  }
  g.actor = openSeatForStreet(g)
}

function buildPots(seats: readonly Seat[]): Pot[] {
  const levels = [...new Set(seats.filter((s) => s.committed > 0).map((s) => s.committed))].sort(
    (a, b) => a - b,
  )
  const pots: Pot[] = []
  let prev = 0
  for (const level of levels) {
    let amount = 0
    for (const seat of seats) {
      amount += Math.max(0, Math.min(seat.committed, level) - Math.min(seat.committed, prev))
    }
    if (amount > 0) {
      pots.push({
        amount,
        candidates: seats.filter((s) => alive(s) && s.committed >= level).map((s) => s.id),
      })
    }
    prev = level
  }
  return pots
}

export function settle(g: Game): void {
  awardPots(g)
  pushRecord(g)
}

function pushRecord(g: Game): void {
  const hero = g.seats.find((seat) => seat.human) ?? g.seats[0]
  const invested = hero.committed
  const payout = hero.won
  const net = payout - invested
  const top = g.winners[0]
  g.history.push({
    handNo: g.handNo,
    outcome: hero.folded ? 'fold' : net > 0 ? 'win' : net < 0 ? 'lose' : 'even',
    invested,
    payout,
    net,
    heroCards: [...hero.hole],
    heroHand: hero.reveal ? evaluate([...hero.hole, ...g.board]).name : '',
    winnerName: top?.name ?? '',
    winnerHand: top?.hand ?? '',
    showdown: g.showdownSeen,
  })
}

function awardPots(g: Game): void {
  g.phase = 'showdown'
  g.handOver = true
  const contenders = g.seats.filter(alive)

  if (contenders.length <= 1) {
    const winnerSeat = contenders[0] ?? g.seats[g.dealer]
    const amount = potTotal(g.seats)
    winnerSeat.stack += amount
    winnerSeat.won += amount
    g.winners = [
      {
        id: winnerSeat.id,
        name: winnerSeat.name,
        amount,
        hand: '',
        cards: winnerSeat.hole,
      },
    ]
    pushLog(g, 'result', `${winnerSeat.name} 收下 ${amount}`)
    return
  }

  const hands = new Map<number, Hand>()
  for (const seat of contenders) {
    hands.set(seat.id, evaluate([...seat.hole, ...g.board]))
    seat.reveal = true
  }
  g.showdownSeen = true

  const potList = buildPots(g.seats)
  g.pots = potList
  const awarded = new Map<number, number>()

  for (const pot of potList) {
    const pool = pot.candidates.filter((id) => hands.has(id))
    if (pool.length === 0) {
      const fallback = nextSeatWhere(g.seats, seatAt(g.seats, g.dealer + 1), alive)
      if (fallback >= 0) awarded.set(fallback, (awarded.get(fallback) ?? 0) + pot.amount)
      continue
    }
    let best = hands.get(pool[0]) as Hand
    let ids: number[] = [pool[0]]
    for (const id of pool.slice(1)) {
      const hand = hands.get(id) as Hand
      const diff = compareScore(hand.score, best.score)
      if (diff > 0) {
        best = hand
        ids = [id]
      } else if (diff === 0) {
        ids.push(id)
      }
    }
    const share = Math.floor(pot.amount / ids.length)
    let remainder = pot.amount - share * ids.length
    for (const id of orderedSeatIds(g.seats, g.dealer)) {
      if (remainder <= 0) break
      if (ids.includes(id)) {
        awarded.set(id, (awarded.get(id) ?? 0) + 1)
        remainder -= 1
      }
    }
    for (const id of ids) {
      awarded.set(id, (awarded.get(id) ?? 0) + share)
    }
    const names = ids.map((id) => labelOf(g.seats, id)).join(' / ')
    pushLog(
      g,
      'result',
      `彩池 ${pot.amount} · ${names} ${best.name}${ids.length > 1 ? '（平分）' : ''}`,
    )
  }

  g.winners = [...awarded.entries()]
    .map(([id, amount]) => ({
      id,
      name: g.seats[id].name,
      amount,
      hand: (hands.get(id) as Hand).name,
      cards: g.seats[id].hole,
    }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  for (const winner of g.winners) {
    g.seats[winner.id].stack += winner.amount
    g.seats[winner.id].won += winner.amount
  }
  if (g.winners.length > 0) {
    const top = g.winners[0]
    pushLog(g, 'result', `${top.name} 赢得 ${top.amount}（${top.hand}）`)
  }
}

function orderedSeatIds(seats: readonly Seat[], dealer: number): number[] {
  const n = seats.length
  const out: number[] = []
  for (let i = 1; i <= n; i++) out.push(seatAt(seats, dealer + i))
  return out
}

function finishIfUncontested(g: Game): boolean {
  if (g.seats.filter(alive).length > 1) return false
  if (g.phase !== 'showdown') collectStreet(g)
  settle(g)
  return true
}

export function act(game: Game, action: Action): Game {
  const g = clone(game)
  if (g.handOver || g.actor < 0) return g
  const seat = g.seats[g.actor]
  if (!seat || !able(seat)) return g
  const me = g.actor

  g.actor = -1

  if (action.type === 'fold') {
    seat.folded = true
    seat.acted = true
    g.reads[me].folded += 1
    pushLog(g, 'action', `${seat.name} 弃牌`)
  } else if (action.type === 'check') {
    if (g.target > seat.wager) return game
    seat.acted = true
    pushLog(g, 'action', `${seat.name} 过牌`)
  } else if (action.type === 'call') {
    const diff = Math.min(g.target - seat.wager, seat.stack)
    if (diff <= 0) {
      seat.acted = true
      pushLog(g, 'action', `${seat.name} 过牌`)
    } else {
      putChips(seat, diff)
      seat.acted = true
      if (g.phase === 'preflop' && g.raiseCount > 0) g.reads[me].played += 1
      pushLog(g, 'action', `${seat.name} 跟注 ${seat.wager}${seat.allIn ? '（全押）' : ''}`)
    }
  } else {
    const maxTo = seatStackFor(seat)
    const wanted = Math.min(Math.max(action.to, g.target + 1), maxTo)
    if (wanted <= g.target) {
      const diff = Math.min(g.target - seat.wager, seat.stack)
      putChips(seat, diff)
      seat.acted = true
      pushLog(g, 'action', `${seat.name} 跟注 ${seat.wager}`)
    } else {
      putChips(seat, wanted - seat.wager)
      const raisedTo = seat.wager
      const reopened = raisedTo >= g.target + g.bbAmount
      g.target = Math.max(g.target, raisedTo)
      seat.acted = true
      g.aggressor = me
      g.raiseCount += 1
      g.reads[me].raised += 1
      if (g.phase === 'preflop') {
        g.preflopAggressor = me
        g.reads[me].played += 1
      }
      for (const other of g.seats) {
        if (other.id !== me && able(other) && other.wager < g.target) other.acted = false
      }
      pushLog(
        g,
        'action',
        `${seat.name} ${reopened ? '加注到' : '押到'} ${raisedTo}${seat.allIn ? '（全押）' : ''}`,
      )
    }
  }

  if (finishIfUncontested(g)) return g
  if (streetComplete(g)) {
    nextStreet(g)
    return g
  }
  g.actor = nextSeatWhere(g.seats, me + 1, able)
  return g
}

/** 不在自己行动顺序上时提前弃牌：刚看完底牌就不想打这手 */
export function foldSeat(game: Game, id: number): Game {
  const target = game.seats[id]
  if (game.handOver || game.actor < 0 || !target || !able(target)) return game
  if (id === game.actor) return act(game, { type: 'fold' })

  const g = clone(game)
  const seat = g.seats[id]
  seat.folded = true
  seat.acted = true
  g.reads[id].folded += 1
  pushLog(g, 'action', `${seat.name} 提前弃牌`)
  finishIfUncontested(g)
  return g
}

export function awaitingHuman(g: Game): boolean {
  if (g.handOver || g.actor < 0) return false
  return g.seats[g.actor]?.human === true && able(g.seats[g.actor])
}

export function streetLabel(g: Game): string {
  if (g.phase === 'preflop') return '翻牌前'
  if (g.phase === 'flop') return '翻牌'
  if (g.phase === 'turn') return '转牌'
  if (g.phase === 'river') return '河牌'
  if (g.phase === 'showdown') return '比牌'
  return '等待开局'
}
