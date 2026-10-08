import type { Card } from '@/game/cards'
import { isRed, rankLabel, SUIT_GLYPH } from '@/game/cards'
import './playing-card.scss'

export type CardSize = 'mini' | 'board' | 'hero'

type Props = {
  card?: Card | null
  faceDown?: boolean
  size?: CardSize
  dealIndex?: number
  className?: string
}

export default function PlayingCard({
  card,
  faceDown = false,
  size = 'board',
  dealIndex = 0,
  className = '',
}: Props) {
  const classes = ['pc', `pc--${size}`, `pc--p${Math.min(dealIndex, 5)}`, className]
  if (!card) classes.push('pc--slot')
  else if (faceDown) classes.push('pc--back')
  else if (isRed(card.suit)) classes.push('pc--red')

  return (
    <div className={classes.join(' ')}>
      {card && faceDown ? <div className='pc__back' /> : null}
      {card && !faceDown ? (
        <div className='pc__face'>
          <div className='pc__corner'>
            <span className='pc__rank'>{rankLabel(card.rank)}</span>
            <span className='pc__suit'>{SUIT_GLYPH[card.suit]}</span>
          </div>
          <span className='pc__glyph'>{SUIT_GLYPH[card.suit]}</span>
          <div className='pc__corner pc__corner--flip'>
            <span className='pc__rank'>{rankLabel(card.rank)}</span>
            <span className='pc__suit'>{SUIT_GLYPH[card.suit]}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
