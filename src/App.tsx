import { useState } from 'react'
import { BitcoinCandleChart } from './BitcoinCandleChart'
import { Watchlist } from './Watchlist'
import { DEFAULT_PAIR, PAIRS } from './data/config'
import './App.css'

function App() {
  const [pair, setPair] = useState(DEFAULT_PAIR)

  return (
    <div className="app">
      <header className="topbar" />
      <main className="workspace">
        <aside className="sidebar" />
        <section className="chart">
          <BitcoinCandleChart pair={pair} />
        </section>
        <aside className="watchlist">
          <Watchlist pairs={PAIRS} selectedId={pair.id} onSelect={setPair} />
        </aside>
      </main>
      <footer className="statusbar" />
    </div>
  )
}
export default App
