import { useEffect, useRef, useState } from 'react'
import type { DrawingTool } from './types'
import './DrawingToolbar.css'

const LINE_TOOLS: { id: DrawingTool; label: string }[] = [
  { id: 'trendline', label: 'Trendline' },
  { id: 'channel', label: 'Channel' },
  { id: 'horizontalLine', label: 'Horizontal line' },
  { id: 'horizontalRay', label: 'Horizontal ray' },
  { id: 'parallelChannel', label: 'Parallel channel' },
]

const LINE_IDS = new Set(LINE_TOOLS.map((item) => item.id))

function Handle({ x, y }: { x: number; y: number }) {
  return <rect x={x - 2.2} y={y - 2.2} width="4.4" height="4.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
}

function ToolIcon({ id }: { id: DrawingTool }) {
  if (id === 'trendline') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <line x1="7" y1="21" x2="21" y2="7" stroke="currentColor" strokeWidth="1.4" />
        <Handle x={7} y={21} />
        <Handle x={21} y={7} />
      </svg>
    )
  }

  if (id === 'channel') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <line x1="5" y1="18" x2="17" y2="6" stroke="currentColor" strokeWidth="1.4" />
        <line x1="11" y1="22" x2="23" y2="10" stroke="currentColor" strokeWidth="1.4" />
        <Handle x={5} y={18} />
        <Handle x={17} y={6} />
        <Handle x={23} y={10} />
      </svg>
    )
  }

  if (id === 'horizontalLine') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <line x1="4" y1="14" x2="24" y2="14" stroke="currentColor" strokeWidth="1.4" />
        <Handle x={6} y={14} />
        <Handle x={22} y={14} />
      </svg>
    )
  }

  if (id === 'horizontalRay') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <line x1="6" y1="14" x2="24" y2="14" stroke="currentColor" strokeWidth="1.4" />
        <Handle x={6} y={14} />
      </svg>
    )
  }

  if (id === 'parallelChannel') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <line x1="3" y1="17" x2="19" y2="5" stroke="currentColor" strokeWidth="1.4" />
        <line x1="9" y1="23" x2="25" y2="11" stroke="currentColor" strokeWidth="1.4" />
        <Handle x={5} y={15.5} />
        <Handle x={17} y={6.5} />
        <Handle x={23} y={12.5} />
      </svg>
    )
  }

  if (id === 'fibRetracement') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <line x1="8" y1="6" x2="24" y2="6" stroke="currentColor" strokeWidth="1.3" />
        <line x1="6" y1="11" x2="24" y2="11" stroke="currentColor" strokeWidth="1.3" />
        <line x1="10" y1="16" x2="24" y2="16" stroke="currentColor" strokeWidth="1.3" />
        <line x1="5" y1="21" x2="24" y2="21" stroke="currentColor" strokeWidth="1.3" />
        <line x1="5" y1="21" x2="14" y2="6" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }

  if (id === 'elliottImpulse') {
    return (
      <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
        <polyline
          points="3,22 8,10 12,16 18,5 24,13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
      <line x1="7" y1="21" x2="21" y2="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 21 V15 M7 21 H13 M21 7 V13 M21 7 H15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function DrawingToolbar({
  tool,
  onSelectTool,
}: {
  tool: DrawingTool | null
  onSelectTool: (tool: DrawingTool | null) => void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lineTool, setLineTool] = useState<DrawingTool>('trendline')
  const shownLine =
    LINE_TOOLS.find((item) => item.id === (tool !== null && LINE_IDS.has(tool) ? tool : lineTool)) ?? LINE_TOOLS[0]
  const lineActive = tool !== null && LINE_IDS.has(tool)

  const selectTool = (id: DrawingTool) => {
    if (LINE_IDS.has(id)) {
      setLineTool(id)
    }
    onSelectTool(tool === id ? null : id)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  return (
    <aside className="drawing-toolbar" aria-label="Drawing tools" ref={rootRef}>
      <div className="drawing-toolbar__group">
        <div className={lineActive ? 'drawing-toolbar__split is-active' : 'drawing-toolbar__split'}>
          <button
            type="button"
            className="drawing-toolbar__button"
            aria-label={shownLine.label}
            title={shownLine.label}
            aria-pressed={lineActive}
            onClick={() => selectTool(shownLine.id)}
          >
            <ToolIcon id={shownLine.id} />
          </button>
          <button
            type="button"
            className="drawing-toolbar__chevron"
            aria-label="Line tools"
            aria-expanded={menuOpen}
            title="Line tools"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true">
              <path d="M0 0 L4 5 L8 0 Z" fill="currentColor" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="drawing-toolbar__menu" role="menu" aria-label="Line tools">
              {LINE_TOOLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={tool === item.id}
                  className={tool === item.id ? 'drawing-toolbar__menu-item is-active' : 'drawing-toolbar__menu-item'}
                  onClick={() => selectTool(item.id)}
                >
                  <ToolIcon id={item.id} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={tool === 'fibRetracement' ? 'drawing-toolbar__button is-active' : 'drawing-toolbar__button'}
          aria-label="Fib retracement"
          title="Fib retracement"
          aria-pressed={tool === 'fibRetracement'}
          onClick={() => selectTool('fibRetracement')}
        >
          <ToolIcon id="fibRetracement" />
        </button>

        <button
          type="button"
          className={tool === 'elliottImpulse' ? 'drawing-toolbar__button is-active' : 'drawing-toolbar__button'}
          aria-label="Elliott impulse wave (12345)"
          title="Elliott impulse wave (12345)"
          aria-pressed={tool === 'elliottImpulse'}
          onClick={() => selectTool('elliottImpulse')}
        >
          <ToolIcon id="elliottImpulse" />
        </button>
      </div>

      <div className="drawing-toolbar__separator" />

      <div className="drawing-toolbar__group">
        <button
          type="button"
          className={tool === 'measure' ? 'drawing-toolbar__button is-active' : 'drawing-toolbar__button'}
          aria-label="Measure"
          title="Measure"
          aria-pressed={tool === 'measure'}
          onClick={() => selectTool('measure')}
        >
          <ToolIcon id="measure" />
        </button>
      </div>
    </aside>
  )
}
