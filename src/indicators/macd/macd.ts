import {
  TIMEFRAME_SECONDS,
  type Candle,
  type TimeframeId,
} from '../../candles'

export type CmMacdSettings = {
  useCurrentRes: boolean
  resCustom: TimeframeId
  showMacdSignal: boolean
  showDots: boolean
  showHistogram: boolean
  macdColorChange: boolean
  histColorChange: boolean
  fastLength: number
  slowLength: number
  signalLength: number
}

export const DEFAULT_CM_MACD_SETTINGS: CmMacdSettings = {
  useCurrentRes: true,
  resCustom: '1h',
  showMacdSignal: true,
  showDots: true,
  showHistogram: true,
  macdColorChange: true,
  histColorChange: true,
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
}

export const CM_MACD_COLORS = {
  histUpStrong: '#00ffff',
  histUpWeak: '#0000ff',
  histDownStrong: '#ff0000',
  histDownWeak: '#800000',
  histFallback: '#ffff00',
  histFlat: '#808080',
  macdAbove: '#00ff00',
  macdBelow: '#ff0000',
  signalColorChange: '#ffff00',
  signalFixed: '#00ff00',
  zero: '#ffffff',
} as const

export type CmMacdPoint = {
  time: number
  macd: number
  signal: number
  hist: number
  histColor: string
  macdColor: string
  signalColor: string
  cross: boolean
}

export function normalizeCmMacdSettings(settings: CmMacdSettings): CmMacdSettings {
  return {
    useCurrentRes: settings.useCurrentRes,
    resCustom: settings.resCustom,
    showMacdSignal: settings.showMacdSignal,
    showDots: settings.showDots,
    showHistogram: settings.showHistogram,
    macdColorChange: settings.macdColorChange,
    histColorChange: settings.histColorChange,
    fastLength: Math.max(1, Math.round(settings.fastLength)),
    slowLength: Math.max(1, Math.round(settings.slowLength)),
    signalLength: Math.max(1, Math.round(settings.signalLength)),
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

function histColor(hist: number, previousHist: number | null, fourColors: boolean): string {
  if (!fourColors) {
    return CM_MACD_COLORS.histFlat
  }
  if (previousHist === null) {
    return CM_MACD_COLORS.histFallback
  }
  if (hist > previousHist && hist > 0) {
    return CM_MACD_COLORS.histUpStrong
  }
  if (hist < previousHist && hist > 0) {
    return CM_MACD_COLORS.histUpWeak
  }
  if (hist < previousHist && hist <= 0) {
    return CM_MACD_COLORS.histDownStrong
  }
  if (hist > previousHist && hist <= 0) {
    return CM_MACD_COLORS.histDownWeak
  }
  return CM_MACD_COLORS.histFallback
}

function decoratePoint(
  time: number,
  macd: number,
  signal: number,
  hist: number,
  previous: CmMacdPoint | null,
  settings: CmMacdSettings,
): CmMacdPoint {
  const macdIsAbove = macd >= signal
  return {
    time,
    macd,
    signal,
    hist,
    histColor: histColor(hist, previous?.hist ?? null, settings.histColorChange),
    macdColor: settings.macdColorChange
      ? macdIsAbove
        ? CM_MACD_COLORS.macdAbove
        : CM_MACD_COLORS.macdBelow
      : CM_MACD_COLORS.macdBelow,
    signalColor: settings.macdColorChange ? CM_MACD_COLORS.signalColorChange : CM_MACD_COLORS.signalFixed,
    cross: previous
      ? crossed(previous.macd, previous.signal, macd, signal)
      : false,
  }
}

function aggregateCandles(candles: Candle[], periodSeconds: number): Candle[] {
  const buckets = new Map<number, Candle>()

  for (const candle of candles) {
    const time = Math.floor(candle.time / periodSeconds) * periodSeconds
    const bucket = buckets.get(time)

    if (!bucket) {
      buckets.set(time, {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })
      continue
    }

    bucket.high = Math.max(bucket.high, candle.high)
    bucket.low = Math.min(bucket.low, candle.low)
    bucket.close = candle.close
  }

  return [...buckets.values()]
}

function rawMacd(candles: Candle[], settings: CmMacdSettings): Array<{
  time: number
  macd: number
  signal: number
  hist: number
}> {
  const closes = candles.map((candle) => candle.close)
  const fastMA = ema(closes, settings.fastLength)
  const slowMA = ema(closes, settings.slowLength)
  const macdLine = fastMA.map((fast, index) => {
    const slow = slowMA[index]
    if (fast === null || slow === null) {
      return null
    }
    return fast - slow
  })
  const signalLine = sma(macdLine, settings.signalLength)
  const points: Array<{ time: number; macd: number; signal: number; hist: number }> = []

  for (let index = 0; index < candles.length; index += 1) {
    const macd = macdLine[index]
    const signal = signalLine[index]
    if (macd === null || signal === null) {
      continue
    }
    points.push({
      time: candles[index].time,
      macd,
      signal,
      hist: macd - signal,
    })
  }

  return points
}

export function calculateCmMacd(
  candles: Candle[],
  settings: CmMacdSettings = DEFAULT_CM_MACD_SETTINGS,
  chartTimeframe: TimeframeId,
): CmMacdPoint[] {
  const normalized = normalizeCmMacdSettings(settings)
  const chartSeconds = TIMEFRAME_SECONDS[chartTimeframe]
  const targetSeconds = normalized.useCurrentRes
    ? chartSeconds
    : TIMEFRAME_SECONDS[normalized.resCustom]
  const source =
    targetSeconds > chartSeconds ? aggregateCandles(candles, targetSeconds) : candles
  const raw = rawMacd(source, normalized)
  if (raw.length === 0) {
    return []
  }

  if (targetSeconds <= chartSeconds) {
    const points: CmMacdPoint[] = []
    let previous: CmMacdPoint | null = null
    for (const item of raw) {
      const point = decoratePoint(item.time, item.macd, item.signal, item.hist, previous, normalized)
      points.push(point)
      previous = point
    }
    return points
  }

  const byTime = new Map(raw.map((item) => [item.time, item]))
  const points: CmMacdPoint[] = []
  let previous: CmMacdPoint | null = null

  for (const candle of candles) {
    const bucket = Math.floor(candle.time / targetSeconds) * targetSeconds
    const item = byTime.get(bucket)
    if (!item) {
      continue
    }
    const point = decoratePoint(candle.time, item.macd, item.signal, item.hist, previous, normalized)
    points.push(point)
    previous = point
  }

  return points
}
