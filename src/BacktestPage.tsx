import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { SessionUser } from './auth/session'
import {
  backBacktest,
  pauseBacktest,
  restartBacktest,
  resumeBacktest,
  setBacktestSpeed,
  subscribeBacktest,
  type BacktestCandle,
  type BacktestSymbol,
} from './backtestSocket'
import { Topbar } from './Topbar'
import { formatUtcTick, formatUtcTime } from './utcChartTime'
import './App.css'
import './BacktestPage.css'

function toBar(candle: BacktestCandle) {
  return {
    time: candle.openTime as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

export function BacktestPage({ user = null }: { user?: SessionUser | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const selectedRef = useRef('')
  const [connected, setConnected] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [paused, setPaused] = useState(true)
  const [candlesPerSecond, setCandlesPerSecond] = useState(4)
  const [timeframe, setTimeframe] = useState('15m')
  const [message, setMessage] = useState<string | null>(null)
  const [symbols, setSymbols] = useState<BacktestSymbol[]>([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState<string | null>(null)
  const speedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        fontFamily: "system-ui, 'Segoe UI', Roboto, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      rightPriceScale: { borderColor: '#2a2e39' },
      localization: {
        timeFormatter: formatUtcTime,
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 8,
        minBarSpacing: 4,
        rightOffset: 8,
        shiftVisibleRangeOnNewBar: false,
        tickMarkFormatter: formatUtcTick,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#758696' },
        horzLine: { color: '#758696' },
      },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })
    chartRef.current = chart
    seriesRef.current = series
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    restartBacktest().catch(() => undefined)
  }, [])

  useEffect(() => {
    return subscribeBacktest((update) => {
      if (update.type === 'snapshot') {
        setEnabled(update.backtest)
        setPaused(update.paused)
        setCandlesPerSecond(update.candlesPerSecond)
        setTimeframe(update.timeframe)
        setMessage(update.message)
        setSymbols(update.symbols.map((item) => ({ ...item, candles: [], index: -1 })))
        setSelected((current) => {
          if (update.symbols.some((item) => item.symbol === current)) {
            return current
          }
          return update.symbols[0]?.symbol ?? ''
        })
        return
      }

      if (update.type === 'status') {
        setPaused(update.paused)
        setCandlesPerSecond(update.candlesPerSecond)
        setTimeframe(update.timeframe)
        setMessage(update.message)
        return
      }

      if (update.type === 'window') {
        setSymbols((current) =>
          current.map((item) => {
            if (item.symbol !== update.symbol) {
              return item
            }
            const candles = item.candles.slice(0, -1)
            return { ...item, index: candles.length - 1, total: update.total, candles }
          }),
        )
        return
      }

      setSymbols((current) =>
        current.map((item) => {
          if (item.symbol !== update.symbol) {
            return item
          }
          const candles = item.candles.filter((candle) => candle.openTime !== update.candle.openTime)
          candles.push(update.candle)
          return {
            ...item,
            index: update.index,
            total: update.total,
            candles,
          }
        }),
      )
    }, setConnected)
  }, [])

  const active = symbols.find((item) => item.symbol === selected) ?? null
  const drawn = useRef({ symbol: '', count: 0, last: 0 })

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series || !chart) {
      return
    }

    const candles = active?.candles ?? []
    const symbol = active?.symbol ?? ''
    const last = candles.at(-1)?.openTime ?? 0
    const previous = drawn.current
    const appended =
      previous.symbol === symbol &&
      previous.count > 0 &&
      candles.length === previous.count + 1 &&
      candles[previous.count - 1]?.openTime === previous.last
    drawn.current = { symbol, count: candles.length, last }

    if (appended) {
      const candle = candles.at(-1)
      if (candle) {
        series.update(toBar(candle))
      }
      return
    }

    const range = previous.symbol === symbol ? chart.timeScale().getVisibleLogicalRange() : null
    series.setData(candles.map(toBar))
    chart.timeScale().applyOptions({ barSpacing: 8, rightOffset: 8 })
    if (range && candles.length > 0) {
      chart.timeScale().setVisibleLogicalRange(range)
    } else if (candles.length > 0) {
      chart.timeScale().setVisibleLogicalRange({ from: -1, to: 80 })
    }
  }, [active])

  const atStart = !active || active.index < 0

  const run = (action: () => Promise<void>) => {
    setError(null)
    action().catch((exception: unknown) => {
      setError(exception instanceof Error ? exception.message : 'Backtest request failed')
    })
  }

  const changeSpeed = (value: number) => {
    setCandlesPerSecond(value)
    clearTimeout(speedTimer.current)
    speedTimer.current = setTimeout(() => {
      run(() => setBacktestSpeed(value))
    }, 300)
  }

  return (
    <div className="app">
      <Topbar user={user} />
      <section className="backtest-page">
        <div className="backtest-bar">
          <div className="backtest-symbols">
            {symbols.map((item) => (
              <button
                key={item.symbol}
                type="button"
                className={item.symbol === selected ? 'active' : undefined}
                onClick={() => setSelected(item.symbol)}
              >
                {item.symbol}
              </button>
            ))}
          </div>
          <div className="backtest-controls">
            <label>
              candles / second
              <input
                type="number"
                min={1}
                max={50}
                step={1}
                value={candlesPerSecond}
                disabled={!enabled}
                onChange={(event) => changeSpeed(Number(event.target.value))}
              />
            </label>
            <button type="button" disabled={!enabled || paused} onClick={() => run(pauseBacktest)}>
              Pause
            </button>
            <button type="button" disabled={!enabled || atStart} onClick={() => run(backBacktest)}>
              Back
            </button>
            <button type="button" className={enabled && !paused ? 'active' : undefined} disabled={!enabled || !paused || message === 'Replay finished'} onClick={() => run(resumeBacktest)}>
              Resume
            </button>
          </div>
          <div className="backtest-meta">
            <span className={connected ? 'backtest-connection live' : 'backtest-connection'}>
              {connected ? 'Connected' : 'Disconnected'}
            </span>
            <span>
              {active ? `${active.symbol} · ${timeframe} · ${active.candles.length} / ${active.total}` : timeframe}
            </span>
          </div>
        </div>
        {!enabled && (
          <p className="backtest-note">Backtest is off. Set MarketWatch:Backtest to true and restart the API.</p>
        )}
        {enabled && message && <p className="backtest-note">{message}</p>}
        {error && <p className="backtest-note error">{error}</p>}
        <div className="backtest-chart" ref={containerRef} />
      </section>
    </div>
  )
}
