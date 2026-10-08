export type Rng = () => number

/** 每张新牌桌取一个新种子，避免每次开局都复现同一副牌序 */
export function freshSeed(): number {
  const buffer = new Uint32Array(1)
  const webcrypto = globalThis.crypto
  if (webcrypto?.getRandomValues) return webcrypto.getRandomValues(buffer)[0]
  return Math.floor(Math.random() * 0x100000000)
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

export function pick<T>(pool: readonly T[], count: number, rng: Rng): T[] {
  const rest = pool.slice()
  const out: T[] = []
  for (let i = 0; i < count && rest.length > 0; i++) {
    const j = Math.floor(rng() * rest.length)
    out.push(rest[j])
    rest.splice(j, 1)
  }
  return out
}

export function hashKey(parts: readonly string[]): number {
  let h = 2166136261
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  }
  return h >>> 0
}
