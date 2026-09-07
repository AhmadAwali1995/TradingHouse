import { useEffect, useRef, useState } from 'react'
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  TIMEFRAMES,
  applyLiveCandle,
  fetchCandles,
  type Candle,
  type TimeframeId,
} from './candles'
import type { Pair } from './data/config'
import {
  CIPHER_B_COLORS,
  DEFAULT_CIPHER_B_SETTINGS,
  DEFAULT_NWE_SETTINGS,
  RSI_LENGTH,
  calculateCipherB,
  calculateNadarayaWatsonEnvelope,
  calculateTradingViewRsi,
  normalizeCipherBSettings,
  normalizeNweSettings,
  type CipherBSettings,
  type NweSettings,
} from './indicators'
import type { IndicatorVisibility } from './indicatorCatalog'
import { subscribeLiveCandles } from './klineSocket'
import { LastPriceCountdownPrimitive } from './lastPriceCountdown'
import { NweSignalMarkersPrimitive } from './nweSignalMarkers'
import './BitcoinCandleChart.css'

type LogicalRange = {
  from: number
  to: number
}

type RsiSettings = {
  length: number
  outerHigh: number
  upperBand: number
  midline: number
  lowerBand: number
  outerLow: number
}

const DEFAULT_RSI_SETTINGS: RsiSettings = {
  length: RSI_LENGTH,
  outerHigh: 80,
  upperBand: 70,
  midline: 50,
  lowerBand: 30,
  outerLow: 20,
}

type RsiPoint = {
  time: number
  value: number
}

type ChartLinePoint = {
  time: UTCTimestamp
  value?: number
}

function interpolateThresholdPoint(
  left: RsiPoint,
  right: RsiPoint,
  threshold: number,
): RsiPoint {
  const delta = right.value - left.value
  if (delta === 0) {
    return { time: left.time, value: threshold }
  }

  const ratio = (threshold - left.value) / delta
  return {
    time: left.time + (right.time - left.time) * ratio,
    value: threshold,
  }
}

function samePoint(left: ChartLinePoint, right: ChartLinePoint): boolean {
  return left.time === right.time && left.value === right.value
}

function buildZoneSeries(
  points: RsiPoint[],
  thresholds: number[],
  isInsideZone: (value: number) => boolean,
): ChartLinePoint[] {
  const data: ChartLinePoint[] = []

  const pushPoint = (point: ChartLinePoint) => {
    const last = data[data.length - 1]
    if (!last || !samePoint(last, point)) {
      data.push(point)
    }
  }

  const pushGap = (time: number) => {
    const gap = { time: time as UTCTimestamp }
    const last = data[data.length - 1]
    if (!last || last.value !== undefined) {
      data.push(gap)
    }
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const segmentPoints = [previous]

    for (const threshold of thresholds) {
      const leftDistance = previous.value - threshold
      const rightDistance = current.value - threshold
      if (leftDistance === 0 || rightDistance === 0 || leftDistance * rightDistance >= 0) {
        continue
      }
      segmentPoints.push(interpolateThresholdPoint(previous, current, threshold))
    }

    segmentPoints.push(current)
    segmentPoints.sort((left, right) => left.time - right.time)

    for (let splitIndex = 1; splitIndex < segmentPoints.length; splitIndex += 1) {
      const left = segmentPoints[splitIndex - 1]
      const right = segmentPoints[splitIndex]
      const middleValue = (left.value + right.value) / 2

      if (!isInsideZone(middleValue)) {
        pushGap(right.time)
        continue
      }

      pushPoint({ time: left.time as UTCTimestamp, value: left.value })
      pushPoint({ time: right.time as UTCTimestamp, value: right.value })
    }
  }

  return data
}

function normalizeRsiSettings(settings: RsiSettings): RsiSettings {
  const outerLow = Math.max(0, Math.min(100, settings.outerLow))
  const lowerBand = Math.max(outerLow, Math.min(100, settings.lowerBand))
  const midline = Math.max(lowerBand, Math.min(100, settings.midline))
  const upperBand = Math.max(midline, Math.min(100, settings.upperBand))
  const outerHigh = Math.max(upperBand, Math.min(100, settings.outerHigh))

  return {
    length: Math.max(1, Math.round(settings.length)),
    outerHigh,
    upperBand,
    midline,
    lowerBand,
    outerLow,
  }
}

type RsiPaneSeries = {
  series: ISeriesApi<'Line'>
  bandTop: ISeriesApi<'Baseline'>
  bandBottom: ISeriesApi<'Baseline'>
  midUp: ISeriesApi<'Line'>
  midDown: ISeriesApi<'Line'>
  white: ISeriesApi<'Line'>
  upper: ISeriesApi<'Line'>
  lower: ISeriesApi<'Line'>
}

