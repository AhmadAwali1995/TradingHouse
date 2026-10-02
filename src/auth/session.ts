const TOKEN_KEY = 'tradinghouse.token'

export type SessionUser = {
  email: string
  firstName: string
  lastName: string
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}
