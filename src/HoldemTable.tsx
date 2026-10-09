import { useEffect, useMemo, useRef, useState } from 'react'
import ChipStack from '@/components/ChipStack'
import HandHistory from '@/components/HandHistory'
import PlayerSeat from '@/components/PlayerSeat'
import PlayingCard from '@/components/PlayingCard'
import SettingsPanel from '@/components/SettingsPanel'
import { decide, fastForward } from '@/game/ai'
import { cardKey } from '@/game/cards'
import { advise } from '@/game/coach'
import { dailySeed } from '@/game/daily'
import { equity } from '@/game/equity'
import { evaluate } from '@/game/evaluate'
import { oddsInfo } from '@/game/odds'
import { drawInfo } from '@/game/outs'
import type { Action, Game } from '@/game/poker'
import {
  act,
  awaitingHuman,
  blindPositions,
  foldSeat,
  newGame,
  potTotal,
  roleOf,
  startHand,
  streetLabel,
  turnOptions,
} from '@/game/poker'
import type { Settings, TableConfig } from '@/game/settings'
import {
  DECISION_SECONDS,
  DEFAULT_CONFIG,
  DEFAULT_SETTINGS,
  TIME_BANK,
} from '@/game/settings'
import { playSound, setSoundEnabled } from '@/game/sound'
import { loadPersisted, savePersisted } from '@/game/storage'
import { summarize, tone } from '@/game/session'
import type { TableSize } from '@/game/tables'
import { DIFFICULTY_LABELS, isCrowded, rosterOf, seatLayout } from '@/game/tables'
import { formatChips, signedChips } from '@/utils/chips'
import './holdem.scss'

const TABLE_TITLES: Record<TableSize, string> = {
  2: '单挑桌，位置和读牌最吃功夫',
  6: '六人桌，标准节奏',
  9: '九人满员桌，耐心比勇气值钱',
}

function buildGame(config: TableConfig, seed?: number): Game {
  const roster = rosterOf(config.size)
  return newGame({
    names: roster.map((seat) => seat.name),
    styles: roster.map((seat) => seat.style),
    stack: config.stack,
    sb: config.sb,
    bb: config.bb,
    difficulty: config.difficulty,
    seed,
  })
}

const BOARD_SLOTS = [0, 1, 2, 3, 4]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function roundTo(value: number, unit: number): number {
  return Math.round(value / unit) * unit
}

function playAction(action: Action): void {
  if (action.type === 'fold') playSound('fold')
  else if (action.type === 'check') playSound('check')
  else playSound('chip')
}

