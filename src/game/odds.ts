/**
 * 底池赔率与期望值：把「跟注多少」翻译成「需要多少胜率才划算」。
 * 约定 pot 为跟注前彩池（已含对手下注），toCall 为需要跟注的额度。
 */

/** 跟注打平所需的最低胜率：toCall / (pot + toCall) */
export function requiredEquity(toCall: number, pot: number): number {
  if (toCall <= 0) return 0
  const denom = pot + toCall
  return denom > 0 ? toCall / denom : 0
}

/** 底池赔率的比值展示：能赢多少 : 需投多少，例如 3:1 */
export function oddsRatio(toCall: number, pot: number): number {
  if (toCall <= 0) return 0
  return pot / toCall
}

/**
 * 跟注的期望筹码收益：equity*(pot+toCall) - toCall。
 * 大于 0 即 +EV（长期跟注划算），与胜率是否超过 requiredEquity 等价。
 */
export function callEV(equity: number, toCall: number, pot: number): number {
  if (toCall <= 0) return 0
  return equity * (pot + toCall) - toCall
}

export type OddsInfo = {
  toCall: number
  pot: number
  /** 打平所需胜率（0-1） */
  required: number
  /** 底池赔率比值，用于展示 x:1 */
  ratio: number
  /** 给定胜率下跟注的期望筹码收益 */
  ev: number
  /** 跟注是否 +EV */
  plusEV: boolean
}

export function oddsInfo(equity: number, toCall: number, pot: number): OddsInfo {
  const required = requiredEquity(toCall, pot)
  const ev = callEV(equity, toCall, pot)
  return {
    toCall,
    pot,
    required,
    ratio: oddsRatio(toCall, pot),
    ev,
    plusEV: toCall > 0 ? ev > 0 : true,
  }
}
