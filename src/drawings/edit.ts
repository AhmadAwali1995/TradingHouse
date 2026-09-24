import type { ChartPoint, Drawing, DrawingBase } from './types'
import { DEFAULT_LINE_STYLE, DEFAULT_LINE_WIDTH, DRAWING_COLOR } from './types'

export function drawingStyle(color = DRAWING_COLOR): Pick<DrawingBase, 'color' | 'lineWidth' | 'lineStyle'> {
  return {
    color,
    lineWidth: DEFAULT_LINE_WIDTH,
    lineStyle: DEFAULT_LINE_STYLE,
  }
}

export function anchorPoints(drawing: Drawing): ChartPoint[] {
  if (drawing.type === 'horizontalLine') {
    return [{ time: drawing.time, price: drawing.price }]
  }
  if (drawing.type === 'horizontalRay') {
    return [drawing.point]
  }
  return [...drawing.points]
}

function shiftPoint(point: ChartPoint, dTime: number, dPrice: number): ChartPoint {
  return { time: point.time + dTime, price: point.price + dPrice }
}

export function translateDrawing(drawing: Drawing, dTime: number, dPrice: number): Drawing {
  switch (drawing.type) {
    case 'horizontalLine':
      return { ...drawing, price: drawing.price + dPrice, time: drawing.time + dTime }
    case 'horizontalRay':
      return { ...drawing, point: shiftPoint(drawing.point, dTime, dPrice) }
    case 'trendline':
    case 'fibRetracement':
    case 'measure':
      return {
        ...drawing,
        points: [shiftPoint(drawing.points[0], dTime, dPrice), shiftPoint(drawing.points[1], dTime, dPrice)],
      }
    case 'channel':
    case 'parallelChannel':
      return {
        ...drawing,
        points: [
          shiftPoint(drawing.points[0], dTime, dPrice),
          shiftPoint(drawing.points[1], dTime, dPrice),
          shiftPoint(drawing.points[2], dTime, dPrice),
        ],
      }
    case 'elliottImpulse':
      return {
        ...drawing,
        points: [
          shiftPoint(drawing.points[0], dTime, dPrice),
          shiftPoint(drawing.points[1], dTime, dPrice),
          shiftPoint(drawing.points[2], dTime, dPrice),
          shiftPoint(drawing.points[3], dTime, dPrice),
          shiftPoint(drawing.points[4], dTime, dPrice),
        ],
      }
  }
}

export function moveAnchor(drawing: Drawing, index: number, point: ChartPoint): Drawing {
  switch (drawing.type) {
    case 'horizontalLine':
      return { ...drawing, price: point.price, time: point.time }
    case 'horizontalRay':
      return { ...drawing, point }
    case 'trendline':
    case 'fibRetracement':
    case 'measure': {
      const points: [ChartPoint, ChartPoint] = [...drawing.points]
      if (index === 0 || index === 1) {
        points[index] = point
      }
      return { ...drawing, points }
    }
    case 'channel':
    case 'parallelChannel': {
      const points: [ChartPoint, ChartPoint, ChartPoint] = [...drawing.points]
      if (index === 0 || index === 1 || index === 2) {
        points[index] = point
      }
      return { ...drawing, points }
    }
    case 'elliottImpulse': {
      const points: [ChartPoint, ChartPoint, ChartPoint, ChartPoint, ChartPoint] = [...drawing.points]
      if (index >= 0 && index < points.length) {
        points[index] = point
      }
      return { ...drawing, points }
    }
  }
}
