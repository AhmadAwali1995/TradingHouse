import { betterRsiStrategy } from './betterRsi'
import { luxAlgoEnhStrategy } from './luxAlgoEnh'
import { rsiEnhStrategy } from './rsiEnh'

export const STRATEGIES = [betterRsiStrategy, luxAlgoEnhStrategy, rsiEnhStrategy] as const

export const STRATEGY_ITEMS = STRATEGIES.map((strategy) => ({
  id: strategy.id,
  label: strategy.label,
}))

export type StrategyId = (typeof STRATEGIES)[number]['id']

export type StrategyVisibility = Record<StrategyId, boolean>

export function defaultStrategyVisibility(): StrategyVisibility {
  return Object.fromEntries(STRATEGY_ITEMS.map((strategy) => [strategy.id, false])) as StrategyVisibility
}
