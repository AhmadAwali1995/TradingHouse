import { useEffect, useRef, useState } from 'react'
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesType,
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
  CM_MACD_COLORS,
  DEFAULT_CIPHER_B_SETTINGS,
  DEFAULT_CM_MACD_SETTINGS,
  DEFAULT_LA_NWE_SETTINGS,
  DEFAULT_SMA_SETTINGS,
  DEFAULT_TV_MACD_SETTINGS,
  RSI_LENGTH,
  SMA_COLORS,
  SMA_SMOOTHING_TYPES,
  SMA_SOURCES,
  TV_MACD_COLORS,
  TV_MACD_MA_TYPES,
  calculateCipherB,
  calculateCmMacd,
  calculateLaNwe,
  calculateSma,
  calculateTradingViewRsi,
  calculateTvMacd,
  normalizeCipherBSettings,
  normalizeCmMacdSettings,
  normalizeLaNweSettings,
  normalizeSmaSettings,
  normalizeTvMacdSettings,
  type CipherBSettings,
  type CmMacdSettings,
  type LaNweSettings,
  type SmaSettings,
  type TvMacdSettings,
} from './indicators'
import type { IndicatorVisibility } from './indicatorCatalog'
import { subscribeLiveCandles } from './klineSocket'
import { LastPriceCountdownPrimitive } from './lastPriceCountdown'
import { formatLastPrice } from './tickers'
import { LaNweSignalMarkersPrimitive } from './la_nweSignalMarkers'
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

type MacdPaneSeries = {
  histogram: ISeriesApi<'Histogram'>
  macd: ISeriesApi<'Line'>
  signal: ISeriesApi<'Line'>
  markers: ISeriesMarkersPluginApi<Time>
}

type TvMacdPaneSeries = {
  histogram: ISeriesApi<'Histogram'>
  macd: ISeriesApi<'Line'>
  signal: ISeriesApi<'Line'>
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

function rsiSeriesList(pane: RsiPaneSeries): Array<ISeriesApi<SeriesType>> {
  return [
    pane.bandTop,
    pane.bandBottom,
    pane.midUp,
    pane.midDown,
    pane.white,
    pane.upper,
    pane.lower,
    pane.series,
  ]
}

function cipherSeriesList(pane: CipherPaneSeries): Array<ISeriesApi<SeriesType>> {
  return [pane.wt1, pane.wt2, pane.diff]
}

function macdSeriesList(pane: MacdPaneSeries): Array<ISeriesApi<SeriesType>> {
  return [pane.histogram, pane.macd, pane.signal]
}

function tvMacdSeriesList(pane: TvMacdPaneSeries): Array<ISeriesApi<SeriesType>> {
  return [pane.histogram, pane.macd, pane.signal]
}

function moveGroupToPane(series: Array<ISeriesApi<SeriesType>>, paneIndex: number) {
  for (const item of series) {
    if (item.getPane().paneIndex() !== paneIndex) {
      item.moveToPane(paneIndex)
    }
  }
}

function ensurePaneCount(chart: IChartApi, count: number) {
  while (chart.panes().length < count) {
    chart.addPane(true)
  }
}

function layoutOscillatorPanes(
  chart: IChartApi,
  rsi: RsiPaneSeries | null,
  cipher: CipherPaneSeries | null,
  tvMacd: TvMacdPaneSeries | null,
  macd: MacdPaneSeries | null,
) {
  const groups: Array<Array<ISeriesApi<SeriesType>>> = []
  if (rsi) {
    groups.push(rsiSeriesList(rsi))
  }
  if (cipher) {
    groups.push(cipherSeriesList(cipher))
  }
  if (tvMacd) {
    groups.push(tvMacdSeriesList(tvMacd))
  }
  if (macd) {
    groups.push(macdSeriesList(macd))
  }

  pruneEmptyOscillatorPanes(chart)
  ensurePaneCount(chart, 1 + groups.length)

  for (let offset = groups.length - 1; offset >= 0; offset -= 1) {
    moveGroupToPane(groups[offset], 1 + offset)
  }

  pruneEmptyOscillatorPanes(chart)
  applyOscillatorPaneStretch(chart)
}

function appendOscillatorPaneIndex(chart: IChartApi): number {
  return chart.addPane(true).paneIndex()
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

function createMacdSeries(chart: IChartApi, paneIndex: number): MacdPaneSeries {
  const histogram = chart.addSeries(
    HistogramSeries,
    {
      color: CM_MACD_COLORS.histFlat,
      base: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'CM_Ult_MacD_MTF',
    },
    paneIndex,
  )
  const macd = chart.addSeries(
    LineSeries,
    {
      color: CM_MACD_COLORS.macdAbove,
      lineWidth: 4,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    },
    paneIndex,
  )
  const signal = chart.addSeries(
    LineSeries,
    {
      color: CM_MACD_COLORS.signalColorChange,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    },
    paneIndex,
  )

  histogram.createPriceLine({
    price: 0,
    color: CM_MACD_COLORS.zero,
    lineWidth: 2,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })

  return { histogram, macd, signal, markers: createSeriesMarkers(signal, []) }
}

function paintMacdSeries(
  pane: MacdPaneSeries,
  candles: Candle[],
  settings: CmMacdSettings,
  chartTimeframe: TimeframeId,
) {
  const points = calculateCmMacd(candles, settings, chartTimeframe)

  pane.histogram.setData(
    settings.showHistogram
      ? points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.hist,
          color: point.histColor,
        }))
      : [],
  )
  pane.macd.setData(
    settings.showMacdSignal
      ? points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.macd,
          color: point.macdColor,
        }))
      : [],
  )
  pane.signal.setData(
    settings.showMacdSignal
      ? points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.signal,
          color: point.signalColor,
        }))
      : [],
  )
  pane.markers.setMarkers(
    settings.showDots
      ? points.flatMap((point) =>
          point.cross
            ? [
                {
                  time: point.time as UTCTimestamp,
                  position: 'atPriceMiddle' as const,
                  shape: 'circle' as const,
                  color: point.macdColor,
                  size: 2,
                  price: point.signal,
                },
              ]
            : [],
        )
      : [],
  )
}

