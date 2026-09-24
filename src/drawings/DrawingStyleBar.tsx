import type { Drawing, DrawingLineStyle } from './types'
import './DrawingStyleBar.css'

const WIDTHS = [1, 2, 3, 4]

export function DrawingStyleBar({
  drawing,
  position,
  onChange,
  onDelete,
}: {
  drawing: Drawing
  position: { x: number; y: number }
  onChange: (patch: Partial<Pick<Drawing, 'color' | 'lineWidth' | 'lineStyle'>>) => void
  onDelete: () => void
}) {
  return (
    <div className="drawing-style" role="toolbar" aria-label="Drawing style" style={{ left: position.x, top: position.y }}>
      <label className="drawing-style__color">
        <span className="drawing-style__swatch" style={{ background: drawing.color }} />
        <input
          type="color"
          value={drawing.color}
          aria-label="Line color"
          onChange={(event) => onChange({ color: event.target.value })}
        />
      </label>
      <select
        aria-label="Line width"
        value={drawing.lineWidth}
        onChange={(event) => onChange({ lineWidth: Number(event.target.value) })}
      >
        {WIDTHS.map((width) => (
          <option key={width} value={width}>
            {width}px
          </option>
        ))}
      </select>
      <select
        aria-label="Line style"
        value={drawing.lineStyle}
        onChange={(event) => onChange({ lineStyle: event.target.value as DrawingLineStyle })}
      >
        <option value="solid">Solid</option>
        <option value="dashed">Dashed</option>
        <option value="dotted">Dotted</option>
      </select>
      <button type="button" aria-label="Delete drawing" title="Delete" onClick={onDelete}>
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path d="M6 6 H14 M8 6 V5 H12 V6 M7 8 V15 H13 V8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
