import type { Candle } from '../../candles'

export const MA_TYPES = ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] as const
export type MaType = (typeof MA_TYPES)[number]

export const MA_SOURCES = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] as const
export type MaSource = (typeof MA_SOURCES)[number]

export const MA_SOURCE_LABELS: Record<MaSource, string> = {
  close: 'Close',
  open: 'Open',
  high: 'High',
  low: 'Low',
  hl2: 'HL2',
  hlc3: 'HLC3',
  ohlc4: 'OHLC4',
}

export type MaLineSettings = {
  show: boolean
  type: MaType
  source: MaSource
  length: number
  color: string
}

export type MaRibbonSettings = {
  ma1: MaLineSettings
  ma2: MaLineSettings
}

export const DEFAULT_MA_RIBBON_SETTINGS: MaRibbonSettings = {
  ma1: { show: true, type: 'SMA', source: 'close', length: 20, color: '#2962ff' },
  ma2: { show: true, type: 'SMA', source: 'close', length: 200, color: '#fdd835' },
}

export type MaPoint = {
  time: number
  value: number
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function normalizeMaLine(line: MaLineSettings, fallback: MaLineSettings): MaLineSettings {
  return {
    show: line.show === true,
    type: MA_TYPES.includes(line.type) ? line.type : fallback.type,
    source: MA_SOURCES.includes(line.source) ? line.source : fallback.source,
    length: Math.max(1, Math.round(line.length) || fallback.length),
    color: HEX_COLOR.test(line.color) ? line.color : fallback.color,
  }
}

export function normalizeMaRibbonSettings(settings: MaRibbonSettings): MaRibbonSettings {
  return {
    ma1: normalizeMaLine(settings.ma1, DEFAULT_MA_RIBBON_SETTINGS.ma1),
    ma2: normalizeMaLine(settings.ma2, DEFAULT_MA_RIBBON_SETTINGS.ma2),
  }
}

function sourceValue(candle: Candle, source: MaSource): number {
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

function vwma(values: Array<number | null>, volumes: number[], length: number): Array<number | null> {
  const weighted = values.map((value, index) => (value === null ? null : value * volumes[index]))
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

function movingAverage(
  values: Array<number | null>,
  volumes: number[],
  length: number,
  type: MaType,
): Array<number | null> {
  switch (type) {
    case 'EMA':
      return ema(values, length)
    case 'SMMA (RMA)':
      return rma(values, length)
    case 'WMA':
      return wma(values, length)
    case 'VWMA':
      return vwma(values, volumes, length)
    default:
      return sma(values, length)
  }
}

export function calculateMa(candles: Candle[], line: MaLineSettings): MaPoint[] {
  const normalized = normalizeMaLine(line, DEFAULT_MA_RIBBON_SETTINGS.ma1)
  const source = candles.map((candle) => sourceValue(candle, normalized.source))
  const volumes = candles.map((candle) => candle.volume ?? 0)
  const values = movingAverage(source, volumes, normalized.length, normalized.type)
  const points: MaPoint[] = []
  for (let index = 0; index < candles.length; index += 1) {
    const value = values[index]
    if (value === null) {
      continue
    }
    points.push({ time: candles[index].time, value })
  }
  return points
}