function removeMacdSeries(chart: IChartApi, pane: MacdPaneSeries) {
  pane.markers.detach()
  chart.removeSeries(pane.histogram)
  chart.removeSeries(pane.macd)
  chart.removeSeries(pane.signal)
}

function createTvMacdSeries(chart: IChartApi, paneIndex: number): TvMacdPaneSeries {
  const histogram = chart.addSeries(
    HistogramSeries,
    {
      color: TV_MACD_COLORS.histUpStrong,
      base: 0,
      priceLineVisible: false,
      lastValueVisible: false,
      title: 'MACD',
    },
    paneIndex,
  )
  const macd = chart.addSeries(
    LineSeries,
    {
      color: TV_MACD_COLORS.macd,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
    },
    paneIndex,
  )
  const signal = chart.addSeries(
    LineSeries,
    {
      color: TV_MACD_COLORS.signal,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    },
    paneIndex,
  )

  histogram.createPriceLine({
    price: 0,
    color: TV_MACD_COLORS.zero,
    lineWidth: 1,
    lineStyle: LineStyle.Solid,
    axisLabelVisible: true,
    title: '',
  })

  return { histogram, macd, signal }
}

function paintTvMacdSeries(pane: TvMacdPaneSeries, candles: Candle[], settings: TvMacdSettings) {
  const points = calculateTvMacd(candles, settings)
  pane.histogram.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.hist,
      color: point.histColor,
    })),
  )
  pane.macd.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.macd,
    })),
  )
  pane.signal.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.signal,
    })),
  )
}

function removeTvMacdSeries(chart: IChartApi, pane: TvMacdPaneSeries) {
  chart.removeSeries(pane.histogram)
  chart.removeSeries(pane.macd)
  chart.removeSeries(pane.signal)
}

