import { useEffect, useState } from 'react'
import { CandleChart } from './CandleChart'
import { AdvanceComparison } from './pages/AdvanceComparison'
import { Watchlist } from './Watchlist'
import type { TimeframeId } from './candles'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import type { IndicatorId, IndicatorVisibility } from './indicatorCatalog'
import type { SmaDcRatio } from './strategies/smaDc'
import { isTestSymbol, isTestTimeframe, type DataMode } from './testCandles'
import './App.css'

type PageId = 'chart' | 'advance'

function pageFromPath(pathname: string): PageId | null {
  const name = pathname.replace(/\/+$/, '').split('/').filter(Boolean).at(-1) ?? ''
  return name === 'advance' ? 'advance' : null
}

function readAppLocation(): { page: PageId; mode: DataMode } {
  const params = new URLSearchParams(window.location.search)
  return {
    page: pageFromPath(window.location.pathname) ?? (params.get('page') === 'advance' ? 'advance' : 'chart'),
    mode: params.get('mode') === 'test' ? 'test' : 'live',
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
  const path = page === 'chart' ? '/' : '/advance/'
  const search = params.toString()
  return `${path}${search ? `?${search}` : ''}${window.location.hash}`
}

function App() {
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState<TimeframeId>('15m')
  const [settingsOpen, setSettingsOpen] = useState<IndicatorId | null>(null)
  const [settingsTick, setSettingsTick] = useState(0)
  const [indicatorVisibility, setIndicatorVisibility] = useState<IndicatorVisibility>({
    maRibbon: false,
    dc: false,
  })
  const [smaEnabled, setSmaEnabled] = useState(false)
  const [smaRatio, setSmaRatio] = useState<SmaDcRatio>(2)
  const [smaDcEnabled, setSmaDcEnabled] = useState(false)
  const [smaDcRatio, setSmaDcRatio] = useState<SmaDcRatio>(2)
  const [maDcDynamicEnabled, setMaDcDynamicEnabled] = useState(false)
  const [maDcDynamicRatio, setMaDcDynamicRatio] = useState<SmaDcRatio>(2)
  const [backtestStrategy, setBacktestStrategy] = useState<'sma' | 'smaDc' | 'maDcDynamic' | null>(null)
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
            className={page === 'advance' ? 'page-nav__button is-active' : 'page-nav__button'}
            aria-pressed={page === 'advance'}
            onClick={() => setPage('advance')}
          >
            Advance comparison
          </button>
        </nav>
      </header>
      {page === 'advance' ? (
        <AdvanceComparison
          pairs={PAIRS}
          timeframe={timeframe}
          dataMode={dataMode}
          onTimeframeChange={setTimeframe}
        />
      ) : null}
      <main className={page === 'chart' ? 'workspace' : 'workspace is-hidden'}>
        <section className="chart">
          <CandleChart
            pair={pair}
            timeframe={timeframe}
            indicatorVisibility={indicatorVisibility}
            dataMode={dataMode}
            settingsOpen={settingsOpen}
            settingsTick={settingsTick}
            smaEnabled={smaEnabled}
            smaRatio={smaRatio}
            smaDcEnabled={smaDcEnabled}
            smaDcRatio={smaDcRatio}
            maDcDynamicEnabled={maDcDynamicEnabled}
            maDcDynamicRatio={maDcDynamicRatio}
            backtestStrategy={backtestStrategy}
            onSmaRatioChange={setSmaRatio}
            onSmaDcRatioChange={setSmaDcRatio}
            onMaDcDynamicRatioChange={setMaDcDynamicRatio}
            onBacktestClose={() => setBacktestStrategy(null)}
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
            dataMode={dataMode}
            settingsOpen={settingsOpen}
            onSelect={setPair}
            onToggleIndicator={(indicator) =>
              setIndicatorVisibility((current) => ({
                ...current,
                [indicator]: !current[indicator],
              }))
            }
            onOpenIndicatorSettings={openIndicatorSettings}
            smaEnabled={smaEnabled}
            smaRatio={smaRatio}
            smaDcEnabled={smaDcEnabled}
            smaDcRatio={smaDcRatio}
            maDcDynamicEnabled={maDcDynamicEnabled}
            maDcDynamicRatio={maDcDynamicRatio}
            onSmaEnabledChange={setSmaEnabled}
            onSmaRatioChange={setSmaRatio}
            onSmaDcEnabledChange={setSmaDcEnabled}
            onSmaDcRatioChange={setSmaDcRatio}
            onMaDcDynamicEnabledChange={setMaDcDynamicEnabled}
            onMaDcDynamicRatioChange={setMaDcDynamicRatio}
            onOpenBacktest={setBacktestStrategy}
          />
        </aside>
      </main>
      <footer className="statusbar" />
    </div>
  )
}
export default App
