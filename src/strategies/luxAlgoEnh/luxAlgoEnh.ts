import type { Candle } from '../../candles'
import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, positionExitTime } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { calculateLaNwe } from '../../indicators'
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

function luxAlgoEnhLevels(
  side: 'long' | 'short',
  candle: Candle,
  rewardRatio: StrategyContext['rewardRatio'],
): { entryPrice: number; targetPrice: number; stopPrice: number } | null {
  const entry = candle.close
  const stop = side === 'long' ? candle.low : candle.high
  const risk = Math.abs(entry - stop)
  if (!(risk > 0)) {
    return null
  }
  const reward = risk * rewardRatio
  const target = side === 'long' ? entry + reward : entry - reward
  return { entryPrice: entry, targetPrice: target, stopPrice: stop }
}

type OpenPosition = {
  side: 'long' | 'short'
  direction: 'up' | 'down'
  startTime: number
  type: 'longPosition' | 'shortPosition'
  entryPrice: number
  targetPrice: number
  stopPrice: number
  exitTime: number | null
}

export const luxAlgoEnhStrategy = {
  id: LUX_ALGO_ENH_ID,
  label: 'Lux Algo Enh',
  positions(context: StrategyContext): PositionDrawing[] {
    const result = calculateLaNwe(context.candles, context.laNweSettings)
    const candlesByTime = new Map(context.candles.map((candle) => [candle.time, candle]))
    const bar = barSeconds(context.candles)
    const lastTime = context.candles.at(-1)?.time ?? 0
    const open: OpenPosition[] = []

    for (const cross of result.crosses) {
      const candle = candlesByTime.get(cross.time)
      if (!candle) {
        continue
      }
      const side = cross.direction === 'up' ? 'long' : 'short'
      const levels = luxAlgoEnhLevels(side, candle, context.rewardRatio)
      if (!levels) {
        continue
      }

      for (const position of open) {
        if (position.side === side) {
          continue
        }
        if (position.exitTime !== null && position.exitTime <= cross.time) {
          continue
        }
        position.exitTime = cross.time
      }

      const type = side === 'long' ? 'longPosition' : 'shortPosition'
      open.push({
        side,
        direction: cross.direction,
        startTime: cross.time,
        type,
        ...levels,
        exitTime: positionExitTime(
          { type, startTime: cross.time, targetPrice: levels.targetPrice, stopPrice: levels.stopPrice },
          context.candles,
        ),
      })
    }

    return open.map((position) => {
      const rawEnd = position.exitTime ?? Math.max(lastTime, position.startTime + bar)
      const endTime = rawEnd - position.startTime < bar ? position.startTime + bar : rawEnd
      return {
        id: `strategy-luxAlgoEnh-${position.startTime}-${position.direction}`,
        type: position.type,
        color: '#d1d4dc',
        lineWidth: DEFAULT_LINE_WIDTH,
        lineStyle: DEFAULT_LINE_STYLE,
        startTime: position.startTime,
        endTime,
        accountSize: DEFAULT_ACCOUNT_SIZE,
        riskPercent: DEFAULT_RISK_PERCENT,
        entryPrice: position.entryPrice,
        targetPrice: position.targetPrice,
        stopPrice: position.stopPrice,
      }
    })
  },
} satisfies StrategyDefinition<typeof LUX_ALGO_ENH_ID>
