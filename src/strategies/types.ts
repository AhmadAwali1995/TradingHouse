import type { Candle } from '../candles'
import type { PositionDrawing } from '../drawings/types'
import type { LaNweSettings } from '../indicators'

export type RewardRatio = 2 | 2.5 | 3

export const REWARD_RATIOS = [2, 2.5, 3] as const satisfies readonly RewardRatio[]

export type StrategyContext = {
  candles: Candle[]
  rewardRatio: RewardRatio
  laNweSettings: LaNweSettings
}

export type StrategyDefinition<Id extends string = string> = {
  id: Id
  label: string
  positions: (context: StrategyContext) => PositionDrawing[]
}
