import { API_BASE_URL } from '../apiBase'
import { clearToken, getToken, setToken, type SessionUser } from './session'

type ErrorBody = {
  error?: string
  errors?: Record<string, string[]>
}

export class ApiError extends Error {
  fields: Record<string, string>

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message)
    this.fields = fields
  }
}

export type AuthSession = SessionUser & {
  accessToken: string
}

export async function register(body: {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}): Promise<{ email: string }> {
  return request(`${API_BASE_URL}/api/auth/register`, { method: 'POST', body: JSON.stringify(body) })
}

export async function verifyRegister(email: string, code: string): Promise<AuthSession> {
  const session = await request<AuthSession>(`${API_BASE_URL}/api/auth/register/verify`, {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  })
  setToken(session.accessToken)
  return session
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await request<AuthSession>(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setToken(session.accessToken)
  return session
}

export async function latestOtp(username: string): Promise<{ code: string }> {
  const response = await fetch(`${API_BASE_URL}/api/auth/otp?username=${encodeURIComponent(username)}`)
  if (!response.ok) {
    throw new ApiError('No code was found for this username.')
  }
  return (await response.json()) as { code: string }
}

export async function currentUser(): Promise<SessionUser | null> {
  const token = getToken()
  if (!token) return null
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 401) {
    clearToken()
    return null
  }
  if (!response.ok) return null
  return (await response.json()) as SessionUser
}

export function logout() {
  clearToken()
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (response.ok) return (await response.json()) as T

  const body = (await response.json().catch(() => null)) as ErrorBody | null
  const fields: Record<string, string> = {}
  if (body?.errors) {
    for (const [key, messages] of Object.entries(body.errors)) {
      const name = key.charAt(0).toLowerCase() + key.slice(1)
      fields[name] = messages[0] ?? 'Invalid value.'
    }
  }
  const message = body?.error ?? Object.values(fields)[0] ?? 'Something went wrong.'
  throw new ApiError(message, fields)
}
