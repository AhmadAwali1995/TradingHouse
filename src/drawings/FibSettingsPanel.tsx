import type { FibSettings } from './types'

export function FibSettingsPanel({
  settings,
  onChange,
  onClose,
}: {
  settings: FibSettings
  onChange: (settings: FibSettings) => void
  onClose: () => void
}) {
  return (
    <div className="candle-chart__settings candle-chart__settings--tv-macd">
      <p className="candle-chart__settings-title">Fib retracement</p>
      <div className="candle-chart__settings-grid">
        <label className="candle-chart__settings-check">
          <span>Reverse</span>
          <input
            type="checkbox"
            checked={settings.reverse}
            onChange={(event) => onChange({ ...settings, reverse: event.target.checked })}
          />
        </label>
        <label className="candle-chart__settings-check">
          <span>Extend left</span>
          <input
            type="checkbox"
            checked={settings.extendLeft}
            onChange={(event) => onChange({ ...settings, extendLeft: event.target.checked })}
          />
        </label>
        <label className="candle-chart__settings-check">
          <span>Extend right</span>
          <input
            type="checkbox"
            checked={settings.extendRight}
            onChange={(event) => onChange({ ...settings, extendRight: event.target.checked })}
          />
        </label>
        <label className="candle-chart__settings-check">
          <span>Show labels</span>
          <input
            type="checkbox"
            checked={settings.showLabels}
            onChange={(event) => onChange({ ...settings, showLabels: event.target.checked })}
          />
        </label>
        <label className="candle-chart__settings-check">
          <span>Fill</span>
          <input
            type="checkbox"
            checked={settings.fill}
            onChange={(event) => onChange({ ...settings, fill: event.target.checked })}
          />
        </label>
      </div>
      <p className="candle-chart__settings-title">Levels</p>
      <div className="candle-chart__settings-grid">
        {settings.levels.map((level, index) => (
          <label key={level.value} className="candle-chart__settings-check">
            <span>
              <input
                type="checkbox"
                checked={level.visible}
                onChange={(event) => {
                  const levels = settings.levels.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, visible: event.target.checked } : item,
                  )
                  onChange({ ...settings, levels })
                }}
              />{' '}
              {level.value}
            </span>
            <input
              type="color"
              value={level.color}
              onChange={(event) => {
                const levels = settings.levels.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, color: event.target.value } : item,
                )
                onChange({ ...settings, levels })
              }}
              aria-label={`${level.value} color`}
            />
          </label>
        ))}
      </div>
      <div className="candle-chart__settings-actions">
        <button type="button" className="candle-chart__settings-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
