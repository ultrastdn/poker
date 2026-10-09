import { useMemo, useState } from 'react'
import PlayingCard from '@/components/PlayingCard'
import { cardKey } from '@/game/cards'
import { judgeDecision, VERDICT_LABELS } from '@/game/coach'
import type { Decision, HandRecord } from '@/game/poker'
import type { SessionSummary } from '@/game/session'
import { tone } from '@/game/session'
import { POSITION_LABELS, POSITION_ORDER, playerStats } from '@/game/stats'
import { formatChips, signedChips } from '@/utils/chips'
import './hand-history.scss'

function phrase(record: HandRecord): string {
  if (record.outcome === 'fold') return '弃牌'
  if (record.outcome === 'even') return '平分彩池'
  if (record.outcome === 'win') {
    if (!record.showdown) return '无人跟注'
    return record.heroHand ? `${record.heroHand} 拿下` : '拿下彩池'
  }
  const mine = record.heroHand ? `${record.heroHand} ` : ''
  const theirs = record.winnerHand ? `（${record.winnerHand}）` : ''
  return `${mine}输给 ${record.winnerName}${theirs}`
}

const ACTION_LABELS: Record<string, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
}

const STREET_LABELS: Record<string, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  showdown: '比牌',
}

function actionLabel(decision: Decision): string {
  const base = ACTION_LABELS[decision.action.type] ?? decision.action.type
  return decision.action.type === 'raise' && 'to' in decision.action
    ? `${base} ${decision.action.to}`
    : base
}

type Props = {
  history: HandRecord[]
  summary: SessionSummary
  onClose: () => void
}

export default function HandHistory({ history, summary, onClose }: Props) {
  const rows = useMemo(() => [...history].reverse(), [history])
  const stats = useMemo(() => playerStats(history), [history])
  const [open, setOpen] = useState<number | null>(null)
  const positions = POSITION_ORDER.filter((role) => stats.byPosition[role].hands > 0)

  return (
    <section className='record' aria-label='牌局记录'>
      <div className='record__grab' />
      <header className='record__head'>
        <span className='record__eyebrow'>牌局记录</span>
        <button className='record__close' onClick={onClose}>
          收起
        </button>
      </header>

      {history.length === 0 ? (
        <p className='record__empty'>
          还没有打完的手牌。每手结束后，这里会记下你投入多少、拿回多少，并可展开逐点复盘。
        </p>
      ) : (
        <>
          <div className='record__total'>
            <span className='record__total-label'>本局净胜</span>
            <span className={`record__total-value record__total-value--${tone(summary.net)}`}>
              {signedChips(summary.net)}
            </span>
          </div>

          <dl className='record__stats'>
            <div className='stat'>
              <dt>手数</dt>
              <dd className='stat__value'>{summary.hands}</dd>
            </div>
            <div className='stat'>
              <dt>胜负手</dt>
              <dd className='stat__value'>
                {summary.wins}/{summary.losses}
              </dd>
            </div>
            <div className='stat'>
              <dt>最佳单手</dt>
              <dd className={`stat__value stat__value--${tone(summary.best)}`}>
                {signedChips(summary.best)}
              </dd>
            </div>
            <div className='stat'>
              <dt>最差单手</dt>
              <dd className={`stat__value stat__value--${tone(summary.worst)}`}>
                {signedChips(summary.worst)}
              </dd>
            </div>
          </dl>

          <div className='metrics'>
            <div className='metrics__row'>
              <span className='metric'>
                <span className='metric__k'>VPIP</span>
                <span className='metric__v'>{Math.round(stats.vpip)}%</span>
              </span>
              <span className='metric'>
                <span className='metric__k'>PFR</span>
                <span className='metric__v'>{Math.round(stats.pfr)}%</span>
              </span>
              <span className='metric'>
                <span className='metric__k'>AF</span>
                <span className='metric__v'>{stats.af.toFixed(1)}</span>
              </span>
            </div>
            <p className='metrics__hint'>入池率 / 翻前加注率 / 激进系数（加注÷跟注）</p>

            {positions.length > 0 ? (
              <ul className='pos'>
                {positions.map((role) => {
                  const bucket = stats.byPosition[role]
                  return (
                    <li className='pos__row' key={role}>
                      <span className='pos__name'>{POSITION_LABELS[role]}</span>
                      <span className='pos__hands'>{bucket.hands} 手</span>
                      <span className={`pos__net pos__net--${tone(bucket.net)}`}>
                        {signedChips(bucket.net)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>

          <ul className='record__list'>
            {rows.map((record) => {
              const expanded = open === record.handNo
              return (
                <li className='record__row' key={record.handNo}>
                  <button
                    type='button'
                    className='record__main'
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : record.handNo)}
                  >
                    <span className='record__no'>{`#${record.handNo}`}</span>
                    <span className='record__cards'>
                      {record.heroCards.map((card, index) => (
                        <PlayingCard key={cardKey(card)} card={card} size='mini' dealIndex={index} />
                      ))}
                    </span>
                    <span className='record__phrase'>{phrase(record)}</span>
                    <span className='record__stake'>投 {formatChips(record.invested)}</span>
                    <span className={`record__net record__net--${tone(record.net)}`}>
                      {signedChips(record.net)}
                    </span>
                  </button>

                  {expanded && record.decisions.length > 0 ? (
                    <ul className='review'>
                      {record.decisions.map((decision, index) => {
                        const { advice, verdict } = judgeDecision(record.heroCards, decision)
                        return (
                          <li className='review__step' key={index}>
                            <span className='review__street'>
                              {STREET_LABELS[decision.phase] ?? decision.phase}
                              {decision.toCall > 0 ? ` · 需跟 ${decision.toCall}` : ' · 可过牌'}
                            </span>
                            <span className='review__line'>
                              <span className='review__you'>你 {actionLabel(decision)}</span>
                              <span className='review__arrow'>→</span>
                              <span className='review__adv'>建议 {advice.label}</span>
                              <span className={`review__tag review__tag--${verdict}`}>
                                {VERDICT_LABELS[verdict]}
                              </span>
                            </span>
                            <span className='review__why'>{advice.reason}</span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : expanded ? (
                    <p className='review__none'>这手没有记录到你的决策点（可能盲注直接结束）。</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