function paintSmaOverlay(
  series: {
    ma: ISeriesApi<'Line'>
    smoothing: ISeriesApi<'Line'>
    bbUpper: ISeriesApi<'Line'>
    bbLower: ISeriesApi<'Line'>
  },
  candles: Candle[],
  settings: SmaSettings,
) {
  const points = calculateSma(candles, settings)
  series.ma.setData(
    points.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.sma,
    })),
  )
  series.smoothing.setData(
    points.map((point) =>
      point.smoothing === null
        ? { time: point.time as UTCTimestamp }
        : { time: point.time as UTCTimestamp, value: point.smoothing },
    ),
  )
  series.bbUpper.setData(
    points.map((point) =>
      point.bbUpper === null
        ? { time: point.time as UTCTimestamp }
        : { time: point.time as UTCTimestamp, value: point.bbUpper },
    ),
  )
  series.bbLower.setData(
    points.map((point) =>
      point.bbLower === null
        ? { time: point.time as UTCTimestamp }
        : { time: point.time as UTCTimestamp, value: point.bbLower },
    ),
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

function candleChange(candle: Candle, candles: Candle[]) {
  const index = candles.findIndex((item) => item.time === candle.time)
  const previous = index > 0 ? candles[index - 1] : null
  const base = previous?.close ?? candle.open
  const delta = candle.close - base
  const percent = base === 0 ? 0 : (delta / base) * 100
  return { delta, percent, up: candle.close >= candle.open }
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
  const macdHistogramRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdMarkersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const tvMacdHistogramRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const tvMacdLineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const tvMacdSignalRef = useRef<ISeriesApi<'Line'> | null>(null)
  const la_nweUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const la_nweLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const smaMaRef = useRef<ISeriesApi<'Line'> | null>(null)
  const smaSmoothingRef = useRef<ISeriesApi<'Line'> | null>(null)
  const smaBbUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const smaBbLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const la_nweMarkersRef = useRef<LaNweSignalMarkersPrimitive | null>(null)
  const candlesRef = useRef<Candle[]>([])
  const countdownRef = useRef<LastPriceCountdownPrimitive | null>(null)
  const initialRangeRef = useRef<LogicalRange | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null)
  const [settingsOpen, setSettingsOpen] = useState<
    null | 'rsi' | 'la_nwe' | 'cipherB' | 'macd' | 'cmMacd' | 'sma'
  >(null)
  const [rsiSettings, setRsiSettings] = useState<RsiSettings>(DEFAULT_RSI_SETTINGS)
  const [draftRsiSettings, setDraftRsiSettings] = useState<RsiSettings>(DEFAULT_RSI_SETTINGS)
  const [la_nweSettings, setLaNweSettings] = useState<LaNweSettings>(DEFAULT_LA_NWE_SETTINGS)
  const [draftLaNweSettings, setDraftLaNweSettings] = useState<LaNweSettings>(DEFAULT_LA_NWE_SETTINGS)
  const [cipherSettings, setCipherSettings] = useState<CipherBSettings>(DEFAULT_CIPHER_B_SETTINGS)
  const [draftCipherSettings, setDraftCipherSettings] = useState<CipherBSettings>(DEFAULT_CIPHER_B_SETTINGS)
  const [macdSettings, setMacdSettings] = useState<CmMacdSettings>(DEFAULT_CM_MACD_SETTINGS)
  const [draftMacdSettings, setDraftMacdSettings] = useState<CmMacdSettings>(DEFAULT_CM_MACD_SETTINGS)
  const [tvMacdSettings, setTvMacdSettings] = useState<TvMacdSettings>(DEFAULT_TV_MACD_SETTINGS)
  const [draftTvMacdSettings, setDraftTvMacdSettings] = useState<TvMacdSettings>(DEFAULT_TV_MACD_SETTINGS)
  const [smaSettings, setSmaSettings] = useState<SmaSettings>(DEFAULT_SMA_SETTINGS)
  const [draftSmaSettings, setDraftSmaSettings] = useState<SmaSettings>(DEFAULT_SMA_SETTINGS)
  const indicatorVisibilityRef = useRef(indicatorVisibility)
  const la_nweSettingsRef = useRef(la_nweSettings)
  const rsiSettingsRef = useRef(rsiSettings)
  const cipherSettingsRef = useRef(cipherSettings)
  const macdSettingsRef = useRef(macdSettings)
  const tvMacdSettingsRef = useRef(tvMacdSettings)
  const smaSettingsRef = useRef(smaSettings)
  const timeframeRef = useRef(timeframe)
  indicatorVisibilityRef.current = indicatorVisibility
  la_nweSettingsRef.current = la_nweSettings
  rsiSettingsRef.current = rsiSettings
  cipherSettingsRef.current = cipherSettings
  macdSettingsRef.current = macdSettings
  tvMacdSettingsRef.current = tvMacdSettings
  smaSettingsRef.current = smaSettings
  timeframeRef.current = timeframe

  const getRsiPane = (): RsiPaneSeries | null => {
    const series = rsiSeriesRef.current
    const bandTop = rsiBandTopRef.current
    const bandBottom = rsiBandBottomRef.current
    const midUp = rsiMidUpRef.current
    const midDown = rsiMidDownRef.current
    const white = rsiWhiteRef.current
    const upper = rsiUpperRef.current
    const lower = rsiLowerRef.current
    if (!series || !bandTop || !bandBottom || !midUp || !midDown || !white || !upper || !lower) {
      return null
    }
    return { series, bandTop, bandBottom, midUp, midDown, white, upper, lower }
  }

  const getCipherPane = (): CipherPaneSeries | null => {
    const wt1 = cipherWt1Ref.current
    const wt2 = cipherWt2Ref.current
    const diff = cipherDiffRef.current
    const markers = cipherMarkersRef.current
    if (!wt1 || !wt2 || !diff || !markers) {
      return null
    }
    return { wt1, wt2, diff, markers }
  }

  const getMacdPane = (): MacdPaneSeries | null => {
    const histogram = macdHistogramRef.current
    const macd = macdLineRef.current
    const signal = macdSignalRef.current
    const markers = macdMarkersRef.current
    if (!histogram || !macd || !signal || !markers) {
      return null
    }
    return { histogram, macd, signal, markers }
  }

  const getTvMacdPane = (): TvMacdPaneSeries | null => {
    const histogram = tvMacdHistogramRef.current
    const macd = tvMacdLineRef.current
    const signal = tvMacdSignalRef.current
    if (!histogram || !macd || !signal) {
      return null
    }
    return { histogram, macd, signal }
  }

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
    const macdSeries = macdHistogramRef.current
    if (!chart || !initialRange || !series) {
      return
    }

    chart.timeScale().setVisibleLogicalRange(initialRange)
    requestAnimationFrame(() => {
      series.priceScale().applyOptions({ autoScale: true })
      rsiSeries?.priceScale().applyOptions({ autoScale: true })
      cipherSeries?.priceScale().applyOptions({ autoScale: true })
      tvMacdHistogramRef.current?.priceScale().applyOptions({ autoScale: true })
      macdSeries?.priceScale().applyOptions({ autoScale: true })
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
        minBarSpacing: 10,
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
    const la_nweMarkers = new LaNweSignalMarkersPrimitive()
    series.attachPrimitive(la_nweMarkers)
    seriesRef.current = series
    countdownRef.current = countdown
    la_nweMarkersRef.current = la_nweMarkers

    const la_nweUpper = chart.addSeries(LineSeries, {
      color: '#00897b',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    const la_nweLower = chart.addSeries(LineSeries, {
      color: '#f23645',
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    la_nweUpperRef.current = la_nweUpper
    la_nweLowerRef.current = la_nweLower

    const smaLineOptions = {
      lineWidth: 2 as const,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: false,
    }
    const smaMa = chart.addSeries(LineSeries, {
      ...smaLineOptions,
      color: SMA_COLORS.ma,
      lastValueVisible: true,
      title: 'SMA',
    })
    const smaSmoothing = chart.addSeries(LineSeries, {
      ...smaLineOptions,
      color: SMA_COLORS.smoothing,
    })
    const smaBbUpper = chart.addSeries(LineSeries, {
      ...smaLineOptions,
      color: SMA_COLORS.band,
    })
    const smaBbLower = chart.addSeries(LineSeries, {
      ...smaLineOptions,
      color: SMA_COLORS.band,
    })
    smaMaRef.current = smaMa
    smaSmoothingRef.current = smaSmoothing
    smaBbUpperRef.current = smaBbUpper
    smaBbLowerRef.current = smaBbLower
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
      macdHistogramRef.current = null
      macdLineRef.current = null
      macdSignalRef.current = null
      macdMarkersRef.current = null
      tvMacdHistogramRef.current = null
      tvMacdLineRef.current = null
      tvMacdSignalRef.current = null
      la_nweUpperRef.current = null
      la_nweLowerRef.current = null
      smaMaRef.current = null
      smaSmoothingRef.current = null
      smaBbUpperRef.current = null
      smaBbLowerRef.current = null
      la_nweMarkersRef.current = null
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
    const chart = chartRef.current
    if (!chartReady || !chart || !indicatorVisibility.rsi) {
      return
    }

    const pane = createRsiSeries(chart, rsiSettings, appendOscillatorPaneIndex(chart))
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
    layoutOscillatorPanes(chart, pane, getCipherPane(), getTvMacdPane(), getMacdPane())

    return () => {
      const activeChart = chartRef.current
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
      if (activeChart) {
        removeRsiSeries(activeChart, pane)
        layoutOscillatorPanes(activeChart, null, getCipherPane(), getTvMacdPane(), getMacdPane())
      }
    }
  }, [chartReady, indicatorVisibility.rsi, rsiSettings])

  useEffect(() => {
    const chart = chartRef.current
    if (!chartReady || !chart || !indicatorVisibility.cipherB) {
      return
    }

    const pane = createCipherBSeries(chart, cipherSettings, appendOscillatorPaneIndex(chart))
    cipherWt1Ref.current = pane.wt1
    cipherWt2Ref.current = pane.wt2
    cipherDiffRef.current = pane.diff
    cipherMarkersRef.current = pane.markers
    if (candlesRef.current.length > 0) {
      paintCipherBSeries(pane, candlesRef.current, cipherSettings)
    }
    layoutOscillatorPanes(chart, getRsiPane(), pane, getTvMacdPane(), getMacdPane())

    return () => {
      const activeChart = chartRef.current
      if (cipherWt1Ref.current === pane.wt1) {
        cipherWt1Ref.current = null
        cipherWt2Ref.current = null
        cipherDiffRef.current = null
        cipherMarkersRef.current = null
      }
      if (activeChart) {
        removeCipherBSeries(activeChart, pane)
        layoutOscillatorPanes(activeChart, getRsiPane(), null, getTvMacdPane(), getMacdPane())
      }
    }
  }, [chartReady, indicatorVisibility.cipherB, cipherSettings])

  useEffect(() => {
    const chart = chartRef.current
    if (!chartReady || !chart || !indicatorVisibility.macd) {
      return
    }

    const pane = createTvMacdSeries(chart, appendOscillatorPaneIndex(chart))
    tvMacdHistogramRef.current = pane.histogram
    tvMacdLineRef.current = pane.macd
    tvMacdSignalRef.current = pane.signal
    if (candlesRef.current.length > 0) {
      paintTvMacdSeries(pane, candlesRef.current, tvMacdSettings)
    }
    layoutOscillatorPanes(chart, getRsiPane(), getCipherPane(), pane, getMacdPane())

    return () => {
      const activeChart = chartRef.current
      if (tvMacdHistogramRef.current === pane.histogram) {
        tvMacdHistogramRef.current = null
        tvMacdLineRef.current = null
        tvMacdSignalRef.current = null
      }
      if (activeChart) {
        removeTvMacdSeries(activeChart, pane)
        layoutOscillatorPanes(activeChart, getRsiPane(), getCipherPane(), null, getMacdPane())
      }
    }
  }, [chartReady, indicatorVisibility.macd, tvMacdSettings])

  useEffect(() => {
    const chart = chartRef.current
    if (!chartReady || !chart || !indicatorVisibility.cmMacd) {
      return
    }

    const pane = createMacdSeries(chart, appendOscillatorPaneIndex(chart))
    macdHistogramRef.current = pane.histogram
    macdLineRef.current = pane.macd
    macdSignalRef.current = pane.signal
    macdMarkersRef.current = pane.markers
    if (candlesRef.current.length > 0) {
      paintMacdSeries(pane, candlesRef.current, macdSettings, timeframeRef.current)
    }
    layoutOscillatorPanes(chart, getRsiPane(), getCipherPane(), getTvMacdPane(), pane)

    return () => {
      const activeChart = chartRef.current
      if (macdHistogramRef.current === pane.histogram) {
        macdHistogramRef.current = null
        macdLineRef.current = null
        macdSignalRef.current = null
        macdMarkersRef.current = null
      }
      if (activeChart) {
        removeMacdSeries(activeChart, pane)
        layoutOscillatorPanes(activeChart, getRsiPane(), getCipherPane(), getTvMacdPane(), null)
      }
    }
  }, [chartReady, indicatorVisibility.cmMacd, macdSettings])

  useEffect(() => {
    const series = seriesRef.current
    const la_nweUpper = la_nweUpperRef.current
    const la_nweLower = la_nweLowerRef.current
    const la_nweMarkers = la_nweMarkersRef.current
    const smaMa = smaMaRef.current
    const smaSmoothing = smaSmoothingRef.current
    const smaBbUpper = smaBbUpperRef.current
    const smaBbLower = smaBbLowerRef.current
    if (
      !series ||
      !la_nweUpper ||
      !la_nweLower ||
      !la_nweMarkers ||
      !smaMa ||
      !smaSmoothing ||
      !smaBbUpper ||
      !smaBbLower
    ) {
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

    const readMacdPane = (): MacdPaneSeries | null => {
      const histogram = macdHistogramRef.current
      const macd = macdLineRef.current
      const signal = macdSignalRef.current
      const markers = macdMarkersRef.current
      if (!histogram || !macd || !signal || !markers) {
        return null
      }
      return { histogram, macd, signal, markers }
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

    const paintMacd = (candles: Candle[]) => {
      const pane = readMacdPane()
      if (!indicatorVisibilityRef.current.cmMacd || !pane) {
        return
      }
      paintMacdSeries(pane, candles, macdSettingsRef.current, timeframeRef.current)
    }

    const paintTvMacd = (candles: Candle[]) => {
      const histogram = tvMacdHistogramRef.current
      const macd = tvMacdLineRef.current
      const signal = tvMacdSignalRef.current
      if (!indicatorVisibilityRef.current.macd || !histogram || !macd || !signal) {
        return
      }
      paintTvMacdSeries({ histogram, macd, signal }, candles, tvMacdSettingsRef.current)
    }

    const paintLaNwe = (candles: Candle[]) => {
      if (!indicatorVisibilityRef.current.la_nwe) {
        la_nweMarkers.setMarkers([])
        return
      }

      const result = calculateLaNwe(candles, la_nweSettingsRef.current)
      la_nweUpper.setData(
        result.points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.upper,
        })),
      )
      la_nweLower.setData(
        result.points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.lower,
        })),
      )
      la_nweMarkers.setMarkers(
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

    const paintSma = (candles: Candle[]) => {
      if (!indicatorVisibilityRef.current.sma) {
        smaMa.setData([])
        smaSmoothing.setData([])
        smaBbUpper.setData([])
        smaBbLower.setData([])
        return
      }
      paintSmaOverlay(
        { ma: smaMa, smoothing: smaSmoothing, bbUpper: smaBbUpper, bbLower: smaBbLower },
        candles,
        smaSettingsRef.current,
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
      paintTvMacd(candles)
      paintMacd(candles)
      paintLaNwe(candles)
      paintSma(candles)
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
      paintTvMacd(candles)
      paintMacd(candles)
      paintLaNwe(candles)
      paintSma(candles)
      const last = candles.at(-1) ?? null
      setHoverCandle((current) => {
        if (!current || !last || current.time === last.time) {
          return last
        }
        return current
      })
    }

    void fetchCandles(pair, timeframe, controller.signal)
      .then((history) => {
        if (closed || controller.signal.aborted || seriesRef.current !== series) {
          return
        }

        const candles = [...history]
        candlesRef.current = candles
        paintHistory(candles)
        setHoverCandle(candles.at(-1) ?? null)
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
    const la_nweUpper = la_nweUpperRef.current
    const la_nweLower = la_nweLowerRef.current
    const la_nweMarkers = la_nweMarkersRef.current
    const candles = candlesRef.current
    if (!la_nweUpper || !la_nweLower || !la_nweMarkers || candles.length === 0) {
      return
    }

    const result = calculateLaNwe(candles, la_nweSettings)
    la_nweUpper.setData(
      result.points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.upper,
      })),
    )
    la_nweLower.setData(
      result.points.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.lower,
      })),
    )
    la_nweMarkers.setMarkers(
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
  }, [la_nweSettings, chartReady, indicatorVisibility])

  useEffect(() => {
    const smaMa = smaMaRef.current
    const smaSmoothing = smaSmoothingRef.current
    const smaBbUpper = smaBbUpperRef.current
    const smaBbLower = smaBbLowerRef.current
    const candles = candlesRef.current
    if (!smaMa || !smaSmoothing || !smaBbUpper || !smaBbLower) {
      return
    }

    const visible = indicatorVisibility.sma
    smaMa.applyOptions({ visible })
    smaSmoothing.applyOptions({ visible: visible && smaSettings.smoothingType !== 'None' })
    const showBands = visible && smaSettings.smoothingType === 'SMA + Bollinger Bands'
    smaBbUpper.applyOptions({ visible: showBands })
    smaBbLower.applyOptions({ visible: showBands })

    if (!visible || candles.length === 0) {
      if (!visible) {
        smaMa.setData([])
        smaSmoothing.setData([])
        smaBbUpper.setData([])
        smaBbLower.setData([])
      }
      return
    }

    paintSmaOverlay(
      { ma: smaMa, smoothing: smaSmoothing, bbUpper: smaBbUpper, bbLower: smaBbLower },
      candles,
      smaSettings,
    )
  }, [smaSettings, chartReady, indicatorVisibility])

  useEffect(() => {
    countdownRef.current?.setTimeframe(timeframe)
  }, [timeframe, chartReady])

  useEffect(() => {
    if (
      (settingsOpen === 'rsi' && !indicatorVisibility.rsi) ||
      (settingsOpen === 'la_nwe' && !indicatorVisibility.la_nwe) ||
      (settingsOpen === 'cipherB' && !indicatorVisibility.cipherB) ||
      (settingsOpen === 'macd' && !indicatorVisibility.macd) ||
      (settingsOpen === 'cmMacd' && !indicatorVisibility.cmMacd) ||
      (settingsOpen === 'sma' && !indicatorVisibility.sma)
    ) {
      setSettingsOpen(null)
    }
  }, [indicatorVisibility, settingsOpen])

  useEffect(() => {
    const la_nweVisible = indicatorVisibility.la_nwe
    la_nweUpperRef.current?.applyOptions({ visible: la_nweVisible })
    la_nweLowerRef.current?.applyOptions({ visible: la_nweVisible })

    const candles = candlesRef.current
    const la_nweMarkers = la_nweMarkersRef.current
    if (!la_nweMarkers) {
      return
    }

    if (!la_nweVisible) {
      la_nweMarkers.setMarkers([])
      return
    }

    if (candles.length === 0) {
      return
    }

    const result = calculateLaNwe(candles, la_nweSettingsRef.current)
    la_nweMarkers.setMarkers(
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

  const updateDraftLaNweSetting = (key: 'bandwidth' | 'multiplier' | 'lookback', value: string) => {
    setDraftLaNweSettings((current) => ({
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

  const updateDraftMacdNumber = (
    key: 'fastLength' | 'slowLength' | 'signalLength',
    value: string,
  ) => {
    setDraftMacdSettings((current) => ({
      ...current,
      [key]: Number(value),
    }))
  }

  const openRsiSettings = () => {
    setDraftRsiSettings(rsiSettings)
    setSettingsOpen('rsi')
  }

  const openLaNweSettings = () => {
    setDraftLaNweSettings(la_nweSettings)
    setSettingsOpen('la_nwe')
  }

  const openCipherSettings = () => {
    setDraftCipherSettings(cipherSettings)
    setSettingsOpen('cipherB')
  }

  const openTvMacdSettings = () => {
    setDraftTvMacdSettings(tvMacdSettings)
    setSettingsOpen('macd')
  }

  const openMacdSettings = () => {
    setDraftMacdSettings(macdSettings)
    setSettingsOpen('cmMacd')
  }

  const openSmaSettings = () => {
    setDraftSmaSettings(smaSettings)
    setSettingsOpen('sma')
  }

  const applySettings = () => {
    if (settingsOpen === 'rsi') {
      const next = normalizeRsiSettings(draftRsiSettings)
      setDraftRsiSettings(next)
      setRsiSettings(next)
    }
    if (settingsOpen === 'la_nwe') {
      const next = normalizeLaNweSettings(draftLaNweSettings)
      setDraftLaNweSettings(next)
      setLaNweSettings(next)
    }
    if (settingsOpen === 'cipherB') {
      const next = normalizeCipherBSettings(draftCipherSettings)
      setDraftCipherSettings(next)
      setCipherSettings(next)
    }
    if (settingsOpen === 'macd') {
      const next = normalizeTvMacdSettings(draftTvMacdSettings)
      setDraftTvMacdSettings(next)
      setTvMacdSettings(next)
    }
    if (settingsOpen === 'cmMacd') {
      const next = normalizeCmMacdSettings(draftMacdSettings)
      setDraftMacdSettings(next)
      setMacdSettings(next)
    }
    if (settingsOpen === 'sma') {
      const next = normalizeSmaSettings(draftSmaSettings)
      setDraftSmaSettings(next)
      setSmaSettings(next)
    }
    setSettingsOpen(null)
  }

  const resetSettings = () => {
    if (settingsOpen === 'rsi') {
      setDraftRsiSettings(DEFAULT_RSI_SETTINGS)
    }
    if (settingsOpen === 'la_nwe') {
      setDraftLaNweSettings(DEFAULT_LA_NWE_SETTINGS)
    }
    if (settingsOpen === 'cipherB') {
      setDraftCipherSettings(DEFAULT_CIPHER_B_SETTINGS)
    }
    if (settingsOpen === 'macd') {
      setDraftTvMacdSettings(DEFAULT_TV_MACD_SETTINGS)
    }
    if (settingsOpen === 'cmMacd') {
      setDraftMacdSettings(DEFAULT_CM_MACD_SETTINGS)
    }
    if (settingsOpen === 'sma') {
      setDraftSmaSettings(DEFAULT_SMA_SETTINGS)
    }
  }

  const oscillatorStack = (id: 'rsi' | 'cipherB' | 'macd' | 'cmMacd') => {
    const order = ['rsi', 'cipherB', 'macd', 'cmMacd'] as const
    const start = order.indexOf(id)
    return order.slice(start + 1).filter((item) => indicatorVisibility[item]).length
  }

  const oscillatorStackClass = (kind: 'indicator-gear' | 'settings', count: number) => {
    if (count >= 3) {
      return `bitcoin-chart__${kind}--stack-3`
    }
    if (count === 2) {
      return `bitcoin-chart__${kind}--stack-2`
    }
    if (count === 1) {
      return `bitcoin-chart__${kind}--stack-1`
    }
    return ''
  }

  const hoverStats = hoverCandle ? candleChange(hoverCandle, candlesRef.current) : null

  return (
    <div className="bitcoin-chart">
      <div className="bitcoin-chart__header">
        <div className="bitcoin-chart__legend">
          <span className="bitcoin-chart__title">
            {pair.symbol} · {TIMEFRAMES.find((item) => item.id === timeframe)?.label ?? timeframe}
          </span>
          {hoverCandle && hoverStats ? (
            <span className={hoverStats.up ? 'bitcoin-chart__ohlc is-up' : 'bitcoin-chart__ohlc is-down'}>
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
              <span className="bitcoin-chart__ohlc-change">
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
        </div>
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
        {indicatorVisibility.sma ? (
          <button
            type="button"
            className="bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--sma"
            onClick={openSmaSettings}
            aria-label="SMA settings"
            title="SMA settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.la_nwe ? (
          <button
            type="button"
            className={
              indicatorVisibility.sma
                ? 'bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--la_nwe bitcoin-chart__indicator-gear--la_nwe-below-sma'
                : 'bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--la_nwe'
            }
            onClick={openLaNweSettings}
            aria-label="Nadaraya-Watson Envelope settings"
            title="Nadaraya-Watson Envelope settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.rsi ? (
          <button
            type="button"
            className={[
              'bitcoin-chart__indicator-gear',
              'bitcoin-chart__indicator-gear--rsi',
              oscillatorStackClass('indicator-gear', oscillatorStack('rsi')),
            ]
              .filter(Boolean)
              .join(' ')}
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
            className={[
              'bitcoin-chart__indicator-gear',
              'bitcoin-chart__indicator-gear--cipher',
              oscillatorStackClass('indicator-gear', oscillatorStack('cipherB')),
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={openCipherSettings}
            aria-label="Cipher_B_free settings"
            title="Cipher_B_free settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.macd ? (
          <button
            type="button"
            className={[
              'bitcoin-chart__indicator-gear',
              'bitcoin-chart__indicator-gear--tv-macd',
              oscillatorStackClass('indicator-gear', oscillatorStack('macd')),
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={openTvMacdSettings}
            aria-label="MACD settings"
            title="MACD settings"
          >
            ⚙
          </button>
        ) : null}
        {indicatorVisibility.cmMacd ? (
          <button
            type="button"
            className="bitcoin-chart__indicator-gear bitcoin-chart__indicator-gear--macd"
            onClick={openMacdSettings}
            aria-label="CM_Ult_MacD_MTF settings"
            title="CM_Ult_MacD_MTF settings"
          >
            ⚙
          </button>
        ) : null}
        {settingsOpen === 'rsi' ? (
          <div
            className={[
              'bitcoin-chart__settings',
              'bitcoin-chart__settings--rsi',
              oscillatorStackClass('settings', oscillatorStack('rsi')),
            ]
              .filter(Boolean)
              .join(' ')}
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
        {settingsOpen === 'la_nwe' ? (
          <div
            className={
              indicatorVisibility.sma
                ? 'bitcoin-chart__settings bitcoin-chart__settings--la_nwe bitcoin-chart__settings--la_nwe-below-sma'
                : 'bitcoin-chart__settings bitcoin-chart__settings--la_nwe'
            }
          >
            <p className="bitcoin-chart__settings-title">Nadaraya-Watson Envelope</p>
            <div className="bitcoin-chart__settings-grid">
              <label>
                <span>Bandwidth</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={draftLaNweSettings.bandwidth}
                  onChange={(event) => updateDraftLaNweSetting('bandwidth', event.target.value)}
                />
              </label>
              <label>
                <span>Multiplier</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={draftLaNweSettings.multiplier}
                  onChange={(event) => updateDraftLaNweSetting('multiplier', event.target.value)}
                />
              </label>
              <label>
                <span>Lookback</span>
                <input
                  type="number"
                  min="2"
                  max="2000"
                  value={draftLaNweSettings.lookback}
                  onChange={(event) => updateDraftLaNweSetting('lookback', event.target.value)}
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>Repainting smoothing</span>
                <input
                  type="checkbox"
                  checked={draftLaNweSettings.repaint}
                  onChange={(event) =>
                    setDraftLaNweSettings((current) => ({
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
        {settingsOpen === 'sma' ? (
          <div className="bitcoin-chart__settings bitcoin-chart__settings--sma">
            <p className="bitcoin-chart__settings-title">SMA</p>
            <div className="bitcoin-chart__settings-grid">
              <label>
                <span>Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftSmaSettings.length}
                  onChange={(event) =>
                    setDraftSmaSettings((current) => ({
                      ...current,
                      length: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Source</span>
                <select
                  value={draftSmaSettings.source}
                  onChange={(event) =>
                    setDraftSmaSettings((current) => ({
                      ...current,
                      source: event.target.value as (typeof SMA_SOURCES)[number],
                    }))
                  }
                >
                  {SMA_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Offset</span>
                <input
                  type="number"
                  min="-500"
                  max="500"
                  value={draftSmaSettings.offset}
                  onChange={(event) =>
                    setDraftSmaSettings((current) => ({
                      ...current,
                      offset: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Smoothing type</span>
                <select
                  value={draftSmaSettings.smoothingType}
                  onChange={(event) =>
                    setDraftSmaSettings((current) => ({
                      ...current,
                      smoothingType: event.target.value as (typeof SMA_SMOOTHING_TYPES)[number],
                    }))
                  }
                >
                  {SMA_SMOOTHING_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Smoothing length</span>
                <input
                  type="number"
                  min="1"
                  disabled={draftSmaSettings.smoothingType === 'None'}
                  value={draftSmaSettings.smoothingLength}
                  onChange={(event) =>
                    setDraftSmaSettings((current) => ({
                      ...current,
                      smoothingLength: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>BB StdDev</span>
                <input
                  type="number"
                  min="0.001"
                  max="50"
                  step="0.5"
                  disabled={draftSmaSettings.smoothingType !== 'SMA + Bollinger Bands'}
                  value={draftSmaSettings.bbStdDev}
                  onChange={(event) =>
                    setDraftSmaSettings((current) => ({
                      ...current,
                      bbStdDev: Number(event.target.value),
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
          <div
            className={[
              'bitcoin-chart__settings',
              'bitcoin-chart__settings--cipher',
              oscillatorStackClass('settings', oscillatorStack('cipherB')),
            ]
              .filter(Boolean)
              .join(' ')}
          >
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
        {settingsOpen === 'macd' ? (
          <div
            className={[
              'bitcoin-chart__settings',
              'bitcoin-chart__settings--tv-macd',
              oscillatorStackClass('settings', oscillatorStack('macd')),
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <p className="bitcoin-chart__settings-title">MACD</p>
            <div className="bitcoin-chart__settings-grid">
              <label>
                <span>Source</span>
                <select
                  value={draftTvMacdSettings.source}
                  onChange={(event) =>
                    setDraftTvMacdSettings((current) => ({
                      ...current,
                      source: event.target.value as (typeof SMA_SOURCES)[number],
                    }))
                  }
                >
                  {SMA_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fast length</span>
                <input
                  type="number"
                  min="1"
                  value={draftTvMacdSettings.fastLength}
                  onChange={(event) =>
                    setDraftTvMacdSettings((current) => ({
                      ...current,
                      fastLength: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Slow length</span>
                <input
                  type="number"
                  min="1"
                  value={draftTvMacdSettings.slowLength}
                  onChange={(event) =>
                    setDraftTvMacdSettings((current) => ({
                      ...current,
                      slowLength: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Signal length</span>
                <input
                  type="number"
                  min="1"
                  value={draftTvMacdSettings.signalLength}
                  onChange={(event) =>
                    setDraftTvMacdSettings((current) => ({
                      ...current,
                      signalLength: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                <span>Oscillator MA type</span>
                <select
                  value={draftTvMacdSettings.oscillatorType}
                  onChange={(event) =>
                    setDraftTvMacdSettings((current) => ({
                      ...current,
                      oscillatorType: event.target.value as (typeof TV_MACD_MA_TYPES)[number],
                    }))
                  }
                >
                  {TV_MACD_MA_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Signal MA type</span>
                <select
                  value={draftTvMacdSettings.signalType}
                  onChange={(event) =>
                    setDraftTvMacdSettings((current) => ({
                      ...current,
                      signalType: event.target.value as (typeof TV_MACD_MA_TYPES)[number],
                    }))
                  }
                >
                  {TV_MACD_MA_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
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
        {settingsOpen === 'cmMacd' ? (
          <div className="bitcoin-chart__settings bitcoin-chart__settings--macd">
            <p className="bitcoin-chart__settings-title">CM_Ult_MacD_MTF</p>
            <div className="bitcoin-chart__settings-grid">
              <label className="bitcoin-chart__settings-check">
                <span>Use Current Chart Resolution?</span>
                <input
                  type="checkbox"
                  checked={draftMacdSettings.useCurrentRes}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      useCurrentRes: event.target.checked,
                    }))
                  }
                />
              </label>
              <label>
                <span>Use Different Timeframe?</span>
                <select
                  value={draftMacdSettings.resCustom}
                  disabled={draftMacdSettings.useCurrentRes}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      resCustom: event.target.value as TimeframeId,
                    }))
                  }
                >
                  {TIMEFRAMES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fast Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftMacdSettings.fastLength}
                  onChange={(event) => updateDraftMacdNumber('fastLength', event.target.value)}
                />
              </label>
              <label>
                <span>Slow Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftMacdSettings.slowLength}
                  onChange={(event) => updateDraftMacdNumber('slowLength', event.target.value)}
                />
              </label>
              <label>
                <span>Signal Length</span>
                <input
                  type="number"
                  min="1"
                  value={draftMacdSettings.signalLength}
                  onChange={(event) => updateDraftMacdNumber('signalLength', event.target.value)}
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>Show MacD & Signal Line?</span>
                <input
                  type="checkbox"
                  checked={draftMacdSettings.showMacdSignal}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      showMacdSignal: event.target.checked,
                    }))
                  }
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>Show Dots When MacD Crosses Signal Line?</span>
                <input
                  type="checkbox"
                  checked={draftMacdSettings.showDots}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      showDots: event.target.checked,
                    }))
                  }
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>Show Histogram?</span>
                <input
                  type="checkbox"
                  checked={draftMacdSettings.showHistogram}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      showHistogram: event.target.checked,
                    }))
                  }
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>Change MacD Line Color-Signal Line Cross?</span>
                <input
                  type="checkbox"
                  checked={draftMacdSettings.macdColorChange}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      macdColorChange: event.target.checked,
                    }))
                  }
                />
              </label>
              <label className="bitcoin-chart__settings-check">
                <span>MacD Histogram 4 Colors?</span>
                <input
                  type="checkbox"
                  checked={draftMacdSettings.histColorChange}
                  onChange={(event) =>
                    setDraftMacdSettings((current) => ({
                      ...current,
                      histColorChange: event.target.checked,
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
