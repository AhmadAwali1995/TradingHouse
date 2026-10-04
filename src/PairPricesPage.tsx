import { useEffect, useState } from 'react'
import type { SessionUser } from './auth/session'
import {
  subscribeMarketWatch,
  type MarketWatchPair,
} from './marketWatchSocket'
import { Topbar } from './Topbar'
import './App.css'
import './MarketWatchPage.css'

type PriceRow = {
  key: string
  price: number
  open: number | null
  closed: boolean | null
  updatedAt: string | null
  orderOpened: boolean
}

const TAPE_LIMIT = 200

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

function rowFrom(pair: MarketWatchPair): PriceRow | null {
  if (pair.price === null) {
    return null
  }

  return {
    key: `${pair.updatedAt ?? ''}-${pair.price}-${pair.orderOpened ? 'order' : 'price'}`,
    price: pair.price,
    open: pair.open,
    closed: pair.closed,
    updatedAt: pair.updatedAt,
    orderOpened: pair.orderOpened === true,
  }
}

export function PairPricesPage({ user, symbol }: { user: SessionUser; symbol: string }) {
  const [connected, setConnected] = useState(false)
  const [pair, setPair] = useState<MarketWatchPair | null>(null)
  const [rows, setRows] = useState<PriceRow[]>([])

  useEffect(() => {
    return subscribeMarketWatch((update) => {
      if (update.type === 'snapshot') {
        const next = update.pairs.find((item) => item.symbol === symbol) ?? null
        setPair(next)
        const row = next ? rowFrom(next) : null
        if (row) {
          setRows((current) => (current.length > 0 ? current : [row]))
        }
        return
      }

      if (update.type !== 'tick' || update.pair.symbol !== symbol) {
        return
      }

      setPair(update.pair)
      const row = rowFrom(update.pair)
      if (!row) {
        return
      }

      setRows((current) => {
        const top = current[0]
        if (top && top.price === row.price && top.orderOpened === row.orderOpened && top.closed === row.closed) {
          return current
        }

        return [row, ...current].slice(0, TAPE_LIMIT)
      })
    }, setConnected)
  }, [symbol])

  const latestDirection = pair?.price != null && pair.open != null && pair.price < pair.open ? 'down' : 'up'

  return (
    <div className="app">
      <Topbar user={user} />
      <main className="watch-page">
        <div className="watch-heading">
          <div>
            <a className="watch-back" href="/watch">All pairs</a>
            <h1>{symbol}</h1>
            <p className={pair?.price == null ? undefined : latestDirection}>{formatPrice(pair?.price ?? null)}</p>
          </div>
          <span className={connected ? 'watch-connection live' : 'watch-connection'}>
            {connected ? 'Socket connected' : 'Reconnecting'}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="watch-empty">{pair ? 'Waiting for the next price.' : 'This pair is not being watched.'}</p>
        ) : (
          <table className="watch-table">
            <thead>
              <tr>
                <th>Price</th>
                <th>Candle</th>
                <th>Order</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const direction = row.open != null && row.price < row.open ? 'down' : 'up'
                return (
                <tr key={row.key}>
                  <td className={direction}>{formatPrice(row.price)}</td>
                  <td>{row.closed === null ? '—' : row.closed ? 'Closed' : 'Forming'}</td>
                  <td>{row.orderOpened ? <span className="watch-flag">Order opened</span> : '—'}</td>
                  <td>{formatTime(row.updatedAt)}</td>
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
