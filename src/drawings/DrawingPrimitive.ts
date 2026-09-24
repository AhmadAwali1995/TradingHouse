import type {
  IChartApiBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { anchorPoints } from './edit'
import { cloneFibSettings, fibPrice } from './fib'
import { distToInfiniteLine, distToSegment, extendThrough, parallelThrough, pointInRect, sameTimeChannel, type XY } from './geometry'
import { timeToX } from './timeScale'
import type { ChartPoint, Drawing, DrawingLineStyle, DrawingPreview, FibDrawing } from './types'

type Converter = {
  timeToX: (time: number) => number | null
  priceToY: (price: number) => number | null
}

type PrimitiveState = {
  drawings: Drawing[]
  preview: DrawingPreview | null
  selectedId: string | null
  hoveredId: string | null
  dashOffset: number
}

export type DrawingHit =
  | { id: string; kind: 'anchor'; index: number }
  | { id: string; kind: 'body' }

const ANCHOR_PX = 8

const HIT_PX = 8

function toXY(convert: Converter, point: ChartPoint): XY | null {
  const x = convert.timeToX(point.time)
  const y = convert.priceToY(point.price)
  if (x === null || y === null) {
    return null
  }
  return { x, y }
}

function applyLine(ctx: CanvasRenderingContext2D, color: string, width: number, style: DrawingLineStyle) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (style === 'dashed') {
    ctx.setLineDash([7, 5])
  } else if (style === 'dotted') {
    ctx.setLineDash([1.5, 4])
  } else {
    ctx.setLineDash([])
  }
}

function drawHandles(ctx: CanvasRenderingContext2D, points: XY[]) {
  ctx.setLineDash([])
  for (const point of points) {
    ctx.beginPath()
    ctx.rect(point.x - 4, point.y - 4, 8, 8)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#2962ff'
    ctx.stroke()
  }
}

function drawLine(ctx: CanvasRenderingContext2D, a: XY, b: XY) {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

function drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.font = '11px system-ui, "Segoe UI", Roboto, sans-serif'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = color
  ctx.fillText(text, x + 4, y - 4)
}

function fibLevelYs(drawing: FibDrawing, convert: Converter): { y: number; level: FibDrawing['settings']['levels'][number] }[] {
  const [start, end] = drawing.points
  const rows: { y: number; level: FibDrawing['settings']['levels'][number] }[] = []
  for (const level of drawing.settings.levels) {
    if (!level.visible) {
      continue
    }
    const y = convert.priceToY(fibPrice(start.price, end.price, level.value, drawing.settings.reverse))
    if (y !== null) {
      rows.push({ y, level })
    }
  }
  return rows.sort((a, b) => a.y - b.y)
}

function drawFib(ctx: CanvasRenderingContext2D, drawing: FibDrawing, convert: Converter, mediaWidth: number) {
  const a = toXY(convert, drawing.points[0])
  const b = toXY(convert, drawing.points[1])
  if (!a || !b) {
    return
  }
  const left = drawing.settings.extendLeft ? 0 : Math.min(a.x, b.x)
  const right = drawing.settings.extendRight ? mediaWidth : Math.max(a.x, b.x)
  const rows = fibLevelYs(drawing, convert)
  if (drawing.settings.fill) {
    for (let i = 0; i < rows.length - 1; i += 1) {
      ctx.fillStyle = `${rows[i].level.color}22`
      ctx.fillRect(left, rows[i].y, right - left, rows[i + 1].y - rows[i].y)
    }
  }
  applyLine(ctx, drawing.color, drawing.lineWidth, drawing.lineStyle)
  drawLine(ctx, a, b)
  for (const row of rows) {
    applyLine(ctx, row.level.color, 1, 'solid')
    ctx.beginPath()
    ctx.moveTo(left, row.y)
    ctx.lineTo(right, row.y)
    ctx.stroke()
    if (drawing.settings.showLabels) {
      drawLabel(ctx, left, row.y, `${row.level.value}`, row.level.color)
    }
  }
}

function drawChannelEnds(ctx: CanvasRenderingContext2D, p1: XY, p2: XY, q1: XY, q2: XY, drawing: Drawing) {
  ctx.fillStyle = `${drawing.color}22`
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.lineTo(q2.x, q2.y)
  ctx.lineTo(q1.x, q1.y)
  ctx.closePath()
  ctx.fill()
  applyLine(ctx, drawing.color, drawing.lineWidth, drawing.lineStyle)
  drawLine(ctx, p1, p2)
  drawLine(ctx, q1, q2)
}

