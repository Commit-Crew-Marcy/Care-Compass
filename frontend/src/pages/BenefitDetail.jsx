import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getBenefit } from '../api'
import ExtensionPrompt from '../components/ExtensionPrompt'
import { useSetPageContext } from '../pageContext'

const NYC_DATASET_PAGE = 'https://data.cityofnewyork.us/d/kvhd-5fmu'

function officialLinkLabel(benefit, isNycProgram) {
  if (!isNycProgram || benefit?.officialLinkType === 'application') {
    return 'Apply on the official site ↗'
  }
  if (benefit?.officialLinkType === 'agency') {
    return 'Visit the agency website ↗'
  }
  return 'View official program information ↗'
}

export default function BenefitDetail() {
  const { id } = useParams()
  const { state } = useLocation()
  const [benefit, setBenefit] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getBenefit(id).then(setBenefit).catch(() => setError('We could not load this benefit.'))
  }, [id])

  const isNycProgram = benefit?.source === 'nyc_open_data'
  const matchReason = state?.matchReason || benefit?.eligibilitySummary || ''
  const actionLabel = officialLinkLabel(benefit, isNycProgram)

  // Safe page-context summary — the benefit's public name/description and
  // the visible controls only, never the raw questionnaire intake.
  const pageContext = useMemo(
    () => ({
      route: `/benefits/${id}`,
      pageTitle: benefit ? benefit.name : 'CareCompass Benefit Detail',
      heading: benefit ? benefit.name : '',
      sectionHeadings: benefit
        ? [
            'What is this program?',
            isNycProgram ? 'Why we showed this' : 'Why you may qualify',
            ...(isNycProgram && benefit.eligibilityDetails ? ['Official eligibility details'] : []),
            ...(benefit.requirements?.length ? ['What you will need to apply'] : []),
          ]
        : [],
      visibleControls: [
        { id: 'back-to-results-link', type: 'link', label: 'Back to results' },
        ...(benefit?.applyUrl ? [{ id: 'apply-official-site-link', type: 'link', label: actionLabel.replace(' ↗', '') }] : []),
      ],
      benefitDetail: benefit ? { name: benefit.name, description: benefit.description } : null,
      matchedBenefits: benefit ? [{ name: benefit.name, description: matchReason }] : [],
    }),
    [actionLabel, benefit, id, isNycProgram, matchReason]
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
      {isNycProgram ? (
        <span className="badge badge--estimate">NYC resource · Check eligibility</span>
      ) : (
        <>
          <span className="badge">✓ Likely eligible</span>
          <span className="badge badge--estimate">Estimate, not final</span>
        </>
      )}

      <div className="detail-section">
        <h3>What is this program?</h3>
        <p>{benefit.description}</p>

        <h3>{isNycProgram ? 'Why we showed this' : 'Why you may qualify'}</h3>
        <p>{matchReason}</p>

        {isNycProgram && benefit.eligibilityDetails && (
          <>
            <h3>Official eligibility details</h3>
            <p>{benefit.eligibilityDetails}</p>
          </>
        )}

        {isNycProgram && benefit.applicationSummary && (
          <>
            <h3>How to apply</h3>
            <p>{benefit.applicationSummary}</p>
          </>
        )}

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
          {isNycProgram && benefit.officialLinkType === 'agency' && (
            <p className="official-link-note">
              This program does not list a direct online page. This button opens the agency’s official website.
            </p>
          )}
          <a id="apply-official-site-link" className="btn btn-primary" href={benefit.applyUrl} target="_blank" rel="noreferrer"
            style={{ marginTop: 24 }}>
            {actionLabel}
          </a>
        </>
      )}

      {isNycProgram && !benefit.applyUrl && (
        <div className="official-link-unavailable" role="status">
          <strong>No official online page is listed.</strong>{' '}
          Follow the “How to apply” instructions above, or call 311 for help finding the program.
        </div>
      )}

      {isNycProgram && (
        <p className="source-attribution">
          Directory source: <a href={NYC_DATASET_PAGE} target="_blank" rel="noreferrer">NYC Benefits Platform program directory</a>
          {benefit.governmentAgency ? ` · ${benefit.governmentAgency}` : ''}
          {benefit.sourceUpdatedAt ? ` · Updated ${new Date(benefit.sourceUpdatedAt).toLocaleDateString()}` : ''}
        </p>
      )}

      <p className="disclaimer">
        CareCompass is an informational guide, not an official eligibility
        determination. Confirm details with the program's agency before applying.
      </p>
    </main>
  )
}
