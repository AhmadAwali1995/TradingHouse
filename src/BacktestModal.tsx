import { useEffect, useState } from 'react'
import { TIMEFRAMES, fetchCandles, type Candle, type TimeframeId } from './candles'
import type { Pair } from './data/config'
import type { LaNweSettings } from './indicators'
import { runLuxAlgoBacktest, type BacktestResult } from './backtest/runBacktest'
import type { RewardRatio } from './strategies'
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

function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatWhen(time: number): string {
  return new Date(time * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function moneyClass(value: number): string | undefined {
  if (value > 0) {
    return 'is-up'
  }
  if (value < 0) {
    return 'is-down'
  }
  return undefined
}

function unixToDateInput(time: number): string {
  return dateInputValue(new Date(time * 1000))
}

function clampDate(value: string, min: string, max: string): string {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

function initialFrom(min: string, max: string): string {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return clampDate(dateInputValue(date), min, max)
}

function monthKey(value: string): string {
  return value.slice(0, 7)
}

function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: dateInputValue(new Date(year, monthNumber - 1, 1)),
    to: dateInputValue(new Date(year, monthNumber, 0)),
  }
}

export function BacktestModal({
  pair,
  timeframe,
  laNweSettings,
  rewardRatio,
  onRewardRatioChange,
  onClose,
}: {
  pair: Pair
  timeframe: TimeframeId
  laNweSettings: LaNweSettings
  rewardRatio: RewardRatio
  onRewardRatioChange: (ratio: RewardRatio) => void
  onClose: () => void
}) {
  const [selectedTimeframe, setSelectedTimeframe] = useState(timeframe)
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('1000')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const firstTime = candles[0]?.time ?? null
  const lastTime = candles.at(-1)?.time ?? null
  const minDate = firstTime === null ? '' : unixToDateInput(firstTime)
  const maxDate = lastTime === null ? '' : unixToDateInput(lastTime)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResult(null)
    setMonth('')

    fetchCandles(pair, selectedTimeframe, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) {
          return
        }
        setCandles(next)
        const first = next[0]?.time
        const last = next.at(-1)?.time
        if (first === undefined || last === undefined) {
          setFrom('')
          setTo('')
          setError('No candles for this timeframe.')
        } else {
          const nextMin = unixToDateInput(first)
          const nextMax = unixToDateInput(last)
          setFrom(initialFrom(nextMin, nextMax))
          setTo(nextMax)
        }
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        setCandles([])
        setFrom('')
        setTo('')
        setLoading(false)
        setError(reason instanceof Error ? reason.message : 'Failed to load candles.')
      })

    return () => controller.abort()
  }, [pair, selectedTimeframe])

  const chooseMonth = (value: string) => {
    setMonth(value)
    if (!value || !minDate || !maxDate) {
      return
    }
    const range = monthRange(value)
    setFrom(clampDate(range.from, minDate, maxDate))
    setTo(clampDate(range.to, minDate, maxDate))
  }

  const chooseFrom = (value: string) => {
    if (!minDate || !maxDate) {
      return
    }
    const next = clampDate(value, minDate, maxDate)
    setFrom(next)
    if (month && (monthKey(next) !== month || monthKey(to) !== month)) {
      setMonth('')
    }
  }

  const chooseTo = (value: string) => {
    if (!minDate || !maxDate) {
      return
    }
    const next = clampDate(value, minDate, maxDate)
    setTo(next)
    if (month && (monthKey(from) !== month || monthKey(next) !== month)) {
      setMonth('')
    }
  }

  const submit = () => {
    const invested = Number(amount)
    if (!minDate || !maxDate) {
      setError('Chart data is not loaded yet.')
      setResult(null)
      return
    }
    const nextFrom = clampDate(from, minDate, maxDate)
    const nextTo = clampDate(to, minDate, maxDate)
    setFrom(nextFrom)
    setTo(nextTo)
    if (!nextFrom || !nextTo) {
      setError('Choose a start and an end date.')
      setResult(null)
      return
    }
    const fromTime = Math.max(startOfDay(nextFrom), firstTime ?? startOfDay(nextFrom))
    const toTime = Math.min(endOfDay(nextTo), lastTime ?? endOfDay(nextTo))
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
      setResult(
        runLuxAlgoBacktest({
          candles,
          laNweSettings,
          rewardRatio,
          from: fromTime,
          to: toTime,
          amount: invested,
        }),
      )
    } catch (reason: unknown) {
      setResult(null)
      setError(reason instanceof Error ? reason.message : 'Backtest failed.')
    }
  }

  return (
    <div className="backtest" role="presentation" onMouseDown={onClose}>
      <div
        className={result ? 'backtest__dialog is-expanded' : 'backtest__dialog'}
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
            <span>Timeframe</span>
            <select
              value={selectedTimeframe}
              onChange={(event) => setSelectedTimeframe(event.target.value as TimeframeId)}
            >
              {TIMEFRAMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Month</span>
            <input
              type="month"
              min={minDate ? monthKey(minDate) : undefined}
              max={maxDate ? monthKey(maxDate) : undefined}
              value={month}
              disabled={!minDate || !maxDate}
              onChange={(event) => chooseMonth(event.target.value)}
            />
          </label>
          <label>
            <span>From</span>
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={from}
              disabled={!minDate || !maxDate}
              onChange={(event) => chooseFrom(event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              min={minDate}
              max={maxDate}
              value={to}
              disabled={!minDate || !maxDate}
              onChange={(event) => chooseTo(event.target.value)}
            />
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
          <div className="backtest__ratio-field">
            <span>RRR</span>
            <div className="backtest__ratio" role="radiogroup" aria-label="Reward to risk">
              {([2, 3] as const).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  role="radio"
                  className={rewardRatio === ratio ? 'backtest__ratio-button is-active' : 'backtest__ratio-button'}
                  aria-checked={rewardRatio === ratio}
                  onClick={() => onRewardRatioChange(ratio)}
                >
                  1:{ratio}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error ? <p className="backtest__error">{error}</p> : null}
        {result ? (
          <>
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
                <dd className={moneyClass(result.profit)}>
                  {formatSignedMoney(result.profit)} ({result.roiPercent > 0 ? '+' : ''}
                  {result.roiPercent.toFixed(2)}%)
                </dd>
              </div>
              <div>
                <dt>Wins / losses</dt>
                <dd>
                  {result.wins} / {result.losses} ({result.winRate.toFixed(1)}%)
                </dd>
              </div>
              <div>
                <dt>Longs / shorts</dt>
                <dd>
                  {result.longs} / {result.shorts}
                </dd>
              </div>
              <div>
                <dt>Profit factor</dt>
                <dd>
                  {result.profitFactor === null ? (result.wins > 0 ? '∞' : '—') : result.profitFactor.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt>Max drawdown</dt>
                <dd className={result.maxDrawdown > 0 ? 'is-down' : undefined}>
                  {formatMoney(result.maxDrawdown)} ({result.maxDrawdownPercent.toFixed(2)}%)
                </dd>
              </div>
              <div>
                <dt>Ending balance</dt>
                <dd className={moneyClass(result.profit)}>
                  {formatMoney(result.endingBalance)}
                </dd>
              </div>
            </dl>
            <div className="backtest__trades">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Side</th>
                    <th>Result</th>
                    <th>P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No positions in this range.</td>
                    </tr>
                  ) : (
                    result.trades.map((trade) => (
                      <tr key={`${trade.time}-${trade.side}`}>
                        <td>{formatWhen(trade.time)}</td>
                        <td>{trade.side === 'long' ? 'Long' : 'Short'}</td>
                        <td>{trade.result === 'target' ? 'Target' : trade.result === 'stop' ? 'Stop' : 'Open'}</td>
                        <td className={moneyClass(trade.profit)}>
                          {trade.result === 'open' ? '—' : formatSignedMoney(trade.profit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        <div className="backtest__actions">
          <button type="button" className="backtest__button" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="backtest__button backtest__button--primary"
            onClick={submit}
            disabled={loading || candles.length === 0}
          >
            {loading ? 'Loading…' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}
