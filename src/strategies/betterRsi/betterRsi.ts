import type { Candle } from '../../candles'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, acceptsLongRisk, positionExitTime } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { RSI_LENGTH, calculateTradingViewRsi } from '../../indicators'
import { longTargetLevels } from '../reward'
import type { StrategyDefinition } from '../types'

export const BETTER_RSI_ID = 'betterRsi' as const

const OVERSOLD = 30
const CENTER = 50

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 24 * 60 * 60
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
    const open: {
      multiple: number
      portion: number
      startTime: number
      entryPrice: number
      exitTime: number | null
      crossedCenter: boolean
    }[] = []
    let waitingForReversal = false

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1].value
      const current = points[index].value
      const point = points[index]

      for (const position of open) {
        if (position.exitTime !== null && position.exitTime <= point.time) {
          continue
        }
        if (point.time <= position.startTime) {
          continue
        }
        if (!position.crossedCenter) {
          if (previous <= CENTER && current > CENTER) {
            position.crossedCenter = true
          }
          continue
        }
        if (!(current < previous) || (position.exitTime !== null && point.time >= position.exitTime)) {
          continue
        }
        position.exitTime = point.time
        const placed = positions.find((item) => item.id === `strategy-betterRsi-${position.startTime}-${position.multiple}`)
        if (!placed) {
          continue
        }
        const rawEnd = point.time
        placed.endTime = rawEnd - position.startTime < bar ? position.startTime + bar : rawEnd
      }

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
      const candle = candlesByTime.get(point.time)
      if (!candle) {
        continue
      }
      const entry = candle.close
      const stop = candle.low
      if (!acceptsLongRisk(entry, stop)) {
        continue
      }
      const targets = longTargetLevels(entry, stop, context.rewardRatio)
      const stillOpen = open.filter((position) => position.exitTime === null || position.exitTime > point.time)
      if (stillOpen.length > 0) {
        for (const position of stillOpen) {
          const target = targets.find((item) => item.multiple === position.multiple) ?? targets[0]
          const placed = positions.find((item) => item.id === `strategy-betterRsi-${position.startTime}-${position.multiple}`)
          if (!placed) {
            continue
          }
          placed.stopPrice = stop
          placed.targetPrice = target.targetPrice
          placed.activeFrom = point.time
          position.exitTime = positionExitTime(
            { type: 'longPosition', startTime: point.time, targetPrice: target.targetPrice, stopPrice: stop },
            context.candles,
          )
          const rawEnd = position.exitTime ?? Math.max(lastTime, position.startTime + bar)
          placed.endTime = rawEnd - position.startTime < bar ? position.startTime + bar : rawEnd
        }
        continue
      }
      for (const target of targets) {
        const exitTime = positionExitTime(
          { type: 'longPosition', startTime: point.time, targetPrice: target.targetPrice, stopPrice: stop },
          context.candles,
        )
        const rawEnd = exitTime ?? Math.max(lastTime, point.time + bar)
        const endTime = rawEnd - point.time < bar ? point.time + bar : rawEnd
        open.push({
          multiple: target.multiple,
          portion: target.portion,
          startTime: point.time,
          entryPrice: entry,
          exitTime,
          crossedCenter: false,
        })
        positions.push({
          id: `strategy-betterRsi-${point.time}-${target.multiple}`,
          type: 'longPosition',
          color: '#d1d4dc',
          lineWidth: DEFAULT_LINE_WIDTH,
          lineStyle: DEFAULT_LINE_STYLE,
          startTime: point.time,
          activeFrom: point.time,
          endTime,
          accountSize: DEFAULT_ACCOUNT_SIZE * target.portion,
          riskPercent: DEFAULT_RISK_PERCENT,
          portion: target.portion,
          entryPrice: entry,
          targetPrice: target.targetPrice,
          stopPrice: stop,
        })
      }
    }

    return positions
  },
} satisfies StrategyDefinition<typeof BETTER_RSI_ID>
