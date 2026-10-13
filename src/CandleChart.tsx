import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  TIMEFRAMES,
  applyLiveCandle,
  fetchCandles,
  type Candle,
  type CandleRange,
  type TimeframeId,
} from './candles'
import type { Pair } from './data/config'
import { fetchTestCandles, isTestTimeframe, type DataMode } from './testCandles'
import {
  DC_COLORS,
  DEFAULT_DC_SETTINGS,
  DEFAULT_MA_RIBBON_SETTINGS,
  DonchianFillPrimitive,
  MA_SOURCE_LABELS,
  MA_SOURCES,
  MA_TYPES,
  calculateDonchian,
  calculateMa,
  normalizeDcSettings,
  normalizeMaRibbonSettings,
  type DcSettings,
  type MaLineSettings,
  type MaRibbonSettings,
} from './indicators'
import type { IndicatorId, IndicatorVisibility } from './indicatorCatalog'
import { subscribeLiveCandles } from './klineSocket'
import { DrawingPrimitive } from './drawings/DrawingPrimitive'
import { DrawingToolbar } from './drawings/DrawingToolbar'
import { DrawingStyleBar } from './drawings/DrawingStyleBar'
import { FibSettingsPanel } from './drawings/FibSettingsPanel'
import { useChartDrawings } from './drawings/useChartDrawings'
import { BacktestModal } from './BacktestModal'
import { LastPriceCountdownPrimitive } from './lastPriceCountdown'
import { buildSmaDcOrders, type SmaDcRatio } from './strategies/smaDc'
import { formatLastPrice } from './tickers'
import './CandleChart.css'

const UTC_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function utcDate(time: Time): Date | null {
  if (typeof time === 'number') {
    return new Date(time * 1000)
  }
  if (typeof time === 'string') {
    return new Date(`${time}T00:00:00Z`)
  }
  return new Date(Date.UTC(time.year, time.month - 1, time.day))
}

function padTime(value: number): string {
  return String(value).padStart(2, '0')
}

function formatUtcTick(time: Time, tickMarkType: TickMarkType): string {
  const date = utcDate(time)
  if (!date) {
    return ''
  }
  if (tickMarkType === TickMarkType.Year) {
    return String(date.getUTCFullYear())
  }
  if (tickMarkType === TickMarkType.Month) {
    return UTC_MONTHS[date.getUTCMonth()] ?? ''
  }
  if (tickMarkType === TickMarkType.DayOfMonth) {
    return String(date.getUTCDate())
  }
  const hours = padTime(date.getUTCHours())
  const minutes = padTime(date.getUTCMinutes())
  if (tickMarkType === TickMarkType.TimeWithSeconds) {
    return `${hours}:${minutes}:${padTime(date.getUTCSeconds())}`
  }
  return `${hours}:${minutes}`
}

function formatUtcCrosshair(time: Time): string {
  const date = utcDate(time)
  if (!date) {
    return ''
  }
  const day = date.getUTCDate()
  const month = UTC_MONTHS[date.getUTCMonth()] ?? ''
  const year = String(date.getUTCFullYear()).slice(2)
  return `${day} ${month} '${year}  ${padTime(date.getUTCHours())}:${padTime(date.getUTCMinutes())} UTC`
}

type LogicalRange = {
  from: number
  to: number
}

