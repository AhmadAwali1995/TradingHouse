import type { Candle } from '../candles'
import { DEFAULT_RISK_PERCENT, positionTrigger } from '../drawings/position'
import type { LaNweSettings } from '../indicators'
import { luxAlgoStrategy } from '../strategies/luxAlgo'
import type { RewardRatio } from '../strategies'

export type BacktestResult = {
  positions: number
  openPositions: number
  profit: number
  roiPercent: number
}

export function runLuxAlgoBacktest(input: {
  candles: Candle[]
  laNweSettings: LaNweSettings
  rewardRatio: RewardRatio
  from: number
  to: number
  amount: number
}): BacktestResult {
  const history = input.candles.filter((candle) => candle.time <= input.to)
  const drawings = luxAlgoStrategy.positions({
    candles: history,
    laNweSettings: input.laNweSettings,
    rewardRatio: input.rewardRatio,
  })
  const riskMoney = input.amount * (DEFAULT_RISK_PERCENT / 100)
  let positions = 0
  let openPositions = 0
  let profit = 0

  for (const drawing of drawings) {
    if (drawing.startTime < input.from || drawing.startTime > input.to) {
      continue
    }
    positions += 1
    const trigger = positionTrigger(drawing, history)
    if (trigger === 'target') {
      const riskDist = Math.abs(drawing.entryPrice - drawing.stopPrice)
      const rewardDist = Math.abs(drawing.targetPrice - drawing.entryPrice)
      profit += riskDist > 0 ? riskMoney * (rewardDist / riskDist) : 0
    } else if (trigger === 'stop') {
      profit -= riskMoney
    } else {
      openPositions += 1
    }
  }

  return {
    positions,
    openPositions,
    profit,
    roiPercent: input.amount > 0 ? (profit / input.amount) * 100 : 0,
  }
}
