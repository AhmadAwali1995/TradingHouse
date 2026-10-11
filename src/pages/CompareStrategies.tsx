import { useEffect, useMemo, useState } from 'react'
import type { BacktestResult } from '../backtest/runBacktest'
import type { TimeframeId } from '../candles'
import type { Pair } from '../data/config'
import {
  REWARD_RATIOS,
  STRATEGY_ITEMS,
  type RewardRatio,
  type StrategyEntrySettings,
  type StrategyId,
} from '../strategies'
import type { DataMode } from '../testCandles'
import {
  clampDate,
  endOfDay,
  formatMoney,
  formatMonth,
  formatSignedMoney,
  moneyClass,
  monthDateRange,
  monthsInCandles,
  reportPairs,
  reportTimeframes,
  runStrategyRange,
  startOfDay,
  statusCounts,
  unixToDateInput,
  useReportCandles,
} from './report'
import { ReportLoader } from './ReportLoader'
import './report.css'

export function CompareStrategies({
  pairs,
  pair,
  timeframe,
  dataMode,
  entries,
  onPairChange,
  onTimeframeChange,
}: {
  pairs: Pair[]
  pair: Pair
  timeframe: TimeframeId
  dataMode: DataMode
  entries: StrategyEntrySettings
  onPairChange: (pair: Pair) => void
  onTimeframeChange: (timeframe: TimeframeId) => void
}) {
  const { candles, loading, error } = useReportCandles(pair, timeframe, dataMode)
  const months = useMemo(() => monthsInCandles(candles), [candles])
  const minDate = candles[0] ? unixToDateInput(candles[0].time) : ''
  const maxDate = candles.at(-1) ? unixToDateInput(candles.at(-1)!.time) : ''
  const [month, setMonth] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('1000')
  const [leftId, setLeftId] = useState<StrategyId>('betterRsi')
  const [rightId, setRightId] = useState<StrategyId>('rsiEnh')
  const [leftRatio, setLeftRatio] = useState<RewardRatio>(2)
  const [rightRatio, setRightRatio] = useState<RewardRatio>(2)
  const availablePairs = reportPairs(pairs, dataMode)
  const timeframes = reportTimeframes(dataMode)

  useEffect(() => {
    if (!minDate || !maxDate || months.length === 0) {
      return
    }
    const last = months[months.length - 1]
    const range = clampedMonthRange(last, minDate, maxDate)
    setMonth(last)
    setFrom(range.from)
    setTo(range.to)
  }, [minDate, maxDate, months])

  const invested = Number(amount)
  const ready = from !== '' && to !== '' && from <= to && Number.isFinite(invested) && invested > 0 && candles.length > 0
  const [left, setLeft] = useState<BacktestResult | null>(null)
  const [right, setRight] = useState<BacktestResult | null>(null)
  const [working, setWorking] = useState(true)

  useEffect(() => {
    if (!ready) {
      if (!loading) {
        setLeft(null)
        setRight(null)
        setWorking(false)
      }
      return
    }
    setWorking(true)
    let timer = 0
    let cancelled = false
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        setLeft(runStrategyRange(candles, startOfDay(from), endOfDay(to), leftId, leftRatio, invested, entries))
        setRight(runStrategyRange(candles, startOfDay(from), endOfDay(to), rightId, rightRatio, invested, entries))
        setWorking(false)
      }, 32)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [ready, loading, candles, from, to, leftId, leftRatio, rightId, rightRatio, invested, entries])

  const rows = left && right ? comparisonRows(left, right) : []

  function chooseMonth(nextMonth: string) {
    if (!nextMonth || !minDate || !maxDate) {
      return
    }
    const range = clampedMonthRange(nextMonth, minDate, maxDate)
    setMonth(nextMonth)
    setFrom(range.from)
    setTo(range.to)
  }

  function chooseFrom(value: string) {
    if (!minDate || !maxDate) {
      return
    }
    const nextFrom = clampDate(value, minDate, maxDate)
    const nextTo = to && nextFrom > to ? nextFrom : to
    setFrom(nextFrom)
    setTo(nextTo)
    setMonth(monthMatching(nextFrom, nextTo, months, minDate, maxDate))
  }

  function chooseTo(value: string) {
    if (!minDate || !maxDate) {
      return
    }
    const nextTo = clampDate(value, minDate, maxDate)
    const nextFrom = from && nextTo < from ? nextTo : from
    setFrom(nextFrom)
    setTo(nextTo)
    setMonth(monthMatching(nextFrom, nextTo, months, minDate, maxDate))
  }

  return (
    <section className="report">
      <div className="report__filters">
        <label>
          <span>Pair</span>
          <select
            value={pair.id}
            onChange={(event) => {
              const next = availablePairs.find((item) => item.id === event.target.value)
              if (next) {
                onPairChange(next)
              }
            }}
          >
            {availablePairs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.symbol}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Timeframe</span>
          <select value={timeframe} onChange={(event) => onTimeframeChange(event.target.value as TimeframeId)}>
            {timeframes.map((item) => (
              <option key={item.id} value={item.id} disabled={item.disabled}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Month</span>
          <select
            value={month}
            onChange={(event) => chooseMonth(event.target.value)}
            disabled={months.length === 0 || !minDate || !maxDate}
          >
            {month === '' ? <option value="">Custom</option> : null}
            {months.map((item) => (
              <option key={item} value={item}>
                {formatMonth(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <input
            className="report__date"
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
            className="report__date"
            type="date"
            min={minDate}
            max={maxDate}
            value={to}
            disabled={!minDate || !maxDate}
            onChange={(event) => chooseTo(event.target.value)}
          />
        </label>
        <label>
          <span>Amount</span>
          <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
      </div>
      {loading || working ? <ReportLoader label={loading ? 'Loading candles…' : 'Calculating…'} /> : null}
      {error ? <p className="report__status">{error}</p> : null}
      {!loading && !error && !ready ? <p className="report__status">Enter an amount greater than zero.</p> : null}
      {!working && left && right ? (
        <>
          <div className="report__sides">
            <StrategySide
              title="Strategy A"
              strategyId={leftId}
              ratio={leftRatio}
              result={left}
              onStrategyChange={setLeftId}
              onRatioChange={setLeftRatio}
            />
            <StrategySide
              title="Strategy B"
              strategyId={rightId}
              ratio={rightRatio}
              result={right}
              onStrategyChange={setRightId}
              onRatioChange={setRightRatio}
            />
          </div>
          <div className="report__table-wrap">
            <table className="report__table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>{labelOf(leftId)}</th>
                  <th>{labelOf(rightId)}</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <th>{row.label}</th>
                    <td className={row.kind === 'money' ? moneyClass(row.left) : undefined}>{row.leftText}</td>
                    <td className={row.kind === 'money' ? moneyClass(row.right) : undefined}>{row.rightText}</td>
                    <td className={moneyClass(row.delta)}>{row.deltaText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}

function StrategySide({
  title,
  strategyId,
  ratio,
  result,
  onStrategyChange,
  onRatioChange,
}: {
  title: string
  strategyId: StrategyId
  ratio: RewardRatio
  result: ReturnType<typeof runStrategyRange>
  onStrategyChange: (strategyId: StrategyId) => void
  onRatioChange: (ratio: RewardRatio) => void
}) {
  const counts = statusCounts(result)
  return (
    <article className="report__side">
      <h2>{title}</h2>
      <label>
        <span>Strategy</span>
        <select value={strategyId} onChange={(event) => onStrategyChange(event.target.value as StrategyId)}>
          {STRATEGY_ITEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <div className="report__ratios" role="radiogroup" aria-label={`${title} reward to risk`}>
        {REWARD_RATIOS.map((item) => (
          <button
            key={item}
            type="button"
            className={ratio === item ? 'is-active' : undefined}
            aria-pressed={ratio === item}
            onClick={() => onRatioChange(item)}
          >
            1:{item}
          </button>
        ))}
      </div>
      <p className={`report__profit ${moneyClass(result.profit) ?? ''}`}>{formatSignedMoney(result.profit)}</p>
      <p className="report__meta">
        {result.wins} wins · {result.losses} losses · {result.winRate.toFixed(1)}%
      </p>
      <p className="report__meta">
        Take profit {counts.target} · Stop {counts.stop} · Signal {counts.signal} · Open {counts.open}
      </p>
    </article>
  )
}

function labelOf(strategyId: StrategyId): string {
  return STRATEGY_ITEMS.find((item) => item.id === strategyId)?.label ?? strategyId
}

function clampedMonthRange(month: string, minDate: string, maxDate: string) {
  const range = monthDateRange(month)
  return {
    from: clampDate(range.from, minDate, maxDate),
    to: clampDate(range.to, minDate, maxDate),
  }
}

function monthMatching(from: string, to: string, months: string[], minDate: string, maxDate: string): string {
  return (
    months.find((month) => {
      const range = clampedMonthRange(month, minDate, maxDate)
      return range.from === from && range.to === to
    }) ?? ''
  )
}

function comparisonRows(left: ReturnType<typeof runStrategyRange>, right: ReturnType<typeof runStrategyRange>) {
  const leftCounts = statusCounts(left)
  const rightCounts = statusCounts(right)
  const count = (label: string, leftValue: number, rightValue: number) => ({
    label,
    kind: 'count' as const,
    left: leftValue,
    right: rightValue,
    delta: rightValue - leftValue,
    leftText: String(leftValue),
    rightText: String(rightValue),
    deltaText: formatDelta(rightValue - leftValue),
  })
  const money = (label: string, leftValue: number, rightValue: number) => ({
    label,
    kind: 'money' as const,
    left: leftValue,
    right: rightValue,
    delta: rightValue - leftValue,
    leftText: formatSignedMoney(leftValue),
    rightText: formatSignedMoney(rightValue),
    deltaText: formatSignedMoney(rightValue - leftValue),
  })
  return [
    count('Positions', left.positions, right.positions),
    count('Take profit', leftCounts.target, rightCounts.target),
    count('Stop', leftCounts.stop, rightCounts.stop),
    count('Signal', leftCounts.signal, rightCounts.signal),
    count('Open', leftCounts.open, rightCounts.open),
    count('Wins', left.wins, right.wins),
    count('Losses', left.losses, right.losses),
    {
      label: 'Win rate',
      kind: 'count' as const,
      left: left.winRate,
      right: right.winRate,
      delta: right.winRate - left.winRate,
      leftText: `${left.winRate.toFixed(1)}%`,
      rightText: `${right.winRate.toFixed(1)}%`,
      deltaText: `${formatDelta(right.winRate - left.winRate, 1)}%`,
    },
    money('Profit', left.profit, right.profit),
    {
      label: 'Return',
      kind: 'money' as const,
      left: left.roiPercent,
      right: right.roiPercent,
      delta: right.roiPercent - left.roiPercent,
      leftText: `${left.roiPercent.toFixed(2)}%`,
      rightText: `${right.roiPercent.toFixed(2)}%`,
      deltaText: `${formatDelta(right.roiPercent - left.roiPercent, 2)}%`,
    },
    {
      label: 'Profit factor',
      kind: 'count' as const,
      left: left.profitFactor ?? 0,
      right: right.profitFactor ?? 0,
      delta: (right.profitFactor ?? 0) - (left.profitFactor ?? 0),
      leftText: factorText(left.profitFactor),
      rightText: factorText(right.profitFactor),
      deltaText:
        left.profitFactor === null || right.profitFactor === null
          ? '—'
          : formatDelta(right.profitFactor - left.profitFactor, 2),
    },
    money('Max drawdown', -left.maxDrawdown, -right.maxDrawdown),
    {
      label: 'Ending balance',
      kind: 'money' as const,
      left: left.endingBalance,
      right: right.endingBalance,
      delta: right.endingBalance - left.endingBalance,
      leftText: formatMoney(left.endingBalance),
      rightText: formatMoney(right.endingBalance),
      deltaText: formatSignedMoney(right.endingBalance - left.endingBalance),
    },
  ]
}

function factorText(value: number | null): string {
  if (value === null) {
    return '—'
  }
  return value.toFixed(2)
}

function formatDelta(value: number, digits = 0): string {
  const body = digits === 0 ? String(Math.abs(value)) : Math.abs(value).toFixed(digits)
  if (value > 0) {
    return `+${body}`
  }
  if (value < 0) {
    return `−${body}`
  }
  return digits === 0 ? '0' : (0).toFixed(digits)
}
