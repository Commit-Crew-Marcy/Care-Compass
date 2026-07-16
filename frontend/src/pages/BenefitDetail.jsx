import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getBenefit } from '../api'
import ExtensionPrompt from '../components/ExtensionPrompt'
import { useSetPageContext } from '../pageContext'

export default function BenefitDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const [benefit, setBenefit] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBenefit(id).then(setBenefit).catch(() => setError('We could not load this benefit.'))
  }, [id])

  const matchReason = state?.matchReason || benefit?.eligibilitySummary || ''

  // Safe page-context summary — the benefit's public name/description and
  // the visible controls only, never the raw questionnaire intake.
  const pageContext = useMemo(
    () => ({
      route: `/benefits/${id}`,
      pageTitle: benefit ? benefit.name : 'CareCompass Benefit Detail',
      heading: benefit ? benefit.name : '',
      sectionHeadings: benefit
        ? ['What is this program?', 'Why you may qualify', ...(benefit.requirements?.length ? ['What you will need to apply'] : [])]
        : [],
      visibleControls: [
        { id: 'back-to-results-link', type: 'link', label: 'Back to results' },
        ...(benefit?.applyUrl ? [{ id: 'apply-official-site-link', type: 'link', label: 'Apply on the official site' }] : []),
      ],
      benefitDetail: benefit ? { name: benefit.name, description: benefit.description } : null,
      matchedBenefits: benefit ? [{ name: benefit.name, description: matchReason }] : [],
    }),
    [benefit, id, matchReason]
  )
  useSetPageContext(pageContext)

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
      <Link id="back-to-results-link" className="back-link" to="/results">← Back to results</Link>
      <h1>{benefit.name}</h1>
      <span className="badge">✓ Likely eligible</span>
      <span className="badge badge--estimate">Estimate, not final</span>

      <div className="detail-section">
        <h3>What is this program?</h3>
        <p>{benefit.description}</p>

        <h3>Why you may qualify</h3>
        <p>{matchReason}</p>

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
        <>
          <ExtensionPrompt />
          <a id="apply-official-site-link" className="btn btn-primary" href={benefit.applyUrl} target="_blank" rel="noreferrer"
            style={{ marginTop: 24 }}>
            Apply on the official site ↗
          </a>
        </>
      )}

      <p className="disclaimer">
        CareCompass is an informational guide, not an official eligibility
        determination. Confirm details with the program's agency before applying.
      </p>
    </main>
  )
}
