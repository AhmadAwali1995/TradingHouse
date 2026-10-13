import type { Candle, CandleRange, TimeframeId } from './candles'
import type { PairTicker } from './tickers'

export const TEST_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'LINKUSDT',
  'AVAXUSDT',
  'QNTUSDT',
  'XRPUSDT',
  'EURUSDT',
] as const

export const TEST_TIMEFRAMES = ['15m', '30m', '45m', '1h'] as const satisfies readonly TimeframeId[]

export type DataMode = 'live' | 'test'

type HistoryCandle = {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type HistoryFile = {
  symbol?: string
  frames?: Partial<Record<TimeframeId, HistoryCandle[]>>
}

const files = new Map<string, Promise<HistoryFile>>()

function loadFile(symbol: string): Promise<HistoryFile> {
  const cached = files.get(symbol)
  if (cached) {
    return cached
  }
  const request = fetch(`/test-candles/${symbol}.json`, { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Test candles for ${symbol} were not found`)
    }
    return (await response.json()) as HistoryFile
  })
  files.set(symbol, request)
  request.catch(() => {
    files.delete(symbol)
  })
  return request
}

function toCandle(candle: HistoryCandle): Candle {
  return {
    time: candle.openTime,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume),
  }
}

export function isTestSymbol(symbol: string): boolean {
  return (TEST_SYMBOLS as readonly string[]).includes(symbol)
}

export function isTestTimeframe(timeframe: TimeframeId): boolean {
  return (TEST_TIMEFRAMES as readonly string[]).includes(timeframe)
}

export async function fetchTestCandles(
  symbol: string,
  timeframe: TimeframeId,
  signal?: AbortSignal,
  range?: CandleRange,
): Promise<Candle[]> {
  const file = await loadFile(symbol)
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
  return (file.frames?.[timeframe] ?? []).map(toCandle).filter((candle) => {
    if (!range) {
      return true
    }
    return candle.time >= range.from && candle.time <= range.to
  })
}

export async function fetchTestTickers(timeframe: TimeframeId, signal?: AbortSignal): Promise<Map<string, PairTicker>> {
  const entries = await Promise.all(
    TEST_SYMBOLS.map(async (symbol) => {
      const candles = await fetchTestCandles(symbol, timeframe, signal)
      const last = candles.at(-1)
      if (!last) {
        return null
      }
      const openPrice = last.open
      const lastPrice = last.close
      const priceChangePercent = openPrice === 0 ? 0 : ((lastPrice - openPrice) / openPrice) * 100
      return [symbol, { symbol, openPrice, lastPrice, priceChangePercent }] as const
    }),
  )
  return new Map(entries.filter((entry) => entry !== null))
}
