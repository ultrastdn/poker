import type { HandRecord } from './poker'

export type SessionSummary = {
  hands: number
  net: number
  wins: number
  losses: number
  best: number
  worst: number
}

const EMPTY: SessionSummary = { hands: 0, net: 0, wins: 0, losses: 0, best: 0, worst: 0 }

export function summarize(history: readonly HandRecord[]): SessionSummary {
  return history.reduce<SessionSummary>(
    (acc, record) => ({
      hands: acc.hands + 1,
      net: acc.net + record.net,
      wins: acc.wins + (record.outcome === 'win' ? 1 : 0),
      losses: acc.losses + (record.outcome === 'lose' || record.outcome === 'fold' ? 1 : 0),
      best: Math.max(acc.best, record.net),
      worst: Math.min(acc.worst, record.net),
    }),
    EMPTY,
  )
}

export function tone(value: number): 'up' | 'down' | 'flat' {
  return value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
}
