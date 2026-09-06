import { BitcoinCandleChart } from './BitcoinCandleChart'
import './App.css'

function App() {
  return (
    <div className="app">
      <header className="topbar" />
      <main className="workspace">
        <aside className="sidebar" />
        <section className="chart">
          <BitcoinCandleChart />
        </section>
        <aside className="watchlist" />
      </main>
      <footer className="statusbar" />
    </div>
  )
}

export default App
