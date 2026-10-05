import { API_BASE_URL } from './apiBase'
import type { Candle, CandleRange, TimeframeId } from './candles'

const RECONNECT_MS = 2000

type HistoryMessage = { type: 'history'; candles: Candle[] }
type CandleMessage = { type: 'candle'; candle: Candle }
type ErrorMessage = { type: 'error'; message: string }
type ChartMessage = HistoryMessage | CandleMessage | ErrorMessage

export function subscribeChartCandles(
  symbol: string,
  timeframe: TimeframeId,
  range: CandleRange | undefined,
  onHistory: (candles: Candle[]) => void,
  onCandle: (candle: Candle) => void,
  onError: (message: string) => void,
): { close: () => void } {
  const url = chartSocketUrl()
  let socket: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    if (closed) {
      return
    }

    if (!url) {
      onError('Chart feed is not configured.')
      return
    }

    socket = new WebSocket(url)
    socket.addEventListener('open', () => {
      socket?.send(
        JSON.stringify({
          symbol,
          timeframe,
          from: range?.from,
          to: range?.to,
        }),
      )
    })
    socket.addEventListener('message', (event) => {
      if (closed || typeof event.data !== 'string') {
        return
      }

      let message: ChartMessage
      try {
        message = JSON.parse(event.data) as ChartMessage
      } catch {
        return
      }

      if (message.type === 'history' && Array.isArray(message.candles)) {
        onHistory(message.candles)
        return
      }

      if (message.type === 'candle' && message.candle) {
        onCandle(message.candle)
        return
      }

      if (message.type === 'error' && message.message) {
        onError(message.message)
      }
    })
    socket.addEventListener('close', () => {
      if (!closed) {
        retry = setTimeout(connect, RECONNECT_MS)
      }
    })
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

function chartSocketUrl(): string {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/chart`
  }

  if (!API_BASE_URL) {
    return ''
  }

  const url = new URL(API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/chart'
  url.search = ''
  url.hash = ''
  return url.toString()
}
