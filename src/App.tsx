import { useEffect, useState } from 'react'
import { CandleChart } from './CandleChart'
import { Watchlist } from './Watchlist'
import type { TimeframeId } from './candles'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import type { IndicatorId, IndicatorVisibility } from './indicatorCatalog'
import type { SmaDcRatio } from './strategies/smaDc'
import { isTestSymbol, isTestTimeframe, type DataMode } from './testCandles'
import './App.css'

function readDataMode(): DataMode {
  return new URLSearchParams(window.location.search).get('mode') === 'test' ? 'test' : 'live'
}

function modeHref(mode: DataMode): string {
  const params = new URLSearchParams(window.location.search)
  params.delete('page')
  if (mode === 'live') {
    params.delete('mode')
  } else {
    params.set('mode', mode)
  }
  const search = params.toString()
  return `/${search ? `?${search}` : ''}${window.location.hash}`
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
  const [smaDcEnabled, setSmaDcEnabled] = useState(true)
  const [smaDcRatio, setSmaDcRatio] = useState<SmaDcRatio>(2)
  const [backtestOpen, setBacktestOpen] = useState(false)
  const [dataMode, setDataMode] = useState<DataMode>(readDataMode)

  useEffect(() => {
    const next = modeHref(dataMode)
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) {
      window.history.pushState(null, '', next)
    }
  }, [dataMode])

  useEffect(() => {
    const onPopState = () => setDataMode(readDataMode())
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
      </header>
      <main className="workspace">
        <section className="chart">
          <CandleChart
            pair={pair}
            timeframe={timeframe}
            indicatorVisibility={indicatorVisibility}
            dataMode={dataMode}
            settingsOpen={settingsOpen}
            settingsTick={settingsTick}
            smaDcEnabled={smaDcEnabled}
            smaDcRatio={smaDcRatio}
            backtestOpen={backtestOpen}
            onSmaDcRatioChange={setSmaDcRatio}
            onBacktestClose={() => setBacktestOpen(false)}
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
            smaDcEnabled={smaDcEnabled}
            smaDcRatio={smaDcRatio}
            onSmaDcEnabledChange={setSmaDcEnabled}
            onSmaDcRatioChange={setSmaDcRatio}
            onOpenBacktest={() => setBacktestOpen(true)}
          />
        </aside>
      </main>
      <footer className="statusbar" />
    </div>
  )
}
export default App
