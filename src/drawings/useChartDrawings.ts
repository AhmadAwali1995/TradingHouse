import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import type { Candle } from '../candles'
import { anchorPoints, drawingStyle, moveAnchor, translateDrawing } from './edit'
import { cloneFibSettings } from './fib'
import { hitTestDrawing, type DrawingHit, type DrawingPrimitive } from './DrawingPrimitive'
import { coordinateToUnix } from './timeScale'
import {
  TOOL_POINTS,
  type ChartPoint,
  type Drawing,
  type DrawingBase,
  type DrawingTool,
  type FibSettings,
} from './types'

function nextId(): string {
  return `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function countBars(candles: Candle[], start: number, end: number): number {
  const min = Math.min(start, end)
  const max = Math.max(start, end)
  return candles.filter((candle) => candle.time >= min && candle.time <= max).length
}

function withBarCount(drawing: Drawing, candles: Candle[]): Drawing {
  if (drawing.type !== 'measure') {
    return drawing
  }
  return {
    ...drawing,
    barCount: countBars(candles, drawing.points[0].time, drawing.points[1].time),
  }
}

function completeDrawing(tool: DrawingTool, points: ChartPoint[], candles: Candle[]): Drawing | null {
  const id = nextId()
  const style = drawingStyle()
  if (tool === 'trendline' && points[0] && points[1]) {
    return { id, type: 'trendline', ...style, points: [points[0], points[1]] }
  }
  if ((tool === 'channel' || tool === 'parallelChannel') && points[0] && points[1] && points[2]) {
    return { id, type: tool, ...style, points: [points[0], points[1], points[2]] }
  }
  if (tool === 'horizontalLine' && points[0]) {
    return { id, type: 'horizontalLine', ...style, price: points[0].price, time: points[0].time }
  }
  if (tool === 'horizontalRay' && points[0]) {
    return { id, type: 'horizontalRay', ...style, point: points[0] }
  }
  if (tool === 'fibRetracement' && points[0] && points[1]) {
    return {
      id,
      type: 'fibRetracement',
      ...style,
      points: [points[0], points[1]],
      settings: cloneFibSettings(),
    }
  }
  if (tool === 'elliottImpulse' && points.length >= 5) {
    return {
      id,
      type: 'elliottImpulse',
      ...style,
      points: [points[0], points[1], points[2], points[3], points[4]],
    }
  }
  if (tool === 'measure' && points[0] && points[1]) {
    return withBarCount(
      { id, type: 'measure', ...style, points: [points[0], points[1]], barCount: 0 },
      candles,
    )
  }
  return null
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'))
}

type DragSession = {
  hit: DrawingHit
  origin: ChartPoint
  snapshot: Drawing
  moved: boolean
}

export function useChartDrawings({
  chartReady,
  pairId,
  chartRef,
  seriesRef,
  candlesRef,
  primitiveRef,
}: {
  chartReady: boolean
  pairId: string
  chartRef: MutableRefObject<IChartApi | null>
  seriesRef: MutableRefObject<ISeriesApi<'Candlestick'> | null>
  candlesRef: MutableRefObject<Candle[]>
  primitiveRef: MutableRefObject<DrawingPrimitive | null>
}) {
  const [tool, setTool] = useState<DrawingTool | null>(null)
  const [draftPoints, setDraftPoints] = useState<ChartPoint[]>([])
  const [hoverPoint, setHoverPoint] = useState<ChartPoint | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawingsByPair, setDrawingsByPair] = useState<Record<string, Drawing[]>>({})

  const drawings = drawingsByPair[pairId] ?? []
  const drawingsRef = useRef(drawings)
  const toolRef = useRef(tool)
  const draftRef = useRef(draftPoints)
  const selectedRef = useRef(selectedId)
  const dragRef = useRef<DragSession | null>(null)
  drawingsRef.current = drawings
  toolRef.current = tool
  draftRef.current = draftPoints
  selectedRef.current = selectedId

  const setPairDrawings = (updater: (current: Drawing[]) => Drawing[]) => {
    setDrawingsByPair((current) => ({
      ...current,
      [pairId]: updater(current[pairId] ?? []),
    }))
  }

  const dropMeasures = (keepId: string | null = null) => {
    setPairDrawings((current) => current.filter((drawing) => drawing.type !== 'measure' || drawing.id === keepId))
  }

  const deleteSelected = () => {
    const id = selectedRef.current
    if (!id) {
      return
    }
    setPairDrawings((current) => current.filter((drawing) => drawing.id !== id))
    setSelectedId(null)
  }

  const clearDrawings = () => {
    setPairDrawings(() => [])
    setSelectedId(null)
    setHoveredId(null)
    setDraftPoints([])
    setHoverPoint(null)
  }

  const updateSelectedFib = (settings: FibSettings) => {
    setPairDrawings((current) =>
      current.map((drawing) =>
        drawing.id === selectedRef.current && drawing.type === 'fibRetracement' ? { ...drawing, settings } : drawing,
      ),
    )
  }

  const updateSelectedStyle = (patch: Partial<Pick<DrawingBase, 'color' | 'lineWidth' | 'lineStyle'>>) => {
    setPairDrawings((current) =>
      current.map((drawing) => (drawing.id === selectedRef.current ? { ...drawing, ...patch } : drawing)),
    )
  }

  useEffect(() => {
    setDraftPoints([])
    setHoverPoint(null)
    setHoveredId(null)
    setSelectedId(null)
  }, [pairId])

  useEffect(() => {
    setDraftPoints([])
    setHoverPoint(null)
  }, [tool])

  useEffect(() => {
    const activeTool = tool
    const showPreview =
      activeTool !== null &&
      (draftPoints.length > 0 || (TOOL_POINTS[activeTool] === 1 && hoverPoint !== null))
    const previewPoints = draftPoints
    const barCount =
      activeTool === 'measure' && previewPoints[0] && hoverPoint
        ? countBars(candlesRef.current, previewPoints[0].time, hoverPoint.time)
        : 0
    primitiveRef.current?.setState({
      drawings,
      selectedId,
      hoveredId,
      preview: showPreview
        ? { tool: activeTool, points: previewPoints, hover: hoverPoint, barCount }
        : null,
    })
  }, [drawings, selectedId, hoveredId, tool, draftPoints, hoverPoint, primitiveRef, candlesRef])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chartReady || !chart || !series) {
      return
    }

    const element = chart.chartElement()

    const localPoint = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    const inMainPane = (x: number, y: number) => {
      const scaleWidth = chart.priceScale('right').width()
      const timeHeight = chart.timeScale().height()
      const paneHeight = chart.panes()[0]?.getHeight() ?? element.clientHeight
      return x >= 0 && x <= element.clientWidth - scaleWidth && y >= 0 && y <= Math.min(paneHeight, element.clientHeight - timeHeight)
    }

    const toChartPoint = (x: number, y: number): ChartPoint | null => {
      if (!inMainPane(x, y)) {
        return null
      }
      const time = coordinateToUnix(chart, series, x)
      const price = series.coordinateToPrice(y)
      if (time === null || price === null) {
        return null
      }
      return { time, price }
    }

    const hitAt = (x: number, y: number): DrawingHit | null => {
      const convert = primitiveRef.current?.converter()
      if (!convert) {
        return null
      }
      return hitTestDrawing(drawingsRef.current, convert, x, y, selectedRef.current)
    }

    let press: { x: number; y: number; point: ChartPoint | null; hit: DrawingHit | null } | null = null

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isTypingTarget(event.target)) {
        return
      }
      const local = localPoint(event)
      const point = toChartPoint(local.x, local.y)
      const hit = point ? hitAt(local.x, local.y) : null
      press = { x: local.x, y: local.y, point, hit }

      if (toolRef.current) {
        if (point) {
          event.stopPropagation()
        }
        return
      }

      if (!hit || !point) {
        return
      }

      const snapshot = drawingsRef.current.find((drawing) => drawing.id === hit.id)
      if (!snapshot) {
        return
      }
      event.stopPropagation()
      event.preventDefault()
      element.setPointerCapture(event.pointerId)
      setSelectedId(hit.id)
      if (snapshot.type !== 'measure') {
        dropMeasures(null)
      }
      dragRef.current = { hit, origin: point, snapshot, moved: false }
    }

    const onPointerMove = (event: PointerEvent) => {
      const local = localPoint(event)
      const point = toChartPoint(local.x, local.y)
      if (toolRef.current) {
        setHoverPoint(point)
        setHoveredId(null)
      } else if (!dragRef.current) {
        setHoverPoint(null)
        const hit = hitAt(local.x, local.y)
        setHoveredId(hit?.id ?? null)
        element.style.cursor = hit?.kind === 'anchor' ? 'move' : hit ? 'pointer' : ''
      }

      const drag = dragRef.current
      if (!drag || !point) {
        return
      }
      const moved = Math.hypot(local.x - (press?.x ?? local.x), local.y - (press?.y ?? local.y)) > 3
      if (!moved) {
        return
      }
      drag.moved = true
      element.style.cursor = 'grabbing'
      const dTime = point.time - drag.origin.time
      const dPrice = point.price - drag.origin.price
      const next =
        drag.hit.kind === 'anchor'
          ? moveAnchor(drag.snapshot, drag.hit.index, point)
          : translateDrawing(drag.snapshot, dTime, dPrice)
      setPairDrawings((current) =>
        current.map((drawing) => (drawing.id === drag.hit.id ? withBarCount(next, candlesRef.current) : drawing)),
      )
    }

    const onPointerUp = (event: PointerEvent) => {
      const local = localPoint(event)
      const pressPoint = press
      const drag = dragRef.current
      press = null
      dragRef.current = null
      element.style.cursor = toolRef.current ? 'crosshair' : ''

      if (toolRef.current && pressPoint?.point) {
        const moved = Math.hypot(local.x - pressPoint.x, local.y - pressPoint.y) > 4
        if (!moved) {
          const activeTool = toolRef.current
          const nextPoints = [...draftRef.current, pressPoint.point]
          if (nextPoints.length >= TOOL_POINTS[activeTool]) {
            const drawing = completeDrawing(activeTool, nextPoints, candlesRef.current)
            if (drawing) {
              setPairDrawings((current) => {
                const withoutOldMeasures =
                  drawing.type === 'measure' ? current.filter((item) => item.type !== 'measure') : current
                return [...withoutOldMeasures, drawing]
              })
              setSelectedId(drawing.id)
              setTool(null)
            }
            setDraftPoints([])
          } else {
            setDraftPoints(nextPoints)
          }
        }
        return
      }

      if (drag?.moved) {
        return
      }

      if (!pressPoint?.hit && Math.hypot(local.x - (pressPoint?.x ?? local.x), local.y - (pressPoint?.y ?? local.y)) < 5) {
        setSelectedId(null)
        dropMeasures(null)
      }
    }

    const onContextMenu = (event: MouseEvent) => {
      if (!toolRef.current && draftRef.current.length === 0) {
        return
      }
      event.preventDefault()
      setDraftPoints([])
    }

    element.addEventListener('pointerdown', onPointerDown, true)
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('contextmenu', onContextMenu)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown, true)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('contextmenu', onContextMenu)
      element.style.cursor = ''
    }
  }, [chartReady, pairId, candlesRef, chartRef, primitiveRef, seriesRef])

  useEffect(() => {
    const chart = chartRef.current
    if (!chartReady || !chart) {
      return
    }
    const element = chart.chartElement()
    element.style.cursor = tool ? 'crosshair' : ''
  }, [tool, chartReady, chartRef])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return
      }
      if (event.key === 'Escape') {
        if (draftRef.current.length > 0) {
          setDraftPoints([])
          return
        }
        if (selectedRef.current) {
          const selected = drawingsRef.current.find((drawing) => drawing.id === selectedRef.current)
          if (selected?.type === 'measure') {
            dropMeasures(null)
          }
          setSelectedId(null)
          return
        }
        setTool(null)
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedRef.current) {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const selected = drawings.find((drawing) => drawing.id === selectedId) ?? null
  const selectedFib = selected?.type === 'fibRetracement' ? selected : null
  const convert = primitiveRef.current?.converter()
  const anchor = selected && convert ? anchorPoints(selected)[0] : null
  const anchorX = anchor ? convert?.timeToX(anchor.time) : null
  const anchorY = anchor ? convert?.priceToY(anchor.price) : null
  const stylePosition =
    anchorX !== null && anchorX !== undefined && anchorY !== null && anchorY !== undefined
      ? { x: Math.max(8, anchorX - 20), y: Math.max(8, anchorY - 48) }
      : null

  return {
    tool,
    setTool,
    selectedId,
    setSelectedId,
    selected,
    selectedFib,
    stylePosition,
    updateSelectedFib,
    updateSelectedStyle,
    deleteSelected,
    clearDrawings,
  }
}
