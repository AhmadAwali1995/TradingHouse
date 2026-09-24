import { sameTimeChannel } from './geometry'
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
  if (drawing.type === 'channel') {
    const [start, end, widthPoint] = drawing.points
    const [lineStart] = sameTimeChannel(start, end, widthPoint)
    return [start, end, lineStart]
  }
  if (drawing.type === 'longPosition' || drawing.type === 'shortPosition') {
    const mid = (drawing.startTime + drawing.endTime) / 2
    return [
      { time: drawing.startTime, price: drawing.entryPrice },
      { time: drawing.endTime, price: drawing.entryPrice },
      { time: mid, price: drawing.targetPrice },
      { time: mid, price: drawing.stopPrice },
      { time: mid, price: drawing.entryPrice },
    ]
  }
  if (!('points' in drawing)) {
    return []
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
    case 'longPosition':
    case 'shortPosition':
      return {
        ...drawing,
        startTime: drawing.startTime + dTime,
        endTime: drawing.endTime + dTime,
        entryPrice: drawing.entryPrice + dPrice,
        targetPrice: drawing.targetPrice + dPrice,
        stopPrice: drawing.stopPrice + dPrice,
      }
  }
}

function setPositionEdge(drawing: Extract<Drawing, { type: 'longPosition' | 'shortPosition' }>, edge: 'start' | 'end', time: number): Drawing {
  if (edge === 'start') {
    if (time < drawing.endTime) {
      return { ...drawing, startTime: time }
    }
    return { ...drawing, startTime: drawing.endTime, endTime: time }
  }
  if (time > drawing.startTime) {
    return { ...drawing, endTime: time }
  }
  return { ...drawing, endTime: drawing.startTime, startTime: time }
}

function setPositionPrice(
  drawing: Extract<Drawing, { type: 'longPosition' | 'shortPosition' }>,
  field: 'target' | 'stop' | 'entry',
  price: number,
): Drawing {
  const long = drawing.type === 'longPosition'
  if (field === 'entry') {
    const upper = long ? drawing.targetPrice : drawing.stopPrice
    const lower = long ? drawing.stopPrice : drawing.targetPrice
    return { ...drawing, entryPrice: Math.min(upper, Math.max(lower, price)) }
  }
  if (field === 'target') {
    return { ...drawing, targetPrice: long ? Math.max(price, drawing.entryPrice) : Math.min(price, drawing.entryPrice) }
  }
  return { ...drawing, stopPrice: long ? Math.min(price, drawing.entryPrice) : Math.max(price, drawing.entryPrice) }
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
    case 'longPosition':
    case 'shortPosition': {
      if (index === 0) {
        return setPositionEdge(drawing, 'start', point.time)
      }
      if (index === 1) {
        return setPositionEdge(drawing, 'end', point.time)
      }
      if (index === 2) {
        return setPositionPrice(drawing, 'target', point.price)
      }
      if (index === 3) {
        return setPositionPrice(drawing, 'stop', point.price)
      }
      if (index === 4) {
        return setPositionPrice(drawing, 'entry', point.price)
      }
      return drawing
    }
  }
}
