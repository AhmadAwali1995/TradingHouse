import type { PositionDrawing } from '../drawings/types'
import { STRATEGIES, type StrategyVisibility } from './catalog'
import type { StrategyContext } from './types'

export function strategyPositions(
  visibility: StrategyVisibility,
  context: StrategyContext,
): PositionDrawing[] {
  return STRATEGIES.flatMap((strategy) => (visibility[strategy.id] ? strategy.positions(context) : []))
}
