import type { Candle } from '../../candles'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, acceptsLongRisk, positionExitTime } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { calculateLaNwe } from '../../indicators'
import { longTargetLevels } from '../reward'
import type { StrategyContext, StrategyDefinition } from '../types'

export const LUX_ALGO_ENH_ID = 'luxAlgoEnh' as const

function barSeconds(candles: Candle[]): number {
  for (let index = candles.length - 1; index > 0; index -= 1) {
    const delta = Math.abs(candles[index].time - candles[index - 1].time)
    if (delta > 0) {
      return delta
    }
  }
  return 24 * 60 * 60
}

type OpenLong = {
  multiple: number
  portion: number
  startTime: number
  activeFrom: number
  entryPrice: number
  targetPrice: number
  stopPrice: number
  exitTime: number | null
}

export const luxAlgoEnhStrategy = {
  id: LUX_ALGO_ENH_ID,
  label: 'Lux Algo Enh',
  positions(context: StrategyContext): PositionDrawing[] {
    const result = calculateLaNwe(context.candles, { ...context.laNweSettings, repaint: false })
    const candlesByTime = new Map(context.candles.map((candle) => [candle.time, candle]))
    const bar = barSeconds(context.candles)
    const lastTime = context.candles.at(-1)?.time ?? 0
    const open: OpenLong[] = []

    for (const cross of result.crosses) {
      if (cross.direction === 'down') {
        for (const position of open) {
          if (position.exitTime !== null && position.exitTime <= cross.time) {
            continue
          }
          position.exitTime = cross.time
        }
        continue
      }

      const candle = candlesByTime.get(cross.time)
      if (!candle) {
        continue
      }
      const entry = candle.close
      const stop = candle.low
      if (!acceptsLongRisk(entry, stop)) {
        continue
      }
      const targets = longTargetLevels(entry, stop, context.rewardRatio)
      const stillOpen = open.filter((position) => position.exitTime === null || position.exitTime > cross.time)
      if (stillOpen.length > 0) {
        for (const position of stillOpen) {
          const target = targets.find((item) => item.multiple === position.multiple) ?? targets[0]
          position.stopPrice = stop
          position.targetPrice = target.targetPrice
          position.activeFrom = cross.time
          position.exitTime = positionExitTime(
            { type: 'longPosition', startTime: cross.time, targetPrice: target.targetPrice, stopPrice: stop },
            context.candles,
          )
        }
        continue
      }
      for (const target of targets) {
        open.push({
          multiple: target.multiple,
          portion: target.portion,
          startTime: cross.time,
          activeFrom: cross.time,
          entryPrice: entry,
          targetPrice: target.targetPrice,
          stopPrice: stop,
          exitTime: positionExitTime(
            { type: 'longPosition', startTime: cross.time, targetPrice: target.targetPrice, stopPrice: stop },
            context.candles,
          ),
        })
      }
    }

    return open.map((position) => {
      const rawEnd = position.exitTime ?? Math.max(lastTime, position.startTime + bar)
      const endTime = rawEnd - position.startTime < bar ? position.startTime + bar : rawEnd
      return {
        id: `strategy-luxAlgoEnh-${position.startTime}-${position.multiple}`,
        type: 'longPosition' as const,
        color: '#d1d4dc',
        lineWidth: DEFAULT_LINE_WIDTH,
        lineStyle: DEFAULT_LINE_STYLE,
        startTime: position.startTime,
        activeFrom: position.activeFrom,
        endTime,
        accountSize: DEFAULT_ACCOUNT_SIZE * position.portion,
        portion: position.portion,
        riskPercent: DEFAULT_RISK_PERCENT,
        entryPrice: position.entryPrice,
        targetPrice: position.targetPrice,
        stopPrice: position.stopPrice,
      }
    })
  },
} satisfies StrategyDefinition<typeof LUX_ALGO_ENH_ID>
