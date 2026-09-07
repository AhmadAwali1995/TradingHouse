import type { Candle } from '../../candles'

export const NWE_LOOKBACK = 500
export const NWE_BANDWIDTH = 8
export const NWE_MULTIPLIER = 3

export type NweSettings = {
  bandwidth: number
  multiplier: number
  lookback: number
  repaint: boolean
}

export const DEFAULT_NWE_SETTINGS: NweSettings = {
  bandwidth: NWE_BANDWIDTH,
  multiplier: NWE_MULTIPLIER,
  lookback: NWE_LOOKBACK,
  repaint: true,
}

export type NwePoint = {
  time: number
  middle: number
  upper: number
  lower: number
}

export type NweCross = {
  time: number
  direction: 'up' | 'down'
}

export type NweResult = {
  points: NwePoint[]
  crosses: NweCross[]
}

function gauss(distance: number, bandwidth: number): number {
  return Math.exp(-(distance * distance) / (bandwidth * bandwidth * 2))
}

function collectCrosses(src: number[], times: number[], upper: number[], lower: number[]): NweCross[] {
  const crosses: NweCross[] = []

  for (let index = 1; index < src.length; index += 1) {
    if (src[index] > upper[index] && src[index - 1] < upper[index]) {
      crosses.push({ time: times[index], direction: 'down' })
    }
    if (src[index] < lower[index] && src[index - 1] > lower[index]) {
      crosses.push({ time: times[index], direction: 'up' })
    }
  }

  return crosses
}

function calculateRepainting(
  candles: Candle[],
  bandwidth: number,
  multiplier: number,
  lookback: number,
): NweResult {
  const window = candles.slice(-lookback)
  const size = window.length
  if (size < 2) {
    return { points: [], crosses: [] }
  }

  const src = window.map((candle) => candle.close)
  const times = window.map((candle) => candle.time)
  const middle = new Array<number>(size)
  let sae = 0

  for (let index = 0; index < size; index += 1) {
    let sum = 0
    let weightSum = 0
    for (let other = 0; other < size; other += 1) {
      const weight = gauss(index - other, bandwidth)
      sum += src[other] * weight
      weightSum += weight
    }
    middle[index] = weightSum === 0 ? src[index] : sum / weightSum
    sae += Math.abs(src[index] - middle[index])
  }

  const width = (sae / (size - 1)) * multiplier
  const upper = middle.map((value) => value + width)
  const lower = middle.map((value) => value - width)

  return {
    points: window.map((candle, index) => ({
      time: candle.time,
      middle: middle[index],
      upper: upper[index],
      lower: lower[index],
    })),
    crosses: collectCrosses(src, times, upper, lower),
  }
}

function calculateEndpoint(
  candles: Candle[],
  bandwidth: number,
  multiplier: number,
  lookback: number,
): NweResult {
  const size = Math.min(lookback, candles.length)
  if (size < 2) {
    return { points: [], crosses: [] }
  }

  const weights = new Array<number>(size)
  let denominator = 0
  for (let lag = 0; lag < size; lag += 1) {
    const weight = gauss(lag, bandwidth)
    weights[lag] = weight
    denominator += weight
  }

  if (denominator === 0) {
    return { points: [], crosses: [] }
  }

  const smaPeriod = size - 1
  const absDev: number[] = []
  const points: NwePoint[] = []
  const src: number[] = []
  const times: number[] = []
  const upper: number[] = []
  const lower: number[] = []

  for (let index = size - 1; index < candles.length; index += 1) {
    let sum = 0
    for (let lag = 0; lag < size; lag += 1) {
      sum += candles[index - lag].close * weights[lag]
    }
    const middle = sum / denominator
    absDev.push(Math.abs(candles[index].close - middle))
    if (absDev.length < smaPeriod) {
      continue
    }

    let mae = 0
    for (let offset = absDev.length - smaPeriod; offset < absDev.length; offset += 1) {
      mae += absDev[offset]
    }
    mae = (mae / smaPeriod) * multiplier

    const candle = candles[index]
    src.push(candle.close)
    times.push(candle.time)
    upper.push(middle + mae)
    lower.push(middle - mae)
    points.push({
      time: candle.time,
      middle,
      upper: middle + mae,
      lower: middle - mae,
    })
  }

  return {
    points,
    crosses: collectCrosses(src, times, upper, lower),
  }
}

export function normalizeNweSettings(settings: NweSettings): NweSettings {
  return {
    bandwidth: Math.max(0.1, settings.bandwidth),
    multiplier: Math.max(0, settings.multiplier),
    lookback: Math.max(2, Math.min(2000, Math.round(settings.lookback))),
    repaint: settings.repaint,
  }
}

export function calculateNadarayaWatsonEnvelope(
  candles: Candle[],
  settings: NweSettings = DEFAULT_NWE_SETTINGS,
): NweResult {
  const { bandwidth, multiplier, lookback, repaint } = normalizeNweSettings(settings)
  if (repaint) {
    return calculateRepainting(candles, bandwidth, multiplier, lookback)
  }
  return calculateEndpoint(candles, bandwidth, multiplier, lookback)
}
