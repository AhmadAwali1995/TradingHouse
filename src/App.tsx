import { useState } from 'react'
import { BitcoinCandleChart } from './BitcoinCandleChart'
import { Watchlist } from './Watchlist'
import type { TimeframeId } from './candles'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import type { IndicatorVisibility } from './indicatorCatalog'
import './App.css'

function App() {
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState<TimeframeId>('1h')
  const [indicatorVisibility, setIndicatorVisibility] = useState<IndicatorVisibility>({
    nwe: true,
    rsi: true,
  })

  return (
    <div className="app">
      <header className="topbar" />
      <main className="workspace">
        <aside className="sidebar" />
        <section className="chart">
          <BitcoinCandleChart
            pair={pair}
            timeframe={timeframe}
            indicatorVisibility={indicatorVisibility}
            onTimeframeChange={setTimeframe}
          />
        </section>
        <aside className="watchlist">
          <Watchlist
            pairs={PAIRS}
            timeframe={timeframe}
            selectedId={pair.id}
            indicatorVisibility={indicatorVisibility}
            onSelect={setPair}
            onToggleIndicator={(indicator) =>
              setIndicatorVisibility((current) => ({
                ...current,
                [indicator]: !current[indicator],
              }))
            }
          />
        </aside>
      </main>
      <footer className="statusbar" />
    </div>
  )
}
export default App
