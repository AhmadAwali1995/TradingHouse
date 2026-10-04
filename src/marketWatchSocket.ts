import { API_BASE_URL } from './apiBase'

const RECONNECT_MS = 2000

export type MarketWatchPair = {
  symbol: string
  interval: string
  state: 'starting' | 'live' | 'failed' | 'skipped' | string
  detail: string | null
  price: number | null
  open: number | null
  high: number | null
  low: number | null
  closed: boolean | null
  updatedAt: string | null
  orderOpened?: boolean
}

export type MarketWatchSnapshot = {
  interval: string
  message: string | null
  pairs: MarketWatchPair[]
}

type SnapshotMessage = MarketWatchSnapshot & { type: 'snapshot' }
type StatusMessage = { type: 'status'; interval: string; message: string | null }
type PairMessage = { type: 'tick' | 'pair'; pair: MarketWatchPair }
type RemoveMessage = { type: 'remove'; symbol: string }
export type MarketWatchMessage = SnapshotMessage | StatusMessage | PairMessage | RemoveMessage

export function marketWatchSocketUrl(): string {
  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}/ws/market-watch`
  }

  if (!API_BASE_URL) {
    return ''
  }

  const url = new URL(API_BASE_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/market-watch'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function subscribeMarketWatch(
  onMessage: (message: MarketWatchMessage) => void,
  onConnection: (connected: boolean) => void,
): () => void {
  const url = marketWatchSocketUrl()
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
        onMessage(JSON.parse(event.data) as MarketWatchMessage)
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
