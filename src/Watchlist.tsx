import { useEffect, useMemo, useState } from 'react'
import type { Pair } from './data/config'
import {
  fetchPairTickers,
  formatChangePercent,
  formatLastPrice,
  type PairTicker,
  subscribeLiveTickers,
} from './tickers'
import './Watchlist.css'

export function Watchlist({
  pairs,
  selectedId,
  onSelect,
}: {
  pairs: Pair[]
  selectedId: string
  onSelect: (pair: Pair) => void
}) {
  const [query, setQuery] = useState('')
  const [tickers, setTickers] = useState<Map<string, PairTicker>>(new Map())
  const [priceMoves, setPriceMoves] = useState<Map<string, 'up' | 'down'>>(new Map())

  const visiblePairs = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return pairs
    }

    return pairs.filter(
      (pair) =>
        pair.symbol.toLowerCase().includes(normalized) ||
        pair.name.toLowerCase().includes(normalized) ||
        pair.baseAsset.toLowerCase().includes(normalized),
    )
  }, [pairs, query])

  useEffect(() => {
    const symbols = pairs.map((pair) => pair.symbol)
    let cancelled = false
    let live: ReturnType<typeof subscribeLiveTickers> | null = null

    const load = async (signal: AbortSignal) => {
      try {
        const next = await fetchPairTickers(symbols, signal)
        if (!cancelled) {
          setTickers(next)
          live = subscribeLiveTickers(symbols, (updates) => {
            if (cancelled) {
              return
            }

            setTickers((current) => {
              const merged = new Map(current)
              const moves = new Map<string, 'up' | 'down'>()

              for (const [symbol, ticker] of updates) {
                const previous = current.get(symbol)
                const nextTicker: PairTicker = {
                  ...ticker,
                  priceChangePercent: Number.isNaN(ticker.priceChangePercent)
                    ? previous?.priceChangePercent ?? 0
                    : ticker.priceChangePercent,
                }

                if (previous) {
                  if (nextTicker.lastPrice > previous.lastPrice) {
                    moves.set(symbol, 'up')
                  } else if (nextTicker.lastPrice < previous.lastPrice) {
                    moves.set(symbol, 'down')
                  }
                }
                merged.set(symbol, nextTicker)
              }

              if (moves.size > 0) {
                setPriceMoves((currentMoves) => {
                  const nextMoves = new Map(currentMoves)
                  for (const [symbol, direction] of moves) {
                    nextMoves.set(symbol, direction)
                  }
                  return nextMoves
                })
              }

              return merged
            })
          })
        }
      } catch (reason: unknown) {
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return
        }
      }
    }

    const controller = new AbortController()
    void load(controller.signal)

    return () => {
      cancelled = true
      controller.abort()
      live?.close()
    }
  }, [pairs])

  return (
    <div className="tv-watchlist">
      <div className="tv-watchlist__toolbar">
        <span className="tv-watchlist__title">Watchlist</span>
      </div>
      <label className="tv-watchlist__search">
        <span className="tv-watchlist__search-icon" aria-hidden="true">
          <svg viewBox="0 0 18 18" width="14" height="14">
            <circle cx="7.5" cy="7.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11.3 11.3 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search watchlist"
        />
      </label>
      <div className="tv-watchlist__columns" aria-hidden="true">
        <span>Symbol</span>
        <span>Last</span>
        <span>Chg%</span>
      </div>
      <div className="tv-watchlist__rows" role="listbox" aria-label="Watchlist">
        {visiblePairs.length === 0 ? (
          <p className="tv-watchlist__empty">No symbols match</p>
        ) : (
          visiblePairs.map((pair) => {
            const ticker = tickers.get(pair.symbol)
            const priceMove = priceMoves.get(pair.symbol)
            const change = ticker?.priceChangePercent
            const changeClass =
              priceMove === 'up'
                ? 'is-up'
                : priceMove === 'down'
                  ? 'is-down'
                  : change === undefined || change === 0
                    ? ''
                    : change > 0
                  ? 'is-up'
                  : 'is-down'
            const selected = pair.id === selectedId

            return (
              <button
                key={pair.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? `tv-watchlist__row is-selected ${changeClass}`.trim()
                    : `tv-watchlist__row ${changeClass}`.trim()
                }
                onClick={() => onSelect(pair)}
              >
                <span className="tv-watchlist__symbol">
                  <span className="tv-watchlist__ticker">{pair.symbol}</span>
                  <span className="tv-watchlist__name">{pair.name}</span>
                </span>
                <span className={`tv-watchlist__last ${changeClass}`}>
                  {ticker ? formatLastPrice(ticker.lastPrice) : '—'}
                </span>
                <span className={`tv-watchlist__change ${changeClass}`}>
                  {ticker ? formatChangePercent(ticker.priceChangePercent) : '—'}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
