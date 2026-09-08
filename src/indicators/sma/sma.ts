import type { Candle } from '../../candles'

export const SMA_SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] as const
export type SmaSource = (typeof SMA_SOURCES)[number]

export const SMA_SMOOTHING_TYPES = [
  'None',
  'SMA',
  'SMA + Bollinger Bands',
  'EMA',
  'SMMA (RMA)',
  'WMA',
  'VWMA',
] as const
export type SmaSmoothingType = (typeof SMA_SMOOTHING_TYPES)[number]

export type SmaSettings = {
  length: number
  source: SmaSource
  offset: number
  smoothingType: SmaSmoothingType
  smoothingLength: number
  bbStdDev: number
}

export const DEFAULT_SMA_SETTINGS: SmaSettings = {
  length: 9,
  source: 'close',
  offset: 0,
  smoothingType: 'None',
  smoothingLength: 14,
  bbStdDev: 2,
}

export const SMA_COLORS = {
  ma: '#2962ff',
  smoothing: '#fdd835',
  band: '#089981',
} as const

export type SmaPoint = {
  time: number
  sma: number
  smoothing: number | null
  bbUpper: number | null
  bbLower: number | null
}

export function normalizeSmaSettings(settings: SmaSettings): SmaSettings {
  const smoothingType = SMA_SMOOTHING_TYPES.includes(settings.smoothingType)
    ? settings.smoothingType
    : 'None'
  const source = SMA_SOURCES.includes(settings.source) ? settings.source : 'close'

  return {
    length: Math.max(1, Math.round(settings.length)),
    source,
    offset: Math.max(-500, Math.min(500, Math.round(settings.offset))),
    smoothingType,
    smoothingLength: Math.max(1, Math.round(settings.smoothingLength)),
    bbStdDev: Math.max(0.001, Math.min(50, settings.bbStdDev)),
  }
}

function sourceValue(candle: Candle, source: SmaSource): number {
  switch (source) {
    case 'open':
      return candle.open
    case 'high':
      return candle.high
    case 'low':
      return candle.low
    case 'hl2':
      return (candle.high + candle.low) / 2
    case 'hlc3':
      return (candle.high + candle.low + candle.close) / 3
    case 'ohlc4':
      return (candle.open + candle.high + candle.low + candle.close) / 4
    default:
      return candle.close
  }
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

function rma(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = []
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

    previous = (previous * (length - 1) + value) / length
    result.push(previous)
  }

  return result
}

function wma(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = []
  const weightSum = (length * (length + 1)) / 2

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
      sum += value * (length - offset)
    }

    result.push(valid ? sum / weightSum : null)
  }

  return result
}

function vwma(
  values: Array<number | null>,
  volumes: number[],
  length: number,
): Array<number | null> {
  const weighted = values.map((value, index) =>
    value === null ? null : value * volumes[index],
  )
  const volumeSma = sma(volumes, length)
  const sourceVolumeSma = sma(weighted, length)

  return sourceVolumeSma.map((value, index) => {
    const volumeAvg = volumeSma[index]
    if (value === null || volumeAvg === null || volumeAvg === 0) {
      return null
    }
    return value / volumeAvg
  })
}

function stdev(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = []

  for (let index = 0; index < values.length; index += 1) {
    if (index < length - 1) {
      result.push(null)
      continue
    }

    const window: number[] = []
    let valid = true
    for (let offset = 0; offset < length; offset += 1) {
      const value = values[index - offset]
      if (value === null) {
        valid = false
        break
      }
      window.push(value)
    }

    if (!valid) {
      result.push(null)
      continue
    }

    const mean = window.reduce((sum, value) => sum + value, 0) / length
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / length
    result.push(Math.sqrt(variance))
  }

  return result
}

function smooth(
  values: Array<number | null>,
  volumes: number[],
  length: number,
  type: SmaSmoothingType,
): Array<number | null> {
  switch (type) {
    case 'SMA':
    case 'SMA + Bollinger Bands':
      return sma(values, length)
    case 'EMA':
      return ema(values, length)
    case 'SMMA (RMA)':
      return rma(values, length)
    case 'WMA':
      return wma(values, length)
    case 'VWMA':
      return vwma(values, volumes, length)
    default:
      return values.map(() => null)
  }
}

export function calculateSma(
  candles: Candle[],
  settings: SmaSettings = DEFAULT_SMA_SETTINGS,
): SmaPoint[] {
  const normalized = normalizeSmaSettings(settings)
  if (candles.length < normalized.length) {
    return []
  }

  const source = candles.map((candle) => sourceValue(candle, normalized.source))
  const volumes = candles.map((candle) => candle.volume ?? 0)
  const smaLine = sma(source, normalized.length)
  const enableSmoothing = normalized.smoothingType !== 'None'
  const isBb = normalized.smoothingType === 'SMA + Bollinger Bands'
  const smoothingLine = enableSmoothing
    ? smooth(smaLine, volumes, normalized.smoothingLength, normalized.smoothingType)
    : smaLine.map(() => null)
  const deviation = isBb ? stdev(smaLine, normalized.smoothingLength) : smaLine.map(() => null)

  const points: SmaPoint[] = []
  for (let index = 0; index < candles.length; index += 1) {
    const smaValue = smaLine[index]
    if (smaValue === null) {
      continue
    }

    const targetIndex = index + normalized.offset
    if (targetIndex < 0 || targetIndex >= candles.length) {
      continue
    }

    const smoothing = smoothingLine[index]
    const spread =
      isBb && smoothing !== null && deviation[index] !== null
        ? deviation[index]! * normalized.bbStdDev
        : null

    points.push({
      time: candles[targetIndex].time,
      sma: smaValue,
      smoothing: enableSmoothing ? smoothing : null,
      bbUpper: spread === null || smoothing === null ? null : smoothing + spread,
      bbLower: spread === null || smoothing === null ? null : smoothing - spread,
    })
  }

  return points
}