function MaLineFields({
  label,
  line,
  onChange,
}: {
  label: string
  line: MaLineSettings
  onChange: (line: MaLineSettings) => void
}) {
  return (
    <div className="candle-chart__ma-row">
      <label>
        <input
          type="checkbox"
          checked={line.show}
          onChange={(event) => onChange({ ...line, show: event.target.checked })}
        />
        <span>{label}</span>
      </label>
      <select
        aria-label={`${label} type`}
        value={line.type}
        disabled={!line.show}
        onChange={(event) => onChange({ ...line, type: event.target.value as MaLineSettings['type'] })}
      >
        {MA_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} source`}
        value={line.source}
        disabled={!line.show}
        onChange={(event) => onChange({ ...line, source: event.target.value as MaLineSettings['source'] })}
      >
        {MA_SOURCES.map((source) => (
          <option key={source} value={source}>
            {MA_SOURCE_LABELS[source]}
          </option>
        ))}
      </select>
      <input
        aria-label={`${label} length`}
        type="number"
        min={1}
        disabled={!line.show}
        value={line.length}
        onChange={(event) => onChange({ ...line, length: Number(event.target.value) })}
      />
      <input
        aria-label={`${label} color`}
        type="color"
        disabled={!line.show}
        value={line.color}
        onChange={(event) => onChange({ ...line, color: event.target.value })}
      />
    </div>
  )
}

function paintMaRibbon(
  series: { ma1: ISeriesApi<'Line'>; ma2: ISeriesApi<'Line'> },
  candles: Candle[],
  settings: MaRibbonSettings,
) {
  const paintLine = (line: ISeriesApi<'Line'>, lineSettings: MaLineSettings) => {
    if (!lineSettings.show) {
      line.setData([])
      return
    }
    line.setData(
      calculateMa(candles, lineSettings).map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    )
  }
  paintLine(series.ma1, settings.ma1)
  paintLine(series.ma2, settings.ma2)
}

function paintDonchianOverlay(
  series: {
    upper: ISeriesApi<'Line'>
    lower: ISeriesApi<'Line'>
    basis: ISeriesApi<'Line'>
    fill: DonchianFillPrimitive
  },
  candles: Candle[],
  settings: DcSettings,
) {
  const points = calculateDonchian(candles, settings)
  const toLine = (pick: (point: (typeof points)[number]) => number) =>
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: pick(point),
    }))

  series.upper.setData(toLine((point) => point.upper))
  series.lower.setData(toLine((point) => point.lower))
  series.basis.setData(toLine((point) => point.basis))
  series.fill.setBands(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      upper: point.upper,
      lower: point.lower,
    })),
  )
}

function centerLastCandle(chart: IChartApi, candleCount: number, onCentered?: (range: LogicalRange) => void) {
  if (candleCount <= 0) {
    return
  }

  const timeScale = chart.timeScale()
  const lastIndex = candleCount - 1

  const applyCenter = () => {
    const range = timeScale.getVisibleLogicalRange()
    if (!range) {
      return
    }

    const width = range.to - range.from
    const halfWidth = width / 2
    const centered = {
      from: lastIndex - halfWidth,
      to: lastIndex + halfWidth,
    }
    timeScale.setVisibleLogicalRange(centered)
    onCentered?.(centered)
  }

  requestAnimationFrame(() => {
    applyCenter()
    requestAnimationFrame(applyCenter)
  })
}

function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`
  }
  return formatLastPrice(value)
}

function dateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000)
}

function endOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000)
}

function ChartRangePicker({
  candles,
  range,
  onApply,
  onReset,
  onClose,
}: {
  candles: Candle[]
  range: CandleRange | null
  onApply: (range: CandleRange) => void
  onReset: () => void
  onClose: () => void
}) {
  const first = candles[0]?.time
  const last = candles.at(-1)?.time
  const [from, setFrom] = useState(range ? dateInputValue(new Date(range.from * 1000)) : first ? dateInputValue(new Date(first * 1000)) : '')
  const [to, setTo] = useState(range ? dateInputValue(new Date(range.to * 1000)) : last ? dateInputValue(new Date(last * 1000)) : '')
  const maxDate = dateInputValue(new Date())

  return (
    <form
      className="candle-chart__range-popover"
      onSubmit={(event) => {
        event.preventDefault()
        if (!from || !to) {
          return
        }
        const start = startOfDay(from)
        const end = endOfDay(to)
        if (end < start) {
          return
        }
        onApply({ from: start, to: end })
      }}
    >
      <label>
        <span>From</span>
        <input type="date" max={maxDate} value={from} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <label>
        <span>To</span>
        <input type="date" max={maxDate} value={to} onChange={(event) => setTo(event.target.value)} />
      </label>
      <div className="candle-chart__range-actions">
        <button type="button" onClick={onReset}>
          Default
        </button>
        <button type="submit">Load</button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </form>
  )
}

