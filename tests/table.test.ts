import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import HoldemTable from '@/HoldemTable'
import PlayerSeat from '@/components/PlayerSeat'
import { newGame, startHand } from '@/game/poker'
import { isCrowded, rosterOf, seatLayout, TABLE_SIZES } from '@/game/tables'

function count(markup: string, pattern: RegExp): number {
  return markup.match(pattern)?.length ?? 0
}

describe('table layouts', () => {
  it.each(TABLE_SIZES)('gives every %i seat its own spot on the felt', (size) => {
    const spots = seatLayout(size)
    expect(spots).toHaveLength(size)
    expect(new Set(spots.map((spot) => `${spot.left}/${spot.top}`)).size).toBe(size)
    for (const spot of spots) {
      const left = Number.parseFloat(spot.left)
      const top = Number.parseFloat(spot.top)
      expect(left).toBeGreaterThan(5)
      expect(left).toBeLessThan(95)
      expect(top).toBeGreaterThan(5)
      expect(top).toBeLessThan(95)
    }
    expect(spots[0]).toEqual({ left: '50%', top: '90%' })
  })

  it.each(TABLE_SIZES)('rosters %i seats with the human first', (size) => {
    const roster = rosterOf(size)
    expect(roster).toHaveLength(size)
    expect(roster[0].name).toBe('你')
    expect(isCrowded(size)).toBe(size >= 9)
  })

  it('rotates the button across every seat of a nine handed table', () => {
    let g = newGame({ names: rosterOf(9).map((seat) => seat.name), stack: 500, sb: 5, bb: 10, seed: 5 })
    const dealers: number[] = []
    for (let hand = 0; hand < 9; hand++) {
      g = startHand(g)
      dealers.push(g.dealer)
    }
    expect(new Set(dealers).size).toBe(9)
  })
})

describe('table shell', () => {
  const markup = renderToStaticMarkup(createElement(HoldemTable))

  it('opens on the six handed lobby with a seat per opponent', () => {
    expect(count(markup, /class="seat[" ]/g)).toBe(5)
    expect(markup).toContain('6 人桌')
    expect(count(markup, /class="pick__opt[" ]/g)).toBe(6)
    expect(count(markup, /pick__opt--on/g)).toBe(2)
    expect(markup).toContain('开始牌局')
  })

  it('keeps the hero panel and action dock readable before any card is dealt', () => {
    expect(markup).toContain('未开局')
    expect(count(markup, /class="hero__slot[" ]/g)).toBe(2)
  })

  it('shrinks opponent seats on a crowded table', () => {
    const g = startHand(newGame({ names: rosterOf(9).map((seat) => seat.name), stack: 500, sb: 5, bb: 10, seed: 6 }))
    const seat = renderToStaticMarkup(
      createElement(PlayerSeat, {
        seat: g.seats[3],
        isDealer: false,
        isActor: true,
        compact: true,
        position: seatLayout(9)[3],
      }),
    )
    expect(seat).toContain('seat--compact')
    expect(seat).toContain('seat--actor')
    expect(count(seat, /class="pc[" ]/g)).toBe(2)
  })
})
