import type {
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

export type RsiZonePoint = {
  time: number
  value: number
}

type ZoneLineState = {
  points: RsiZonePoint[]
  lowerBand: number
  upperBand: number
}

const INSIDE_COLOR = '#f3f4f6'
const OUTSIDE_COLOR = '#ff3b30'

class RsiZoneLineRenderer implements IPrimitivePaneRenderer {
  private readonly state: ZoneLineState
  private readonly series: ISeriesApi<SeriesType>
  private readonly timeToCoordinate: (time: Time) => number | null

  constructor(
    state: ZoneLineState,
    series: ISeriesApi<SeriesType>,
    timeToCoordinate: (time: Time) => number | null,
  ) {
    this.state = state
    this.series = series
    this.timeToCoordinate = timeToCoordinate
  }

  draw(target: CanvasRenderingTarget2D) {
    const { points, lowerBand, upperBand } = this.state
    if (points.length < 2) {
      return
    }

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      for (let index = 1; index < points.length; index += 1) {
        const left = points[index - 1]
        const right = points[index]
        const x1 = this.timeToCoordinate(left.time as UTCTimestamp)
        const x2 = this.timeToCoordinate(right.time as UTCTimestamp)
        const y1 = this.series.priceToCoordinate(left.value)
        const y2 = this.series.priceToCoordinate(right.value)
        if (x1 === null || x2 === null || y1 === null || y2 === null) {
          continue
        }

        const splits: Array<{ x: number; y: number; value: number }> = [
          { x: x1, y: y1, value: left.value },
        ]
        for (const threshold of [lowerBand, upperBand]) {
          const leftDistance = left.value - threshold
          const rightDistance = right.value - threshold
          if (leftDistance === 0 || rightDistance === 0 || leftDistance * rightDistance >= 0) {
            continue
          }
          const ratio = (threshold - left.value) / (right.value - left.value)
          const y = this.series.priceToCoordinate(threshold)
          splits.push({
            x: x1 + (x2 - x1) * ratio,
            y: y === null ? y1 + (y2 - y1) * ratio : y,
            value: threshold,
          })
        }
        splits.push({ x: x2, y: y2, value: right.value })
        splits.sort((first, second) => first.x - second.x)

        for (let splitIndex = 1; splitIndex < splits.length; splitIndex += 1) {
          const start = splits[splitIndex - 1]
          const end = splits[splitIndex]
          const middle = (start.value + end.value) / 2
          ctx.beginPath()
          ctx.strokeStyle = middle < lowerBand || middle > upperBand ? OUTSIDE_COLOR : INSIDE_COLOR
          ctx.moveTo(start.x, start.y)
          ctx.lineTo(end.x, end.y)
          ctx.stroke()
        }
      }
    })
  }
}

class RsiZoneLinePaneView implements IPrimitivePaneView {
  private rendererInstance: RsiZoneLineRenderer | null = null

  setRenderer(renderer: RsiZoneLineRenderer) {
    this.rendererInstance = renderer
  }

  zOrder() {
    return 'top' as const
  }

  renderer() {
    return this.rendererInstance
  }
}

export class RsiZoneLinePrimitive implements ISeriesPrimitive {
  private series: ISeriesApi<SeriesType> | null = null
  private timeToCoordinate: ((time: Time) => number | null) | null = null
  private requestUpdate: (() => void) | null = null
  private readonly state: ZoneLineState = { points: [], lowerBand: 30, upperBand: 70 }
  private readonly paneView = new RsiZoneLinePaneView()

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.series = param.series
    this.timeToCoordinate = (time) => param.chart.timeScale().timeToCoordinate(time)
    this.requestUpdate = param.requestUpdate
    this.replaceRenderer()
  }

  detached() {
    this.series = null
    this.timeToCoordinate = null
    this.requestUpdate = null
  }

  setLine(points: RsiZonePoint[], lowerBand: number, upperBand: number) {
    this.state.points = points
    this.state.lowerBand = lowerBand
    this.state.upperBand = upperBand
    this.requestUpdate?.()
  }

  updateAllViews() {}

  paneViews() {
    return [this.paneView]
  }

  private replaceRenderer() {
    if (!this.series || !this.timeToCoordinate) {
      return
    }
    this.paneView.setRenderer(new RsiZoneLineRenderer(this.state, this.series, this.timeToCoordinate))
  }
}
