import { useEffect, useState } from 'react'
import type { SessionUser } from './auth/session'
import {
  subscribeMarketWatch,
  type MarketWatchPair,
} from './marketWatchSocket'
import { Topbar } from './Topbar'
import './App.css'
import './MarketWatchPage.css'

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }

  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  const time = new Date(value)
  if (Number.isNaN(time.getTime())) {
    return '—'
  }

  return time.toLocaleTimeString()
}

function stateLabel(state: string): string {
  if (state === 'live') return 'Live'
  if (state === 'starting') return 'Starting'
  if (state === 'failed') return 'Failed'
  if (state === 'skipped') return 'Skipped'
  return state
}

export function MarketWatchPage({ user }: { user: SessionUser }) {
  const [connected, setConnected] = useState(false)
  const [candleInterval, setCandleInterval] = useState('15m')
  const [message, setMessage] = useState<string | null>(null)
  const [pairs, setPairs] = useState<MarketWatchPair[]>([])

  useEffect(() => {
    return subscribeMarketWatch((update) => {
      if (update.type === 'snapshot') {
        setCandleInterval(update.interval)
        setMessage(update.message)
        setPairs(update.pairs)
        return
      }

      if (update.type === 'status') {
        setCandleInterval(update.interval)
        setMessage(update.message)
        return
      }

      if (update.type === 'remove') {
        setPairs((current) => current.filter((pair) => pair.symbol !== update.symbol))
        return
      }

      setPairs((current) => {
        const next = current.filter((pair) => pair.symbol !== update.pair.symbol)
        next.push(update.pair)
        next.sort((left, right) => left.symbol.localeCompare(right.symbol))
        return next
      })
    }, setConnected)
  }, [])

  return (
    <div className="app">
      <Topbar user={user} />
      <main className="watch-page">
        <div className="watch-heading">
          <div>
            <h1>Market watch</h1>
            <p>{message ?? `Watching ${candleInterval} candles`}</p>
          </div>
          <span className={connected ? 'watch-connection live' : 'watch-connection'}>
            {connected ? 'Socket connected' : 'Reconnecting'}
          </span>
        </div>
        {pairs.length === 0 ? (
          <p className="watch-empty">{message ?? 'Waiting for the market watch.'}</p>
        ) : (
          <table className="watch-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Price</th>
                <th>Open</th>
                <th>High</th>
                <th>Low</th>
                <th>Candle</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((pair) => {
                const direction = pair.price !== null && pair.open !== null && pair.price < pair.open ? 'down' : 'up'
                const href = `/watch/${encodeURIComponent(pair.symbol)}`
                return (
                  <tr
                    key={pair.symbol}
                    className="watch-row"
                    onClick={() => {
                      window.location.assign(href)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') window.location.assign(href)
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <a href={href}>{pair.symbol}</a>
                      {pair.detail ? <span className="watch-detail">{pair.detail}</span> : null}
                    </td>
                    <td className={pair.price === null ? undefined : direction}>{formatPrice(pair.price)}</td>
                    <td>{formatPrice(pair.open)}</td>
                    <td>{formatPrice(pair.high)}</td>
                    <td>{formatPrice(pair.low)}</td>
                    <td>{pair.closed === null ? '—' : pair.closed ? 'Closed' : 'Forming'}</td>
                    <td className={`watch-state ${pair.state}`}>{stateLabel(pair.state)}</td>
                    <td>{formatTime(pair.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  )
}
