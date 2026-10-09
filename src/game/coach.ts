import type { Card } from './cards'
import { equity } from './equity'
import { callEV, requiredEquity } from './odds'
import type { Decision } from './poker'

export type AdviceAction = 'fold' | 'check' | 'call' | 'raise'

export const ADVICE_LABELS: Record<AdviceAction, string> = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raise: '加注',
}

export type Advice = {
  action: AdviceAction
  label: string
  /** 一句人话解释为什么这么建议 */
  reason: string
  /** 英雄当前胜率（0-1） */
  equity: number
  /** 跟注打平所需胜率（无需跟注时为 0） */
  required: number
  /** 跟注的期望筹码收益 */
  ev: number
}

export type AdviceInput = {
  hole: readonly Card[]
  board: readonly Card[]
  opponents: number
  pot: number
  toCall: number
  canRaise: boolean
  preflop: boolean
}

/** 翻牌前后统一用真实底池赔率做门槛，见 advise 说明 */
function trials(boardSize: number): number {
  return boardSize === 0 ? 85 : 115
}

/**
 * 教练建议：以胜率对比底池赔率为核心，翻牌前后统一用「真实底池赔率所需胜率」做门槛，
 * 保证提示里的「所需 X%」与英雄区底池赔率行一致，不给学习者两个打架的数字。
 * 加注另设更强的价值门槛（份额胜率/半数以上），避免用边缘牌加注。
 * 定位是练习提示而非最优解 GTO，规则透明便于玩家理解「为什么」。
 */
export function advise(input: AdviceInput): Advice {
  const { hole, board, opponents, pot, toCall, canRaise, preflop } = input
  const foes = Math.max(1, opponents)
  const eq = hole.length === 2 && foes >= 1
    ? equity({ hole: [...hole], board: [...board], opponents: foes, trials: trials(board.length) })
    : 0
  const fair = 1 / (foes + 1)

  const finish = (action: AdviceAction, required: number, ev: number, reason: string): Advice => ({
    action,
    label: ADVICE_LABELS[action],
    reason,
    equity: eq,
    required,
    ev,
  })

  // 无人下注：可过牌，牌够强则价值下注/加注
  if (toCall <= 0) {
    const gate = preflop ? fair + 0.08 : 0.62
    if (canRaise && eq >= gate) {
      return finish('raise', 0, 0, `胜率 ${pct(eq)}，牌力领先，主动下注建立彩池`)
    }
    return finish('check', 0, 0, `胜率 ${pct(eq)}，暂无下注价值，过牌`)
  }

  const required = requiredEquity(toCall, pot)
  const ev = callEV(eq, toCall, pot)
  const raiseFloor = preflop ? fair + 0.15 : 0.55

  if (canRaise && eq >= required + 0.12 && eq >= raiseFloor) {
    return finish('raise', required, ev, `胜率 ${pct(eq)} 远高于所需 ${pct(required)}，加注争取更多价值`)
  }
  if (eq >= required) {
    return finish('call', required, ev, `胜率 ${pct(eq)} ≥ 所需 ${pct(required)}，跟注 +EV`)
  }
  return finish('fold', required, ev, `胜率 ${pct(eq)} < 所需 ${pct(required)}，跟注长期亏损，弃牌`)
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

export type Verdict = 'good' | 'loose' | 'tight' | 'passive' | 'aggressive'

export const VERDICT_LABELS: Record<Verdict, string> = {
  good: '合理',
  loose: '偏松',
  tight: '偏紧',
  passive: '偏被动',
  aggressive: '偏激进',
}

/** 动作激进程度排序，用于判断「比建议更凶还是更软」 */
const AGGRESSION: Record<AdviceAction, number> = { fold: 0, check: 0, call: 1, raise: 2 }

export type Judgement = {
  advice: Advice
  yourAction: AdviceAction
  verdict: Verdict
}

/**
 * 复盘单个决策点：把当时的牌面重算一遍教练建议，与英雄实际动作对比给出评价。
 * 只在方向性错误时判定为「偏松/偏紧」，同为继续牌局但尺度不同记为「偏激进/偏被动」。
 */
export function judgeDecision(hole: readonly Card[], decision: Decision): Judgement {
  const advice = advise({
    hole,
    board: decision.board,
    opponents: Math.max(1, decision.opponents),
    pot: decision.pot,
    toCall: decision.toCall,
    canRaise: decision.canRaise,
    preflop: decision.phase === 'preflop',
  })
  const yourAction = decision.action.type
  let verdict: Verdict
  if (yourAction === advice.action) {
    verdict = 'good'
  } else if (advice.action === 'fold') {
    verdict = 'loose'
  } else if (yourAction === 'fold') {
    verdict = 'tight'
  } else {
    verdict = AGGRESSION[yourAction] > AGGRESSION[advice.action] ? 'aggressive' : 'passive'
  }
  return { advice, yourAction, verdict }
}
