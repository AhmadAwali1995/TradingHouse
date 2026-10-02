import { useEffect, useState } from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { currentUser } from './auth/api'
import { LoginPage } from './auth/LoginPage.tsx'
import { RegisterPage } from './auth/RegisterPage.tsx'
import type { SessionUser } from './auth/session'

function Root() {
  const path = window.location.pathname
  const isAuthPage = path === '/login' || path === '/register'
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    currentUser().then((next) => {
      if (active) setUser(next)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (user === undefined) return
    if (!user && !isAuthPage) window.location.replace('/login')
    if (user && isAuthPage) window.location.replace('/')
  }, [user, isAuthPage])

  if (user === undefined || (!user && !isAuthPage) || (user && isAuthPage)) return null
  if (path === '/login') return <LoginPage />
  if (path === '/register') return <RegisterPage />
  return <App user={user} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
