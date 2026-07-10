import { Link, useLocation, useNavigate } from 'react-router-dom'

// Results arrive via router state from the questionnaire (no persistence
// needed for MVP — the check is stateless, matching the API design).

export default function Results() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const results = state?.results

  // Visiting /results directly with no data sends you back to the form
  if (!results) {
    return (
      <main className="container">
        <h1>No results yet</h1>
        <p className="subtitle">Answer the questionnaire first so we can find your benefits.</p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Start the questionnaire</button>
      </main>
    )
  }

  return (
    <main className="container">
      <h1>Your matched benefits</h1>
      <p className="subtitle">
        {results.length} program{results.length === 1 ? '' : 's'} found based on your information
      </p>

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
