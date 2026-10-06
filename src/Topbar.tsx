import { logout } from './auth/api'
import type { SessionUser } from './auth/session'

export function Topbar({ user = null }: { user?: SessionUser | null }) {
  const path = window.location.pathname.replace(/\/$/, '') || '/'

  return (
    <header className="topbar">
      <div className="topbar-start">
        <a className="brand" href="/">
          <span className="brand-badge" aria-hidden="true">TH</span>
          Trading House
        </a>
        <nav className="topbar-nav">
          <a href="/" aria-current={path === '/' ? 'page' : undefined}>Chart</a>
          <a href="/watch" aria-current={path === '/watch' ? 'page' : undefined}>Watcher</a>
          <a href="/backtest" aria-current={path === '/backtest' ? 'page' : undefined}>Backtest</a>
        </nav>
      </div>
      <div className="topbar-auth">
        {user ? (
          <>
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
          </>
        ) : (
          <a href="/login">Sign in</a>
        )}
      </div>
    </header>
  )
}
