import type { Candle } from '../../candles'

export const LA_NWE_LOOKBACK = 500
export const LA_NWE_BANDWIDTH = 8
export const LA_NWE_MULTIPLIER = 3

export type LaNweSettings = {
  bandwidth: number
  multiplier: number
  lookback: number
  repaint: boolean
}

export const DEFAULT_LA_NWE_SETTINGS: LaNweSettings = {
  bandwidth: LA_NWE_BANDWIDTH,
  multiplier: LA_NWE_MULTIPLIER,
  lookback: LA_NWE_LOOKBACK,
  repaint: true,
}

export type LaNwePoint = {
  time: number
  middle: number
  upper: number
  lower: number
}

export type LaNweCross = {
  time: number
  price: number
  direction: 'up' | 'down'
}

export type LaNweResult = {
  points: LaNwePoint[]
  crosses: LaNweCross[]
}

function gauss(distance: number, bandwidth: number): number {
  return Math.exp(-(distance * distance) / (bandwidth * bandwidth * 2))
}

function collectCrosses(
  candles: Candle[],
  src: number[],
  upper: number[],
  lower: number[],
): LaNweCross[] {
  const crosses: LaNweCross[] = []

  for (let index = 1; index < src.length; index += 1) {
    const previousClose = src[index - 1]
    const currentClose = src[index]
    const previousUpper = upper[index - 1]
    const currentUpper = upper[index]
    const previousLower = lower[index - 1]
    const currentLower = lower[index]
    const candle = candles[index]

    if (currentClose >= currentUpper && previousClose <= previousUpper) {
      crosses.push({ time: candle.time, price: candle.high, direction: 'down' })
    }
    if (currentClose <= currentLower && previousClose >= previousLower) {
      crosses.push({ time: candle.time, price: candle.low, direction: 'up' })
    }
  }

  return crosses
}

function calculateRepainting(
  candles: Candle[],
  bandwidth: number,
  multiplier: number,
  lookback: number,
): LaNweResult {
  const size = candles.length
  if (size < 2) {
    return { points: [], crosses: [] }
  }

  const radius = Math.max(1, lookback - 1)
  const src = candles.map((candle) => candle.close)
  const middle = new Array<number>(size)
  let sae = 0

  for (let index = 0; index < size; index += 1) {
    let sum = 0
    let weightSum = 0
    const start = Math.max(0, index - radius)
    const end = Math.min(size - 1, index + radius)

    for (let other = start; other <= end; other += 1) {
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
    points: candles.map((candle, index) => ({
      time: candle.time,
      middle: middle[index],
      upper: upper[index],
      lower: lower[index],
    })),
    crosses: collectCrosses(candles, src, upper, lower),
  }
}

function calculateEndpoint(
  candles: Candle[],
  bandwidth: number,
  multiplier: number,
  lookback: number,
): LaNweResult {
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
  const points: LaNwePoint[] = []
  const crossCandles: Candle[] = []
  const src: number[] = []
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
    crossCandles.push(candle)
    src.push(candle.close)
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
    crosses: collectCrosses(crossCandles, src, upper, lower),
  }
}

export function normalizeLaNweSettings(settings: LaNweSettings): LaNweSettings {
  return {
    bandwidth: Math.max(0.1, settings.bandwidth),
    multiplier: Math.max(0, settings.multiplier),
    lookback: Math.max(2, Math.min(2000, Math.round(settings.lookback))),
    repaint: settings.repaint,
  }
}

export function calculateLaNwe(
  candles: Candle[],
  settings: LaNweSettings = DEFAULT_LA_NWE_SETTINGS,
): LaNweResult {
  const { bandwidth, multiplier, lookback, repaint } = normalizeLaNweSettings(settings)
  if (repaint) {
    return calculateRepainting(candles, bandwidth, multiplier, lookback)
  }
  return calculateEndpoint(candles, bandwidth, multiplier, lookback)
}
