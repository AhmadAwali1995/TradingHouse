import { useState, type FormEvent } from 'react'
import { ApiError, login } from './api'
import { AuthShell } from './AuthShell'
import { PasswordField } from './PasswordField'
import { validateLogin } from './validation'
import './Auth.css'

export function LoginPage() {
  const [emailOrUserName, setEmailOrUserName] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateLogin({ emailOrUserName, password })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      await login(emailOrUserName.trim(), password)
      window.location.assign('/')
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.fields)
        setFormError(Object.keys(error.fields).length > 0 ? '' : error.message)
      } else {
        setFormError('Could not reach the server.')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthShell
      title="Sign in"
      lede="Continue to your desk."
      footer={
        <>
          New to Trading House? <a href="/register">Create an account</a>
        </>
      }
    >
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <label className={`auth-field${errors.emailOrUserName ? ' is-invalid' : ''}`}>
          Email or username
          <input
            value={emailOrUserName}
            autoComplete="username"
            placeholder="name@email.com or username"
            onChange={(event) => setEmailOrUserName(event.target.value)}
          />
          {errors.emailOrUserName ? <span className="auth-error">{errors.emailOrUserName}</span> : null}
        </label>
        <PasswordField
          label="Password"
          value={password}
          autoComplete="current-password"
          error={errors.password}
          onChange={setPassword}
        />
        {formError ? <div className="auth-banner">{formError}</div> : null}
        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  )
}
