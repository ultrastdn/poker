import type { Seat } from '@/game/poker'
import { styleLabel } from '@/game/ai'
import { formatChips } from '@/utils/chips'
import ChipStack from './ChipStack'
import PlayingCard from './PlayingCard'
import './player-seat.scss'

type Props = {
  seat: Seat
  isDealer: boolean
  isActor: boolean
  compact?: boolean
  position: { left: string; top: string }
}

export default function PlayerSeat({ seat, isDealer, isActor, compact = false, position }: Props) {
  const classes = ['seat']
  if (compact) classes.push('seat--compact')
  if (isActor) classes.push('seat--actor')
  if (seat.folded) classes.push('seat--folded')
  if (seat.won > 0) classes.push('seat--won')

  const tag = seat.folded ? '弃牌' : seat.allIn ? '全押' : isActor ? '行动中' : ''
  const tagTone = seat.folded ? 'out' : seat.allIn ? 'allin' : 'live'

  return (
    <div className={classes.join(' ')} style={{ left: position.left, top: position.top }}>
      <div className='seat__body'>
        <div className='seat__hand'>
          {seat.hole.length === 2 ? (
            <>
              <PlayingCard card={seat.hole[0]} faceDown={!seat.reveal} size='mini' />
              <PlayingCard card={seat.hole[1]} faceDown={!seat.reveal} size='mini' dealIndex={1} />
            </>
          ) : null}
        </div>
        <div className='seat__avatar'>
          <span className='seat__initial'>{seat.name.slice(0, 1)}</span>
          {isDealer ? (
            <span className='seat__button'>
              <span className='seat__button-text'>D</span>
            </span>
          ) : null}
          {seat.won > 0 ? <span className='seat__won'>+{formatChips(seat.won)}</span> : null}
        </div>
        <div className='seat__meta'>
          <span className='seat__name'>{seat.name}</span>
          <span className='seat__stack'>{formatChips(seat.stack)}</span>
          <span className='seat__style'>{styleLabel(seat.style)}</span>
        </div>
        {tag ? <span className={`seat__tag seat__tag--${tagTone}`}>{tag}</span> : null}
      </div>

      {seat.wager > 0 ? (
        <div className='seat__bet'>
          <ChipStack amount={seat.wager} limit={3} />
        </div>
      ) : null}
    </div>
  )
}
