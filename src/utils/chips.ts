export type ChipTone = 'gold' | 'purple' | 'black' | 'green' | 'red' | 'white'

export type Chip = {
  value: number
  tone: ChipTone
}

const DENOMINATIONS: Chip[] = [
  { value: 1000, tone: 'gold' },
  { value: 500, tone: 'purple' },
  { value: 100, tone: 'black' },
  { value: 25, tone: 'green' },
  { value: 5, tone: 'red' },
  { value: 1, tone: 'white' },
]

export function splitChips(amount: number, limit: number): { chips: Chip[]; rest: number } {
  let left = Math.max(0, Math.round(amount))
  const chips: Chip[] = []
  for (const denom of DENOMINATIONS) {
    while (left >= denom.value && chips.length < limit) {
      chips.push(denom)
      left -= denom.value
    }
    if (left === 0) break
  }
  return { chips, rest: left }
}

export function formatChips(amount: number): string {
  const digits = String(Math.round(Math.abs(amount)))
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (amount < 0 ? '-' : '') + grouped
}
