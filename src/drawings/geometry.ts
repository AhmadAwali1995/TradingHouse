import type { ChartPoint } from './types'

export type XY = { x: number; y: number }

export function hypot2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return Math.hypot(dx, dy)
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const length2 = dx * dx + dy * dy
  if (length2 === 0) {
    return Math.hypot(px - ax, py - ay)
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function distToInfiniteLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy)
  if (length === 0) {
    return Math.hypot(px - ax, py - ay)
  }
  return Math.abs((px - ax) * dy - (py - ay) * dx) / length
}

export function extendThrough(a: XY, b: XY, scale = 8000): [XY, XY] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  return [
    { x: a.x - ux * scale, y: a.y - uy * scale },
    { x: a.x + ux * scale, y: a.y + uy * scale },
  ]
}

export function parallelThrough(a: XY, b: XY, c: XY): [XY, XY] {
  return [
    { x: c.x, y: c.y },
    { x: c.x + (b.x - a.x), y: c.y + (b.y - a.y) },
  ]
}

export function pointInRect(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const left = Math.min(ax, bx)
  const right = Math.max(ax, bx)
  const top = Math.min(ay, by)
  const bottom = Math.max(ay, by)
  return px >= left && px <= right && py >= top && py <= bottom
}

export function midpoint(a: ChartPoint, b: ChartPoint): ChartPoint {
  return {
    time: (a.time + b.time) / 2,
    price: (a.price + b.price) / 2,
  }
}
