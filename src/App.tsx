import { useEffect, useState } from 'react'
import { CandleChart } from './CandleChart'
import { AdvanceComparison } from './pages/AdvanceComparison'
import { CompareStrategies } from './pages/CompareStrategies'
import { MonthlyPerformance } from './pages/MonthlyPerformance'
import { Watchlist } from './Watchlist'
import type { TimeframeId } from './candles'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import type { IndicatorId, IndicatorVisibility } from './indicatorCatalog'
import {
  defaultStrategyEntries,
  defaultStrategyVisibility,
  setRsiEnhLevel,
  toggleStrategyEntry,
  type RewardRatio,
  type StrategyEntrySettings,
  type StrategyId,
  type StrategyVisibility,
} from './strategies'
import { isTestSymbol, isTestTimeframe, type DataMode } from './testCandles'
import './App.css'

type PageId = 'chart' | 'compare' | 'months' | 'advance'

const PAGES: PageId[] = ['chart', 'compare', 'months', 'advance']

function pageFromPath(pathname: string): PageId | null {
  const name = pathname.replace(/\/+$/, '').split('/').filter(Boolean).at(-1) ?? ''
  return PAGES.includes(name as PageId) && name !== 'chart' ? (name as PageId) : null
}

function readAppLocation(): { page: PageId; mode: DataMode } {
  const params = new URLSearchParams(window.location.search)
  const pageParam = params.get('page')
  const modeParam = params.get('mode')
  const fromPath = pageFromPath(window.location.pathname)
  const fromQuery = PAGES.includes(pageParam as PageId) ? (pageParam as PageId) : null
  return {
    page: fromPath ?? fromQuery ?? 'chart',
    mode: modeParam === 'test' ? 'test' : 'live',
  }
}

function appLocationHref(page: PageId, mode: DataMode): string {
  const params = new URLSearchParams(window.location.search)
  params.delete('page')
  if (mode === 'live') {
    params.delete('mode')
  } else {
    params.set('mode', mode)
  }
  const path = page === 'chart' ? '/' : `/${page}/`
  const search = params.toString()
  return `${path}${search ? `?${search}` : ''}${window.location.hash}`
}

