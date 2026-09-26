import type { Candle } from '../candles'
import { DEFAULT_RISK_PERCENT, positionExitTime, positionTrigger } from '../drawings/position'
import type { PositionDrawing } from '../drawings/types'
import type { LaNweSettings } from '../indicators'
import { luxAlgoStrategy } from '../strategies/luxAlgo'
import { LUX_ALGO_ENH_ID, luxAlgoEnhStrategy } from '../strategies/luxAlgoEnh'
import type { RewardRatio, StrategyId } from '../strategies'

export type BacktestTrade = {
  time: number
  exitTime: number | null
  side: 'long' | 'short'
  result: 'target' | 'stop' | 'signal' | 'open'
  profit: number
}

export type BacktestResult = {
  positions: number
  openPositions: number
  longs: number
  shorts: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number | null
  maxDrawdown: number
  maxDrawdownPercent: number
  endingBalance: number
  profit: number
  roiPercent: number
  trades: BacktestTrade[]
}

const STRATEGIES_BY_ID = {
  luxAlgo: luxAlgoStrategy,
  luxAlgoEnh: luxAlgoEnhStrategy,
} as const

function closedByOppositeSignal(drawing: PositionDrawing, drawings: PositionDrawing[], side: 'long' | 'short') {
  return drawings.some((other) => {
    if (other.id === drawing.id || other.startTime !== drawing.endTime) {
      return false
    }
    const otherSide = other.type === 'longPosition' ? 'long' : 'short'
    return otherSide !== side
  })
}

export function runLuxAlgoBacktest(input: {
  candles: Candle[]
  laNweSettings: LaNweSettings
  rewardRatio: RewardRatio
  from: number
  to: number
  amount: number
  strategyId: StrategyId
}): BacktestResult {
  const history = input.candles.filter((candle) => candle.time <= input.to)
  const drawings = STRATEGIES_BY_ID[input.strategyId].positions({
    candles: history,
    laNweSettings: input.laNweSettings,
    rewardRatio: input.rewardRatio,
  })
  const riskMoney = input.amount * (DEFAULT_RISK_PERCENT / 100)
  const trades: BacktestTrade[] = []

  for (const drawing of drawings) {
    if (drawing.startTime < input.from || drawing.startTime > input.to) {
      continue
    }
    const side = drawing.type === 'longPosition' ? 'long' : 'short'
    const trigger = positionTrigger(drawing, history)
    let profit = 0
    let result: BacktestTrade['result'] = 'open'
    let exitTime = positionExitTime(drawing, history)
    if (trigger === 'target') {
      const riskDist = Math.abs(drawing.entryPrice - drawing.stopPrice)
      const rewardDist = Math.abs(drawing.targetPrice - drawing.entryPrice)
      profit = riskDist > 0 ? riskMoney * (rewardDist / riskDist) : 0
      result = 'target'
    } else if (trigger === 'stop') {
      profit = -riskMoney
      result = 'stop'
    } else if (
      input.strategyId === LUX_ALGO_ENH_ID &&
      closedByOppositeSignal(drawing, drawings, side)
    ) {
      const exitCandle = history.find((candle) => candle.time === drawing.endTime)
      const riskDist = Math.abs(drawing.entryPrice - drawing.stopPrice)
      if (exitCandle && riskDist > 0) {
        const move = side === 'long' ? exitCandle.close - drawing.entryPrice : drawing.entryPrice - exitCandle.close
        profit = (riskMoney / riskDist) * move
        result = 'signal'
        exitTime = drawing.endTime
      }
    }
    trades.push({ time: drawing.startTime, exitTime, side, result, profit })
  }

  trades.sort((left, right) => left.time - right.time)

  let grossProfit = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let longs = 0
  let shorts = 0
  let profit = 0
  for (const trade of trades) {
    if (trade.side === 'long') {
      longs += 1
    } else {
      shorts += 1
    }
    if (trade.result === 'target' || (trade.result === 'signal' && trade.profit > 0)) {
      wins += 1
      grossProfit += trade.profit
      profit += trade.profit
    } else if (trade.result === 'stop' || (trade.result === 'signal' && trade.profit < 0)) {
      losses += 1
      grossLoss += Math.abs(trade.profit)
      profit += trade.profit
    }
  }

  const closed = trades
    .filter((trade) => trade.result !== 'open')
    .sort((left, right) => (left.exitTime ?? left.time) - (right.exitTime ?? right.time))
  let equity = input.amount
  let peak = input.amount
  let maxDrawdown = 0
  let maxDrawdownPercent = 0
  for (const trade of closed) {
    equity += trade.profit
    if (equity > peak) {
      peak = equity
    }
    const drop = peak - equity
    if (drop > maxDrawdown) {
      maxDrawdown = drop
      maxDrawdownPercent = peak > 0 ? (drop / peak) * 100 : 0
    }
  }

  const closedCount = wins + losses
  return {
    positions: trades.length,
    openPositions: trades.filter((trade) => trade.result === 'open').length,
    longs,
    shorts,
    wins,
    losses,
    winRate: closedCount > 0 ? (wins / closedCount) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    maxDrawdown,
    maxDrawdownPercent,
    endingBalance: input.amount + profit,
    profit,
    roiPercent: input.amount > 0 ? (profit / input.amount) * 100 : 0,
    trades,
  }
}
