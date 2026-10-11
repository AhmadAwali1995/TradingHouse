import type { Candle } from '../../candles'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, acceptsLongRisk, positionExitTime } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { RSI_LENGTH, calculateTradingViewRsi } from '../../indicators'
import { longTargetLevels } from '../reward'
import type { StrategyDefinition } from '../types'

export const RSI_ENH_ID = 'rsiEnh' as const

const OVERSOLD = 30
const CENTER = 50
const MIDDLE_MARK = '50'

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 24 * 60 * 60
}

export const rsiEnhStrategy = {
  id: RSI_ENH_ID,
  label: 'RSI Enh',
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
      mark: string
    }[] = []
    let waitingForReversal = false
    let waitingFor55 = false

    const stillOpenAt = (time: number) =>
      open.filter((position) => position.exitTime === null || position.exitTime > time)

    const openLong = (time: number, entry: number, stop: number, mark: string, crossedCenter: boolean) => {
      const targets = longTargetLevels(entry, stop, context.rewardRatio)
      for (const target of targets) {
        const exitTime = positionExitTime(
          { type: 'longPosition', startTime: time, targetPrice: target.targetPrice, stopPrice: stop },
          context.candles,
        )
        const rawEnd = exitTime ?? Math.max(lastTime, time + bar)
        const endTime = rawEnd - time < bar ? time + bar : rawEnd
        open.push({
          multiple: target.multiple,
          portion: target.portion,
          startTime: time,
          entryPrice: entry,
          exitTime,
          crossedCenter,
          mark,
        })
        positions.push({
          id: `strategy-rsiEnh-${time}-${target.multiple}`,
          type: 'longPosition',
          color: '#d1d4dc',
          lineWidth: DEFAULT_LINE_WIDTH,
          lineStyle: DEFAULT_LINE_STYLE,
          startTime: time,
          activeFrom: time,
          endTime,
          accountSize: DEFAULT_ACCOUNT_SIZE * target.portion,
          riskPercent: DEFAULT_RISK_PERCENT,
          portion: target.portion,
          entryPrice: entry,
          targetPrice: target.targetPrice,
          stopPrice: stop,
          mark,
        })
      }
    }

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
        const reachedExit = position.mark === MIDDLE_MARK && current >= context.entries.rsiEnh.exitLevel
        if (!reachedExit) {
          if (!position.crossedCenter) {
            if (previous <= CENTER && current > CENTER) {
              position.crossedCenter = true
            }
            continue
          }
          if (!(current < previous) || (position.exitTime !== null && point.time >= position.exitTime)) {
            continue
          }
        } else if (position.exitTime !== null && point.time >= position.exitTime) {
          continue
        }
        position.exitTime = point.time
        const placed = positions.find((item) => item.id === `strategy-rsiEnh-${position.startTime}-${position.multiple}`)
        if (!placed) {
          continue
        }
        const rawEnd = point.time
        placed.endTime = rawEnd - position.startTime < bar ? position.startTime + bar : rawEnd
      }

      if (context.entries.rsiEnh.cross50To55) {
        if (!waitingFor55 && previous <= CENTER && current > CENTER) {
          waitingFor55 = true
        }
        if (waitingFor55 && current >= context.entries.rsiEnh.entryLevel) {
          waitingFor55 = false
          const candle = candlesByTime.get(point.time)
          if (candle && stillOpenAt(point.time).length === 0 && acceptsLongRisk(candle.close, candle.low)) {
            openLong(point.time, candle.close, candle.low, MIDDLE_MARK, true)
          }
        } else if (waitingFor55 && current < previous) {
          waitingFor55 = false
        }
      }

      if (!context.entries.rsiEnh.oversoldTurn) {
        continue
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
      const stillOpen = stillOpenAt(point.time)
      if (stillOpen.length > 0) {
        for (const position of stillOpen) {
          const target = targets.find((item) => item.multiple === position.multiple) ?? targets[0]
          const placed = positions.find((item) => item.id === `strategy-rsiEnh-${position.startTime}-${position.multiple}`)
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
      openLong(point.time, entry, stop, '30', false)
    }

    return positions
  },
} satisfies StrategyDefinition<typeof RSI_ENH_ID>