export default function HoldemTable() {
  const boot = useMemo(() => loadPersisted(), [])
  const [config, setConfig] = useState<TableConfig>(boot?.config ?? DEFAULT_CONFIG)
  const [settings, setSettings] = useState<Settings>(boot?.settings ?? DEFAULT_SETTINGS)
  const [game, setGame] = useState<Game>(() => boot?.game ?? buildGame(DEFAULT_CONFIG))
  const [daily, setDaily] = useState(false)
  const [raiseMode, setRaiseMode] = useState(false)
  const [raiseTo, setRaiseTo] = useState<number | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [timeLeft, setTimeLeft] = useState(DECISION_SECONDS)
  const [bank, setBank] = useState(TIME_BANK)
  const decisionRef = useRef('')
  const prevOver = useRef(false)

  const layout = useMemo(() => seatLayout(config.size), [config.size])
  const crowded = isCrowded(config.size)
  const opts = turnOptions(game)
  const myTurn = awaitingHuman(game)
  const hero = game.seats[0]
  const pot = potTotal(game.seats)
  const summary = useMemo(() => summarize(game.history), [game.history])
  const paused = showSettings || showRecords

  const toCall = opts?.toCall ?? 0
  const opponentsLeft = game.seats.filter((seat) => seat.id !== 0 && !seat.folded).length

  // 存档：任一状态变化后防抖写入 localStorage
  useEffect(() => {
    const id = window.setTimeout(() => savePersisted({ config, settings, game }), 400)
    return () => window.clearTimeout(id)
  }, [config, settings, game])

  useEffect(() => {
    setSoundEnabled(settings.sound)
  }, [settings.sound])

  // 机器人行动
  useEffect(() => {
    if (game.phase === 'idle' || game.handOver || game.actor < 0 || awaitingHuman(game)) return
    const delay = 560 + ((game.handNo * 31 + game.actor * 17) % 460)
    const timer = window.setTimeout(() => {
      const action = decide(game)
      playAction(action)
      setGame((current) => {
        if (current.handOver || current.actor < 0 || awaitingHuman(current)) return current
        return act(current, action)
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [game])

  useEffect(() => {
    setRaiseMode(false)
    setRaiseTo(null)
  }, [game.actor, game.phase])

  // 每手刷新时间银行
  useEffect(() => {
    setBank(TIME_BANK)
  }, [game.handNo])

  // 轮到英雄且进入新决策点时重置倒计时
  useEffect(() => {
    if (!myTurn) {
      decisionRef.current = ''
      return
    }
    const sig = `${game.handNo}:${game.phase}:${game.board.length}`
    if (decisionRef.current !== sig) {
      decisionRef.current = sig
      setTimeLeft(DECISION_SECONDS)
    }
  }, [myTurn, game.handNo, game.phase, game.board.length])

  // 倒计时递减
  useEffect(() => {
    if (!settings.timer || paused || !myTurn || game.handOver || game.phase === 'idle' || timeLeft <= 0)
      return
    const id = window.setTimeout(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000)
    return () => window.clearTimeout(id)
  }, [settings.timer, paused, myTurn, game.handOver, game.phase, timeLeft])

  // 时间归零：先用时间银行续命，用尽则自动过牌/弃牌
  useEffect(() => {
    if (!settings.timer || paused || !myTurn || timeLeft > 0) return
    if (bank >= 10) {
      setBank((b) => b - 10)
      setTimeLeft(10)
      playSound('tick')
      return
    }
    const options = turnOptions(game)
    const auto: Action = !options || options.toCall === 0 ? { type: 'check' } : { type: 'fold' }
    playAction(auto)
    setGame((current) => (awaitingHuman(current) ? act(current, auto) : current))
  }, [timeLeft, bank, settings.timer, paused, myTurn, game])

  // 结算音效
  useEffect(() => {
    if (game.handOver && !prevOver.current && game.winners.some((w) => w.id === 0)) {
      playSound('win')
    }
    prevOver.current = game.handOver
  }, [game.handOver, game.winners])

  const submit = (action: Action) => {
    playAction(action)
    setGame((current) => act(current, action))
  }
  const deal = () => {
    playSound('deal')
    setGame((current) => startHand(current))
  }
  const applyConfig = (next: TableConfig) => {
    setConfig(next)
    setDaily(false)
    setShowSettings(false)
    setRaiseMode(false)
    setRaiseTo(null)
    playSound('deal')
    setGame(buildGame(next))
  }
  const patchSettings = (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch }))
  const moveTables = () => {
    setDaily(false)
    playSound('deal')
    setGame(buildGame(config))
    setRaiseMode(false)
    setRaiseTo(null)
  }
  const startDaily = () => {
    const cfg: TableConfig = { size: 6, difficulty: 'standard', stack: 500, sb: 5, bb: 10 }
    setConfig(cfg)
    setDaily(true)
    setShowSettings(false)
    playSound('deal')
    setGame(startHand(buildGame(cfg, dailySeed())))
  }
  /** 弃掉这手并让机器人瞬间打完，直接开下一手，不用留在牌桌上观战 */
  const quickFold = () => {
    playSound('fold')
    setGame((current) => {
      const me = current.seats.find((seat) => seat.human)
      if (!me) return current
      const folded = foldSeat(current, me.id)
      if (folded === current) return current
      const done = fastForward(folded)
      return done.handOver ? startHand(done) : done
    })
  }

  // 键盘快捷键
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const key = event.key.toLowerCase()

      if (key === 'escape') {
        setShowSettings(false)
        setShowRecords(false)
        setRaiseMode(false)
        return
      }
      if (showSettings) return

      if (game.phase === 'idle' || game.handOver) {
        if (key === 'enter' || key === ' ') {
          event.preventDefault()
          deal()
        }
        return
      }
      if (key === 'q') {
        if (!game.handOver && !hero.folded && !hero.allIn) quickFold()
        return
      }
      if (!myTurn) return
      const live = turnOptions(game)
      if (!live) return
      if (raiseMode) {
        if (key === 'enter') {
          const value = clamp(raiseTo ?? live.raiseMin, live.raiseMin, live.raiseMax)
          submit({ type: 'raise', to: value })
        } else if (key === 'escape') {
          setRaiseMode(false)
        }
        return
      }
      if (key === 'f') submit({ type: 'fold' })
      else if (key === 'c') submit(live.toCall === 0 ? { type: 'check' } : { type: 'call' })
      else if (key === 'r' && live.canRaise) setRaiseMode(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, myTurn, raiseMode, raiseTo, showSettings, hero.folded, hero.allIn])

  const canQuickFold =
    game.phase !== 'idle' && !game.handOver && !hero.folded && !hero.allIn && hero.stack > 0
  const quickFoldBtn = canQuickFold ? (
    <button type='button' className='btn btn--quick' onClick={quickFold}>
      快速弃牌<span className='btn__hint'>直接下一手</span>
    </button>
  ) : null

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

  const odds = useMemo(
    () => (winRate == null ? null : oddsInfo(winRate, toCall, pot)),
    [winRate, toCall, pot],
  )

  const draw = useMemo(() => {
    if (hero.hole.length !== 2 || hero.folded || game.handOver || game.board.length < 3) return null
    return drawInfo(hero.hole, game.board)
  }, [hero.hole, hero.folded, game.handOver, game.board])

  const advice = useMemo(() => {
    if (!settings.coach || !myTurn || !opts || hero.hole.length !== 2 || paused) return null
    return advise({
      hole: hero.hole,
      board: game.board,
      opponents: Math.max(1, opponentsLeft),
      pot,
      toCall: opts.toCall,
      canRaise: opts.canRaise,
      preflop: game.phase === 'preflop',
    })
  }, [settings.coach, myTurn, opts, paused, hero.hole, game.board, game.phase, opponentsLeft, pot])

  const raiseMin = opts?.raiseMin ?? 0
  const raiseMax = opts?.raiseMax ?? 0
  const raiseValue = clamp(raiseTo ?? raiseMin, raiseMin, raiseMax)
  const potAfterCall = pot + toCall
  const step = game.bbAmount
  const callIsStack = toCall > 0 && toCall >= hero.stack

  const positionLabel = (id: number): string => {
    const blinds = blindPositions(game)
    if (id === blinds.bb) return '大盲'
    if (id === blinds.sb) return game.seats.length === 2 ? '按钮/小盲' : '小盲'
    if (id === game.dealer) return '按钮'
    const role = roleOf(game, id)
    if (role === 'early') return '前位'
    if (role === 'middle') return '中位'
    return '后位'
  }

  const heroWon = game.winners.some((winner) => winner.id === 0)
  const showOdds = !game.handOver && !hero.folded
  const oddsNote = game.handOver ? '本手结束' : hero.folded ? '已弃牌，旁观本手' : `对 ${opponentsLeft} 家胜率`

  const timerBar =
    settings.timer && myTurn && !paused ? (
      <div className={`timer${timeLeft <= 5 ? ' timer--low' : ''}`}>
        <span
          className='timer__fill'
          style={{ width: `${Math.min(100, (timeLeft / DECISION_SECONDS) * 100)}%` }}
        />
        <span className='timer__text'>
          剩余 {timeLeft}s · 时间银行 {bank}s
        </span>
      </div>
    ) : null

  const coachBar = advice ? (
    <div className={`coach coach--${advice.action}`}>
      <span className='coach__badge'>教练 · {advice.label}</span>
      <span className='coach__why'>{advice.reason}</span>
    </div>
  ) : null

  const keysHint = (
    <p className='dock__keys'>
      <kbd>F</kbd>弃牌 <kbd>C</kbd>
      {toCall === 0 ? '过牌' : '跟注'} <kbd>R</kbd>加注 <kbd>Q</kbd>快速弃牌
    </p>
  )

  return (
    <div className='holdem'>
      <div className='holdem__frame'>
        <header className='rail'>
          <span className='rail__name'>
            {config.size} 人桌 · {DIFFICULTY_LABELS[config.difficulty]}
            {daily ? <span className='rail__daily'>每日一手</span> : null}
          </span>
          <span className='rail__meta'>
            {game.phase === 'idle' ? '未开局' : `第 ${game.handNo} 手 · ${streetLabel(game)}`}
          </span>
          <span className='rail__blinds'>
            盲注 {game.sbAmount}/{game.bbAmount}
          </span>
          <span className='rail__actions'>
            <button
              type='button'
              className={`rail__gear${showSettings ? ' rail__gear--on' : ''}`}
              aria-label='牌桌设置'
              onClick={() => {
                playSound('click')
                setShowSettings((open) => !open)
              }}
            >
              设置
            </button>
            <button
              type='button'
              className={`rail__record${showRecords ? ' rail__record--on' : ''}`}
              aria-expanded={showRecords}
              onClick={() => {
                playSound('click')
                setShowRecords((open) => !open)
              }}
            >
              记录
              {summary.hands > 0 ? (
                <span className={`rail__net rail__net--${tone(summary.net)}`}>
                  {signedChips(summary.net)}
                </span>
              ) : null}
            </button>
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
                compact={crowded}
                position={layout[seat.id]}
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
                  <h1 className='overlay__title'>{TABLE_TITLES[config.size]}</h1>

                  <dl className='brief'>
                    <div className='brief__cell'>
                      <dt>人数</dt>
                      <dd>{config.size} 人</dd>
                    </div>
                    <div className='brief__cell'>
                      <dt>机器人</dt>
                      <dd>{DIFFICULTY_LABELS[config.difficulty]}</dd>
                    </div>
                    <div className='brief__cell'>
                      <dt>起始码</dt>
                      <dd>{config.stack}</dd>
                    </div>
                    <div className='brief__cell'>
                      <dt>盲注</dt>
                      <dd>
                        {config.sb}/{config.bb}
                      </dd>
                    </div>
                  </dl>

                  <button className='btn btn--raise btn--wide' onClick={deal}>
                    开始牌局
                  </button>
                  <div className='overlay__row'>
                    <button className='btn btn--ghost' onClick={startDaily}>
                      每日一手
                    </button>
                    <button
                      className='btn btn--ghost'
                      onClick={() => {
                        playSound('click')
                        setShowSettings(true)
                      }}
                    >
                      牌桌设置
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className={`hero${heroWon ? ' hero--won' : ''}${myTurn ? ' hero--turn' : ''}`}>
          <div className='hero__cards'>
            {hero.hole.map((card, index) => (
              <div
                className={`hero__slot hero__slot--${index === 0 ? 'left' : 'right'}`}
                key={cardKey(card)}
              >
                <PlayingCard card={card} size='hero' dealIndex={index} />
              </div>
            ))}
            {hero.hole.length < 2
              ? [0, 1].slice(hero.hole.length).map((index) => (
                  <div
                    className={`hero__slot hero__slot--${index === 0 ? 'left' : 'right'}`}
                    key={`hero-slot-${index}`}
                  >
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
            {odds && toCall > 0 && showOdds ? (
              <div className={`hero__pot hero__pot--${odds.plusEV ? 'good' : 'bad'}`}>
                <span>
                  底池赔率 {odds.ratio.toFixed(1)}:1 · 需 {Math.round(odds.required * 100)}%
                </span>
                <strong>
                  {odds.plusEV ? '+' : ''}
                  {Math.round(odds.ev)} EV
                </strong>
              </div>
            ) : null}
            {draw && draw.outs > 0 ? (
              <div className='hero__draw'>
                <span>听牌 · 补牌 {draw.outs} 张</span>
                <strong>成牌 {Math.round(draw.hitProbability * 100)}%</strong>
              </div>
            ) : null}
          </div>
        </section>

        <section className='dock'>
          {myTurn && !paused ? timerBar : null}
          {coachBar}

          {game.phase === 'idle' ? (
            <p className='dock__note'>按下「开始牌局」发第一手，或用「每日一手」挑战固定牌局。</p>
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
              <div className='settle__foot'>
                <button className='btn btn--raise' onClick={deal}>
                  下一手
                </button>
                <button className='btn btn--fold' onClick={moveTables}>
                  换桌
                </button>
              </div>
            </div>
          ) : !myTurn || !opts ? (
            <>
              <div className='dock__waiting'>等待 {game.seats[game.actor]?.name ?? '发牌'} 行动</div>
              {quickFoldBtn}
            </>
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
              {quickFoldBtn}
              {keysHint}
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

        {showRecords ? (
          <HandHistory
            history={game.history}
            summary={summary}
            onClose={() => setShowRecords(false)}
          />
        ) : null}

        {showSettings ? (
          <SettingsPanel
            config={config}
            settings={settings}
            onSettings={patchSettings}
            onApply={applyConfig}
            onClose={() => setShowSettings(false)}
          />
        ) : null}
      </div>
    </div>
  )
}
