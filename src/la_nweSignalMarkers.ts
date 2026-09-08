import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export type LaNweSignalMarker = {
  time: Time
  price: number
  direction: 'up' | 'down'
  color: string
}

type MarkerState = {
  markers: LaNweSignalMarker[]
}

class TriangleMarkersRenderer implements IPrimitivePaneRenderer {
  private readonly state: MarkerState
  private readonly series: ISeriesApi<SeriesType>
  private readonly timeToCoordinate: (time: Time) => number | null

  constructor(
    state: MarkerState,
    series: ISeriesApi<SeriesType>,
    timeToCoordinate: (time: Time) => number | null,
  ) {
    this.state = state
    this.series = series
    this.timeToCoordinate = timeToCoordinate
  }

  draw(target: CanvasRenderingTarget2D) {
    if (this.state.markers.length === 0) {
      return
    }

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      for (const marker of this.state.markers) {
        const x = this.timeToCoordinate(marker.time)
        const y = this.series.priceToCoordinate(marker.price)

        if (x === null || y === null) {
          continue
        }

        const size = 6
        const offset = 10
        const tipY = marker.direction === 'down' ? y - offset : y + offset

        ctx.beginPath()
        if (marker.direction === 'down') {
          ctx.moveTo(x, tipY)
          ctx.lineTo(x - size, tipY - size - 1)
          ctx.lineTo(x + size, tipY - size - 1)
        } else {
          ctx.moveTo(x, tipY)
          ctx.lineTo(x - size, tipY + size + 1)
          ctx.lineTo(x + size, tipY + size + 1)
        }
        ctx.closePath()
        ctx.fillStyle = marker.color
        ctx.fill()
      }
    })
  }
}

class TriangleMarkersPaneView implements IPrimitivePaneView {
  private rendererInstance: TriangleMarkersRenderer | null = null

  setRenderer(renderer: TriangleMarkersRenderer) {
    this.rendererInstance = renderer
  }

  zOrder() {
    return 'top' as const
  }

  renderer() {
    return this.rendererInstance
  }
}

export class LaNweSignalMarkersPrimitive implements ISeriesPrimitive {
  private series: ISeriesApi<SeriesType> | null = null
  private timeToCoordinate: ((time: Time) => number | null) | null = null
  private requestUpdate: (() => void) | null = null
  private readonly state: MarkerState = { markers: [] }
  private readonly paneView = new TriangleMarkersPaneView()

  constructor() {}

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

  setMarkers(markers: LaNweSignalMarker[]) {
    this.state.markers = markers
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

    this.paneView.setRenderer(
      new TriangleMarkersRenderer(this.state, this.series, this.timeToCoordinate),
    )
  }
}
