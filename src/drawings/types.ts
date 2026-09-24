export type DrawingTool =
  | 'trendline'
  | 'channel'
  | 'horizontalLine'
  | 'horizontalRay'
  | 'parallelChannel'
  | 'fibRetracement'
  | 'elliottImpulse'
  | 'longPosition'
  | 'shortPosition'
  | 'measure'

export type ChartPoint = {
  time: number
  price: number
}

export type FibLevel = {
  value: number
  visible: boolean
  color: string
}

export type FibSettings = {
  levels: FibLevel[]
  reverse: boolean
  extendLeft: boolean
  extendRight: boolean
  showLabels: boolean
  fill: boolean
}

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted'

export type DrawingBase = {
  id: string
  color: string
  lineWidth: number
  lineStyle: DrawingLineStyle
}

export type TrendlineDrawing = DrawingBase & {
  type: 'trendline'
  points: [ChartPoint, ChartPoint]
}

export type ChannelDrawing = DrawingBase & {
  type: 'channel' | 'parallelChannel'
  points: [ChartPoint, ChartPoint, ChartPoint]
}

export type HorizontalLineDrawing = DrawingBase & {
  type: 'horizontalLine'
  price: number
  time: number
}

export type HorizontalRayDrawing = DrawingBase & {
  type: 'horizontalRay'
  point: ChartPoint
}

export type FibDrawing = DrawingBase & {
  type: 'fibRetracement'
  points: [ChartPoint, ChartPoint]
  settings: FibSettings
}

export type ElliottDrawing = DrawingBase & {
  type: 'elliottImpulse'
  points: [ChartPoint, ChartPoint, ChartPoint, ChartPoint, ChartPoint]
}

export type MeasureDrawing = DrawingBase & {
  type: 'measure'
  points: [ChartPoint, ChartPoint]
  barCount: number
}

export type PositionDrawing = DrawingBase & {
  type: 'longPosition' | 'shortPosition'
  startTime: number
  endTime: number
  entryPrice: number
  targetPrice: number
  stopPrice: number
  accountSize: number
  riskPercent: number
}

export type Drawing =
  | TrendlineDrawing
  | ChannelDrawing
  | HorizontalLineDrawing
  | HorizontalRayDrawing
  | FibDrawing
  | ElliottDrawing
  | PositionDrawing
  | MeasureDrawing

export type DrawingPreview = {
  tool: DrawingTool
  points: ChartPoint[]
  hover: ChartPoint | null
  barCount: number
  position: {
    startTime: number
    endTime: number
    entryPrice: number
    targetPrice: number
    stopPrice: number
  } | null
}

export const TOOL_POINTS: Record<DrawingTool, number> = {
  trendline: 2,
  channel: 3,
  horizontalLine: 1,
  horizontalRay: 1,
  parallelChannel: 3,
  fibRetracement: 2,
  elliottImpulse: 5,
  longPosition: 1,
  shortPosition: 1,
  measure: 2,
}

export const DRAWING_COLOR = '#2962ff'
export const DEFAULT_LINE_WIDTH = 2
export const DEFAULT_LINE_STYLE: DrawingLineStyle = 'solid'
