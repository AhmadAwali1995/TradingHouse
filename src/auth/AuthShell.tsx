import type { ReactNode } from 'react'

export function AuthShell({
  title,
  lede,
  children,
  footer,
}: {
  title: string
  lede: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <a className="auth-mark" href="/login">
          <span className="auth-mark-badge" aria-hidden="true">TH</span>
          Trading House
        </a>
        <div className="auth-aside-body">
          <p>One desk for charts, strategies, and orders.</p>
          <ul>
            <li>Live market data</li>
            <li>Strategy signals</li>
            <li>Open and closed orders</li>
          </ul>
        </div>
      </aside>
      <main className="auth-panel">
        <div className="auth-panel-inner">
          <a className="auth-mark auth-mark-compact" href="/login">
            <span className="auth-mark-badge" aria-hidden="true">TH</span>
            Trading House
          </a>
          <h1>{title}</h1>
          <p className="auth-lede">{lede}</p>
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </main>
    </div>
  )
}
