import { useState } from 'react'
import { logout } from './auth/api'
import type { SessionUser } from './auth/session'
import { CandleChart } from './CandleChart'
import { Watchlist } from './Watchlist'
import type { TimeframeId } from './candles'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import type { IndicatorId, IndicatorVisibility } from './indicatorCatalog'
import { defaultStrategyVisibility, type RewardRatio, type StrategyId, type StrategyVisibility } from './strategies'
import './App.css'

function App({ user }: { user: SessionUser }) {
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
  const [strategyVisibility, setStrategyVisibility] =
    useState<StrategyVisibility>(defaultStrategyVisibility)
  const [rewardRatio, setRewardRatio] = useState<RewardRatio>(2)
  const [backtestStrategy, setBacktestStrategy] = useState<StrategyId | null>(null)

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
        <a className="brand" href="/">
          <span className="brand-badge" aria-hidden="true">TH</span>
          Trading House
        </a>
        <div className="topbar-auth">
          <span className="topbar-user">
            <span className="topbar-avatar" aria-hidden="true">{user.firstName.slice(0, 1).toUpperCase()}</span>
            {user.firstName}
          </span>
          <button
            type="button"
            onClick={() => {
              logout()
              window.location.assign('/login')
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="workspace">
        <section className="chart">
          <CandleChart
            pair={pair}
            timeframe={timeframe}
            indicatorVisibility={indicatorVisibility}
            strategyVisibility={strategyVisibility}
            rewardRatio={rewardRatio}
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
            rewardRatio={rewardRatio}
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
