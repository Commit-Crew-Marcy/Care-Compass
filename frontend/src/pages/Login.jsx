import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../api'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/screenings')
      // Full reload so the nav picks up the new session.
      window.location.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-container">
      <h1>Log in</h1>
      <p className="subtitle">Welcome back. Log in to see your saved screenings.</p>

      {error && <div className="error-box" role="alert">{error}</div>}

      <form onSubmit={submit} noValidate>
        <div className="field-group">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field-group">
          <label htmlFor="login-password">Password</label>
          <div className="password-input-wrapper">
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="password-input"
            />
            <button
              type="button"
              className="password-toggle"
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="disclaimer">
        No account yet? <Link to="/register">Create one here</Link>.
      </p>
    </main>
  )
}