type CipherPaneSeries = {
  wt1: ISeriesApi<'Baseline'>
  wt2: ISeriesApi<'Baseline'>
  diff: ISeriesApi<'Baseline'>
  markers: ISeriesMarkersPluginApi<Time>
}

function applyOscillatorPaneStretch(chart: IChartApi) {
  const panes = chart.panes()
  panes[0]?.setStretchFactor(3)
  for (let index = 1; index < panes.length; index += 1) {
    panes[index]?.setStretchFactor(1)
  }
}

function pruneEmptyOscillatorPanes(chart: IChartApi) {
  const panes = chart.panes()
  for (let index = panes.length - 1; index >= 1; index -= 1) {
    if (panes[index].getSeries().length === 0) {
      chart.removePane(index)
    }
  }
}

function createRsiSeries(chart: IChartApi, settings: RsiSettings, paneIndex: number): RsiPaneSeries {
  const bandTop = chart.addSeries(
    BaselineSeries,
    {
      baseValue: { type: 'price', price: settings.midline },
      topFillColor1: 'rgba(104, 33, 122, 0.26)',
      topFillColor2: 'rgba(104, 33, 122, 0.26)',
      topLineColor: 'rgba(0, 0, 0, 0)',
      bottomFillColor1: 'rgba(0, 0, 0, 0)',
      bottomFillColor2: 'rgba(0, 0, 0, 0)',
      bottomLineColor: 'rgba(0, 0, 0, 0)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const bandBottom = chart.addSeries(
    BaselineSeries,
    {
      baseValue: { type: 'price', price: settings.midline },
      topFillColor1: 'rgba(0, 0, 0, 0)',
      topFillColor2: 'rgba(0, 0, 0, 0)',
      topLineColor: 'rgba(0, 0, 0, 0)',
      bottomFillColor1: 'rgba(104, 33, 122, 0.26)',
      bottomFillColor2: 'rgba(104, 33, 122, 0.26)',
      bottomLineColor: 'rgba(0, 0, 0, 0)',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const midUp = chart.addSeries(
    LineSeries,
    {
      color: '#2db84d',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const midDown = chart.addSeries(
    LineSeries,
    {
      color: '#d52d35',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const white = chart.addSeries(
    LineSeries,
    {
      color: '#f3f4f6',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const upper = chart.addSeries(
    LineSeries,
    {
      color: '#ff3b30',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const lower = chart.addSeries(
    LineSeries,
    {
      color: '#ff3b30',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    },
    paneIndex,
  )
  const series = chart.addSeries(
    LineSeries,
    {
      color: 'rgba(243, 244, 246, 0)',
      lineWidth: 1,
      title: `Better RSI ${settings.length}`,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: settings.outerLow,
          maxValue: settings.outerHigh,
        },
      }),
    },
    paneIndex,
  )

  series.createPriceLine({
    price: settings.outerHigh,
    color: '#a66a2c',
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })
  series.createPriceLine({
    price: settings.upperBand,
    color: '#9095a1',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: '',
  })
  series.createPriceLine({
    price: settings.midline,
    color: '#9095a1',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: '',
  })
  series.createPriceLine({
    price: settings.lowerBand,
    color: '#9095a1',
    lineWidth: 1,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title: '',
  })
  series.createPriceLine({
    price: settings.outerLow,
    color: '#a66a2c',
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })

  return { series, bandTop, bandBottom, midUp, midDown, white, upper, lower }
}

function paintRsiSeries(pane: RsiPaneSeries, candles: Candle[], settings: RsiSettings) {
  const points = calculateTradingViewRsi(candles, settings.length)
  pane.bandTop.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: settings.upperBand,
    })),
  )
  pane.bandBottom.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: settings.lowerBand,
    })),
  )
  pane.midUp.setData(
    points.map((point) =>
      point.value >= settings.midline
        ? { time: point.time as UTCTimestamp, value: settings.midline }
        : { time: point.time as UTCTimestamp },
    ),
  )
  pane.midDown.setData(
    points.map((point) =>
      point.value < settings.midline
        ? { time: point.time as UTCTimestamp, value: settings.midline }
        : { time: point.time as UTCTimestamp },
    ),
  )
  pane.white.setData(
    buildZoneSeries(
      points,
      [settings.lowerBand, settings.upperBand],
      (value) => value >= settings.lowerBand && value <= settings.upperBand,
    ),
  )
  pane.upper.setData(
    buildZoneSeries(points, [settings.lowerBand, settings.upperBand], (value) => value > settings.upperBand),
  )
  pane.lower.setData(
    buildZoneSeries(points, [settings.lowerBand, settings.upperBand], (value) => value < settings.lowerBand),
  )
  pane.series.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    })),
  )
}

