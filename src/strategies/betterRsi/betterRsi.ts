import type { Candle } from '../../candles'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, positionExitTime } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { RSI_LENGTH, calculateTradingViewRsi } from '../../indicators'
import type { StrategyContext, StrategyDefinition } from '../types'

export const BETTER_RSI_ID = 'betterRsi' as const

const OVERSOLD = 30

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 24 * 60 * 60
}

function longLevels(
  candle: Candle,
  rewardRatio: StrategyContext['rewardRatio'],
): { entryPrice: number; targetPrice: number; stopPrice: number } | null {
  const entry = candle.close
  const stop = candle.low
  const risk = entry - stop
  if (!(risk > 0)) {
    return null
  }
  return { entryPrice: entry, targetPrice: entry + risk * rewardRatio, stopPrice: stop }
}

export const betterRsiStrategy = {
  id: BETTER_RSI_ID,
  label: 'Better RSI',
  positions(context): PositionDrawing[] {
    const points = calculateTradingViewRsi(context.candles, RSI_LENGTH)
    const candlesByTime = new Map(context.candles.map((candle) => [candle.time, candle]))
    const bar = barSeconds(context.candles)
    const lastTime = context.candles.at(-1)?.time ?? 0
    const positions: PositionDrawing[] = []
    let waitingForReversal = false

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1].value
      const current = points[index].value

      if (!waitingForReversal) {
        if (previous >= OVERSOLD && current < OVERSOLD) {
          waitingForReversal = true
        }
        continue
      }

      if (!(current > previous)) {
        continue
      }

      waitingForReversal = false
      const point = points[index]
      const candle = candlesByTime.get(point.time)
      if (!candle) {
        continue
      }
      const levels = longLevels(candle, context.rewardRatio)
      if (!levels) {
        continue
      }
      const exitTime = positionExitTime(
        { type: 'longPosition', startTime: point.time, targetPrice: levels.targetPrice, stopPrice: levels.stopPrice },
        context.candles,
      )
      const rawEnd = exitTime ?? Math.max(lastTime, point.time + bar)
      const endTime = rawEnd - point.time < bar ? point.time + bar : rawEnd
      positions.push({
        id: `strategy-betterRsi-${point.time}`,
        type: 'longPosition',
        color: '#d1d4dc',
        lineWidth: DEFAULT_LINE_WIDTH,
        lineStyle: DEFAULT_LINE_STYLE,
        startTime: point.time,
        endTime,
        accountSize: DEFAULT_ACCOUNT_SIZE,
        riskPercent: DEFAULT_RISK_PERCENT,
        ...levels,
      })
    }

    return positions
  },
} satisfies StrategyDefinition<typeof BETTER_RSI_ID>
