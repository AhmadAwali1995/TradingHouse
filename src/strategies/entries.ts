import type { StrategyId } from './catalog'

export type StrategyEntrySettings = {
  betterRsi: { oversoldTurn: boolean }
  luxAlgoEnh: { lowerBand: boolean }
  rsiEnh: { oversoldTurn: boolean; cross50To55: boolean; entryLevel: number; exitLevel: number }
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
    { id: 'cross50To55', label: 'RSI(14) crosses 50 from below and reaches the entry level' },
  ],
} as const satisfies {
  [Strategy in StrategyId]: readonly { id: keyof StrategyEntrySettings[Strategy]; label: string }[]
}

export function defaultStrategyEntries(): StrategyEntrySettings {
  return {
    betterRsi: { oversoldTurn: true },
    luxAlgoEnh: { lowerBand: true },
    rsiEnh: { oversoldTurn: true, cross50To55: true, entryLevel: 55, exitLevel: 67 },
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
  const value = group[entry as keyof typeof group]
  if (typeof value !== 'boolean') {
    return current
  }
  return {
    ...current,
    [strategy]: {
      ...group,
      [entry]: !value,
    },
  }
}

export function setRsiEnhLevel(
  current: StrategyEntrySettings,
  level: 'entryLevel' | 'exitLevel',
  value: number,
): StrategyEntrySettings {
  if (!Number.isFinite(value)) {
    return current
  }
  const next = Math.min(100, Math.max(0, value))
  return {
    ...current,
    rsiEnh: {
      ...current.rsiEnh,
      [level]: next,
    },
  }
}
