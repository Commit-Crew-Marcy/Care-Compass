import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api'

export default function Register() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await register(email, password, displayName || null)
      navigate('/screenings')
      window.location.reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container">
      <h1>Create your account</h1>
      <p className="subtitle">Save your eligibility results and come back to them anytime.</p>
      {error && <div className="error-box">{error}</div>}
      <form onSubmit={submit}>
        <label htmlFor="name">Name (optional)</label>
        <input id="name" type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label htmlFor="email">Email</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Password (8+ characters)</label>
        <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>
      <p className="disclaimer">
        Already have an account? <Link to="/login">Log in here</Link>.
      </p>
    </main>
  )
}
