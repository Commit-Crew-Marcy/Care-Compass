import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createScreening, getToken } from '../api'
import { clearLatestScreening, loadLatestScreening, saveLatestScreening } from '../resultsStorage'
import ChatPanel from '../components/ChatPanel'

// Results arrive via router state from the questionnaire, but state is lost
// on refresh or when navigating in from elsewhere (e.g. back from a benefit
// detail page opened in a new tab). Falling back to a localStorage cache of
// the latest screening keeps results visible until the user starts a new
// questionnaire. Matches are grouped by category so a long list stays
// scannable, and the AI chat panel floats on this page with the matches as
// context. Logged-in users can SAVE the screening (the CREATE of the CRUD
// resource) — that save feature is unrelated to this navigation cache.

const GROUPS = [
  {
    title: 'Medicare and Medicare savings',
    types: ['medicare_part_a', 'medicare_part_b', 'medicare_advantage', 'medicare_part_d', 'medigap', 'extra_help', 'msp'],
  },
  {
    title: 'Health coverage',
    types: ['medicaid', 'emergency_medicaid', 'chip', 'marketplace'],
  },
  {
    title: 'Food and family support',
    types: ['snap', 'wic', 'school_lunch', 'head_start', 'tanf'],
  },
  {
    title: 'Money and utility help',
    types: ['ssi', 'liheap'],
  },
]

function groupResults(results) {
  const used = new Set()
  const grouped = GROUPS.map((g) => {
    const items = results.filter((b) => g.types.includes(b.programType))
    items.forEach((b) => used.add(b.id))
    return { title: g.title, items }
  }).filter((g) => g.items.length > 0)

  const rest = results.filter((b) => !used.has(b.id))
  if (rest.length > 0) grouped.push({ title: 'Other programs', items: rest })
  return grouped
}

export default function Results() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const hasStateResults = Boolean(state?.results)
  // Read the cache at most once per mount — location.state doesn't change
  // across re-renders of the same page visit, so there's no need to re-read
  // localStorage on every render (e.g. every keystroke in the save-name field).
  const [cached] = useState(() => (hasStateResults ? null : loadLatestScreening()))
  const results = hasStateResults ? state.results : cached?.results
  const intake = hasStateResults ? state.intake : cached?.intake
  const [saveName, setSaveName] = useState('My screening')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const loggedIn = Boolean(getToken())

  // Arriving fresh from the questionnaire (state present) refreshes the
  // cache so it reflects the newest screening.
  useEffect(() => {
    if (hasStateResults) saveLatestScreening(state.results, state.intake)
  }, [hasStateResults, state])

  const startNewQuestionnaire = () => {
    clearLatestScreening()
    navigate('/questionnaire')
  }

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

  const grouped = groupResults(results)

  return (
    <main className="container">
      <h1>Your matched benefits</h1>
      <p className="subtitle">
        {results.length} program{results.length === 1 ? '' : 's'} found based on your information
      </p>

      <button
        type="button"
        className="btn btn-outline"
        style={{ marginBottom: 24 }}
        onClick={startNewQuestionnaire}
      >
        Start a new questionnaire
      </button>

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

      {grouped.map((group) => (
        <section key={group.title}>
          <h2 className="group-title">{group.title}</h2>
          {group.items.map((b) => (
            <Link to={`/benefits/${b.id}`} state={{ matchReason: b.matchReason }} className="card" key={b.id}>
              <span className="badge">✓ Likely eligible</span>
              <h2>{b.name}</h2>
              <p>{b.eligibilitySummary}</p>
            </Link>
          ))}
        </section>
      ))}

      <p className="disclaimer">
        These results are estimates based on the information you provided, not an
        official determination. Contact each program's agency to confirm your eligibility.
      </p>

      <ChatPanel contextBenefits={results} />
    </main>
  )
}
