import { useState } from 'react'
import { CandleChart } from './CandleChart'
import { Watchlist } from './Watchlist'
import type { TimeframeId } from './candles'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import type { IndicatorId, IndicatorVisibility } from './indicatorCatalog'
import './App.css'

function App() {
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState<TimeframeId>('1h')
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
      <header className="topbar" />
      <main className="workspace">
        <aside className="sidebar" />
        <section className="chart">
          <CandleChart
            pair={pair}
            timeframe={timeframe}
            indicatorVisibility={indicatorVisibility}
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
            settingsOpen={settingsOpen}
            onSelect={setPair}
            onToggleIndicator={(indicator) =>
              setIndicatorVisibility((current) => ({
                ...current,
                [indicator]: !current[indicator],
              }))
            }
            onOpenIndicatorSettings={openIndicatorSettings}
          />
        </aside>
      </main>
      <footer className="statusbar" />
    </div>
  )
}
export default App
