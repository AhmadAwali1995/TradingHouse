import { useEffect, useState } from 'react'
import { TIMEFRAMES, fetchCandles, type Candle, type TimeframeId } from '../candles'
import type { Pair } from '../data/config'
import { runLuxAlgoBacktest, type BacktestResult } from '../backtest/runBacktest'
import { DEFAULT_LA_NWE_SETTINGS } from '../indicators'
import type { RewardRatio, StrategyEntrySettings, StrategyId } from '../strategies'
import { isTestSymbol, isTestTimeframe, fetchTestCandles, type DataMode } from '../testCandles'

export function useReportCandles(pair: Pair, timeframe: TimeframeId, dataMode: DataMode) {
  const [candles, setCandles] = useState<Candle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dataMode === 'test' && (!isTestSymbol(pair.symbol) || !isTestTimeframe(timeframe))) {
      setCandles([])
      setLoading(false)
      setError('That pair or timeframe is not in the test files.')
      return
    }
    if (pair.market !== 'crypto') {
      setCandles([])
      setLoading(false)
      setError('Forex prices are not connected yet.')
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    const load =
      dataMode === 'test'
        ? fetchTestCandles(pair.symbol, timeframe, controller.signal)
        : fetchCandles(pair, timeframe, controller.signal)
    load
      .then((next) => {
        if (controller.signal.aborted) {
          return
        }
        setCandles(next)
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) {
          return
        }
        setCandles([])
        setError(reason instanceof Error ? reason.message : 'Failed to load candles')
        setLoading(false)
      })

    return () => controller.abort()
  }, [pair, timeframe, dataMode])

  return { candles, loading, error }
}

export function useReportCandleMap(pairs: Pair[], timeframe: TimeframeId, dataMode: DataMode) {
  const [candlesById, setCandlesById] = useState<Record<string, Candle[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pairKey = pairs.map((pair) => pair.id).join(',')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all(
      pairs.map(async (pair) => {
        if (pair.market !== 'crypto' || (dataMode === 'test' && (!isTestSymbol(pair.symbol) || !isTestTimeframe(timeframe)))) {
          return [pair.id, [] as Candle[]] as const
        }
        const next =
          dataMode === 'test'
            ? await fetchTestCandles(pair.symbol, timeframe, controller.signal)
            : await fetchCandles(pair, timeframe, controller.signal)
        return [pair.id, next] as const
      }),
    )
      .then((entries) => {
        if (controller.signal.aborted) {
          return
        }
        setCandlesById(Object.fromEntries(entries))
        setLoading(false)
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === 'AbortError')) {
          return
        }
        setCandlesById({})
        setError(reason instanceof Error ? reason.message : 'Failed to load candles')
        setLoading(false)
      })

    return () => controller.abort()
    // pairKey already tracks which pairs to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairKey, timeframe, dataMode])

  return { candlesById, loading, error }
}

export function monthsInCandles(candles: Candle[]): string[] {
  const first = candles[0]
  const last = candles.at(-1)
  if (!first || !last) {
    return []
  }
  const cursor = new Date(first.time * 1000)
  cursor.setDate(1)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(last.time * 1000)
  end.setDate(1)
  end.setHours(0, 0, 0, 0)
  const months: string[] = []
  while (cursor <= end) {
    const month = String(cursor.getMonth() + 1).padStart(2, '0')
    months.push(`${cursor.getFullYear()}-${month}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

export function monthBounds(month: string): { from: number; to: number } {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: Math.floor(new Date(year, monthNumber - 1, 1).getTime() / 1000),
    to: Math.floor(new Date(year, monthNumber, 0, 23, 59, 59).getTime() / 1000),
  }
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

export function runStrategyMonth(
  candles: Candle[],
  month: string,
  strategyId: StrategyId,
  rewardRatio: RewardRatio,
  amount: number,
  entries: StrategyEntrySettings,
): BacktestResult {
  const range = monthBounds(month)
  return runStrategyRange(candles, range.from, range.to, strategyId, rewardRatio, amount, entries)
}

export function runStrategyRange(
  candles: Candle[],
  from: number,
  to: number,
  strategyId: StrategyId,
  rewardRatio: RewardRatio,
  amount: number,
  entries: StrategyEntrySettings,
): BacktestResult {
  return runLuxAlgoBacktest({
    candles,
    rewardRatio,
    from,
    to,
    amount,
    strategyId,
    laNweSettings: DEFAULT_LA_NWE_SETTINGS,
    entries,
  })
}

export function dateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function unixToDateInput(time: number): string {
  return dateInputValue(new Date(time * 1000))
}

export function startOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(new Date(year, month - 1, day).getTime() / 1000)
}

export function endOfDay(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  return Math.floor(new Date(year, month - 1, day, 23, 59, 59).getTime() / 1000)
}

export function clampDate(value: string, min: string, max: string): string {
  if (value < min) {
    return min
  }
  if (value > max) {
    return max
  }
  return value
}

export function monthDateRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  return {
    from: dateInputValue(new Date(year, monthNumber - 1, 1)),
    to: dateInputValue(new Date(year, monthNumber, 0)),
  }
}

export function statusCounts(result: BacktestResult) {
  return {
    target: result.trades.filter((trade) => trade.result === 'target').length,
    stop: result.trades.filter((trade) => trade.result === 'stop').length,
    signal: result.trades.filter((trade) => trade.result === 'signal').length,
    open: result.openPositions,
  }
}

export function reportPairs(pairs: Pair[], dataMode: DataMode): Pair[] {
  return pairs.filter((pair) => pair.market === 'crypto' && (dataMode !== 'test' || isTestSymbol(pair.symbol)))
}

export function formatSignedMoney(value: number): string {
  const body = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return value > 0 ? `+$${body}` : value < 0 ? `−$${body}` : `$${body}`
}

export function formatMoney(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function moneyClass(value: number): string | undefined {
  if (value > 0) {
    return 'is-up'
  }
  if (value < 0) {
    return 'is-down'
  }
  return undefined
}

export function reportTimeframes(dataMode: DataMode) {
  return TIMEFRAMES.map((item) => ({
    ...item,
    disabled: dataMode === 'test' && !isTestTimeframe(item.id),
  }))
}