function candleChange(candle: Candle, candles: Candle[]) {
  const index = candles.findIndex((item) => item.time === candle.time)
  const previous = index > 0 ? candles[index - 1] : null
  const base = previous?.close ?? candle.open
  const delta = candle.close - base
  const percent = base === 0 ? 0 : (delta / base) * 100
  return { delta, percent, up: candle.close >= candle.open }
}

export function CandleChart({
  pair,
  timeframe,
  indicatorVisibility,
  dataMode,
  settingsOpen,
  settingsTick,
  smaDcEnabled,
  smaDcRatio,
  backtestOpen,
  onSmaDcRatioChange,
  onBacktestClose,
  onTimeframeChange,
  onSettingsOpenChange,
}: {
  pair: Pair
  timeframe: TimeframeId
  indicatorVisibility: IndicatorVisibility
  dataMode: DataMode
  settingsOpen: IndicatorId | null
  settingsTick: number
  smaDcEnabled: boolean
  smaDcRatio: SmaDcRatio
  backtestOpen: boolean
  onSmaDcRatioChange: (ratio: SmaDcRatio) => void
  onBacktestClose: () => void
  onTimeframeChange: (timeframe: TimeframeId) => void
  onSettingsOpenChange: (indicator: IndicatorId | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const ma1Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const ma2Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const dcUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const dcLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const dcBasisRef = useRef<ISeriesApi<'Line'> | null>(null)
  const dcFillRef = useRef<DonchianFillPrimitive | null>(null)
  const drawingPrimitiveRef = useRef<DrawingPrimitive | null>(null)
  const candlesRef = useRef<Candle[]>([])
  const countdownRef = useRef<LastPriceCountdownPrimitive | null>(null)
  const initialRangeRef = useRef<LogicalRange | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadedCandles, setLoadedCandles] = useState<Candle[]>([])
  const [chartRange, setChartRange] = useState<CandleRange | null>(null)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null)
  const [maRibbonSettings, setMaRibbonSettings] = useState<MaRibbonSettings>(DEFAULT_MA_RIBBON_SETTINGS)
  const [draftMaRibbonSettings, setDraftMaRibbonSettings] = useState<MaRibbonSettings>(DEFAULT_MA_RIBBON_SETTINGS)
  const [dcSettings, setDcSettings] = useState<DcSettings>(DEFAULT_DC_SETTINGS)
  const [draftDcSettings, setDraftDcSettings] = useState<DcSettings>(DEFAULT_DC_SETTINGS)
  const indicatorVisibilityRef = useRef(indicatorVisibility)
  const maRibbonSettingsRef = useRef(maRibbonSettings)
  const dcSettingsRef = useRef(dcSettings)
  indicatorVisibilityRef.current = indicatorVisibility
  maRibbonSettingsRef.current = maRibbonSettings
  dcSettingsRef.current = dcSettings

  const smaDcOrders = useMemo(
    () => (smaDcEnabled ? buildSmaDcOrders(loadedCandles, maRibbonSettings, smaDcRatio) : []),
    [smaDcEnabled, loadedCandles, maRibbonSettings, smaDcRatio],
  )

  const {
    tool: drawingTool,
    setTool: setDrawingTool,
    setSelectedId,
    selected,
    selectedFib,
    stylePosition,
    updateSelectedFib,
    updateSelectedStyle,
    deleteSelected,
    clearDrawings,
  } = useChartDrawings({
    chartReady,
    pairId: pair.id,
    chartRef,
    seriesRef,
    candlesRef,
    primitiveRef: drawingPrimitiveRef,
    strategyDrawings: smaDcOrders,
  })

  const shiftRange = (direction: -1 | 1) => {
    const chart = chartRef.current
    const range = chart?.timeScale().getVisibleLogicalRange()
    if (!chart || !range) {
      return
    }

    const width = range.to - range.from
    const step = Math.max(width * 0.2, 1)
    chart.timeScale().setVisibleLogicalRange({
      from: range.from + direction * step,
      to: range.to + direction * step,
    })
  }

  const zoomRange = (factor: number) => {
    const chart = chartRef.current
    const range = chart?.timeScale().getVisibleLogicalRange()
    if (!chart || !range) {
      return
    }

    const center = (range.from + range.to) / 2
    const nextWidth = Math.max((range.to - range.from) * factor, 10)
    const halfWidth = nextWidth / 2
    chart.timeScale().setVisibleLogicalRange({
      from: center - halfWidth,
      to: center + halfWidth,
    })
  }

  const resetView = () => {
    const chart = chartRef.current
    const initialRange = initialRangeRef.current
    const series = seriesRef.current
    if (!chart || !initialRange || !series) {
      return
    }

    chart.timeScale().setVisibleLogicalRange(initialRange)
    requestAnimationFrame(() => {
      series.priceScale().applyOptions({ autoScale: true })
    })
  }

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
      rightPriceScale: {
        borderColor: '#2a2e39',
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: 2,
        tickMarkFormatter: formatUtcTick,
      },
      localization: {
        timeFormatter: formatUtcCrosshair,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#758696' },
        horzLine: { color: '#758696' },
      },
    })

    chartRef.current = chart

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      lastValueVisible: false,
      priceLineVisible: true,
      priceLineStyle: LineStyle.Dotted,
    })
    const countdown = new LastPriceCountdownPrimitive(timeframe)
    series.attachPrimitive(countdown)
    const dcFill = new DonchianFillPrimitive()
    series.attachPrimitive(dcFill)
    const drawings = new DrawingPrimitive()
    series.attachPrimitive(drawings)
    seriesRef.current = series
    countdownRef.current = countdown
    dcFillRef.current = dcFill
    drawingPrimitiveRef.current = drawings

    const maLineOptions = {
      lineWidth: 2 as const,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: true,
      visible: false,
    }
    const ma1 = chart.addSeries(LineSeries, {
      ...maLineOptions,
      color: DEFAULT_MA_RIBBON_SETTINGS.ma1.color,
      title: `MA ${DEFAULT_MA_RIBBON_SETTINGS.ma1.length}`,
    })
    const ma2 = chart.addSeries(LineSeries, {
      ...maLineOptions,
      color: DEFAULT_MA_RIBBON_SETTINGS.ma2.color,
      title: `MA ${DEFAULT_MA_RIBBON_SETTINGS.ma2.length}`,
    })
    ma1Ref.current = ma1
    ma2Ref.current = ma2

    const dcLineOptions = {
      lineWidth: 1 as const,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    }
    const dcUpper = chart.addSeries(LineSeries, {
      ...dcLineOptions,
      color: DC_COLORS.upper,
    })
    const dcLower = chart.addSeries(LineSeries, {
      ...dcLineOptions,
      color: DC_COLORS.lower,
    })
    const dcBasis = chart.addSeries(LineSeries, {
      ...dcLineOptions,
      color: DC_COLORS.basis,
      lastValueVisible: true,
      title: `DC ${DEFAULT_DC_SETTINGS.length}`,
    })
    dcUpperRef.current = dcUpper
    dcLowerRef.current = dcLower
    dcBasisRef.current = dcBasis
    setChartReady(true)

    return () => {
      setChartReady(false)
      seriesRef.current = null
      ma1Ref.current = null
      ma2Ref.current = null
      dcUpperRef.current = null
      dcLowerRef.current = null
      dcBasisRef.current = null
      dcFillRef.current = null
      drawingPrimitiveRef.current = null
      countdownRef.current = null
      chartRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chartReady || !chart || !series) {
      return
    }

    const onCrosshairMove = (param: MouseEventParams) => {
      const last = candlesRef.current.at(-1) ?? null
      if (!param.point) {
        setHoverCandle(last)
        return
      }

      const data = param.seriesData.get(series)
      if (
        data &&
        typeof data === 'object' &&
        'open' in data &&
        'high' in data &&
        'low' in data &&
        'close' in data
      ) {
        const bar = data as { time: number; open: number; high: number; low: number; close: number }
        const match = candlesRef.current.find((candle) => candle.time === bar.time)
        setHoverCandle(
          match ?? {
            time: bar.time,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          },
        )
        return
      }

      if (typeof param.time === 'number') {
        const match = candlesRef.current.find((candle) => candle.time === param.time)
        setHoverCandle(match ?? last)
        return
      }

      setHoverCandle(last)
    }

    chart.subscribeCrosshairMove(onCrosshairMove)
    return () => {
      chart.unsubscribeCrosshairMove(onCrosshairMove)
    }
  }, [chartReady])

  useEffect(() => {
    const series = seriesRef.current
    const ma1 = ma1Ref.current
    const ma2 = ma2Ref.current
    const dcUpper = dcUpperRef.current
    const dcLower = dcLowerRef.current
    const dcBasis = dcBasisRef.current
    const dcFill = dcFillRef.current
    if (
      !series ||
      !ma1 ||
      !ma2 ||
      !dcUpper ||
      !dcLower ||
      !dcBasis ||
      !dcFill
    ) {
      return
    }

    const controller = new AbortController()
    let closed = false
    let live: ReturnType<typeof subscribeLiveCandles> | null = null
    initialRangeRef.current = null
    setError(null)
    setLoading(true)

    const paintRibbon = (candles: Candle[]) => {
      if (!indicatorVisibilityRef.current.maRibbon) {
        ma1.setData([])
        ma2.setData([])
        return
      }
      paintMaRibbon({ ma1, ma2 }, candles, maRibbonSettingsRef.current)
    }

    const paintDc = (candles: Candle[]) => {
      if (!indicatorVisibilityRef.current.dc) {
        dcUpper.setData([])
        dcLower.setData([])
        dcBasis.setData([])
        dcFill.setBands([])
        return
      }
      paintDonchianOverlay(
        { upper: dcUpper, lower: dcLower, basis: dcBasis, fill: dcFill },
        candles,
        dcSettingsRef.current,
      )
    }

    const paintHistory = (candles: Candle[]) => {
      series.setData(
        candles.map((candle) => ({
          time: candle.time as UTCTimestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
        })),
      )
      paintRibbon(candles)
      paintDc(candles)
    }

    const paintLive = (candles: Candle[], candle: Candle) => {
      series.update({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })
      paintRibbon(candles)
      paintDc(candles)
      const last = candles.at(-1) ?? null
      setHoverCandle((current) => {
        if (!current || !last || current.time === last.time) {
          return last
        }
        return current
      })
    }

    if (pair.market !== 'crypto') {
      paintHistory([])
      candlesRef.current = []
      setLoadedCandles([])
      setHoverCandle(null)
      setLoading(false)
      setError('Forex prices are not connected yet.')
      return () => {
        closed = true
        controller.abort()
      }
    }

    void (dataMode === 'test'
      ? fetchTestCandles(pair.symbol, timeframe, controller.signal, chartRange ?? undefined)
      : fetchCandles(pair, timeframe, controller.signal, chartRange ?? undefined))
      .then((history) => {
        if (closed || controller.signal.aborted || seriesRef.current !== series) {
          return
        }

        const candles = [...history]
        candlesRef.current = candles
        setLoadedCandles(candles)
        paintHistory(candles)
        setHoverCandle(candles.at(-1) ?? null)
        setLoading(false)
        chartRef.current?.timeScale().fitContent()
        if (chartRef.current) {
          centerLastCandle(chartRef.current, candles.length, (range) => {
            initialRangeRef.current = range
          })
        }

        if (dataMode === 'test') {
          return
        }

        live = subscribeLiveCandles(
          pair,
          timeframe,
          (candle) => {
            if (controller.signal.aborted || seriesRef.current !== series) {
              return
            }
            if (chartRange && candle.time > chartRange.to) {
              return
            }
            if (applyLiveCandle(candles, candle)) {
              candlesRef.current = candles
              setLoadedCandles([...candles])
              paintLive(candles, candle)
            }
          },
          candles.at(-1),
        )

        if (closed) {
          live.close()
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        if (reason instanceof DOMException && reason.name === 'AbortError') {
          return
        }
        const message =
          reason instanceof Error ? reason.message : `Failed to load ${pair.name} candles`
        setError(message)
        setLoading(false)
      })

    return () => {
      closed = true
      controller.abort()
      live?.close()
      candlesRef.current = []
    }
  }, [pair, timeframe, chartReady, chartRange, dataMode])

  useEffect(() => {
    const ma1 = ma1Ref.current
    const ma2 = ma2Ref.current
    const candles = candlesRef.current
    if (!ma1 || !ma2) {
      return
    }

    const visible = indicatorVisibility.maRibbon
    const applyLine = (series: ISeriesApi<'Line'>, line: MaLineSettings) => {
      series.applyOptions({
        visible: visible && line.show,
        color: line.color,
        title: `MA ${line.length}`,
      })
    }
    applyLine(ma1, maRibbonSettings.ma1)
    applyLine(ma2, maRibbonSettings.ma2)

    if (!visible || candles.length === 0) {
      if (!visible) {
        ma1.setData([])
        ma2.setData([])
      }
      return
    }

    paintMaRibbon({ ma1, ma2 }, candles, maRibbonSettings)
  }, [maRibbonSettings, chartReady, indicatorVisibility])

  useEffect(() => {
    const upper = dcUpperRef.current
    const lower = dcLowerRef.current
    const basis = dcBasisRef.current
    const fill = dcFillRef.current
    const candles = candlesRef.current
    if (!upper || !lower || !basis || !fill) {
      return
    }

    const visible = indicatorVisibility.dc
    upper.applyOptions({ visible })
    lower.applyOptions({ visible })
    basis.applyOptions({ visible, title: `DC ${dcSettings.length}` })

    if (!visible || candles.length === 0) {
      if (!visible) {
        upper.setData([])
        lower.setData([])
        basis.setData([])
        fill.setBands([])
      }
      return
    }

    paintDonchianOverlay({ upper, lower, basis, fill }, candles, dcSettings)
  }, [dcSettings, chartReady, indicatorVisibility])

  useEffect(() => {
    countdownRef.current?.setTimeframe(timeframe)
  }, [timeframe, chartReady])

  useEffect(() => {
    if (settingsOpen === 'maRibbon') {
      setDraftMaRibbonSettings(maRibbonSettings)
    }
    if (settingsOpen === 'dc') {
      setDraftDcSettings(dcSettings)
    }
  }, [settingsOpen, settingsTick])

  const toggleSettings = (indicator: IndicatorId) => {
    onSettingsOpenChange(settingsOpen === indicator ? null : indicator)
  }

  const openMaRibbonSettings = () => {
    setDraftMaRibbonSettings(maRibbonSettings)
    toggleSettings('maRibbon')
  }

  const openDcSettings = () => {
    setDraftDcSettings(dcSettings)
    toggleSettings('dc')
  }

  const applySettings = () => {
    if (settingsOpen === 'maRibbon') {
      const next = normalizeMaRibbonSettings(draftMaRibbonSettings)
      setDraftMaRibbonSettings(next)
      setMaRibbonSettings(next)
    }
    if (settingsOpen === 'dc') {
      const next = normalizeDcSettings(draftDcSettings)
      setDraftDcSettings(next)
      setDcSettings(next)
    }
    onSettingsOpenChange(null)
  }

  const resetSettings = () => {
    if (settingsOpen === 'maRibbon') {
      setDraftMaRibbonSettings(DEFAULT_MA_RIBBON_SETTINGS)
    }
    if (settingsOpen === 'dc') {
      setDraftDcSettings(DEFAULT_DC_SETTINGS)
    }
  }

  const hoverStats = hoverCandle ? candleChange(hoverCandle, candlesRef.current) : null
  const hoverMa =
    hoverCandle && indicatorVisibility.maRibbon
      ? {
          ma1: maRibbonSettings.ma1.show
            ? calculateMa(candlesRef.current, maRibbonSettings.ma1).find((point) => point.time === hoverCandle.time)
            : null,
          ma2: maRibbonSettings.ma2.show
            ? calculateMa(candlesRef.current, maRibbonSettings.ma2).find((point) => point.time === hoverCandle.time)
            : null,
        }
      : null
  const hoverDc =
    hoverCandle && indicatorVisibility.dc
      ? calculateDonchian(candlesRef.current, dcSettings).find((point) => point.time === hoverCandle.time)
      : null

  return (
    <div className="candle-chart">
      <div className="candle-chart__header">
        <div className="candle-chart__legend">
          <span className="candle-chart__title">
            {pair.symbol} · {TIMEFRAMES.find((item) => item.id === timeframe)?.label ?? timeframe}
          </span>
          {hoverCandle && hoverStats ? (
            <span className={hoverStats.up ? 'candle-chart__ohlc is-up' : 'candle-chart__ohlc is-down'}>
              <span>
                O <strong>{formatLastPrice(hoverCandle.open)}</strong>
              </span>
              <span>
                H <strong>{formatLastPrice(hoverCandle.high)}</strong>
              </span>
              <span>
                L <strong>{formatLastPrice(hoverCandle.low)}</strong>
              </span>
              <span>
                C <strong>{formatLastPrice(hoverCandle.close)}</strong>
              </span>
              <span className="candle-chart__ohlc-change">
                {hoverStats.delta >= 0 ? '+' : ''}
                {formatLastPrice(hoverStats.delta)} ({hoverStats.percent >= 0 ? '+' : ''}
                {hoverStats.percent.toFixed(2)}%)
              </span>
              {hoverCandle.volume !== undefined ? (
                <span>
                  Vol <strong>{formatVolume(hoverCandle.volume)}</strong>
                </span>
              ) : null}
            </span>
          ) : null}
          {hoverMa?.ma1 ? (
            <span className="candle-chart__legend-ma">
              MA {maRibbonSettings.ma1.length}{' '}
              <strong style={{ color: maRibbonSettings.ma1.color }}>{formatLastPrice(hoverMa.ma1.value)}</strong>
            </span>
          ) : null}
          {hoverMa?.ma2 ? (
            <span className="candle-chart__legend-ma">
              MA {maRibbonSettings.ma2.length}{' '}
              <strong style={{ color: maRibbonSettings.ma2.color }}>{formatLastPrice(hoverMa.ma2.value)}</strong>
            </span>
          ) : null}
          {hoverDc ? (
            <span className="candle-chart__legend-dc">
              DC {dcSettings.length}{' '}
              <strong className="is-upper">{formatLastPrice(hoverDc.upper)}</strong>
              <strong className="is-basis">{formatLastPrice(hoverDc.basis)}</strong>
              <strong className="is-lower">{formatLastPrice(hoverDc.lower)}</strong>
            </span>
          ) : null}
        </div>
        <div className="candle-chart__header-tools">
        <div className="candle-chart__range">
          <button
            type="button"
            className={chartRange || rangeOpen ? 'candle-chart__timeframe is-active' : 'candle-chart__timeframe'}
            aria-expanded={rangeOpen}
            onClick={() => setRangeOpen((open) => !open)}
          >
            Range
          </button>
          {rangeOpen ? (
            <ChartRangePicker
              candles={loadedCandles}
              range={chartRange}
              onClose={() => setRangeOpen(false)}
              onApply={(range) => {
                setChartRange(range)
                setRangeOpen(false)
              }}
              onReset={() => {
                setChartRange(null)
                setRangeOpen(false)
              }}
            />
          ) : null}
        </div>
        <div className="candle-chart__timeframes" role="tablist" aria-label="Timeframes">
          {TIMEFRAMES.map((item) => {
            const unavailable = dataMode === 'test' && !isTestTimeframe(item.id)
            return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={timeframe === item.id}
              disabled={unavailable}
              className={
                timeframe === item.id
                  ? 'candle-chart__timeframe is-active'
                  : 'candle-chart__timeframe'
              }
              onClick={() => onTimeframeChange(item.id)}
            >
            {item.label}
          </button>
            )
          })}
        </div>
        </div>
      </div>
      {error ? <p className="candle-chart__error">{error}</p> : null}
      <div className="candle-chart__body">
        <DrawingToolbar tool={drawingTool} onSelectTool={setDrawingTool} onClear={clearDrawings} />
      <div className="candle-chart__viewport">
        <div className="candle-chart__canvas" ref={containerRef} />
        {selected && stylePosition ? (
          <DrawingStyleBar
            drawing={selected}
            position={stylePosition}
            onChange={updateSelectedStyle}
            onDelete={deleteSelected}
          />
        ) : null}
        {loading ? (
          <div className="candle-chart__loading" role="status" aria-live="polite" aria-label="Loading chart data">
            <span className="candle-chart__loading-spinner" aria-hidden="true" />
            <span>Loading chart...</span>
          </div>
        ) : null}
        {indicatorVisibility.maRibbon ? (
          <button
            type="button"
            className="candle-chart__indicator-gear candle-chart__indicator-gear--ma-ribbon"
            onClick={openMaRibbonSettings}
            aria-label="MA ribbon settings"
            title="MA ribbon settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.dc ? (
          <button
            type="button"
            className={
              indicatorVisibility.maRibbon
                ? 'candle-chart__indicator-gear candle-chart__indicator-gear--dc candle-chart__indicator-gear--dc-below-ma-ribbon'
                : 'candle-chart__indicator-gear candle-chart__indicator-gear--dc'
            }
            onClick={openDcSettings}
            aria-label="Donchian Channels settings"
            title="Donchian Channels settings"
          >
            ⚙
          </button>
        ) : null}
        {settingsOpen === 'maRibbon' ? (
          <div className="candle-chart__settings candle-chart__settings--ma-ribbon">
            <p className="candle-chart__settings-title">MA ribbon</p>
            <MaLineFields
              label="MA #1"
              line={draftMaRibbonSettings.ma1}
              onChange={(line) => setDraftMaRibbonSettings((current) => ({ ...current, ma1: line }))}
            />
            <MaLineFields
              label="MA #2"
              line={draftMaRibbonSettings.ma2}
              onChange={(line) => setDraftMaRibbonSettings((current) => ({ ...current, ma2: line }))}
            />
            <div className="candle-chart__settings-actions">
              <button type="button" className="candle-chart__settings-button" onClick={resetSettings}>
                Defaults
              </button>
              <button type="button" className="candle-chart__settings-button" onClick={() => onSettingsOpenChange(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="candle-chart__settings-button candle-chart__settings-button--primary"
                onClick={applySettings}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
        {settingsOpen === 'dc' ? (
          <div className="candle-chart__settings candle-chart__settings--dc">
            <p className="candle-chart__settings-title">Donchian Channels</p>
            <div className="candle-chart__settings-grid">
              <label>
                <span>Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftDcSettings.length}
                  onChange={(event) =>
                    setDraftDcSettings((current) => ({
                      ...current,
                      length: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Offset</span>
                <input
                  type="number"
                  min="-500"
                  max="500"
                  value={draftDcSettings.offset}
                  onChange={(event) =>
                    setDraftDcSettings((current) => ({
                      ...current,
                      offset: Number(event.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <div className="candle-chart__settings-actions">
              <button type="button" className="candle-chart__settings-button" onClick={resetSettings}>
                Defaults
              </button>
              <button type="button" className="candle-chart__settings-button" onClick={() => onSettingsOpenChange(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="candle-chart__settings-button candle-chart__settings-button--primary"
                onClick={applySettings}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
        {selectedFib ? (
          <FibSettingsPanel
            settings={selectedFib.settings}
            onChange={updateSelectedFib}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
        <div className="candle-chart__controls" aria-label="Chart controls">
          <button type="button" className="candle-chart__control" onClick={() => zoomRange(1.25)}>
            -
          </button>
          <button type="button" className="candle-chart__control" onClick={() => zoomRange(0.8)}>
            +
          </button>
          <button type="button" className="candle-chart__control" onClick={() => shiftRange(-1)}>
            &lt;
          </button>
          <button type="button" className="candle-chart__control" onClick={() => shiftRange(1)}>
            &gt;
          </button>
          <button
            type="button"
            className="candle-chart__control candle-chart__control--reset"
            onClick={resetView}
            aria-label="Reset chart view"
            title="Reset chart view"
          >
            ↻
          </button>
        </div>
      </div>
      </div>
      {backtestOpen ? (
        <BacktestModal
          candles={loadedCandles}
          timeframe={timeframe}
          onTimeframeChange={onTimeframeChange}
          rewardRatio={smaDcRatio}
          onRewardRatioChange={onSmaDcRatioChange}
          maRibbonSettings={maRibbonSettings}
          dataMode={dataMode}
          onClose={onBacktestClose}
        />
      ) : null}
    </div>
  )
}
