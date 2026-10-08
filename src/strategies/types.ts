import type { Candle } from '../candles'
import type { PositionDrawing } from '../drawings/types'

export type RewardRatio = 2 | 3

export type StrategyContext = {
  candles: Candle[]
  rewardRatio: RewardRatio
}

export type StrategyDefinition<Id extends string = string> = {
  id: Id
  label: string
  positions: (context: StrategyContext) => PositionDrawing[]
}
