import { luxAlgoStrategy } from './luxAlgo'

export const STRATEGIES = [luxAlgoStrategy] as const

export const STRATEGY_ITEMS = STRATEGIES.map((strategy) => ({
  id: strategy.id,
  label: strategy.label,
}))

export type StrategyId = (typeof STRATEGIES)[number]['id']

export type StrategyVisibility = Record<StrategyId, boolean>

export function defaultStrategyVisibility(): StrategyVisibility {
  return Object.fromEntries(STRATEGY_ITEMS.map((strategy) => [strategy.id, false])) as StrategyVisibility
}
