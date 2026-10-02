export type FieldErrors = Record<string, string>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegister(values: {
  firstName: string
  lastName: string
  email: string
  password: string
  confirmPassword: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.firstName.trim()) errors.firstName = 'First name is required.'
  else if (values.firstName.trim().length > 50) errors.firstName = 'First name must be 50 characters or less.'
  if (!values.lastName.trim()) errors.lastName = 'Last name is required.'
  else if (values.lastName.trim().length > 50) errors.lastName = 'Last name must be 50 characters or less.'
  if (!values.email.trim()) errors.email = 'Email is required.'
  else if (!emailPattern.test(values.email.trim())) errors.email = 'Enter a valid email.'
  const passwordError = passwordMessage(values.password)
  if (passwordError) errors.password = passwordError
  if (values.confirmPassword !== values.password) errors.confirmPassword = 'Passwords do not match.'
  return errors
}

export function validateLogin(values: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.email.trim()) errors.email = 'Email is required.'
  else if (!emailPattern.test(values.email.trim())) errors.email = 'Enter a valid email.'
  if (!values.password) errors.password = 'Password is required.'
  return errors
}

export function validateOtp(code: string): string | null {
  if (!/^[0-9]{6}$/.test(code.trim())) return 'Enter the 6-digit code.'
  return null
}

function passwordMessage(password: string): string | null {
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain a digit.'
  return null
}
