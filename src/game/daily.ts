import { hashKey } from './rng'

/** 本地日期串 YYYY-MM-DD，用于「同一天所有人拿到同一手牌」 */
export function dayKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 由当天日期派生的确定性种子：每日一手的牌序固定且可复现 */
export function dailySeed(date: Date = new Date()): number {
  return hashKey(['daily-hand', dayKey(date)])
}
