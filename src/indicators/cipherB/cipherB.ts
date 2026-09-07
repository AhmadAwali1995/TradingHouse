import type { Candle } from '../../candles'

export const CIPHER_B_CHANNEL_LENGTH = 10
export const CIPHER_B_AVERAGE_LENGTH = 21
export const CIPHER_B_WT2_LENGTH = 4
export const CIPHER_B_CI_SCALE = 0.015

export type CipherBSettings = {
  channelLength: number
  averageLength: number
  overbought1: number
  overbought2: number
  oversold1: number
  oversold2: number
}

export const DEFAULT_CIPHER_B_SETTINGS: CipherBSettings = {
  channelLength: CIPHER_B_CHANNEL_LENGTH,
  averageLength: CIPHER_B_AVERAGE_LENGTH,
  overbought1: 60,
  overbought2: 53,
  oversold1: -60,
  oversold2: -53,
}

export const CIPHER_B_COLORS = {
  wt1: '#2196F3',
  wt1Fill: 'rgba(33, 150, 243, 0.9)',
  wt2: '#0000FF',
  wt2Fill: 'rgba(0, 0, 255, 0.9)',
  difference: '#FFFF00',
  differenceFill: 'rgba(255, 255, 0, 1)',
  zero: '#808080',
  overbought: '#FF0000',
  oversold: '#008000',
  buy: '#00FF00',
  sell: '#FF0000',
  crossOutline: '#000000',
} as const

export type CipherBPoint = {
  time: number
  wt1: number
  wt2: number
  difference: number
  cross: null | 'buy' | 'sell'
}

export function normalizeCipherBSettings(settings: CipherBSettings): CipherBSettings {
  return {
    channelLength: Math.max(1, Math.round(settings.channelLength)),
    averageLength: Math.max(1, Math.round(settings.averageLength)),
    overbought1: settings.overbought1,
    overbought2: settings.overbought2,
    oversold1: settings.oversold1,
    oversold2: settings.oversold2,
  }
}

function ema(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = []
  const alpha = 2 / (length + 1)
  let previous: number | null = null
  let seedSum = 0
  let seedCount = 0

  for (const value of values) {
    if (value === null) {
      result.push(null)
      continue
    }

    if (previous === null) {
      seedSum += value
      seedCount += 1
      if (seedCount === length) {
        previous = seedSum / length
        result.push(previous)
      } else {
        result.push(null)
      }
      continue
    }

    previous = alpha * value + (1 - alpha) * previous
    result.push(previous)
  }

  return result
}

function sma(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = []

  for (let index = 0; index < values.length; index += 1) {
    if (index < length - 1) {
      result.push(null)
      continue
    }

    let sum = 0
    let valid = true
    for (let offset = 0; offset < length; offset += 1) {
      const value = values[index - offset]
      if (value === null) {
        valid = false
        break
      }
      sum += value
    }

    result.push(valid ? sum / length : null)
  }

  return result
}

function crossed(previousLeft: number, previousRight: number, left: number, right: number): boolean {
  return (previousLeft < previousRight && left > right) || (previousLeft > previousRight && left < right)
}

export function calculateCipherB(
  candles: Candle[],
  settings: CipherBSettings = DEFAULT_CIPHER_B_SETTINGS,
): CipherBPoint[] {
  const channelLength = Math.max(1, Math.round(settings.channelLength))
  const averageLength = Math.max(1, Math.round(settings.averageLength))
  if (candles.length < channelLength + averageLength + CIPHER_B_WT2_LENGTH) {
    return []
  }

  const typicalPrice = candles.map((candle) => (candle.high + candle.low + candle.close) / 3)
  const esa = ema(typicalPrice, channelLength)
  const deviation = ema(
    typicalPrice.map((price, index) => {
      const basis = esa[index]
      return basis === null ? null : Math.abs(price - basis)
    }),
    channelLength,
  )
  const ci = typicalPrice.map((price, index) => {
    const basis = esa[index]
    const spread = deviation[index]
    if (basis === null || spread === null || spread === 0) {
      return null
    }
    return (price - basis) / (CIPHER_B_CI_SCALE * spread)
  })
  const wt1 = ema(ci, averageLength)
  const wt2 = sma(wt1, CIPHER_B_WT2_LENGTH)
  const points: CipherBPoint[] = []

  for (let index = 1; index < candles.length; index += 1) {
    const currentWt1 = wt1[index]
    const currentWt2 = wt2[index]
    const previousWt1 = wt1[index - 1]
    const previousWt2 = wt2[index - 1]
    if (
      currentWt1 === null ||
      currentWt2 === null ||
      previousWt1 === null ||
      previousWt2 === null
    ) {
      continue
    }

    let cross: CipherBPoint['cross'] = null
    if (crossed(previousWt1, previousWt2, currentWt1, currentWt2)) {
      cross = currentWt2 - currentWt1 > 0 ? 'sell' : 'buy'
    }

    points.push({
      time: candles[index].time,
      wt1: currentWt1,
      wt2: currentWt2,
      difference: currentWt1 - currentWt2,
      cross,
    })
  }

  return points
}
