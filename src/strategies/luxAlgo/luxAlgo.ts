import { DEFAULT_ACCOUNT_SIZE, DEFAULT_RISK_PERCENT, positionLevels } from '../../drawings/position'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, type PositionDrawing } from '../../drawings/types'
import { calculateLaNwe } from '../../indicators'
import type { StrategyContext, StrategyDefinition } from '../types'

export const LUX_ALGO_ID = 'luxAlgo' as const

export const luxAlgoStrategy = {
  id: LUX_ALGO_ID,
  label: 'Lux Algo',
  positions(context: StrategyContext): PositionDrawing[] {
    const result = calculateLaNwe(context.candles, context.laNweSettings)

    return result.crosses.map((cross) => {
      const side = cross.direction === 'up' ? 'long' : 'short'
      const levels = positionLevels(side, { time: cross.time, price: cross.price }, context.candles)
      const span = levels.endTime - levels.startTime

      return {
        id: `strategy-luxAlgo-${cross.time}-${cross.direction}`,
        type: side === 'long' ? 'longPosition' : 'shortPosition',
        color: '#d1d4dc',
        lineWidth: DEFAULT_LINE_WIDTH,
        lineStyle: DEFAULT_LINE_STYLE,
        ...levels,
        startTime: cross.time,
        endTime: cross.time + span,
        accountSize: DEFAULT_ACCOUNT_SIZE,
        riskPercent: DEFAULT_RISK_PERCENT,
      }
    })
  },
} satisfies StrategyDefinition<typeof LUX_ALGO_ID>