function App() {
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState<TimeframeId>('15m')
  const [settingsOpen, setSettingsOpen] = useState<IndicatorId | null>(null)
  const [settingsTick, setSettingsTick] = useState(0)
  const [indicatorVisibility, setIndicatorVisibility] = useState<IndicatorVisibility>({
    la_nwe: false,
    rsi: false,
    cipherB: false,
    macd: false,
    cmMacd: false,
    sma: false,
  })
  const [strategyVisibility, setStrategyVisibility] =
    useState<StrategyVisibility>(defaultStrategyVisibility)
  const [strategyEntries, setStrategyEntries] =
    useState<StrategyEntrySettings>(defaultStrategyEntries)
  const [rewardRatio, setRewardRatio] = useState<RewardRatio>(2)
  const [backtestStrategy, setBacktestStrategy] = useState<StrategyId | null>(null)
  const [dataMode, setDataMode] = useState<DataMode>(() => readAppLocation().mode)
  const [page, setPage] = useState<PageId>(() => readAppLocation().page)

  useEffect(() => {
    const next = appLocationHref(page, dataMode)
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) {
      window.history.pushState(null, '', next)
    }
  }, [page, dataMode])

  useEffect(() => {
    const onPopState = () => {
      const next = readAppLocation()
      setPage(next.page)
      setDataMode(next.mode)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (dataMode !== 'test') {
      return
    }
    if (!isTestSymbol(pair.symbol)) {
      const next = PAIRS.find((item) => item.symbol === 'BTCUSDT')
      if (next) {
        setPair(next)
      }
    }
    if (!isTestTimeframe(timeframe)) {
      setTimeframe('15m')
    }
  }, [dataMode, pair.symbol, timeframe])

  const openIndicatorSettings = (indicator: IndicatorId) => {
    if (settingsOpen === indicator) {
      setSettingsOpen(null)
      return
    }

    setSettingsOpen(indicator)
    setSettingsTick((current) => current + 1)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="mode-switch" role="group" aria-label="Data source">
          <button
            type="button"
            className={dataMode === 'live' ? 'mode-switch__button is-active' : 'mode-switch__button'}
            aria-pressed={dataMode === 'live'}
            onClick={() => setDataMode('live')}
          >
            Live
          </button>
          <button
            type="button"
            className={dataMode === 'test' ? 'mode-switch__button is-active' : 'mode-switch__button'}
            aria-pressed={dataMode === 'test'}
            onClick={() => setDataMode('test')}
          >
            Test
          </button>
        </div>
        <nav className="page-nav" aria-label="Pages">
          <button
            type="button"
            className={page === 'chart' ? 'page-nav__button is-active' : 'page-nav__button'}
            aria-pressed={page === 'chart'}
            onClick={() => setPage('chart')}
          >
            Chart
          </button>
          <button
            type="button"
            className={page === 'compare' ? 'page-nav__button is-active' : 'page-nav__button'}
            aria-pressed={page === 'compare'}
            onClick={() => setPage('compare')}
          >
            Compare strategies
          </button>
          <button
            type="button"
            className={page === 'months' ? 'page-nav__button is-active' : 'page-nav__button'}
            aria-pressed={page === 'months'}
            onClick={() => setPage('months')}
          >
            Monthly performance
          </button>
          <button
            type="button"
            className={page === 'advance' ? 'page-nav__button is-active' : 'page-nav__button'}
            aria-pressed={page === 'advance'}
            onClick={() => setPage('advance')}
          >
            Advance comparison
          </button>
        </nav>
      </header>
      {page === 'compare' ? (
        <CompareStrategies
          pairs={PAIRS}
          pair={pair}
          timeframe={timeframe}
          dataMode={dataMode}
          entries={strategyEntries}
          onPairChange={setPair}
          onTimeframeChange={setTimeframe}
        />
      ) : null}
      {page === 'advance' ? (
        <AdvanceComparison
          pairs={PAIRS}
          timeframe={timeframe}
          dataMode={dataMode}
          entries={strategyEntries}
          onTimeframeChange={setTimeframe}
        />
      ) : null}
      {page === 'months' ? (
        <MonthlyPerformance
          pairs={PAIRS}
          pair={pair}
          timeframe={timeframe}
          dataMode={dataMode}
          entries={strategyEntries}
          onPairChange={setPair}
          onTimeframeChange={setTimeframe}
        />
      ) : null}
      <main className={page === 'chart' ? 'workspace' : 'workspace is-hidden'}>
        <section className="chart">
          <CandleChart
            pair={pair}
            timeframe={timeframe}
            indicatorVisibility={indicatorVisibility}
            strategyVisibility={strategyVisibility}
            strategyEntries={strategyEntries}
            rewardRatio={rewardRatio}
            dataMode={dataMode}
            onRewardRatioChange={setRewardRatio}
            backtestStrategy={backtestStrategy}
            onBacktestClose={() => setBacktestStrategy(null)}
            settingsOpen={settingsOpen}
            settingsTick={settingsTick}
            onTimeframeChange={setTimeframe}
            onSettingsOpenChange={setSettingsOpen}
          />
        </section>
        <aside className="watchlist">
          <Watchlist
            pairs={PAIRS}
            timeframe={timeframe}
            selectedId={pair.id}
            indicatorVisibility={indicatorVisibility}
            strategyVisibility={strategyVisibility}
            strategyEntries={strategyEntries}
            rewardRatio={rewardRatio}
            dataMode={dataMode}
            settingsOpen={settingsOpen}
            onSelect={setPair}
            onToggleIndicator={(indicator) =>
              setIndicatorVisibility((current) => ({
                ...current,
                [indicator]: !current[indicator],
              }))
            }
            onToggleStrategy={(strategy) =>
              setStrategyVisibility((current) => ({
                ...current,
                [strategy]: !current[strategy],
              }))
            }
            onRewardRatioChange={setRewardRatio}
            onToggleStrategyEntry={(strategy, entry) =>
              setStrategyEntries((current) => toggleStrategyEntry(current, strategy, entry))
            }
            onSetRsiEnhLevel={(level, value) =>
              setStrategyEntries((current) => setRsiEnhLevel(current, level, value))
            }
            onOpenBacktest={setBacktestStrategy}
            onOpenIndicatorSettings={openIndicatorSettings}
          />
        </aside>
      </main>
      <footer className="statusbar" />
    </div>
  )
}
export default App
