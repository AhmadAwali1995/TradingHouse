import type { Candle } from '../candles'
import { accountMove, longRiskPercent, positionExitTime, positionTrigger } from './position'
import type { PositionDrawing } from './types'

function money(value: number): string {
  const body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value > 0 ? `+${body}` : value < 0 ? `−${body}` : body
}

function price(value: number): string {
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 4 : 6
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

function when(time: number): string {
  return new Date(time * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function OrderBoxModal({
  drawing,
  candles,
  onClose,
}: {
  drawing: PositionDrawing
  candles: Candle[]
  onClose: () => void
}) {
  const long = drawing.type === 'longPosition'
  const trigger = positionTrigger(drawing, candles)
  const naturalExit = positionExitTime(drawing, candles)
  const signalExit = naturalExit !== null && drawing.endTime < naturalExit
  const exitPrice = signalExit
    ? candles.find((candle) => candle.time === drawing.endTime)?.close
    : trigger === 'target'
      ? drawing.targetPrice
      : trigger === 'stop'
        ? drawing.stopPrice
        : null
  const profit =
    exitPrice === undefined || exitPrice === null
      ? null
      : accountMove(drawing.accountSize, drawing.entryPrice, long ? exitPrice : drawing.entryPrice * 2 - exitPrice)
  const risk = long ? longRiskPercent(drawing.entryPrice, drawing.stopPrice) : null
  const riskDist = Math.abs(drawing.entryPrice - drawing.stopPrice)
  const reward = riskDist > 0 ? Math.abs(drawing.targetPrice - drawing.entryPrice) / riskDist : null
  const status = signalExit ? 'Signal' : trigger === 'target' ? 'Take profit' : trigger === 'stop' ? 'Stop loss' : 'Open'
  const rows = [
    ['Status', status],
    ['Entry', price(drawing.entryPrice)],
    ['Stop', price(drawing.stopPrice)],
    ['Target', price(drawing.targetPrice)],
    ['Risk', risk === null ? '—' : `${risk.toFixed(2)}%`],
    ['Reward', reward === null ? '—' : `1:${reward.toFixed(2)}`],
    ['P&L', profit === null ? '—' : money(profit)],
    ['Opened', when(drawing.startTime)],
    ['Closed', exitPrice === undefined || exitPrice === null ? '—' : when(signalExit ? drawing.endTime : (naturalExit ?? drawing.endTime))],
  ]

  return (
    <div className="order-box" role="presentation" onMouseDown={onClose}>
      <div
        className="order-box__dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${long ? 'Long' : 'Short'} order`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="order-box__header">
          <h2>{long ? 'Long' : 'Short'} order</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