function drawChannel(
  ctx: CanvasRenderingContext2D,
  a: XY,
  b: XY,
  c: XY,
  drawing: Drawing,
  extend: boolean,
) {
  const [p1, p2] = extend ? extendThrough(a, b) : [a, b]
  const [q1raw, q2raw] = parallelThrough(a, b, c)
  const [q1, q2] = extend ? extendThrough(q1raw, q2raw) : [q1raw, q2raw]
  ctx.fillStyle = `${drawing.color}22`
  ctx.beginPath()
  ctx.moveTo(p1.x, p1.y)
  ctx.lineTo(p2.x, p2.y)
  ctx.lineTo(q2.x, q2.y)
  ctx.lineTo(q1.x, q1.y)
  ctx.closePath()
  ctx.fill()
  applyLine(ctx, drawing.color, drawing.lineWidth, drawing.lineStyle)
  drawLine(ctx, p1, p2)
  drawLine(ctx, q1, q2)
}

function drawMeasure(
  ctx: CanvasRenderingContext2D,
  a: XY,
  b: XY,
  p1: ChartPoint,
  p2: ChartPoint,
  barCount: number,
  color: string,
) {
  const left = Math.min(a.x, b.x)
  const top = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  ctx.fillStyle = `${color}18`
  ctx.fillRect(left, top, w, h)
  applyLine(ctx, color, 1, 'solid')
  ctx.strokeRect(left, top, w, h)
  const delta = p2.price - p1.price
  const percent = p1.price === 0 ? 0 : (delta / p1.price) * 100
  const text = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}  ${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%  ${barCount} bars`
  ctx.font = '11px system-ui, "Segoe UI", Roboto, sans-serif'
  ctx.fillStyle = color
  ctx.textBaseline = 'top'
  ctx.fillText(text, left + 6, top + 6)
}

function drawOne(
  ctx: CanvasRenderingContext2D,
  drawing: Drawing,
  convert: Converter,
  mediaWidth: number,
  emphasize: boolean,
) {
  applyLine(ctx, drawing.color, emphasize ? drawing.lineWidth + 1 : drawing.lineWidth, drawing.lineStyle)

  if (drawing.type === 'trendline') {
    const a = toXY(convert, drawing.points[0])
    const b = toXY(convert, drawing.points[1])
    if (a && b) {
      drawLine(ctx, a, b)
    }
    return
  }

  if (drawing.type === 'channel') {
    const [lineStart, lineEnd] = sameTimeChannel(drawing.points[0], drawing.points[1], drawing.points[2])
    const p1 = toXY(convert, drawing.points[0])
    const p2 = toXY(convert, drawing.points[1])
    const q1 = toXY(convert, lineStart)
    const q2 = toXY(convert, lineEnd)
    if (p1 && p2 && q1 && q2) {
      drawChannelEnds(ctx, p1, p2, q1, q2, drawing)
    }
    return
  }

  if (drawing.type === 'parallelChannel') {
    const a = toXY(convert, drawing.points[0])
    const b = toXY(convert, drawing.points[1])
    const c = toXY(convert, drawing.points[2])
    if (a && b && c) {
      drawChannel(ctx, a, b, c, drawing, true)
    }
    return
  }

  if (drawing.type === 'horizontalLine') {
    const y = convert.priceToY(drawing.price)
    if (y !== null) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(mediaWidth, y)
      ctx.stroke()
    }
    return
  }

  if (drawing.type === 'horizontalRay') {
    const point = toXY(convert, drawing.point)
    if (point) {
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
      ctx.lineTo(mediaWidth, point.y)
      ctx.stroke()
    }
    return
  }

  if (drawing.type === 'fibRetracement') {
    drawFib(ctx, drawing, convert, mediaWidth)
    return
  }

  if (drawing.type === 'elliottImpulse') {
    const points = drawing.points.map((point) => toXY(convert, point))
    ctx.beginPath()
    points.forEach((point, index) => {
      if (!point) {
        return
      }
      if (index === 0) {
        ctx.moveTo(point.x, point.y)
      } else {
        ctx.lineTo(point.x, point.y)
      }
    })
    ctx.stroke()
    points.forEach((point, index) => {
      if (point) {
        drawLabel(ctx, point.x, point.y, String(index + 1), drawing.color)
      }
    })
    return
  }

  const a = toXY(convert, drawing.points[0])
  const b = toXY(convert, drawing.points[1])
  if (a && b && drawing.type === 'measure') {
    drawMeasure(ctx, a, b, drawing.points[0], drawing.points[1], drawing.barCount, drawing.color)
  }
}

const PREVIEW_STYLE = {
  id: 'preview',
  color: '#5b9cff',
  lineWidth: 1,
  lineStyle: 'dashed' as const,
}

function previewDrawing(preview: DrawingPreview): Drawing | null {
  const hover = preview.hover
  const points = hover ? [...preview.points, hover] : preview.points
  const id = PREVIEW_STYLE.id
  const color = PREVIEW_STYLE.color
  const lineWidth = PREVIEW_STYLE.lineWidth
  const lineStyle = PREVIEW_STYLE.lineStyle

  if (preview.tool === 'horizontalLine' && points[0]) {
    return { id, type: 'horizontalLine', color, lineWidth, lineStyle, price: points[0].price, time: points[0].time }
  }
  if (preview.tool === 'horizontalRay' && points[0]) {
    return { id, type: 'horizontalRay', color, lineWidth, lineStyle, point: points[0] }
  }
  if (preview.tool === 'trendline' && points.length >= 2) {
    return { id, type: 'trendline', color, lineWidth, lineStyle, points: [points[0], points[1]] }
  }
  if ((preview.tool === 'channel' || preview.tool === 'parallelChannel') && points.length >= 3) {
    return {
      id,
      type: preview.tool,
      color,
      lineWidth,
      lineStyle,
      points: [points[0], points[1], points[2]],
    }
  }
  if ((preview.tool === 'channel' || preview.tool === 'parallelChannel') && points.length === 2) {
    return { id, type: 'trendline', color, lineWidth, lineStyle, points: [points[0], points[1]] }
  }
  if (preview.tool === 'fibRetracement' && points.length >= 2) {
    return {
      id,
      type: 'fibRetracement',
      color,
      lineWidth,
      lineStyle,
      points: [points[0], points[1]],
      settings: cloneFibSettings(),
    }
  }
  if (preview.tool === 'measure' && points.length >= 2) {
    return { id, type: 'measure', color, lineWidth, lineStyle, points: [points[0], points[1]], barCount: preview.barCount }
  }
  if (preview.tool === 'elliottImpulse' && points.length >= 2) {
    const padded = [...points]
    while (padded.length < 5) {
      padded.push(padded[padded.length - 1])
    }
    return {
      id,
      type: 'elliottImpulse',
      color,
      lineWidth,
      lineStyle,
      points: [padded[0], padded[1], padded[2], padded[3], padded[4]],
    }
  }
  if (points[0]) {
    const xyTool = preview.tool
    if (xyTool === 'trendline' || xyTool === 'fibRetracement' || xyTool === 'measure' || xyTool === 'elliottImpulse') {
      const a = points[0]
      return { id, type: 'trendline', color, lineWidth, lineStyle, points: [a, a] }
    }
  }
  return null
}

class DrawingRenderer implements IPrimitivePaneRenderer {
  private readonly state: PrimitiveState
  private readonly convert: Converter

  constructor(state: PrimitiveState, convert: Converter) {
    this.state = state
    this.convert = convert
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      for (const drawing of this.state.drawings) {
        const selected = drawing.id === this.state.selectedId
        drawOne(ctx, drawing, this.convert, mediaSize.width, selected || drawing.id === this.state.hoveredId)
        if (selected) {
          const handles = anchorPoints(drawing)
            .map((point) => toXY(this.convert, point))
            .filter((point): point is XY => point !== null)
          drawHandles(ctx, handles)
        }
      }
      if (this.state.preview) {
        const preview = previewDrawing(this.state.preview)
        if (preview) {
          ctx.save()
          ctx.setLineDash([6, 4])
          ctx.lineDashOffset = -this.state.dashOffset
          drawOne(ctx, preview, this.convert, mediaSize.width, false)
          ctx.restore()
          const handles = this.state.preview.points
            .map((point) => toXY(this.convert, point))
            .filter((point): point is XY => point !== null)
          drawHandles(ctx, handles)
        }
      }
    })
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  private readonly state: PrimitiveState
  private readonly convert: Converter

  constructor(state: PrimitiveState, convert: Converter) {
    this.state = state
    this.convert = convert
  }

  zOrder() {
    return 'top' as const
  }

  renderer() {
    return new DrawingRenderer(this.state, this.convert)
  }
}

export function hitTestDrawing(
  drawings: Drawing[],
  convert: Converter,
  x: number,
  y: number,
  selectedId: string | null,
): DrawingHit | null {
  if (selectedId) {
    const selected = drawings.find((drawing) => drawing.id === selectedId)
    if (selected) {
      const anchors = anchorPoints(selected)
      for (let index = anchors.length - 1; index >= 0; index -= 1) {
        const point = toXY(convert, anchors[index])
        if (point && Math.hypot(x - point.x, y - point.y) <= ANCHOR_PX) {
          return { id: selected.id, kind: 'anchor', index }
        }
      }
    }
  }

  for (let i = drawings.length - 1; i >= 0; i -= 1) {
    const drawing = drawings[i]
    if (drawing.type === 'trendline') {
      const a = toXY(convert, drawing.points[0])
      const b = toXY(convert, drawing.points[1])
      if (a && b && distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_PX) {
        return { id: drawing.id, kind: 'body' }
      }
    }
    if (drawing.type === 'channel') {
      const [lineStart, lineEnd] = sameTimeChannel(drawing.points[0], drawing.points[1], drawing.points[2])
      const a = toXY(convert, drawing.points[0])
      const b = toXY(convert, drawing.points[1])
      const q1 = toXY(convert, lineStart)
      const q2 = toXY(convert, lineEnd)
      if (
        a &&
        b &&
        q1 &&
        q2 &&
        (distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_PX || distToSegment(x, y, q1.x, q1.y, q2.x, q2.y) <= HIT_PX)
      ) {
        return { id: drawing.id, kind: 'body' }
      }
    }
    if (drawing.type === 'parallelChannel') {
      const a = toXY(convert, drawing.points[0])
      const b = toXY(convert, drawing.points[1])
      const c = toXY(convert, drawing.points[2])
      if (a && b && c) {
        const [q1, q2] = parallelThrough(a, b, c)
        if (
          distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_PX ||
          distToInfiniteLine(x, y, q1.x, q1.y, q2.x, q2.y) <= HIT_PX
        ) {
          return { id: drawing.id, kind: 'body' }
        }
      }
    }
    if (drawing.type === 'horizontalLine') {
      const py = convert.priceToY(drawing.price)
      if (py !== null && Math.abs(y - py) <= HIT_PX) {
        return { id: drawing.id, kind: 'body' }
      }
    }
    if (drawing.type === 'horizontalRay') {
      const point = toXY(convert, drawing.point)
      if (point && x >= point.x - HIT_PX && Math.abs(y - point.y) <= HIT_PX) {
        return { id: drawing.id, kind: 'body' }
      }
    }
    if (drawing.type === 'fibRetracement') {
      const a = toXY(convert, drawing.points[0])
      const b = toXY(convert, drawing.points[1])
      if (a && b && distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_PX) {
        return { id: drawing.id, kind: 'body' }
      }
      for (const row of fibLevelYs(drawing, convert)) {
        if (Math.abs(y - row.y) <= HIT_PX) {
          return { id: drawing.id, kind: 'body' }
        }
      }
    }
    if (drawing.type === 'elliottImpulse') {
      const pts = drawing.points.map((point) => toXY(convert, point))
      for (let p = 1; p < pts.length; p += 1) {
        const prev = pts[p - 1]
        const next = pts[p]
        if (prev && next && distToSegment(x, y, prev.x, prev.y, next.x, next.y) <= HIT_PX) {
          return { id: drawing.id, kind: 'body' }
        }
      }
    }
    if (drawing.type === 'measure') {
      const a = toXY(convert, drawing.points[0])
      const b = toXY(convert, drawing.points[1])
      if (a && b && (pointInRect(x, y, a.x, a.y, b.x, b.y) || distToSegment(x, y, a.x, a.y, b.x, b.y) <= HIT_PX)) {
        return { id: drawing.id, kind: 'body' }
      }
    }
  }
  return null
}

export class DrawingPrimitive implements ISeriesPrimitive {
  private chart: IChartApiBase<Time> | null = null
  private series: ISeriesApi<SeriesType, Time> | null = null
  private requestUpdate: (() => void) | null = null
  private dashTimer: number | null = null
  private readonly state: PrimitiveState = {
    drawings: [],
    preview: null,
    selectedId: null,
    hoveredId: null,
    dashOffset: 0,
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this.chart = param.chart
    this.series = param.series
    this.requestUpdate = param.requestUpdate
  }

  detached() {
    this.stopDash()
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  private stopDash() {
    if (this.dashTimer !== null) {
      window.clearInterval(this.dashTimer)
      this.dashTimer = null
    }
  }

  private syncDash() {
    const active = this.state.preview !== null && this.state.preview.points.length > 0
    if (active && this.dashTimer === null) {
      this.dashTimer = window.setInterval(() => {
        this.state.dashOffset = (this.state.dashOffset + 1) % 20
        this.requestUpdate?.()
      }, 40)
    }
    if (!active) {
      this.stopDash()
    }
  }

  setState(next: Partial<PrimitiveState>) {
    if (next.drawings) {
      this.state.drawings = next.drawings
    }
    if (next.preview !== undefined) {
      this.state.preview = next.preview
    }
    if (next.selectedId !== undefined) {
      this.state.selectedId = next.selectedId
    }
    if (next.hoveredId !== undefined) {
      this.state.hoveredId = next.hoveredId
    }
    this.syncDash()
    this.requestUpdate?.()
  }

  converter(): Converter | null {
    const chart = this.chart
    const series = this.series
    if (!chart || !series) {
      return null
    }
    return {
      timeToX: (time) => timeToX(chart, series, time),
      priceToY: (price) => series.priceToCoordinate(price),
    }
  }

  updateAllViews() {}

  paneViews() {
    const convert = this.converter()
    if (!convert) {
      return []
    }
    return [new DrawingPaneView(this.state, convert)]
  }
}
