import { API_BASE_URL } from './apiBase'

const RECONNECT_MS = 2000

export type BacktestCandle = {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean
}

export type BacktestSymbol = {
  symbol: string
  index: number
  total: number
  candles: BacktestCandle[]
}

export type BacktestSnapshot = {
  type: 'snapshot'
  backtest: boolean
  paused: boolean
  candlesPerSecond: number
  timeframe: string
  message: string | null
  symbols: BacktestSymbol[]
}

export type BacktestCandleMessage = {
  type: 'candle'
  symbol: string
  timeframe: string
  index: number
  total: number
  candle: BacktestCandle
}

export type BacktestWindowMessage = {
  type: 'window'
  symbol: string
  timeframe: string
  index: number
  total: number
  candles: BacktestCandle[]
}

export type BacktestStatusMessage = {
  type: 'status'
  paused: boolean
  candlesPerSecond: number
  timeframe: string
  message: string | null
}

export type BacktestMessage =
  | BacktestSnapshot
  | BacktestCandleMessage
  | BacktestWindowMessage
  | BacktestStatusMessage

export function backtestSocketUrl(): string {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/backtest`
  }

  if (!API_BASE_URL) {
    return ''
  }

  const url = new URL(API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/backtest'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function subscribeBacktest(
  onMessage: (message: BacktestMessage) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  const url = backtestSocketUrl()
  let socket: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined

  const connect = () => {
    if (closed) {
      return
    }

    if (!url) {
      onConnection(false)
      return
    }

    socket = new WebSocket(url)
    socket.addEventListener('open', () => onConnection(true))
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') {
        return
      }

      try {
        onMessage(JSON.parse(event.data) as BacktestMessage)
      } catch {
        return
      }
    })
    socket.addEventListener('close', () => {
      onConnection(false)
      if (!closed) {
        retry = setTimeout(connect, RECONNECT_MS)
      }
    })
  }

  connect()
  return () => {
    closed = true
    clearTimeout(retry)
    socket?.close()
  }
}

async function postBacktest(path: string, body?: unknown): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`Backtest request failed (${response.status})`)
  }
}

export function pauseBacktest(): Promise<void> {
  return postBacktest('/api/test/candles/backtest/pause')
}

export function resumeBacktest(): Promise<void> {
  return postBacktest('/api/test/candles/backtest/resume')
}

export function backBacktest(): Promise<void> {
  return postBacktest('/api/test/candles/backtest/back')
}

export function restartBacktest(): Promise<void> {
  return postBacktest('/api/test/candles/backtest/restart')
}

export function setBacktestSpeed(candlesPerSecond: number): Promise<void> {
  return postBacktest('/api/test/candles/backtest/speed', { candlesPerSecond })
}
