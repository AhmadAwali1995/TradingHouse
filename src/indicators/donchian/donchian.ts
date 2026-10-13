import type { Candle } from '../../candles'

export type DcSettings = {
  length: number
  offset: number
}

export const DEFAULT_DC_SETTINGS: DcSettings = {
  length: 20,
  offset: 0,
}

export const DC_COLORS = {
  basis: '#FF6D00',
  upper: '#2962FF',
  lower: '#2962FF',
  fill: 'rgba(33, 150, 243, 0.05)',
} as const

export type DcPoint = {
  time: number
  upper: number
  lower: number
  basis: number
}

export function normalizeDcSettings(settings: DcSettings): DcSettings {
  return {
    length: Math.max(1, Math.round(settings.length)),
    offset: Math.max(-500, Math.min(500, Math.round(settings.offset))),
  }
}

export function calculateDonchian(
  candles: Candle[],
  settings: DcSettings = DEFAULT_DC_SETTINGS,
): DcPoint[] {
  const normalized = normalizeDcSettings(settings)
  if (candles.length < normalized.length) {
    return []
  }

  const points: DcPoint[] = []
  for (let index = normalized.length - 1; index < candles.length; index += 1) {
    let upper = -Infinity
    let lower = Infinity
    for (let lookback = index - normalized.length + 1; lookback <= index; lookback += 1) {
      upper = Math.max(upper, candles[lookback].high)
      lower = Math.min(lower, candles[lookback].low)
    }

    const targetIndex = index + normalized.offset
    if (targetIndex < 0 || targetIndex >= candles.length) {
      continue
    }

    points.push({
      time: candles[targetIndex].time,
      upper,
      lower,
      basis: (upper + lower) / 2,
    })
  }

  return points
}
