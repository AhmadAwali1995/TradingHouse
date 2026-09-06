import {
  getBinanceInterval,
  mergeIntoBucket,
  type Candle,
  type TimeframeId,
} from './candles'
import { getApiLink, type Pair } from './data/config'

const RECONNECT_MS = 2000
const BUCKET_45M = 45 * 60

type BinanceKlineMessage = {
  k?: {
    t: number
    o: string
    h: string
    l: string
    c: string
  }
}

export type LiveCandleSubscription = {
  close: () => void
}

function streamUrl(symbol: string, interval: string): string {
  return `${getApiLink('binanceKlineStream')}/${symbol.toLowerCase()}@kline_${interval}`
}

function parseStreamCandle(payload: string): Candle | null {
  try {
    const message = JSON.parse(payload) as BinanceKlineMessage
    const kline = message.k
    if (!kline) {
      return null
    }

    return {
      time: Math.floor(kline.t / 1000),
      open: Number(kline.o),
      high: Number(kline.h),
      low: Number(kline.l),
      close: Number(kline.c),
    }
  } catch {
    return null
  }
}

export function subscribeLiveCandles(
  pair: Pair,
  timeframe: TimeframeId,
  onCandle: (candle: Candle) => void,
  seed?: Candle,
): LiveCandleSubscription {
  const interval = getBinanceInterval(timeframe)
  const url = streamUrl(pair.symbol, interval)
  const emit =
    timeframe === '45m'
      ? (() => {
          let current = seed
          return (candle: Candle) => {
            current = mergeIntoBucket(current, candle, BUCKET_45M)
            onCandle(current)
          }
        })()
      : onCandle

  let socket: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    if (closed) {
      return
    }

    socket = new WebSocket(url)
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return
      }
      const candle = parseStreamCandle(event.data)
      if (candle) {
        emit(candle)
      }
    }
    socket.onclose = () => {
      if (closed) {
        return
      }
      retry = setTimeout(connect, RECONNECT_MS)
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
