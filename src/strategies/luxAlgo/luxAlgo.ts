import type { Candle } from '../../candles'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, positionExitTime } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { calculateLaNwe } from '../../indicators'
import type { LaNwePoint } from '../../indicators/la_nwe'
import type { StrategyContext, StrategyDefinition } from '../types'

export const LUX_ALGO_ID = 'luxAlgo' as const

const BAND_BUFFER = 0.1

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 24 * 60 * 60
}

function luxAlgoLevels(
  side: 'long' | 'short',
  candle: Candle,
  point: LaNwePoint,
): { entryPrice: number; targetPrice: number; stopPrice: number } | null {
  const entry = candle.close
  const target = point.middle
  const buffer = Math.abs(point.upper - point.middle) * BAND_BUFFER
  const stop = side === 'long' ? candle.low - buffer : candle.high + buffer
  const valid = side === 'long' ? stop < entry && entry < target : target < entry && entry < stop
  if (!valid) {
    return null
  }
  return { entryPrice: entry, targetPrice: target, stopPrice: stop }
}

export const luxAlgoStrategy = {
  id: LUX_ALGO_ID,
  label: 'Lux Algo',
  positions(context: StrategyContext): PositionDrawing[] {
    const result = calculateLaNwe(context.candles, context.laNweSettings)
    const candlesByTime = new Map(context.candles.map((candle) => [candle.time, candle]))
    const pointsByTime = new Map(result.points.map((point) => [point.time, point]))
    const bar = barSeconds(context.candles)
    const lastTime = context.candles.at(-1)?.time ?? 0
    const positions: PositionDrawing[] = []

    for (const cross of result.crosses) {
      const candle = candlesByTime.get(cross.time)
      const point = pointsByTime.get(cross.time)
      if (!candle || !point) {
        continue
      }
      const side = cross.direction === 'up' ? 'long' : 'short'
      const levels = luxAlgoLevels(side, candle, point)
      if (!levels) {
        continue
      }
      const type = side === 'long' ? 'longPosition' : 'shortPosition'
      const exitTime = positionExitTime(
        { type, startTime: cross.time, targetPrice: levels.targetPrice, stopPrice: levels.stopPrice },
        context.candles,
      )
      const rawEnd = exitTime ?? Math.max(lastTime, cross.time + bar)
      const endTime = rawEnd - cross.time < bar ? cross.time + bar : rawEnd
      positions.push({
        id: `strategy-luxAlgo-${cross.time}-${cross.direction}`,
        type,
        color: '#d1d4dc',
        lineWidth: DEFAULT_LINE_WIDTH,
        lineStyle: DEFAULT_LINE_STYLE,
        startTime: cross.time,
        endTime,
        accountSize: DEFAULT_ACCOUNT_SIZE,
        riskPercent: DEFAULT_RISK_PERCENT,
        ...levels,
      })
    }

    return positions
  },
} satisfies StrategyDefinition<typeof LUX_ALGO_ID>