function removeRsiSeries(chart: IChartApi, pane: RsiPaneSeries) {
  chart.removeSeries(pane.bandTop)
  chart.removeSeries(pane.bandBottom)
  chart.removeSeries(pane.midUp)
  chart.removeSeries(pane.midDown)
  chart.removeSeries(pane.white)
  chart.removeSeries(pane.upper)
  chart.removeSeries(pane.lower)
  chart.removeSeries(pane.series)
}

function createCipherBSeries(
  chart: IChartApi,
  settings: CipherBSettings,
  paneIndex: number,
): CipherPaneSeries {
  const areaBase = {
    baseValue: { type: 'price' as const, price: 0 },
    lineWidth: 1 as const,
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
  }

  const wt1 = chart.addSeries(
    BaselineSeries,
    {
      ...areaBase,
      topFillColor1: CIPHER_B_COLORS.wt1Fill,
      topFillColor2: CIPHER_B_COLORS.wt1Fill,
      topLineColor: CIPHER_B_COLORS.wt1,
      bottomFillColor1: CIPHER_B_COLORS.wt1Fill,
      bottomFillColor2: CIPHER_B_COLORS.wt1Fill,
      bottomLineColor: CIPHER_B_COLORS.wt1,
      title: `Cipher_B_free ${settings.channelLength} ${settings.averageLength}`,
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: Math.min(settings.oversold1, settings.oversold2) - 8,
          maxValue: Math.max(settings.overbought1, settings.overbought2) + 8,
        },
      }),
    },
    paneIndex,
  )
  const wt2 = chart.addSeries(
    BaselineSeries,
    {
      ...areaBase,
      topFillColor1: CIPHER_B_COLORS.wt2Fill,
      topFillColor2: CIPHER_B_COLORS.wt2Fill,
      topLineColor: CIPHER_B_COLORS.wt2,
      bottomFillColor1: CIPHER_B_COLORS.wt2Fill,
      bottomFillColor2: CIPHER_B_COLORS.wt2Fill,
      bottomLineColor: CIPHER_B_COLORS.wt2,
    },
    paneIndex,
  )
  const diff = chart.addSeries(
    BaselineSeries,
    {
      ...areaBase,
      topFillColor1: CIPHER_B_COLORS.differenceFill,
      topFillColor2: CIPHER_B_COLORS.differenceFill,
      topLineColor: CIPHER_B_COLORS.difference,
      bottomFillColor1: CIPHER_B_COLORS.differenceFill,
      bottomFillColor2: CIPHER_B_COLORS.differenceFill,
      bottomLineColor: CIPHER_B_COLORS.difference,
    },
    paneIndex,
  )

  wt1.createPriceLine({
    price: 0,
    color: CIPHER_B_COLORS.zero,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })
  wt1.createPriceLine({
    price: settings.overbought1,
    color: CIPHER_B_COLORS.overbought,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })
  wt1.createPriceLine({
    price: settings.oversold1,
    color: CIPHER_B_COLORS.oversold,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })
  wt1.createPriceLine({
    price: settings.overbought2,
    color: CIPHER_B_COLORS.overbought,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })
  wt1.createPriceLine({
    price: settings.oversold2,
    color: CIPHER_B_COLORS.oversold,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })

  return { wt1, wt2, diff, markers: createSeriesMarkers(wt2, []) }
}

function paintCipherBSeries(pane: CipherPaneSeries, candles: Candle[], settings: CipherBSettings) {
  const points = calculateCipherB(candles, settings)
  pane.wt1.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.wt1,
    })),
  )
  pane.wt2.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.wt2,
    })),
  )
  pane.diff.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.difference,
    })),
  )
  pane.markers.setMarkers(
    points.flatMap((point) => {
      if (!point.cross) {
        return []
      }

      const color = point.cross === 'buy' ? CIPHER_B_COLORS.buy : CIPHER_B_COLORS.sell
      return [
        {
          time: point.time as UTCTimestamp,
          position: 'atPriceMiddle' as const,
          shape: 'circle' as const,
          color: CIPHER_B_COLORS.crossOutline,
          size: 2.4,
          price: point.wt2,
        },
        {
          time: point.time as UTCTimestamp,
          position: 'atPriceMiddle' as const,
          shape: 'circle' as const,
          color,
          size: 1.6,
          price: point.wt2,
        },
      ]
    }),
  )
}

