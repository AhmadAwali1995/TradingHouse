import type { TimeframeId } from './candles'
import { useEffect, useMemo, useState } from 'react'
import type { Pair } from './data/config'
import {
  INDICATOR_ITEMS,
  type IndicatorId,
  type IndicatorVisibility,
} from './indicatorCatalog'
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
  timeframe,
  selectedId,
  indicatorVisibility,
  settingsOpen,
  onSelect,
  onToggleIndicator,
  onOpenIndicatorSettings,
}: {
  pairs: Pair[]
  timeframe: TimeframeId
  selectedId: string
  indicatorVisibility: IndicatorVisibility
  settingsOpen: IndicatorId | null
  onSelect: (pair: Pair) => void
  onToggleIndicator: (indicator: IndicatorId) => void
  onOpenIndicatorSettings: (indicator: IndicatorId) => void
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
    let cancelled = false
    let live: ReturnType<typeof subscribeLiveTickers> | null = null

    const load = async (signal: AbortSignal) => {
      try {
        const next = await fetchPairTickers(pairs, timeframe, signal)
        if (!cancelled) {
          setTickers(next)
          live = subscribeLiveTickers(pairs, (updates) => {
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
                  openPrice: Number.isNaN(ticker.openPrice)
                    ? previous?.openPrice ?? ticker.lastPrice
                    : ticker.openPrice,
                  priceChangePercent: Number.isNaN(ticker.priceChangePercent)
                    ? previous
                      ? ((ticker.lastPrice - previous.openPrice) / previous.openPrice) * 100
                      : 0
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
  }, [pairs, timeframe])

  return (
    <div className="tv-watchlist">
      <div className="tv-watchlist__toolbar">
        <span className="tv-watchlist__title">Watchlist</span>
      </div>
      <div className="tv-watchlist__section">
        <div className="tv-watchlist__section-header">
          <span className="tv-watchlist__section-title">Pairs</span>
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
        <div className="tv-watchlist__rows" role="listbox" aria-label="Pairs">
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
      <div className="tv-watchlist__section tv-watchlist__section--indicators">
        <div className="tv-watchlist__section-header">
          <span className="tv-watchlist__section-title">Indicators</span>
        </div>
        <div className="tv-watchlist__indicator-list" role="list" aria-label="Indicators">
          {INDICATOR_ITEMS.map((indicator) => {
            const visible = indicatorVisibility[indicator.id]

            return (
              <div key={indicator.id} className="tv-watchlist__indicator-row" role="listitem">
                <span className="tv-watchlist__indicator-name">{indicator.label}</span>
                <div className="tv-watchlist__indicator-actions">
                  <button
                    type="button"
                    className={
                      settingsOpen === indicator.id
                        ? 'tv-watchlist__indicator-toggle is-active'
                        : 'tv-watchlist__indicator-toggle'
                    }
                    aria-label={`Edit ${indicator.label} settings`}
                    title={`${indicator.label} settings`}
                    aria-pressed={settingsOpen === indicator.id}
                    onClick={() => onOpenIndicatorSettings(indicator.id)}
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                      <path
                        d="M8.2 2.6h3.6l.4 1.7c.4.1.8.3 1.1.6l1.6-.7 1.8 1.8-.7 1.6c.3.3.5.7.6 1.1l1.7.4v3.6l-1.7.4c-.1.4-.3.8-.6 1.1l.7 1.6-1.8 1.8-1.6-.7c-.3.3-.7.5-1.1.6l-.4 1.7H8.2l-.4-1.7c-.4-.1-.8-.3-1.1-.6l-1.6.7-1.8-1.8.7-1.6c-.3-.3-.5-.7-.6-1.1L1.7 11.8V8.2l1.7-.4c.1-.4.3-.8.6-1.1l-.7-1.6 1.8-1.8 1.6.7c.3-.3.7-.5 1.1-.6l.4-1.7Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinejoin="round"
                      />
                      <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="tv-watchlist__indicator-toggle"
                    aria-label={`${visible ? 'Hide' : 'Show'} ${indicator.label}`}
                    aria-pressed={visible}
                    onClick={() => onToggleIndicator(indicator.id)}
                  >
                    {visible ? (
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                        <path
                          d="M10 4c4.2 0 7.5 3.1 8.8 5.8.2.4.2.9 0 1.3C17.5 13.9 14.2 17 10 17S2.5 13.9 1.2 11.1a1.5 1.5 0 0 1 0-1.3C2.5 7.1 5.8 4 10 4Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <circle cx="10" cy="10.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                        <path
                          d="M3.2 3.2 16.8 16.8"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                        <path
                          d="M6.1 6.1A9.3 9.3 0 0 1 10 5c4.2 0 7.5 3.1 8.8 5.8.2.4.2.9 0 1.3a10.5 10.5 0 0 1-3.2 3.7M8.1 15.2A9.5 9.5 0 0 1 10 16c-4.2 0-7.5-3.1-8.8-5.8a1.5 1.5 0 0 1 0-1.3A10.3 10.3 0 0 1 4 5.9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
