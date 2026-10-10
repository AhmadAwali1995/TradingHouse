import type { Candle } from '../candles'
import { accountMove, positionExitTime, positionTrigger } from '../drawings/position'
import type { LaNweSettings } from '../indicators'
import { betterRsiStrategy } from '../strategies/betterRsi'
import { luxAlgoEnhStrategy } from '../strategies/luxAlgoEnh'
import type { RewardRatio, StrategyId } from '../strategies'

export type BacktestTrade = {
  time: number
  exitTime: number | null
  side: 'long'
  result: 'target' | 'stop' | 'signal' | 'open'
  profit: number
}

export type BacktestResult = {
  positions: number
  openPositions: number
  longs: number
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
  betterRsi: betterRsiStrategy,
  luxAlgoEnh: luxAlgoEnhStrategy,
} as const

export function runLuxAlgoBacktest(input: {
  candles: Candle[]
  rewardRatio: RewardRatio
  from: number
  to: number
  amount: number
  strategyId: StrategyId
  laNweSettings: LaNweSettings
}): BacktestResult {
  const history = input.candles.filter((candle) => candle.time <= input.to)
  const drawings = STRATEGIES_BY_ID[input.strategyId].positions({
    candles: history,
    rewardRatio: input.rewardRatio,
    laNweSettings: input.laNweSettings,
  })
  const trades: BacktestTrade[] = []

  for (const drawing of drawings) {
    if (drawing.type !== 'longPosition' || drawing.startTime < input.from || drawing.startTime > input.to) {
      continue
    }
    const side = 'long' as const
    const trigger = positionTrigger(drawing, history)
    const naturalExit = positionExitTime(drawing, history)
    const closedOnSignal = naturalExit === null ? false : drawing.endTime < naturalExit
    let profit = 0
    let result: BacktestTrade['result'] = 'open'
    let exitTime = naturalExit
    if (closedOnSignal) {
      const exitCandle = history.find((candle) => candle.time === drawing.endTime)
      const exitPrice = exitCandle?.close ?? drawing.entryPrice
      profit = accountMove(input.amount * (drawing.portion ?? 1), drawing.entryPrice, exitPrice)
      result = 'signal'
      exitTime = drawing.endTime
    } else if (trigger === 'target') {
      profit = accountMove(input.amount * (drawing.portion ?? 1), drawing.entryPrice, drawing.targetPrice)
      result = 'target'
    } else if (trigger === 'stop') {
      profit = accountMove(input.amount * (drawing.portion ?? 1), drawing.entryPrice, drawing.stopPrice)
      result = 'stop'
    }
    trades.push({ time: drawing.startTime, exitTime, side, result, profit })
  }

  trades.sort((left, right) => left.time - right.time)

  let grossProfit = 0
  let grossLoss = 0
  let wins = 0
  let losses = 0
  let longs = 0
  let profit = 0
  for (const trade of trades) {
    longs += 1
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
