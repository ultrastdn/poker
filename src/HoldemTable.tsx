import { useEffect, useMemo, useState } from 'react'
import ChipStack from '@/components/ChipStack'
import PlayerSeat from '@/components/PlayerSeat'
import PlayingCard from '@/components/PlayingCard'
import { decide } from '@/game/ai'
import { cardKey } from '@/game/cards'
import { equity } from '@/game/equity'
import { evaluate } from '@/game/evaluate'
import type { Action, Game, SeatStyle } from '@/game/poker'
import {
  act,
  awaitingHuman,
  blindPositions,
  newGame,
  potTotal,
  startHand,
  streetLabel,
  turnOptions,
} from '@/game/poker'
import { formatChips } from '@/utils/chips'
import './holdem.scss'

const SEATS: { name: string; style: SeatStyle }[] = [
  { name: '你', style: 'tight' },
  { name: '阿哲', style: 'loose' },
  { name: '老赵', style: 'aggro' },
  { name: '小薇', style: 'tight' },
  { name: 'Kay', style: 'aggro' },
]

const SEAT_POSITIONS = [
  { left: '0%', top: '0%' },
  { left: '15%', top: '85%' },
  { left: '32%', top: '20%' },
  { left: '68%', top: '20%' },
  { left: '85%', top: '85%' },
]

const BOARD_SLOTS = [0, 1, 2, 3, 4]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit
}

