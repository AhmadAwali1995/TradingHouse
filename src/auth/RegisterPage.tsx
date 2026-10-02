import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError, latestOtp, register, verifyRegister } from './api'
import { AuthShell } from './AuthShell'
import { PasswordField } from './PasswordField'
import { validateOtp, validateRegister } from './validation'
import './Auth.css'

const CODE_LENGTH = 6

export function RegisterPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'details' | 'otp'>('details')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const digits = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (step !== 'otp') return
    let active = true
    latestOtp(email.trim())
      .then((result) => {
        if (active) setCode(result.code.slice(0, CODE_LENGTH))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [step, email])

  const onRegister = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateRegister({ firstName, lastName, email, password, confirmPassword })
    setErrors(nextErrors)
    setFormError('')
    if (Object.keys(nextErrors).length > 0) return

    setPending(true)
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        confirmPassword,
      })
      setStep('otp')
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

  const onVerify = async (event: FormEvent) => {
    event.preventDefault()
    const codeError = validateOtp(code)
    setErrors(codeError ? { code: codeError } : {})
    setFormError('')
    if (codeError) return

    setPending(true)
    try {
      await verifyRegister(email.trim(), code.trim())
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

  const setDigit = (index: number, raw: string) => {
    const nextDigit = raw.replace(/\D/g, '').slice(-1)
    const chars = Array.from({ length: CODE_LENGTH }, (_, slot) => code[slot] ?? ' ')
    chars[index] = nextDigit || ' '
    setCode(chars.join('').trimEnd())
    if (nextDigit && index < CODE_LENGTH - 1) digits.current[index + 1]?.focus()
  }

  const onDigitKey = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      digits.current[index - 1]?.focus()
    }
  }

  const onPaste = (text: string) => {
    const next = text.replace(/\D/g, '').slice(0, CODE_LENGTH)
    if (next) setCode(next)
  }

  return (
    <AuthShell
      title={step === 'details' ? 'Create account' : 'Verify email'}
      lede={
        step === 'details'
          ? 'A six-digit code confirms the address.'
          : `Enter the code for ${email.trim()}.`
      }
      footer={
        step === 'details' ? (
          <>
            Already have an account? <a href="/login">Sign in</a>
          </>
        ) : (
          <button type="button" className="auth-text-button" onClick={() => setStep('details')}>
            Use a different email
          </button>
        )
      }
    >
      {step === 'details' ? (
        <form className="auth-form" onSubmit={onRegister} noValidate>
          <div className="auth-row">
            <label className={`auth-field${errors.firstName ? ' is-invalid' : ''}`}>
              First name
              <input value={firstName} autoComplete="given-name" onChange={(event) => setFirstName(event.target.value)} />
              {errors.firstName ? <span className="auth-error">{errors.firstName}</span> : null}
            </label>
            <label className={`auth-field${errors.lastName ? ' is-invalid' : ''}`}>
              Last name
              <input value={lastName} autoComplete="family-name" onChange={(event) => setLastName(event.target.value)} />
              {errors.lastName ? <span className="auth-error">{errors.lastName}</span> : null}
            </label>
          </div>
          <label className={`auth-field${errors.email ? ' is-invalid' : ''}`}>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              placeholder="name@email.com"
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email ? <span className="auth-error">{errors.email}</span> : null}
          </label>
          <PasswordField
            label="Password"
            value={password}
            autoComplete="new-password"
            error={errors.password}
            onChange={setPassword}
          />
          <PasswordField
            label="Confirm password"
            value={confirmPassword}
            autoComplete="new-password"
            error={errors.confirmPassword}
            onChange={setConfirmPassword}
          />
          {formError ? <div className="auth-banner">{formError}</div> : null}
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? 'Sending code…' : 'Continue'}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={onVerify} noValidate>
          <div className={`auth-otp${errors.code ? ' is-invalid' : ''}`}>
            {Array.from({ length: CODE_LENGTH }, (_, index) => (
              <input
                key={index}
                ref={(node) => {
                  digits.current[index] = node
                }}
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={code[index] ?? ''}
                aria-label={`Digit ${index + 1}`}
                onChange={(event) => setDigit(index, event.target.value)}
                onKeyDown={(event) => onDigitKey(index, event)}
                onPaste={(event) => {
                  event.preventDefault()
                  onPaste(event.clipboardData.getData('text'))
                }}
              />
            ))}
          </div>
          {errors.code ? <span className="auth-error">{errors.code}</span> : null}
          {formError ? <div className="auth-banner">{formError}</div> : null}
          <button className="auth-submit" type="submit" disabled={pending}>
            {pending ? 'Verifying…' : 'Create account'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
