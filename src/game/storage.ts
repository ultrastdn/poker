import type { Game } from './poker'
import type { Settings, TableConfig } from './settings'

export type Persisted = {
  version: number
  config: TableConfig
  settings: Settings
  game: Game
}

const KEY = 'holdem.session'
const VERSION = 1

/** 无 localStorage（如 SSR / node 测试环境）或隐私模式抛错时返回 null，调用方走默认值 */
function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function loadPersisted(): Persisted | null {
  const local = store()
  if (!local) return null
  try {
    const raw = local.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    if (
      !parsed ||
      parsed.version !== VERSION ||
      !parsed.game ||
      !Array.isArray(parsed.game.seats) ||
      !parsed.config ||
      !parsed.settings
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function savePersisted(state: Omit<Persisted, 'version'>): void {
  const local = store()
  if (!local) return
  try {
    local.setItem(KEY, JSON.stringify({ version: VERSION, ...state }))
  } catch {
    // 存储配额满或被禁用时静默失败，不影响对局
  }
}

export function clearPersisted(): void {
  const local = store()
  if (!local) return
  try {
    local.removeItem(KEY)
  } catch {
    // 忽略
  }
}
