import { useEffect, useMemo, useState } from 'react'
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
  formatMonth,
  formatSignedMoney,
  moneyClass,
  monthsInCandles,
  reportPairs,
  reportTimeframes,
  runStrategyMonth,
  statusCounts,
  useReportCandles,
} from './report'
import { ReportLoader } from './ReportLoader'
import './report.css'

type MonthRow = {
  month: string
  result: ReturnType<typeof runStrategyMonth>
  counts: ReturnType<typeof statusCounts>
}

export function MonthlyPerformance({
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
  const [strategyId, setStrategyId] = useState<StrategyId>('rsiEnh')
  const [ratio, setRatio] = useState<RewardRatio>(2)
  const [amount, setAmount] = useState('1000')
  const availablePairs = reportPairs(pairs, dataMode)
  const timeframes = reportTimeframes(dataMode)
  const invested = Number(amount)
  const ready = Number.isFinite(invested) && invested > 0 && candles.length > 0
  const [rows, setRows] = useState<MonthRow[]>([])
  const [working, setWorking] = useState(true)

  useEffect(() => {
    if (!ready) {
      if (!loading) {
        setRows([])
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
        setRows(
          months.map((month) => {
            const result = runStrategyMonth(candles, month, strategyId, ratio, invested, entries)
            return { month, result, counts: statusCounts(result) }
          }),
        )
        setWorking(false)
      }, 32)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [ready, loading, months, candles, strategyId, ratio, invested, entries])

  const totals = rows.reduce(
    (sum, row) => {
      sum.positions += row.result.positions
      sum.wins += row.result.wins
      sum.losses += row.result.losses
      sum.profit += row.result.profit
      sum.target += row.counts.target
      sum.stop += row.counts.stop
      sum.signal += row.counts.signal
      return sum
    },
    { positions: 0, wins: 0, losses: 0, profit: 0, target: 0, stop: 0, signal: 0 },
  )

  return (
    <section className="report">
      <div className="report__filters">
        <label>
          <span>Strategy</span>
          <select value={strategyId} onChange={(event) => setStrategyId(event.target.value as StrategyId)}>
            {STRATEGY_ITEMS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
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
          <span>Amount</span>
          <input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <div className="report__ratios" role="radiogroup" aria-label="Reward to risk">
          {REWARD_RATIOS.map((item) => (
            <button
              key={item}
              type="button"
              className={ratio === item ? 'is-active' : undefined}
              aria-pressed={ratio === item}
              onClick={() => setRatio(item)}
            >
              1:{item}
            </button>
          ))}
        </div>
      </div>
      {loading || working ? <ReportLoader label={loading ? 'Loading candles…' : 'Calculating…'} /> : null}
      {error ? <p className="report__status">{error}</p> : null}
      {!loading && !error && !ready ? <p className="report__status">Enter an amount greater than zero.</p> : null}
      {!working && ready && rows.length > 0 ? (
        <div className="report__table-wrap">
          <table className="report__table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Positions</th>
                <th>Take profit</th>
                <th>Stop</th>
                <th>Signal</th>
                <th>Open</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Win rate</th>
                <th>Profit</th>
                <th>Return</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month}>
                  <th>{formatMonth(row.month)}</th>
                  <td>{row.result.positions}</td>
                  <td>{row.counts.target}</td>
                  <td>{row.counts.stop}</td>
                  <td>{row.counts.signal}</td>
                  <td>{row.counts.open}</td>
                  <td>{row.result.wins}</td>
                  <td>{row.result.losses}</td>
                  <td>{row.result.winRate.toFixed(1)}%</td>
                  <td className={moneyClass(row.result.profit)}>{formatSignedMoney(row.result.profit)}</td>
                  <td className={moneyClass(row.result.roiPercent)}>{row.result.roiPercent.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>All months</th>
                <td>{totals.positions}</td>
                <td>{totals.target}</td>
                <td>{totals.stop}</td>
                <td>{totals.signal}</td>
                <td>—</td>
                <td>{totals.wins}</td>
                <td>{totals.losses}</td>
                <td>{totals.wins + totals.losses > 0 ? ((totals.wins / (totals.wins + totals.losses)) * 100).toFixed(1) : '0.0'}%</td>
                <td className={moneyClass(totals.profit)}>{formatSignedMoney(totals.profit)}</td>
                <td className={moneyClass(totals.profit)}>{invested > 0 ? ((totals.profit / invested) * 100).toFixed(2) : '0.00'}%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </section>
  )
}
