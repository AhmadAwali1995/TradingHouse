import { getApiLink } from './data/config'

export type PairTicker = {
  symbol: string
  lastPrice: number
  priceChangePercent: number
}

export type LiveTickerSubscription = {
  close: () => void
}

type BinanceTicker24hr = {
  symbol: string
  lastPrice: string
  priceChangePercent: string
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

export async function fetchPairTickers(
  symbols: string[],
  signal?: AbortSignal,
): Promise<Map<string, PairTicker>> {
  const unique = [...new Set(symbols)]
  if (unique.length === 0) {
    return new Map()
  }

  const params = new URLSearchParams()
  if (unique.length === 1) {
    params.set('symbol', unique[0])
  } else {
    params.set('symbols', JSON.stringify(unique))
  }

  const response = await fetch(`${getApiLink('binanceTicker24hr')}?${params}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`Failed to load tickers (${response.status})`)
  }

  const payload = (await response.json()) as BinanceTicker24hr | BinanceTicker24hr[]
  const rows = Array.isArray(payload) ? payload : [payload]
  const tickers = new Map<string, PairTicker>()

  for (const row of rows) {
    tickers.set(row.symbol, toPairTicker(row))
  }

  return tickers
}

function toPairTicker(row: { symbol: string; lastPrice: string; priceChangePercent: string }): PairTicker {
  return {
    symbol: row.symbol,
    lastPrice: Number(row.lastPrice),
    priceChangePercent: Number(row.priceChangePercent),
  }
}

function toPairTickerFromBookTicker(row: BinanceBookTickerRow): PairTicker {
  const bid = Number(row.b)
  const ask = Number(row.a)
  const midPrice = Number.isFinite(bid) && Number.isFinite(ask) ? (bid + ask) / 2 : bid || ask

  return {
    symbol: row.s,
    lastPrice: midPrice,
    priceChangePercent: Number.NaN,
  }
}

export function subscribeLiveTickers(
  symbols: string[],
  onTickers: (tickers: Map<string, PairTicker>) => void,
): LiveTickerSubscription {
  const allowed = new Set(symbols)
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
