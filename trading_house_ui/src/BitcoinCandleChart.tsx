import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  TIMEFRAMES,
  fetchBitcoinCandles,
  type TimeframeId,
} from './bitcoinCandles'
import { RSI_LENGTH, calculateTradingViewRsi } from './rsi'
import './BitcoinCandleChart.css'

export function BitcoinCandleChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const [timeframe, setTimeframe] = useState<TimeframeId>('1h')
  const [chartReady, setChartReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: 2,
      },
      crosshair: {
        vertLine: { color: '#758696' },
        horzLine: { color: '#758696' },
      },
    })

    chartRef.current = chart
    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    const rsiSeries = chart.addSeries(
      LineSeries,
      {
        color: '#7E57C2',
        lineWidth: 1,
        title: `RSI ${RSI_LENGTH}`,
        priceLineVisible: false,
        lastValueVisible: true,
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100,
          },
        }),
      },
      1,
    )

    rsiSeries.createPriceLine({
      price: 70,
      color: '#787B86',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '',
    })
    rsiSeries.createPriceLine({
      price: 30,
      color: '#787B86',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: '',
    })

    rsiSeriesRef.current = rsiSeries
    chart.panes()[0]?.setStretchFactor(3)
    chart.panes()[1]?.setStretchFactor(1)
    setChartReady(true)

    return () => {
      setChartReady(false)
      seriesRef.current = null
      rsiSeriesRef.current = null
      chartRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const rsiSeries = rsiSeriesRef.current
    if (!series || !rsiSeries) {
      return
    }

    const controller = new AbortController()
    setError(null)

    void fetchBitcoinCandles(timeframe, controller.signal)
      .then((candles) => {
        if (
          controller.signal.aborted ||
          seriesRef.current !== series ||
          rsiSeriesRef.current !== rsiSeries
        ) {
          return
        }
        series.setData(
          candles.map((candle) => ({
            time: candle.time as UTCTimestamp,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          })),
        )
        rsiSeries.setData(
          calculateTradingViewRsi(candles).map((point) => ({
            time: point.time as UTCTimestamp,
            value: point.value,
          })),
        )
        chartRef.current?.timeScale().fitContent()
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return
        }
        const message =
          reason instanceof Error ? reason.message : 'Failed to load Bitcoin candles'
        setError(message)
      })

    return () => {
      controller.abort()
    }
  }, [timeframe, chartReady])

  return (
    <div className="bitcoin-chart">
      <div className="bitcoin-chart__header">
        <span className="bitcoin-chart__title">BTCUSDT · Japanese candles</span>
        <div className="bitcoin-chart__timeframes" role="tablist" aria-label="Timeframes">
          {TIMEFRAMES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={timeframe === item.id}
              className={
                timeframe === item.id
                  ? 'bitcoin-chart__timeframe is-active'
                  : 'bitcoin-chart__timeframe'
              }
              onClick={() => setTimeframe(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="bitcoin-chart__error">{error}</p> : null}
      <div className="bitcoin-chart__canvas" ref={containerRef} />
    </div>
  )
}
