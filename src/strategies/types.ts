import type { Candle } from '../candles'
import type { PositionDrawing } from '../drawings/types'
import type { LaNweSettings } from '../indicators'

export type RewardRatio = 2 | 3

export type StrategyContext = {
  candles: Candle[]
  laNweSettings: LaNweSettings
  rewardRatio: RewardRatio
}

export type StrategyDefinition<Id extends string = string> = {
  id: Id
  label: string
  positions: (context: StrategyContext) => PositionDrawing[]
}
