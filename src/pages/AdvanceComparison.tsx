import { useEffect, useMemo, useState } from 'react'
import type { Candle, TimeframeId } from '../candles'
import type { Pair } from '../data/config'
import { DEFAULT_MA_RIBBON_SETTINGS } from '../indicators/maRibbon/maRibbon'
import { runMaDcDynamicBacktest, runSmaDcBacktest } from '../backtest/runBacktest'
import { type SmaDcRatio } from '../strategies/smaDc'
import type { DataMode } from '../testCandles'
import {
  formatMonth,
  formatSignedMoney,
  moneyClass,
  monthBounds,
  monthsInCandles,
  reportPairs,
  reportTimeframes,
  statusCounts,
  useReportCandleMap,
} from './report'
import { ReportLoader } from './ReportLoader'
import './report.css'

const COMPARISON_STRATEGIES = [
  { id: 'sma', label: 'MA_DC', requireAboveSlowMa: false, dynamic: false },
  { id: 'maDcDynamic', label: 'MA_DC_dynamic', requireAboveSlowMa: false, dynamic: true },
  { id: 'smaDc', label: 'SMA_DC', requireAboveSlowMa: true, dynamic: false },
] as const

const RATIOS = [2, 3] as const satisfies readonly SmaDcRatio[]

type MonthRow = {
  month: string
  positions: number
  target: number
  stop: number
  signal: number
  open: number
  wins: number
  losses: number
  winRate: number
  profit: number
  roiPercent: number
}

type BlockTotals = {
  wins: number
  stop: number
  signal: number
  returnPercent: number
}

type ComparisonBlock = {
  key: string
  title: string
  rows: MonthRow[]
  totals: BlockTotals
}

type SortKey = 'return' | 'wins' | 'stop' | 'signal'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'return', label: 'Total return' },
  { key: 'wins', label: 'Wins' },
  { key: 'stop', label: 'Stop' },
  { key: 'signal', label: 'Signal' },
]

