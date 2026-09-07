import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { TIMEFRAME_SECONDS, type TimeframeId } from './candles'

type LabelState = {
  visible: boolean
  y: number
  priceText: string
  remainingText: string
  background: string
}

const UP_COLOR = '#26a69a'
const TEXT_COLOR = '#ffffff'

function unixSeconds(time: Time): number | null {
  return typeof time === 'number' ? time : null
}

export function formatBarRemaining(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

class AxisLabelRenderer implements IPrimitivePaneRenderer {
  private readonly state: LabelState

  constructor(state: LabelState) {
    this.state = state
  }

  draw(target: CanvasRenderingTarget2D) {
    if (!this.state.visible) {
      return
    }

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const width = mediaSize.width
      const lineHeight = 13
      const paddingY = 3
      const height = lineHeight * 2 + paddingY * 2
      const top = this.state.y - height / 2
      const radius = 2
      const textX = width - 6

      ctx.beginPath()
      ctx.moveTo(radius, top)
      ctx.lineTo(width, top)
      ctx.lineTo(width, top + height)
      ctx.lineTo(radius, top + height)
      ctx.quadraticCurveTo(0, top + height, 0, top + height - radius)
      ctx.lineTo(0, top + radius)
      ctx.quadraticCurveTo(0, top, radius, top)
      ctx.closePath()
      ctx.fillStyle = this.state.background
      ctx.fill()

      ctx.fillStyle = TEXT_COLOR
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.font = '12px system-ui, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(this.state.priceText, textX, top + paddingY + lineHeight / 2)
      ctx.font = '11px system-ui, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(this.state.remainingText, textX, top + paddingY + lineHeight * 1.5)
    })
  }
}

class AxisLabelPaneView implements IPrimitivePaneView {
  private readonly paneRenderer: AxisLabelRenderer

  constructor(state: LabelState) {
    this.paneRenderer = new AxisLabelRenderer(state)
  }

  zOrder() {
    return 'top' as const
  }

  renderer() {
    return this.paneRenderer
  }
}

class WidthAxisView implements ISeriesPrimitiveAxisView {
  private readonly state: LabelState

  constructor(state: LabelState) {
    this.state = state
  }

  coordinate() {
    return this.state.y
  }

  text() {
    return this.state.priceText
  }

  textColor() {
    return TEXT_COLOR
  }

  backColor() {
    return this.state.background
  }

  visible() {
    return false
  }
}

export class LastPriceCountdownPrimitive implements ISeriesPrimitive {
  private series: ISeriesApi<SeriesType> | null = null
  private requestUpdate: (() => void) | null = null
  private timer: number | null = null
  private periodSeconds: number
  private readonly state: LabelState = {
    visible: false,
    y: 0,
    priceText: '',
    remainingText: '00:00',
    background: UP_COLOR,
  }
  private readonly axisPaneViews: IPrimitivePaneView[]
  private readonly axisViews: ISeriesPrimitiveAxisView[]

  constructor(timeframe: TimeframeId) {
    this.periodSeconds = TIMEFRAME_SECONDS[timeframe]
    this.axisPaneViews = [new AxisLabelPaneView(this.state)]
    this.axisViews = [new WidthAxisView(this.state)]
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.series = param.series
    this.requestUpdate = param.requestUpdate
    this.timer = window.setInterval(() => {
      this.requestUpdate?.()
    }, 250)
  }

  detached() {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    this.series = null
    this.requestUpdate = null
  }

  setTimeframe(timeframe: TimeframeId) {
    this.periodSeconds = TIMEFRAME_SECONDS[timeframe]
    this.requestUpdate?.()
  }

  updateAllViews() {
    const series = this.series
    if (!series) {
      this.state.visible = false
      return
    }

    const last = series.data().at(-1)
    const lastValue = series.lastValueData(true)
    if (!last || lastValue.noData || !('close' in last)) {
      this.state.visible = false
      return
    }

    const y = series.priceToCoordinate(lastValue.price)
    const barTime = unixSeconds(last.time)
    if (y === null || barTime === null) {
      this.state.visible = false
      return
    }

    this.state.visible = true
    this.state.y = y
    this.state.priceText = series.priceFormatter().format(lastValue.price)
    this.state.remainingText = formatBarRemaining(barTime + this.periodSeconds - Date.now() / 1000)
    this.state.background = lastValue.color || UP_COLOR
  }

  paneViews() {
    return []
  }

  priceAxisPaneViews() {
    return this.axisPaneViews
  }

  priceAxisViews() {
    return this.axisViews
  }
}