export default function HoldemTable() {
  const [game, setGame] = useState<Game>(() =>
    newGame({
      names: SEATS.map((seat) => seat.name),
      styles: SEATS.map((seat) => seat.style),
      stack: 500,
      sb: 5,
      bb: 10,
      seed: 20261008,
    }),
  )
  const [raiseMode, setRaiseMode] = useState(false)
  const [raiseTo, setRaiseTo] = useState<number | null>(null)

  const opts = turnOptions(game)
  const myTurn = awaitingHuman(game)
  const hero = game.seats[0]
  const pot = potTotal(game.seats)

  useEffect(() => {
    if (game.phase === 'idle' || game.handOver || game.actor < 0 || awaitingHuman(game)) return
    const delay = 560 + ((game.handNo * 31 + game.actor * 17) % 460)
    const timer = window.setTimeout(() => {
      setGame((current) => {
        if (current.handOver || current.actor < 0 || awaitingHuman(current)) return current
        return act(current, decide(current))
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [game])

  useEffect(() => {
    setRaiseMode(false)
    setRaiseTo(null)
  }, [game.actor, game.phase])

  const submit = (action: Action) => setGame((current) => act(current, action))
  const deal = () => setGame((current) => startHand(current))

  const opponentsLeft = game.seats.filter((seat) => seat.id !== 0 && !seat.folded).length

  const madeHand = useMemo(() => {
    if (hero.hole.length !== 2 || hero.folded || game.board.length < 3) return null
    return evaluate([...hero.hole, ...game.board])
  }, [hero.hole, hero.folded, game.board])

  const winRate = useMemo(() => {
    if (hero.hole.length !== 2 || hero.folded || game.handOver || opponentsLeft < 1) return null
    return equity({
      hole: hero.hole,
      board: game.board,
      opponents: opponentsLeft,
      trials: game.board.length === 0 ? 70 : 90,
    })
  }, [hero.hole, hero.folded, game.board, game.handOver, opponentsLeft])

  const raiseMin = opts?.raiseMin ?? 0
  const raiseMax = opts?.raiseMax ?? 0
  const raiseValue = clamp(raiseTo ?? raiseMin, raiseMin, raiseMax)
  const potAfterCall = pot + (opts?.toCall ?? 0)
  const step = game.bbAmount
  const toCall = opts?.toCall ?? 0
  const callIsStack = toCall > 0 && toCall >= hero.stack

  const blinds = blindPositions(game)
  const positionLabel = (id: number): string => {
    if (id === game.dealer) return '按钮'
    if (id === blinds.sb) return '小盲'
    if (id === blinds.bb) return '大盲'
    return '闲位'
  }

  const heroWon = game.winners.some((winner) => winner.id === 0)
  const showOdds = !game.handOver && !hero.folded
  const oddsNote = game.handOver ? '本手结束' : hero.folded ? '已弃牌，旁观本手' : `对 ${opponentsLeft} 家胜率`

  return (
    <div className='holdem'>
      <div className='holdem__frame'>
        <header className='rail'>
          <span className='rail__name'>牌桌 4 · 无限注</span>
          <span className='rail__meta'>
            {game.phase === 'idle' ? '未开局' : `第 ${game.handNo} 手 · ${streetLabel(game)}`}
          </span>
          <span className='rail__blinds'>
            盲注 {game.sbAmount}/{game.bbAmount}
          </span>
        </header>

        <section className='table'>
          <div className='table__felt'>
            {game.seats.slice(1).map((seat) => (
              <PlayerSeat
                key={seat.id}
                seat={seat}
                isDealer={seat.id === game.dealer}
                isActor={game.actor === seat.id && !game.handOver}
                position={SEAT_POSITIONS[seat.id]}
              />
            ))}

            <div className='felt__board'>
              {BOARD_SLOTS.map((index) => {
                const card = game.board[index]
                return (
                  <PlayingCard
                    key={card ? cardKey(card) : `slot-${index}`}
                    card={card}
                    size='board'
                    dealIndex={game.board.length === 3 ? index : 0}
                  />
                )
              })}
            </div>

            <div className='felt__pot'>
              <ChipStack amount={pot} limit={6} scale='pot' />
              <div className='placard'>
                <span className='placard__eyebrow'>彩池</span>
                <span className='placard__value'>{formatChips(pot)}</span>
              </div>
            </div>

            {game.phase === 'idle' ? (
              <div className='overlay'>
                <div className='overlay__plate'>
                  <span className='overlay__eyebrow'>HOLD&apos;EM ROOM</span>
                  <h1 className='overlay__title'>五人牌桌，打一手真规则</h1>
                  <p className='overlay__text'>
                    起始 500 码，盲注 5/10。两张底牌只有你能看，五张公共牌大家共用，四轮下注后比最大的五张牌型。
                  </p>
                  <button className='btn btn--raise btn--wide' onClick={deal}>
                    开始牌局
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className={`hero${heroWon ? ' hero--won' : ''}${myTurn ? ' hero--turn' : ''}`}
        >
          <div className='hero__cards'>
            {hero.hole.map((card, index) => (
              <div className={`hero__slot hero__slot--${index === 0 ? 'left' : 'right'}`} key={cardKey(card)}>
                <PlayingCard card={card} size='hero' dealIndex={index} />
              </div>
            ))}
            {hero.hole.length < 2
              ? [0, 1].slice(hero.hole.length).map((index) => (
                  <div className={`hero__slot hero__slot--${index === 0 ? 'left' : 'right'}`} key={`hero-slot-${index}`}>
                    <PlayingCard size='hero' />
                  </div>
                ))
              : null}
          </div>

          <div className='hero__info'>
            <div className='hero__line'>
              <span className='hero__name'>你</span>
              <span className='hero__pos'>{positionLabel(0)}</span>
              <span className='hero__stack'>{formatChips(hero.stack)}</span>
            </div>
            <div className='hero__hand'>
              <span className='hero__hand-name'>
                {madeHand ? madeHand.name : hero.folded ? '已弃牌' : '起手牌'}
              </span>
              <span className='hero__hand-en'>{madeHand?.nameEn}</span>
            </div>
            <div className='meter'>
              <div
                className='meter__fill'
                style={{ width: `${Math.round((winRate ?? 0) * 100)}%` }}
              />
            </div>
            <div className='hero__odds'>
              <span>{oddsNote}</span>
              {showOdds ? <strong>{Math.round((winRate ?? 0) * 100)}%</strong> : null}
            </div>
          </div>
        </section>

        <section className='dock'>
          {game.phase === 'idle' ? (
            <p className='dock__note'>按下「开始牌局」发第一手。</p>
          ) : game.handOver ? (
            <div className='settle'>
              <div className='settle__head'>
                <span className='settle__eyebrow'>{game.showdownSeen ? '比牌结果' : '无人跟注'}</span>
                {game.pots.length > 1 ? (
                  <span className='settle__pots'>{game.pots.length} 层彩池</span>
                ) : null}
              </div>
              <ul className='settle__list'>
                {game.winners.map((winner) => (
                  <li className='settle__row' key={winner.id}>
                    <span className='settle__name'>{winner.name}</span>
                    {winner.hand ? <span className='settle__hand'>{winner.hand}</span> : null}
                    <span className='settle__amount'>+{formatChips(winner.amount)}</span>
                  </li>
                ))}
              </ul>
              <button className='btn btn--raise btn--wide' onClick={deal}>
                下一手
              </button>
            </div>
          ) : !myTurn || !opts ? (
            <div className='dock__waiting'>等待 {game.seats[game.actor]?.name ?? '发牌'} 行动</div>
          ) : raiseMode ? (
            <div className='raise'>
              <div className='raise__head'>
                <span className='raise__eyebrow'>加注到</span>
                <span className='raise__value'>{formatChips(raiseValue)}</span>
              </div>
              <input
                className='raise__slider'
                type='range'
                min={raiseMin}
                max={raiseMax}
                step={step}
                value={raiseValue}
                aria-label='加注额度'
                onChange={(event) => setRaiseTo(Number(event.target.value))}
              />
              <div className='raise__presets'>
                {[
                  { label: '1/2 池', value: roundTo(opts.callTo + potAfterCall * 0.5, step) },
                  { label: '3/4 池', value: roundTo(opts.callTo + potAfterCall * 0.75, step) },
                  { label: '底池', value: roundTo(opts.callTo + potAfterCall, step) },
                  { label: '全押', value: opts.raiseMax },
                ].map((preset) => (
                  <button
                    className='preset'
                    key={preset.label}
                    onClick={() => setRaiseTo(clamp(preset.value, raiseMin, raiseMax))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className='raise__actions'>
                <button className='btn btn--fold' onClick={() => setRaiseMode(false)}>
                  返回
                </button>
                <button
                  className='btn btn--raise'
                  onClick={() => submit({ type: 'raise', to: raiseValue })}
                >
                  加注到 {formatChips(raiseValue)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button className='btn btn--fold' onClick={() => submit({ type: 'fold' })}>
                弃牌
              </button>
              <button
                className='btn btn--call'
                onClick={() => submit(toCall === 0 ? { type: 'check' } : { type: 'call' })}
              >
                {toCall === 0 ? '过牌' : `跟注 ${formatChips(toCall)}${callIsStack ? '（全押）' : ''}`}
              </button>
              <button
                className='btn btn--raise'
                disabled={!opts.canRaise}
                onClick={() => setRaiseMode(true)}
              >
                加注
              </button>
            </>
          )}
        </section>

        <p className='log' aria-live='polite'>
          {game.log
            .slice(-3)
            .reverse()
            .map((line) => (
              <span className={`log__line log__line--${line.kind}`} key={line.id}>
                {line.text}
              </span>
            ))}
        </p>
      </div>
    </div>
  )
}
