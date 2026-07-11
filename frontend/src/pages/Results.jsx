import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createScreening, getToken } from '../api'

// Results arrive via router state from the questionnaire. Logged-in users
// can SAVE the screening (the CREATE of the CRUD resource).

export default function Results() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const results = state?.results
  const intake = state?.intake
  const [saveName, setSaveName] = useState('My screening')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const loggedIn = Boolean(getToken())

  if (!results) {
    return (
      <main className="container">
        <h1>No results yet</h1>
        <p className="subtitle">Answer the questionnaire first so we can find your benefits.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Start the questionnaire</button>
      </main>
    )
  }

  const save = async () => {
    setError('')
    try {
      await createScreening({ ...intake, name: saveName, matchedBenefits: results })
      setSaved(true)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <main className="container">
      <h1>Your matched benefits</h1>
      <p className="subtitle">
        {results.length} program{results.length === 1 ? '' : 's'} found based on your information
      </p>

      {error && <div className="error-box">{error}</div>}
      {saved && (
        <div className="success-box">
          Saved! View it anytime under <Link to="/screenings">My screenings</Link>.
        </div>
      )}

      {!saved && intake && (
        loggedIn ? (
          <div className="save-banner">
            <label htmlFor="save-name">Save these results as</label>
            <input id="save-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <button className="btn btn-primary" onClick={save}>Save my results</button>
          </div>
        ) : (
          <div className="save-banner">
            Want to keep these results? <Link to="/register">Create a free account</Link> or{' '}
            <Link to="/login">log in</Link> to save them.
          </div>
        )
      )}

      {results.length === 0 && (
        <div className="card">
          <h2>No matches found</h2>
          <p>
            None of our listed programs matched your answers. Income limits change
            yearly, so it may still be worth contacting your state Medicaid office directly.
          </p>
        </div>
      )}

      {results.map((b) => (
        <Link to={`/benefits/${b.id}`} state={{ matchReason: b.matchReason }} className="card" key={b.id}>
          <span className="badge">✓ Likely eligible</span>
          <h2>{b.name}</h2>
          <p>{b.eligibilitySummary}</p>
        </Link>
      ))}

      <p className="disclaimer">
        These results are estimates based on the information you provided, not an
        official determination. Contact each program's agency to confirm your eligibility.
      </p>
    </main>
  )
}
