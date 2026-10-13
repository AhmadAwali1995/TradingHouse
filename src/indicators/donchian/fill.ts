import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { DC_COLORS } from './donchian'

export type DonchianBand = {
  time: UTCTimestamp
  upper: number
  lower: number
}

class DonchianFillRenderer implements IPrimitivePaneRenderer {
  private readonly source: DonchianFillPrimitive

  constructor(source: DonchianFillPrimitive) {
    this.source = source
  }

  draw(target: CanvasRenderingTarget2D) {
    const chart = this.source.chart
    const series = this.source.series
    const bands = this.source.bands
    if (!chart || !series || bands.length < 2) {
      return
    }

    const upper: Array<{ x: number; y: number }> = []
    const lower: Array<{ x: number; y: number }> = []
    for (const band of bands) {
      const x = chart.timeScale().timeToCoordinate(band.time)
      const upperY = series.priceToCoordinate(band.upper)
      const lowerY = series.priceToCoordinate(band.lower)
      if (x === null || upperY === null || lowerY === null) {
        continue
      }
      upper.push({ x, y: upperY })
      lower.push({ x, y: lowerY })
    }

    if (upper.length < 2) {
      return
    }

    target.useMediaCoordinateSpace(({ context }) => {
      context.beginPath()
      context.moveTo(upper[0].x, upper[0].y)
      for (let index = 1; index < upper.length; index += 1) {
        context.lineTo(upper[index].x, upper[index].y)
      }
      for (let index = lower.length - 1; index >= 0; index -= 1) {
        context.lineTo(lower[index].x, lower[index].y)
      }
      context.closePath()
      context.fillStyle = DC_COLORS.fill
      context.fill()
    })
  }
}

class DonchianFillPaneView implements IPrimitivePaneView {
  private readonly rendererImpl: DonchianFillRenderer

  constructor(source: DonchianFillPrimitive) {
    this.rendererImpl = new DonchianFillRenderer(source)
  }

  zOrder() {
    return 'bottom' as const
  }

  renderer() {
    return this.rendererImpl
  }
}

export class DonchianFillPrimitive implements ISeriesPrimitive<Time> {
  chart: IChartApi | null = null
  series: ISeriesApi<SeriesType> | null = null
  bands: DonchianBand[] = []
  private requestUpdate: (() => void) | null = null
  private readonly paneView: DonchianFillPaneView

  constructor() {
    this.paneView = new DonchianFillPaneView(this)
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.chart = param.chart
    this.series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached() {
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  setBands(bands: DonchianBand[]) {
    this.bands = bands
    this.requestUpdate?.()
  }

  updateAllViews() {}

  paneViews() {
    return [this.paneView]
  }
}