function removeCipherBSeries(chart: IChartApi, pane: CipherPaneSeries) {
  pane.markers.detach()
  chart.removeSeries(pane.wt1)
  chart.removeSeries(pane.wt2)
  chart.removeSeries(pane.diff)
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

export function BitcoinCandleChart({
  pair,
  timeframe,
  indicatorVisibility,
  onTimeframeChange,
}: {
  pair: Pair
  timeframe: TimeframeId
  indicatorVisibility: IndicatorVisibility
  onTimeframeChange: (timeframe: TimeframeId) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiBandTopRef = useRef<ISeriesApi<'Baseline'> | null>(null)
  const rsiBandBottomRef = useRef<ISeriesApi<'Baseline'> | null>(null)
  const rsiMidUpRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiMidDownRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiWhiteRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const cipherWt1Ref = useRef<ISeriesApi<'Baseline'> | null>(null)
  const cipherWt2Ref = useRef<ISeriesApi<'Baseline'> | null>(null)
  const cipherDiffRef = useRef<ISeriesApi<'Baseline'> | null>(null)
  const cipherMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const nweUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const nweLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const nweMarkersRef = useRef<NweSignalMarkersPrimitive | null>(null)
  const candlesRef = useRef<Candle[]>([])
  const countdownRef = useRef<LastPriceCountdownPrimitive | null>(null)
  const initialRangeRef = useRef<LogicalRange | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState<null | 'rsi' | 'nwe' | 'cipherB'>(null)
  const [rsiSettings, setRsiSettings] = useState<RsiSettings>(DEFAULT_RSI_SETTINGS)
  const [draftRsiSettings, setDraftRsiSettings] = useState<RsiSettings>(DEFAULT_RSI_SETTINGS)
  const [nweSettings, setNweSettings] = useState<NweSettings>(DEFAULT_NWE_SETTINGS)
  const [draftNweSettings, setDraftNweSettings] = useState<NweSettings>(DEFAULT_NWE_SETTINGS)
  const [cipherSettings, setCipherSettings] = useState<CipherBSettings>(DEFAULT_CIPHER_B_SETTINGS)
  const [draftCipherSettings, setDraftCipherSettings] = useState<CipherBSettings>(DEFAULT_CIPHER_B_SETTINGS)
  const indicatorVisibilityRef = useRef(indicatorVisibility)
  const nweSettingsRef = useRef(nweSettings)
  const rsiSettingsRef = useRef(rsiSettings)
  const cipherSettingsRef = useRef(cipherSettings)
  indicatorVisibilityRef.current = indicatorVisibility
  nweSettingsRef.current = nweSettings
  rsiSettingsRef.current = rsiSettings
  cipherSettingsRef.current = cipherSettings

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
    const rsiSeries = rsiSeriesRef.current
    const cipherSeries = cipherWt1Ref.current
    if (!chart || !initialRange || !series) {
      return
    }

    chart.timeScale().setVisibleLogicalRange(initialRange)
    requestAnimationFrame(() => {
      series.priceScale().applyOptions({ autoScale: true })
      rsiSeries?.priceScale().applyOptions({ autoScale: true })
      cipherSeries?.priceScale().applyOptions({ autoScale: true })
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
      },
      crosshair: {
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
    const nweMarkers = new NweSignalMarkersPrimitive()
    series.attachPrimitive(nweMarkers)
    seriesRef.current = series
    countdownRef.current = countdown
    nweMarkersRef.current = nweMarkers

    const nweUpper = chart.addSeries(LineSeries, {
      color: '#00897b',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    const nweLower = chart.addSeries(LineSeries, {
      color: '#f23645',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    nweUpperRef.current = nweUpper
    nweLowerRef.current = nweLower
    setChartReady(true)

    return () => {
      setChartReady(false)
      seriesRef.current = null
      rsiSeriesRef.current = null
      rsiBandTopRef.current = null
      rsiBandBottomRef.current = null
      rsiMidUpRef.current = null
      rsiMidDownRef.current = null
      rsiWhiteRef.current = null
      rsiUpperRef.current = null
      rsiLowerRef.current = null
      cipherWt1Ref.current = null
      cipherWt2Ref.current = null
      cipherDiffRef.current = null
      cipherMarkersRef.current = null
      nweUpperRef.current = null
      nweLowerRef.current = null
      nweMarkersRef.current = null
      countdownRef.current = null
      chartRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chartReady || !chart || !indicatorVisibility.rsi) {
      return
    }

    cipherWt1Ref.current?.moveToPane(2)
    cipherWt2Ref.current?.moveToPane(2)
    cipherDiffRef.current?.moveToPane(2)

    const pane = createRsiSeries(chart, rsiSettings, 1)
    rsiSeriesRef.current = pane.series
    rsiBandTopRef.current = pane.bandTop
    rsiBandBottomRef.current = pane.bandBottom
    rsiMidUpRef.current = pane.midUp
    rsiMidDownRef.current = pane.midDown
    rsiWhiteRef.current = pane.white
    rsiUpperRef.current = pane.upper
    rsiLowerRef.current = pane.lower
    if (candlesRef.current.length > 0) {
      paintRsiSeries(pane, candlesRef.current, rsiSettings)
    }
    applyOscillatorPaneStretch(chart)

    return () => {
      const activeChart = chartRef.current
      if (activeChart) {
        removeRsiSeries(activeChart, pane)
        pruneEmptyOscillatorPanes(activeChart)
        applyOscillatorPaneStretch(activeChart)
      }
      if (rsiSeriesRef.current === pane.series) {
        rsiSeriesRef.current = null
        rsiBandTopRef.current = null
        rsiBandBottomRef.current = null
        rsiMidUpRef.current = null
        rsiMidDownRef.current = null
        rsiWhiteRef.current = null
        rsiUpperRef.current = null
        rsiLowerRef.current = null
      }
    }
  }, [chartReady, indicatorVisibility.rsi, rsiSettings])

  useEffect(() => {
    const chart = chartRef.current
    if (!chartReady || !chart || !indicatorVisibility.cipherB) {
      return
    }

    const pane = createCipherBSeries(chart, cipherSettings, rsiSeriesRef.current ? 2 : 1)
    cipherWt1Ref.current = pane.wt1
    cipherWt2Ref.current = pane.wt2
    cipherDiffRef.current = pane.diff
    cipherMarkersRef.current = pane.markers
    if (candlesRef.current.length > 0) {
      paintCipherBSeries(pane, candlesRef.current, cipherSettings)
    }
    applyOscillatorPaneStretch(chart)

    return () => {
      const activeChart = chartRef.current
      if (activeChart) {
        removeCipherBSeries(activeChart, pane)
        pruneEmptyOscillatorPanes(activeChart)
        applyOscillatorPaneStretch(activeChart)
      }
      if (cipherWt1Ref.current === pane.wt1) {
        cipherWt1Ref.current = null
        cipherWt2Ref.current = null
        cipherDiffRef.current = null
        cipherMarkersRef.current = null
      }
    }
  }, [chartReady, indicatorVisibility.cipherB, cipherSettings])

  useEffect(() => {
    const series = seriesRef.current
    const nweUpper = nweUpperRef.current
    const nweLower = nweLowerRef.current
    const nweMarkers = nweMarkersRef.current
    if (!series || !nweUpper || !nweLower || !nweMarkers) {
      return
    }

    const controller = new AbortController()
    let closed = false
    let live: ReturnType<typeof subscribeLiveCandles> | null = null
    initialRangeRef.current = null
    setError(null)
    setLoading(true)

    const readRsiPane = (): RsiPaneSeries | null => {
      const rsiSeries = rsiSeriesRef.current
      const bandTop = rsiBandTopRef.current
      const bandBottom = rsiBandBottomRef.current
      const midUp = rsiMidUpRef.current
      const midDown = rsiMidDownRef.current
      const white = rsiWhiteRef.current
      const upper = rsiUpperRef.current
      const lower = rsiLowerRef.current
      if (!rsiSeries || !bandTop || !bandBottom || !midUp || !midDown || !white || !upper || !lower) {
        return null
      }
      return { series: rsiSeries, bandTop, bandBottom, midUp, midDown, white, upper, lower }
    }

    const readCipherPane = (): CipherPaneSeries | null => {
      const wt1 = cipherWt1Ref.current
      const wt2 = cipherWt2Ref.current
      const diff = cipherDiffRef.current
      const markers = cipherMarkersRef.current
      if (!wt1 || !wt2 || !diff || !markers) {
        return null
      }
      return { wt1, wt2, diff, markers }
    }

    const paintRsi = (candles: Candle[]) => {
      const pane = readRsiPane()
      if (!indicatorVisibilityRef.current.rsi || !pane) {
        return
      }
      paintRsiSeries(pane, candles, rsiSettingsRef.current)
    }

    const paintCipherB = (candles: Candle[]) => {
      const pane = readCipherPane()
      if (!indicatorVisibilityRef.current.cipherB || !pane) {
        return
      }
      paintCipherBSeries(pane, candles, cipherSettingsRef.current)
    }

    const paintNwe = (candles: Candle[]) => {
      if (!indicatorVisibilityRef.current.nwe) {
        nweMarkers.setMarkers([])
        return
      }

      const result = calculateNadarayaWatsonEnvelope(candles, nweSettingsRef.current)
      nweUpper.setData(
        result.points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.upper,
        })),
      )
      nweLower.setData(
        result.points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.lower,
        })),
      )
      nweMarkers.setMarkers(
        result.crosses.map((cross) =>
          cross.direction === 'down'
            ? {
                time: cross.time as UTCTimestamp,
                price: cross.price,
                direction: 'down',
                color: '#f23645',
              }
            : {
                time: cross.time as UTCTimestamp,
                price: cross.price,
                direction: 'up',
                color: '#00897b',
              },
        ),
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
      paintRsi(candles)
      paintCipherB(candles)
      paintNwe(candles)
    }

    const paintLive = (candles: Candle[], candle: Candle) => {
      series.update({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })
      paintRsi(candles)
      paintCipherB(candles)
      paintNwe(candles)
    }

    void fetchCandles(pair, timeframe, controller.signal)
      .then((history) => {
        if (closed || controller.signal.aborted || seriesRef.current !== series) {
          return
        }

        const candles = [...history]
        candlesRef.current = candles
        paintHistory(candles)
        setLoading(false)
        chartRef.current?.timeScale().fitContent()
        if (chartRef.current) {
          centerLastCandle(chartRef.current, candles.length, (range) => {
            initialRangeRef.current = range
          })
        }

        live = subscribeLiveCandles(
          pair,
          timeframe,
          (candle) => {
            if (controller.signal.aborted || seriesRef.current !== series) {
              return
            }
            if (applyLiveCandle(candles, candle)) {
              candlesRef.current = candles
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
  }, [pair, timeframe, chartReady])

  useEffect(() => {
    const nweUpper = nweUpperRef.current
    const nweLower = nweLowerRef.current
    const nweMarkers = nweMarkersRef.current
    const candles = candlesRef.current
    if (!nweUpper || !nweLower || !nweMarkers || candles.length === 0) {
      return
    }

    const result = calculateNadarayaWatsonEnvelope(candles, nweSettings)
    nweUpper.setData(
      result.points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.upper,
      })),
    )
    nweLower.setData(
      result.points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.lower,
      })),
    )
    nweMarkers.setMarkers(
      result.crosses.map((cross) =>
        cross.direction === 'down'
          ? {
              time: cross.time as UTCTimestamp,
              price: cross.price,
              direction: 'down',
              color: '#f23645',
            }
          : {
              time: cross.time as UTCTimestamp,
              price: cross.price,
              direction: 'up',
              color: '#00897b',
            },
      ),
    )
  }, [nweSettings, chartReady, indicatorVisibility])

  useEffect(() => {
    countdownRef.current?.setTimeframe(timeframe)
  }, [timeframe, chartReady])

  useEffect(() => {
    if (
      (settingsOpen === 'rsi' && !indicatorVisibility.rsi) ||
      (settingsOpen === 'nwe' && !indicatorVisibility.nwe) ||
      (settingsOpen === 'cipherB' && !indicatorVisibility.cipherB)
    ) {
      setSettingsOpen(null)
    }
  }, [indicatorVisibility, settingsOpen])

  useEffect(() => {
    const nweVisible = indicatorVisibility.nwe
    nweUpperRef.current?.applyOptions({ visible: nweVisible })
    nweLowerRef.current?.applyOptions({ visible: nweVisible })

    const candles = candlesRef.current
    const nweMarkers = nweMarkersRef.current
    if (!nweMarkers) {
      return
    }

    if (!nweVisible) {
      nweMarkers.setMarkers([])
      return
    }

    if (candles.length === 0) {
      return
    }

    const result = calculateNadarayaWatsonEnvelope(candles, nweSettingsRef.current)
    nweMarkers.setMarkers(
      result.crosses.map((cross) =>
        cross.direction === 'down'
          ? {
              time: cross.time as UTCTimestamp,
              price: cross.price,
              direction: 'down',
              color: '#f23645',
            }
          : {
              time: cross.time as UTCTimestamp,
              price: cross.price,
              direction: 'up',
              color: '#00897b',
            },
      ),
    )
  }, [indicatorVisibility, chartReady])

  const updateDraftSetting = (key: keyof RsiSettings, value: string) => {
    setDraftRsiSettings((current) => ({
      ...current,
      [key]: Number(value),
    }))
  }

  const updateDraftNweSetting = (key: 'bandwidth' | 'multiplier' | 'lookback', value: string) => {
    setDraftNweSettings((current) => ({
      ...current,
      [key]: Number(value),
    }))
  }

  const updateDraftCipherSetting = (key: keyof CipherBSettings, value: string) => {
    setDraftCipherSettings((current) => ({
      ...current,
      [key]: Number(value),
    }))
  }

  const openRsiSettings = () => {
    setDraftRsiSettings(rsiSettings)
    setSettingsOpen('rsi')
  }

  const openNweSettings = () => {
    setDraftNweSettings(nweSettings)
    setSettingsOpen('nwe')
  }

  const openCipherSettings = () => {
    setDraftCipherSettings(cipherSettings)
    setSettingsOpen('cipherB')
  }

  const applySettings = () => {
    if (settingsOpen === 'rsi') {
      const next = normalizeRsiSettings(draftRsiSettings)
      setDraftRsiSettings(next)
      setRsiSettings(next)
    }
    if (settingsOpen === 'nwe') {
      const next = normalizeNweSettings(draftNweSettings)
      setDraftNweSettings(next)
      setNweSettings(next)
    }
    if (settingsOpen === 'cipherB') {
      const next = normalizeCipherBSettings(draftCipherSettings)
      setDraftCipherSettings(next)
      setCipherSettings(next)
    }
    setSettingsOpen(null)
  }

  const resetSettings = () => {
    if (settingsOpen === 'rsi') {
      setDraftRsiSettings(DEFAULT_RSI_SETTINGS)
    }
    if (settingsOpen === 'nwe') {
      setDraftNweSettings(DEFAULT_NWE_SETTINGS)
    }
    if (settingsOpen === 'cipherB') {
      setDraftCipherSettings(DEFAULT_CIPHER_B_SETTINGS)
    }
  }

  return (
    <div className="bitcoin-chart">
      <div className="bitcoin-chart__header">
        <span className="bitcoin-chart__title">
          {pair.symbol} · Japanese candles
        </span>
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
              onClick={() => onTimeframeChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="bitcoin-chart__error">{error}</p> : null}
      <div className="bitcoin-chart__viewport">
        <div className="bitcoin-chart__canvas" ref={containerRef} />
        {loading ? (
          <div className="bitcoin-chart__loading" role="status" aria-live="polite" aria-label="Loading chart data">
            <span className="bitcoin-chart__loading-spinner" aria-hidden="true" />
            <span>Loading chart...</span>
          </div>
        ) : null}
        {indicatorVisibility.nwe ? (
          <button
            type="button"
            className="bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--nwe"
            onClick={openNweSettings}
            aria-label="Nadaraya-Watson Envelope settings"
            title="Nadaraya-Watson Envelope settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.rsi ? (
          <button
            type="button"
            className={
              indicatorVisibility.cipherB
                ? 'bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--rsi bitcoin-chart__indicator-gear--rsi-raised'
                : 'bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--rsi'
            }
            onClick={openRsiSettings}
            aria-label="Better RSI settings"
            title="Better RSI settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.cipherB ? (
          <button
            type="button"
            className="bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--cipher"
            onClick={openCipherSettings}
            aria-label="Cipher_B_free settings"
            title="Cipher_B_free settings"
          >
            ⚙
          </button>
        ) : null}
        {settingsOpen === 'rsi' ? (
          <div
            className={
              indicatorVisibility.cipherB
                ? 'bitcoin-chart__settings bitcoin-chart__settings--rsi bitcoin-chart__settings--rsi-raised'
                : 'bitcoin-chart__settings bitcoin-chart__settings--rsi'
            }
          >
            <p className="bitcoin-chart__settings-title">Better RSI</p>
            <div className="bitcoin-chart__settings-grid">
              <label>
                <span>Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftRsiSettings.length}
                  onChange={(event) => updateDraftSetting('length', event.target.value)}
                />
              </label>
              <label>
                <span>Outer high</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draftRsiSettings.outerHigh}
                  onChange={(event) => updateDraftSetting('outerHigh', event.target.value)}
                />
              </label>
              <label>
                <span>Upper band</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draftRsiSettings.upperBand}
                  onChange={(event) => updateDraftSetting('upperBand', event.target.value)}
                />
              </label>
              <label>
                <span>Midline</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draftRsiSettings.midline}
                  onChange={(event) => updateDraftSetting('midline', event.target.value)}
                />
              </label>
              <label>
                <span>Lower band</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draftRsiSettings.lowerBand}
                  onChange={(event) => updateDraftSetting('lowerBand', event.target.value)}
                />
              </label>
              <label>
                <span>Outer low</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draftRsiSettings.outerLow}
                  onChange={(event) => updateDraftSetting('outerLow', event.target.value)}
                />
              </label>
            </div>
            <div className="bitcoin-chart__settings-actions">
              <button type="button" className="bitcoin-chart__settings-button" onClick={resetSettings}>
                Defaults
              </button>
              <button type="button" className="bitcoin-chart__settings-button" onClick={() => setSettingsOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="bitcoin-chart__settings-button bitcoin-chart__settings-button--primary"
                onClick={applySettings}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
        {settingsOpen === 'nwe' ? (
          <div className="bitcoin-chart__settings bitcoin-chart__settings--nwe">
            <p className="bitcoin-chart__settings-title">Nadaraya-Watson Envelope</p>
            <div className="bitcoin-chart__settings-grid">
              <label>
                <span>Bandwidth</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={draftNweSettings.bandwidth}
                  onChange={(event) => updateDraftNweSetting('bandwidth', event.target.value)}
                />
              </label>
              <label>
                <span>Multiplier</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draftNweSettings.multiplier}
                  onChange={(event) => updateDraftNweSetting('multiplier', event.target.value)}
                />
              </label>
              <label>
                <span>Lookback</span>
                <input
                  type="number"
                  min="2"
                  max="2000"
                  value={draftNweSettings.lookback}
                  onChange={(event) => updateDraftNweSetting('lookback', event.target.value)}
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>Repainting smoothing</span>
                <input
                  type="checkbox"
                  checked={draftNweSettings.repaint}
                  onChange={(event) =>
                    setDraftNweSettings((current) => ({
                      ...current,
                      repaint: event.target.checked,
                    }))
                  }
                />
              </label>
            </div>
            <div className="bitcoin-chart__settings-actions">
              <button type="button" className="bitcoin-chart__settings-button" onClick={resetSettings}>
                Defaults
              </button>
              <button type="button" className="bitcoin-chart__settings-button" onClick={() => setSettingsOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="bitcoin-chart__settings-button bitcoin-chart__settings-button--primary"
                onClick={applySettings}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
        {settingsOpen === 'cipherB' ? (
          <div className="bitcoin-chart__settings bitcoin-chart__settings--cipher">
            <p className="bitcoin-chart__settings-title">Cipher_B_free</p>
            <div className="bitcoin-chart__settings-grid">
              <label>
                <span>Channel Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftCipherSettings.channelLength}
                  onChange={(event) => updateDraftCipherSetting('channelLength', event.target.value)}
                />
              </label>
              <label>
                <span>Average Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftCipherSettings.averageLength}
                  onChange={(event) => updateDraftCipherSetting('averageLength', event.target.value)}
                />
              </label>
              <label>
                <span>Over Bought 1</span>
                <input
                  type="number"
                  value={draftCipherSettings.overbought1}
                  onChange={(event) => updateDraftCipherSetting('overbought1', event.target.value)}
                />
              </label>
              <label>
                <span>Over Bought 2</span>
                <input
                  type="number"
                  value={draftCipherSettings.overbought2}
                  onChange={(event) => updateDraftCipherSetting('overbought2', event.target.value)}
                />
              </label>
              <label>
                <span>Over Sold 1</span>
                <input
                  type="number"
                  value={draftCipherSettings.oversold1}
                  onChange={(event) => updateDraftCipherSetting('oversold1', event.target.value)}
                />
              </label>
              <label>
                <span>Over Sold 2</span>
                <input
                  type="number"
                  value={draftCipherSettings.oversold2}
                  onChange={(event) => updateDraftCipherSetting('oversold2', event.target.value)}
                />
              </label>
            </div>
            <div className="bitcoin-chart__settings-actions">
              <button type="button" className="bitcoin-chart__settings-button" onClick={resetSettings}>
                Defaults
              </button>
              <button type="button" className="bitcoin-chart__settings-button" onClick={() => setSettingsOpen(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="bitcoin-chart__settings-button bitcoin-chart__settings-button--primary"
                onClick={applySettings}
              >
                Apply
              </button>
            </div>
          </div>
        ) : null}
        <div className="bitcoin-chart__controls" aria-label="Chart controls">
          <button type="button" className="bitcoin-chart__control" onClick={() => zoomRange(1.25)}>
            -
          </button>
          <button type="button" className="bitcoin-chart__control" onClick={() => zoomRange(0.8)}>
            +
          </button>
          <button type="button" className="bitcoin-chart__control" onClick={() => shiftRange(-1)}>
            &lt;
          </button>
          <button type="button" className="bitcoin-chart__control" onClick={() => shiftRange(1)}>
            &gt;
          </button>
          <button
            type="button"
            className="bitcoin-chart__control bitcoin-chart__control--reset"
            onClick={resetView}
            aria-label="Reset chart view"
            title="Reset chart view"
          >
            ↻
          </button>
        </div>
      </div>
    </div>
  )
}
