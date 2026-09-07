import { getBinanceInterval, mergeIntoBucket, type Candle, type TimeframeId } from './candles'
import { getApiLink } from './data/config'
import type { Pair } from './data/config'

export type PairTicker = {
  symbol: string
  openPrice: number
  lastPrice: number
  priceChangePercent: number
}

export type LiveTickerSubscription = {
  close: () => void
}

type BinanceBookTickerRow = {
  s: string
  b: string
  a: string
}

type BinanceCombinedBookTickerMessage = {
  stream: string
  data?: BinanceBookTickerRow
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  ...unknown[],
]

function toCandle(kline: BinanceKline): Candle {
  return {
    time: Math.floor(kline[0] / 1000),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
  }
}

function formatTimeframeChange(lastPrice: number, openPrice: number): number {
  if (openPrice === 0) {
    return 0
  }

  return ((lastPrice - openPrice) / openPrice) * 100
}

async function fetchCurrentTimeframeCandle(
  pair: Pair,
  timeframe: TimeframeId,
  signal?: AbortSignal,
): Promise<Candle | null> {
  const interval = getBinanceInterval(timeframe)
  const limit = timeframe === '45m' ? 3 : 1
  const params = new URLSearchParams({
    symbol: pair.symbol,
    interval,
    limit: String(limit),
  })

  const requestInit =
    typeof AbortSignal !== 'undefined' && signal instanceof AbortSignal ? { signal } : undefined
  const response = await fetch(`${getApiLink(pair.api)}?${params}`, requestInit)
  if (!response.ok) {
    throw new Error(`Failed to load tickers (${response.status})`)
  }

  const payload = (await response.json()) as BinanceKline[]
  const candles = payload.map(toCandle)
  if (candles.length === 0) {
    return null
  }

  if (timeframe !== '45m') {
    return candles.at(-1) ?? null
  }

  let current: Candle | undefined
  for (const candle of candles) {
    current = mergeIntoBucket(current, candle, 45 * 60)
  }

  return current ?? null
}

export async function fetchPairTickers(
  pairs: Pair[],
  timeframe: TimeframeId,
  signal?: AbortSignal,
): Promise<Map<string, PairTicker>> {
  if (pairs.length === 0) {
    return new Map()
  }

  const tickers = new Map<string, PairTicker>()
  const rows = await Promise.all(
    pairs.map(async (pair) => ({
      pair,
      candle: await fetchCurrentTimeframeCandle(pair, timeframe, signal),
    })),
  )

  for (const row of rows) {
    if (!row.candle) {
      continue
    }
    tickers.set(row.pair.symbol, {
      symbol: row.pair.symbol,
      openPrice: row.candle.open,
      lastPrice: row.candle.close,
      priceChangePercent: formatTimeframeChange(row.candle.close, row.candle.open),
    })
  }

  return tickers
}

function toPairTickerFromBookTicker(row: BinanceBookTickerRow): PairTicker {
  const bid = Number(row.b)
  const ask = Number(row.a)
  const midPrice = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : bid || ask

  return {
    symbol: row.s,
    openPrice: Number.NaN,
    lastPrice: midPrice,
    priceChangePercent: Number.NaN,
  }
}

export function subscribeLiveTickers(
  pairs: Pair[],
  onTickers: (tickers: Map<string, PairTicker>) => void,
): LiveTickerSubscription {
  const allowed = new Set(pairs.map((pair) => pair.symbol))
  let socket: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    if (closed) {
      return
    }

    const streams = [...allowed]
      .map((symbol) => `${symbol.toLowerCase()}@bookTicker`)
      .join('/')
    socket = new WebSocket(`${getApiLink('binanceCombinedStream')}${streams}`)
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return
      }

      try {
        const payload = JSON.parse(event.data) as BinanceCombinedBookTickerMessage
        const updates = new Map<string, PairTicker>()
        const row = payload.data
        if (row && allowed.has(row.s)) {
          updates.set(row.s, toPairTickerFromBookTicker(row))
        }

        if (updates.size > 0) {
          onTickers(updates)
        }
      } catch {
        // Ignore malformed socket payloads and keep the stream alive.
      }
    }
    socket.onclose = () => {
      if (closed) {
        return
      }
      retry = setTimeout(connect, 2000)
    }
  }

  connect()

  return {
    close() {
      closed = true
      if (retry !== undefined) {
        clearTimeout(retry)
      }
      socket?.close()
      socket = null
    },
  }
}

export function formatLastPrice(value: number): string {
  if (value >= 1000) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  if (value >= 1) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })
}

export function formatChangePercent(value: number): string {
  const absolute = Math.abs(value).toFixed(2)
  if (value > 0) {
    return `+${absolute}%`
  }
  if (value < 0) {
    return `-${absolute}%`
  }
  return `${absolute}%`
}
