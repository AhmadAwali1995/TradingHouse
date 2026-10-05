export const TIMEFRAMES = [
  { id: '15m', label: '15m' },
  { id: '30m', label: '30m' },
  { id: '45m', label: '45m' },
  { id: '1h', label: '1h' },
  { id: '4h', label: '4h' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
] as const

export type TimeframeId = (typeof TIMEFRAMES)[number]['id']

export const TIMEFRAME_SECONDS: Record<TimeframeId, number> = {
  '15m': 15 * 60,
  '30m': 30 * 60,
  '45m': 45 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '1w': 7 * 24 * 60 * 60,
}

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

const BINANCE_INTERVAL: Record<TimeframeId, string> = {
  '15m': '15m',
  '30m': '30m',
  '45m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
}

export type CandleRange = {
  from: number
  to: number
}

export function getBinanceInterval(timeframe: TimeframeId): string {
  return BINANCE_INTERVAL[timeframe]
}

export function applyLiveCandle(candles: Candle[], candle: Candle): boolean {
  const lastIndex = candles.length - 1
  const last = candles[lastIndex]

  if (last && last.time === candle.time) {
    candles[lastIndex] = candle
    return true
  }

  if (!last || candle.time > last.time) {
    candles.push(candle)
    return true
  }

  return false
}

export function mergeIntoBucket(
  current: Candle | undefined,
  candle: Candle,
  periodSeconds: number,
): Candle {
  const time = Math.floor(candle.time / periodSeconds) * periodSeconds

  if (!current || current.time !== time) {
    return {
      time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume ?? 0,
    }
  }

  return {
    time,
    open: current.open,
    high: Math.max(current.high, candle.high),
    low: Math.min(current.low, candle.low),
    close: candle.close,
    volume: (current.volume ?? 0) + (candle.volume ?? 0),
  }
}
