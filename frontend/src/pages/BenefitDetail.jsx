import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getBenefit } from '../api'
import ChatPanel from '../components/ChatPanel'

export default function BenefitDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const [benefit, setBenefit] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBenefit(id).then(setBenefit).catch(() => setError('We could not load this benefit.'))
  }, [id])

  if (error) {
    return (
      <main className="container">
        <div className="error-box">{error}</div>
        <Link className="back-link" to="/results">← Back to results</Link>
      </main>
    )
  }

  if (!benefit) return <main className="container"><p className="loading">Loading...</p></main>

  return (
    <main className="container">
      <Link className="back-link" to="/results">← Back to results</Link>
      <h1>{benefit.name}</h1>
      <span className="badge">✓ Likely eligible</span>

      <div className="detail-section">
        <h3>What is this program?</h3>
        <p>{benefit.description}</p>

        <h3>Why you may qualify</h3>
        <p>{state?.matchReason || benefit.eligibilitySummary}</p>

        {benefit.requirements?.length > 0 && (
          <>
            <h3>What you will need to apply</h3>
            <ol className="req-list">
              {benefit.requirements.map((r, i) => <li key={i}>{r.description}</li>)}
            </ol>
          </>
        )}
      </div>

      {benefit.applyUrl && (
        <a className="btn btn-primary" href={benefit.applyUrl} target="_blank" rel="noreferrer"
          style={{ marginTop: 24 }}>
          Apply on the official site ↗
        </a>
      )}

      <p className="disclaimer">
        CareCompass is an informational guide, not an official eligibility
        determination. Confirm details with the program's agency before applying.
      </p>

      <ChatPanel contextBenefits={[benefit]} />
    </main>
  )
}
