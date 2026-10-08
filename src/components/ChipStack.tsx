import { formatChips, splitChips } from '@/utils/chips'
import './chip-stack.scss'

type Props = {
  amount: number
  limit?: number
  scale?: 'bets' | 'pot'
  label?: string
}

export default function ChipStack({ amount, limit = 5, scale = 'bets', label }: Props) {
  if (amount <= 0) return null
  const { chips, rest } = splitChips(amount, limit)

  return (
    <div className={`cs cs--${scale}`}>
      <div className='cs__stack'>
        {chips.map((chip, index) => (
          <div
            className={`cs__chip cs__chip--${chip.tone}`}
            style={{ marginTop: index === 0 ? 0 : -3 }}
            key={index}
          >
            <div className='cs__band' />
          </div>
        ))}
        {rest > 0 ? (
          <div className='cs__bundle' style={{ marginTop: -3 }}>
            <span className='cs__bundle-text'>{formatChips(rest)}</span>
          </div>
        ) : null}
      </div>
      {label ? <span className='cs__label'>{label}</span> : null}
    </div>
  )
}
