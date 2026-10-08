export type Suit = 'S' | 'H' | 'D' | 'C'

export type Card = {
  rank: number
  suit: Suit
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C']

export const SUIT_GLYPH: Record<Suit, string> = {
  S: '\u2660',
  H: '\u2665',
  D: '\u2666',
  C: '\u2663',
}

export function isRed(suit: Suit): boolean {
  return suit === 'H' || suit === 'D'
}

export function rankLabel(rank: number): string {
  if (rank === 14) return 'A'
  if (rank === 13) return 'K'
  if (rank === 12) return 'Q'
  if (rank === 11) return 'J'
  return String(rank)
}

export function cardLabel(card: Card): string {
  return rankLabel(card.rank) + SUIT_GLYPH[card.suit]
}

export function cardKey(card: Card): string {
  return card.rank + card.suit
}

export function standardDeck(): Card[] {
  const deck: Card[] = []
  for (let rank = 2; rank <= 14; rank++) {
    for (const suit of SUITS) deck.push({ rank, suit })
  }
  return deck
}

export function formatCards(cards: readonly Card[]): string {
  return cards.map(cardLabel).join(' ')
}
