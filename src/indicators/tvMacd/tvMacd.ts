import type { Candle } from '../../candles'
import { SMA_SOURCES, type SmaSource } from '../sma'

export const TV_MACD_MA_TYPES = ['EMA', 'SMA'] as const
export type TvMacdMaType = (typeof TV_MACD_MA_TYPES)[number]

export type TvMacdSettings = {
  source: SmaSource
  fastLength: number
  slowLength: number
  signalLength: number
  oscillatorType: TvMacdMaType
  signalType: TvMacdMaType
}

export const DEFAULT_TV_MACD_SETTINGS: TvMacdSettings = {
  source: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscillatorType: 'EMA',
  signalType: 'EMA',
}

export const TV_MACD_COLORS = {
  macd: '#2962ff',
  signal: '#ff6d00',
  zero: '#787b8680',
  histUpStrong: '#26a69a',
  histUpWeak: '#b2dfdb',
  histDownWeak: '#ffcdd2',
  histDownStrong: '#ff5252',
} as const

export type TvMacdPoint = {
  time: number
  macd: number
  signal: number
  hist: number
  histColor: string
}

export function normalizeTvMacdSettings(settings: TvMacdSettings): TvMacdSettings {
  const source = SMA_SOURCES.includes(settings.source) ? settings.source : 'close'
  const oscillatorType = TV_MACD_MA_TYPES.includes(settings.oscillatorType)
    ? settings.oscillatorType
    : 'EMA'
  const signalType = TV_MACD_MA_TYPES.includes(settings.signalType) ? settings.signalType : 'EMA'

  return {
    source,
    fastLength: Math.max(1, Math.round(settings.fastLength)),
    slowLength: Math.max(1, Math.round(settings.slowLength)),
    signalLength: Math.max(1, Math.round(settings.signalLength)),
    oscillatorType,
    signalType,
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

function ma(values: Array<number | null>, length: number, type: TvMacdMaType): Array<number | null> {
  return type === 'SMA' ? sma(values, length) : ema(values, length)
}

function histColor(hist: number, previousHist: number | null): string {
  if (hist >= 0) {
    return previousHist !== null && hist > previousHist
      ? TV_MACD_COLORS.histUpStrong
      : TV_MACD_COLORS.histUpWeak
  }
  return previousHist !== null && hist > previousHist
    ? TV_MACD_COLORS.histDownWeak
    : TV_MACD_COLORS.histDownStrong
}

export function calculateTvMacd(
  candles: Candle[],
  settings: TvMacdSettings = DEFAULT_TV_MACD_SETTINGS,
): TvMacdPoint[] {
  const normalized = normalizeTvMacdSettings(settings)
  const source = candles.map((candle) => sourceValue(candle, normalized.source))
  const maFast = ma(source, normalized.fastLength, normalized.oscillatorType)
  const maSlow = ma(source, normalized.slowLength, normalized.oscillatorType)
  const macdLine = maFast.map((fast, index) => {
    const slow = maSlow[index]
    if (fast === null || slow === null) {
      return null
    }
    return fast - slow
  })
  const signalLine = ma(macdLine, normalized.signalLength, normalized.signalType)
  const points: TvMacdPoint[] = []
  let previousHist: number | null = null

  for (let index = 0; index < candles.length; index += 1) {
    const macd = macdLine[index]
    const signal = signalLine[index]
    if (macd === null || signal === null) {
      continue
    }

    const hist = macd - signal
    points.push({
      time: candles[index].time,
      macd,
      signal,
      hist,
      histColor: histColor(hist, previousHist),
    })
    previousHist = hist
  }

  return points
}
