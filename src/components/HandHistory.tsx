import { useMemo } from 'react'
import PlayingCard from '@/components/PlayingCard'
import { cardKey } from '@/game/cards'
import type { HandRecord } from '@/game/poker'
import type { SessionSummary } from '@/game/session'
import { tone } from '@/game/session'
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

type Props = {
  history: HandRecord[]
  summary: SessionSummary
  onClose: () => void
}

export default function HandHistory({ history, summary, onClose }: Props) {
  const rows = useMemo(() => [...history].reverse(), [history])

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
          还没有打完的手牌。每手结束后，这里会记下你投入多少、拿回多少。
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

          <ul className='record__list'>
            {rows.map((record) => (
              <li className='record__row' key={record.handNo}>
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
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
