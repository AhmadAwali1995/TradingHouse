import { useId, useState } from 'react'

export function PasswordField({
  label,
  value,
  autoComplete,
  error,
  onChange,
}: {
  label: string
  value: string
  autoComplete: string
  error?: string
  onChange: (value: string) => void
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)

  return (
    <div className={`auth-field${error ? ' is-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <span className="auth-password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className={`auth-eye${visible ? ' is-open' : ''}${animating ? ' is-animating' : ''}`}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => {
            setVisible((current) => !current)
            setAnimating(true)
          }}
          onAnimationEnd={() => setAnimating(false)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g className="eye-lid">
              <path
                className="eye-outline"
                d="M2.2 12S5.8 5.5 12 5.5 21.8 12 21.8 12 18.2 18.5 12 18.5 2.2 12 2.2 12Z"
              />
              <circle className="eye-pupil" cx="12" cy="12" r="2.6" />
            </g>
            <path className="eye-slash" d="M4.5 5.5 19.5 18.5" />
          </svg>
        </button>
      </span>
      {error ? <span className="auth-error">{error}</span> : null}
    </div>
  )
}
