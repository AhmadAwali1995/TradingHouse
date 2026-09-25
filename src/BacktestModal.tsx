import { useState } from 'react'
import type { BacktestResult } from './backtest/runBacktest'
import './BacktestModal.css'

function dateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function startOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000)
}

function endOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000)
}

function formatSignedMoney(value: number): string {
  const body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value > 0 ? `+$${body}` : value < 0 ? `−$${body}` : `$${body}`
}

function defaultFrom(): string {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return dateInputValue(date)
}

export function BacktestModal({
  onClose,
  onRun,
}: {
  onClose: () => void
  onRun: (from: number, to: number, amount: number) => BacktestResult
}) {
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(() => dateInputValue(new Date()))
  const [amount, setAmount] = useState('1000')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const invested = Number(amount)
    if (!from || !to) {
      setError('Choose a start and an end date.')
      setResult(null)
      return
    }
    const fromTime = startOfDay(from)
    const toTime = endOfDay(to)
    if (toTime < fromTime) {
      setError('The end date has to be on or after the start date.')
      setResult(null)
      return
    }
    if (!Number.isFinite(invested) || invested <= 0) {
      setError('Enter an amount greater than zero.')
      setResult(null)
      return
    }
    try {
      setError(null)
      setResult(onRun(fromTime, toTime, invested))
    } catch (reason: unknown) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : 'Backtest failed.')
    }
  }

  return (
    <div className="backtest" role="presentation" onMouseDown={onClose}>
      <div
        className="backtest__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backtest-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="backtest__header">
          <h2 id="backtest-title">Backtest</h2>
          <button type="button" className="backtest__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="backtest__fields">
          <label>
            <span>From</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="backtest__amount">
            <span>Amount to invest</span>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        </div>
        {error ? <p className="backtest__error">{error}</p> : null}
        {result ? (
          <dl className="backtest__result">
            <div>
              <dt>Positions</dt>
              <dd>
                {result.positions}
                {result.openPositions > 0 ? ` (${result.openPositions} still open)` : ''}
              </dd>
            </div>
            <div>
              <dt>Return of investment</dt>
              <dd className={result.profit > 0 ? 'is-up' : result.profit < 0 ? 'is-down' : undefined}>
                {formatSignedMoney(result.profit)} ({result.roiPercent > 0 ? '+' : ''}
                {result.roiPercent.toFixed(2)}%)
              </dd>
            </div>
          </dl>
        ) : null}
        <div className="backtest__actions">
          <button type="button" className="backtest__button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="backtest__button backtest__button--primary" onClick={submit}>
            Run
          </button>
        </div>
      </div>
    </div>
  )
}