export function AdvanceComparison({
  pairs,
  timeframe,
  dataMode,
  onTimeframeChange,
}: {
  pairs: Pair[]
  timeframe: TimeframeId
  dataMode: DataMode
  onTimeframeChange: (timeframe: TimeframeId) => void
}) {
  const availablePairs = useMemo(() => reportPairs(pairs, dataMode), [pairs, dataMode])
  const { candlesById, loading, error } = useReportCandleMap(availablePairs, timeframe, dataMode)
  const timeframes = reportTimeframes(dataMode)
  const [ratio, setRatio] = useState<SmaDcRatio>(2)
  const [amount, setAmount] = useState('1000')
  const [blocks, setBlocks] = useState<ComparisonBlock[]>([])
  const [working, setWorking] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('return')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({})
  const invested = Number(amount)
  const ready = Number.isFinite(invested) && invested > 0 && !loading && !error

  useEffect(() => {
    if (!ready) {
      if (!loading) {
        setBlocks([])
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
        setBlocks(buildBlocks(availablePairs, candlesById, ratio, invested))
        setWorking(false)
      }, 32)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [ready, loading, availablePairs, candlesById, ratio, invested])

  const ordered = useMemo(() => {
    const direction = sortDir === 'asc' ? 1 : -1
    return [...blocks].sort((left, right) => {
      const delta = sortValue(left, sortKey) - sortValue(right, sortKey)
      if (delta !== 0) {
        return delta * direction
      }
      return left.title.localeCompare(right.title)
    })
  }, [blocks, sortKey, sortDir])

  return (
    <section className="report">
      <div className="report__filters">
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
          {RATIOS.map((item) => (
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
        <label>
          <span>Order by</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            {SORTS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="report__ratios" role="radiogroup" aria-label="Sort direction">
          <button
            type="button"
            className={sortDir === 'desc' ? 'is-active' : undefined}
            aria-pressed={sortDir === 'desc'}
            onClick={() => setSortDir('desc')}
          >
            Desc
          </button>
          <button
            type="button"
            className={sortDir === 'asc' ? 'is-active' : undefined}
            aria-pressed={sortDir === 'asc'}
            onClick={() => setSortDir('asc')}
          >
            Asc
          </button>
        </div>
      </div>
      {loading || working ? <ReportLoader label={loading ? 'Loading candles…' : 'Calculating…'} /> : null}
      {error ? <p className="report__status">{error}</p> : null}
      {!loading && !error && !ready ? <p className="report__status">Enter an amount greater than zero.</p> : null}
      {!working && ordered.map((block) => {
        const open = openKeys[block.key] === true
        return (
          <section key={block.key} className="report__block">
            <div className="report__block-head">
              <h2>{block.title}</h2>
              <p className="report__block-summary">
                <span className={moneyClass(block.totals.returnPercent)}>{block.totals.returnPercent.toFixed(2)}%</span>
                <span>{block.totals.wins} wins</span>
                <span>{block.totals.stop} stop</span>
                <span>{block.totals.signal} signal</span>
              </p>
              <button
                type="button"
                className="report__toggle"
                aria-expanded={open}
                onClick={() => setOpenKeys((current) => ({ ...current, [block.key]: !open }))}
              >
                {open ? 'Collapse' : 'Expand'}
              </button>
            </div>
            {open ? <MonthTable rows={block.rows} invested={invested} /> : null}
          </section>
        )
      })}
    </section>
  )
}

function sortValue(block: ComparisonBlock, sortKey: SortKey): number {
  if (sortKey === 'return') {
    return block.totals.returnPercent
  }
  return block.totals[sortKey]
}

function buildBlocks(
  pairs: Pair[],
  candlesById: Record<string, Candle[]>,
  ratio: SmaDcRatio,
  invested: number,
): ComparisonBlock[] {
  return COMPARISON_STRATEGIES.flatMap((strategy) =>
    pairs.flatMap((pair) => {
      const candles = candlesById[pair.id] ?? []
      if (candles.length === 0) {
        return []
      }
      const rows = monthsInCandles(candles).map((month) => {
        const range = monthBounds(month)
        const result = strategy.dynamic
          ? runMaDcDynamicBacktest({
              candles,
              rewardRatio: ratio,
              from: range.from,
              to: range.to,
              amount: invested,
              maRibbonSettings: DEFAULT_MA_RIBBON_SETTINGS,
            })
          : runSmaDcBacktest({
              candles,
              rewardRatio: ratio,
              from: range.from,
              to: range.to,
              amount: invested,
              maRibbonSettings: DEFAULT_MA_RIBBON_SETTINGS,
              requireAboveSlowMa: strategy.requireAboveSlowMa,
            })
        const counts = statusCounts(result)
        return {
          month,
          positions: result.positions,
          target: counts.target,
          stop: counts.stop,
          signal: counts.signal,
          open: counts.open,
          wins: result.wins,
          losses: result.losses,
          winRate: result.winRate,
          profit: result.profit,
          roiPercent: result.roiPercent,
        }
      })
      const totals = rows.reduce(
        (sum, row) => {
          sum.wins += row.wins
          sum.stop += row.stop
          sum.signal += row.signal
          sum.profit += row.profit
          return sum
        },
        { wins: 0, stop: 0, signal: 0, profit: 0 },
      )
      return [
        {
          key: `${strategy.id}-${pair.id}`,
          title: `${strategy.label} · ${pair.symbol}`,
          rows,
          totals: {
            wins: totals.wins,
            stop: totals.stop,
            signal: totals.signal,
            returnPercent: invested > 0 ? (totals.profit / invested) * 100 : 0,
          },
        },
      ]
    }),
  )
}

function MonthTable({ rows, invested }: { rows: MonthRow[]; invested: number }) {
  const totals = rows.reduce(
    (sum, row) => {
      sum.positions += row.positions
      sum.wins += row.wins
      sum.losses += row.losses
      sum.profit += row.profit
      sum.target += row.target
      sum.stop += row.stop
      sum.signal += row.signal
      return sum
    },
    { positions: 0, wins: 0, losses: 0, profit: 0, target: 0, stop: 0, signal: 0 },
  )
  const closed = totals.wins + totals.losses
  return (
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
              <td>{row.positions}</td>
              <td>{row.target}</td>
              <td>{row.stop}</td>
              <td>{row.signal}</td>
              <td>{row.open}</td>
              <td>{row.wins}</td>
              <td>{row.losses}</td>
              <td>{row.winRate.toFixed(1)}%</td>
              <td className={moneyClass(row.profit)}>{formatSignedMoney(row.profit)}</td>
              <td className={moneyClass(row.roiPercent)}>{row.roiPercent.toFixed(2)}%</td>
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
            <td>{closed > 0 ? ((totals.wins / closed) * 100).toFixed(1) : '0.0'}%</td>
            <td className={moneyClass(totals.profit)}>{formatSignedMoney(totals.profit)}</td>
            <td className={moneyClass(totals.profit)}>
              {invested > 0 ? ((totals.profit / invested) * 100).toFixed(2) : '0.00'}%
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
