import type { StrategyId } from './catalog'

export type StrategyEntrySettings = {
  betterRsi: { oversoldTurn: boolean }
  luxAlgoEnh: { lowerBand: boolean }
  rsiEnh: { oversoldTurn: boolean }
}

export const STRATEGY_ENTRY_OPTIONS = {
  betterRsi: [
    { id: 'oversoldTurn', label: 'RSI(14) falls through 30, then turns up' },
  ],
  luxAlgoEnh: [
    { id: 'lowerBand', label: 'Lux Algo lower-band long, repainting off' },
  ],
  rsiEnh: [
    { id: 'oversoldTurn', label: 'RSI(14) falls through 30, then turns up' },
  ],
} as const satisfies {
  [Strategy in StrategyId]: readonly { id: keyof StrategyEntrySettings[Strategy]; label: string }[]
}

export function defaultStrategyEntries(): StrategyEntrySettings {
  return {
    betterRsi: { oversoldTurn: true },
    luxAlgoEnh: { lowerBand: true },
    rsiEnh: { oversoldTurn: true },
  }
}

export function toggleStrategyEntry(
  current: StrategyEntrySettings,
  strategy: StrategyId,
  entry: string,
): StrategyEntrySettings {
  const group = current[strategy]
  if (!(entry in group)) {
    return current
  }
  return {
    ...current,
    [strategy]: {
      ...group,
      [entry]: !group[entry as keyof typeof group],
    },
  }
}
