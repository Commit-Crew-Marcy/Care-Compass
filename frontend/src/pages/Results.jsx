import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { createScreening, getToken } from '../api'
import ExtensionPrompt from '../components/ExtensionPrompt'
import { clearLatestScreening, loadLatestScreening, saveLatestScreening } from '../resultsStorage'
import { useSetPageContext } from '../pageContext'

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
    types: ['medicaid', 'emergency_medicaid', 'chip', 'marketplace', 'marketplace_plan', 'marketplace_directory', 'health'],
  },
  {
    title: 'Food and family support',
    types: ['snap', 'wic', 'school_lunch', 'head_start', 'tanf', 'food', 'family', 'child_care'],
  },
  {
    title: 'Money and utility help',
    types: ['ssi', 'liheap', 'cash', 'housing', 'city_id', 'eitc', 'ctc', 'state_tax_credit'],
  },
  {
    title: 'Work, education, and activities',
    types: ['work', 'education', 'enrichment'],
  },
]

function groupResults(results) {
  const used = new Set()
  const grouped = GROUPS.map((g) => {
    const items = results
      .filter((b) => g.types.includes(b.programType))
      .sort((a, b) => resultPriority(a) - resultPriority(b))
    items.forEach((b) => used.add(b.id))
    return { title: g.title, items }
  }).filter((g) => g.items.length > 0)

  const rest = results.filter((b) => !used.has(b.id))
  if (rest.length > 0) grouped.push({ title: 'Other programs', items: rest })
  return grouped
}

function resultPriority(benefit) {
  if (isPreliminaryPositive(benefit)) return 0
  if (benefit.source === 'cms_marketplace' || benefit.source === 'cms_marketplace_directory') return 1
  return 2
}

function isPreliminaryPositive(benefit) {
  if (benefit.source === 'nyc_open_data' || benefit.source === 'cms_marketplace_directory') return false
  if (benefit.source === 'policyengine') {
    return benefit.eligibilityStatus === 'likely_eligible'
  }
  return true
}

function detailMatchReason(benefit) {
  if (benefit.source === 'cms_marketplace_directory') return benefit.matchReason
  if (benefit.policyEngineCatalog) {
    return benefit.policyEngineCalculationReason
      || benefit.calculationReason
      || 'We showed this because PolicyEngine US includes it in the program catalog for your selected state. Review the official requirements to find out whether your household may qualify.'
  }
  return benefit.matchReason
}

function ResultCardContent({ benefit }) {
  const amount = benefit.estimatedAnnualAmount
  const summary = ['policyengine', 'cms_marketplace', 'cms_marketplace_directory'].includes(benefit.source)
    ? benefit.description
    : benefit.eligibilitySummary
  return (
    <>
      {benefit.source === 'nyc_open_data'
        ? <span className="badge badge--estimate">NYC resource · Check eligibility</span>
        : benefit.source === 'cms_marketplace_directory'
          ? <span className="badge badge--estimate">Official state Marketplace</span>
        : benefit.source === 'cms_marketplace'
          ? <span className="badge badge--estimate">CMS Marketplace · Plan estimate</span>
        : benefit.source === 'policyengine'
          ? benefit.eligibilityStatus === 'likely_eligible'
            ? <span className="badge">✓ Likely eligible · Estimate</span>
            : <span className="badge badge--estimate">Check eligibility</span>
          : benefit.policyEngineEligibilityStatus === 'likely_eligible'
            ? <span className="badge">✓ Likely eligible · Estimate</span>
            : <span className="badge">✓ Likely eligible</span>}
      <h2>{benefit.name}</h2>
      <p>{summary}</p>
      {amount != null && (
        <p className="policyengine-amount">
          Estimated for the year: <strong>${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
        </p>
      )}
      {benefit.source === 'cms_marketplace' && (benefit.premiumWithCredit ?? benefit.premium) != null && (
        <p className="policyengine-amount">
          Estimated monthly premium:{' '}
          <strong>
            ${Number(benefit.premiumWithCredit ?? benefit.premium).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </strong>
          {benefit.monthlySavings > 0 ? ` after an estimated $${Number(benefit.monthlySavings).toLocaleString(undefined, { maximumFractionDigits: 2 })} tax credit` : ''}
        </p>
      )}
    </>
  )
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
  const metadata = hasStateResults ? (state.metadata || {}) : (cached?.metadata || {})
  const [saveName, setSaveName] = useState('My screening')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const loggedIn = Boolean(getToken())

  // Arriving fresh from the questionnaire (state present) refreshes the
  // cache so it reflects the newest screening.
  useEffect(() => {
    if (hasStateResults) saveLatestScreening(state.results, state.intake, state.metadata || {})
  }, [hasStateResults, state])

  const startNewQuestionnaire = () => {
    clearLatestScreening()
    navigate('/questionnaire')
  }

  const grouped = useMemo(() => (results ? groupResults(results) : []), [results])
  const nycResultCount = results?.filter((benefit) => benefit.source === 'nyc_open_data').length || 0
  const policyEngineResultCount = results?.filter((benefit) => benefit.policyEngineCatalog).length || 0
  const policyEngineLikelyCount = results?.filter((benefit) => (
    benefit.policyEngineEligibilityStatus === 'likely_eligible'
    || (benefit.source === 'policyengine' && benefit.eligibilityStatus === 'likely_eligible')
  )).length || 0
  const cmsMarketplacePlanCount = results?.filter((benefit) => benefit.source === 'cms_marketplace').length || 0

  // Safe page-context summary for the AI Guide — only names and short,
  // already-public descriptions, never raw intake answers.
  const pageContext = useMemo(
    () => ({
      route: '/results',
      pageTitle: 'CareCompass Results',
      heading: results ? 'Your possible benefits and resources' : 'No results yet',
      sectionHeadings: grouped.map((g) => g.title),
      visibleControls: results
        ? [{ id: 'start-new-questionnaire-button', type: 'button', label: 'Start a new questionnaire' }]
        : [{ id: 'start-questionnaire-button', type: 'button', label: 'Start the questionnaire' }],
      visibleLinks: results
        ? results
            .slice(0, 10)
            .map((b) => ({ id: `benefit-link-${b.id}`, label: b.name, route: `/benefits/${b.id}` }))
        : [],
      matchedBenefits: results
        ? results.slice(0, 10).map((b) => ({ name: b.name, description: b.eligibilitySummary }))
        : [],
    }),
    [results, grouped]
  )
  useSetPageContext(pageContext)

  if (!results) {
    return (
      <main className="container">
        <h1>No results yet</h1>
        <p className="subtitle">Answer the questionnaire first so we can find your benefits.</p>
        <button id="start-questionnaire-button" className="btn btn-primary" onClick={() => navigate('/')}>
          Start the questionnaire
        </button>
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
      <h1>Your possible benefits and resources</h1>
      <p className="subtitle">
        {results.length} program{results.length === 1 ? '' : 's'} and resource{results.length === 1 ? '' : 's'} shown for your state
      </p>

      {nycResultCount > 0 && (
        <div className="source-notice">
          <strong>{nycResultCount} current New York City resource{nycResultCount === 1 ? '' : 's'} included.</strong>{' '}
          These come from the NYC Benefits and Programs directory. They may be relevant, but their official requirements still need to be checked.
        </div>
      )}

      {metadata.cmsMarketplaceRequested
        && !metadata.cmsMarketplaceUnavailable
        && metadata.cmsMarketplacePlanEstimatesAvailable === false && (
        <div className="source-notice" role="status">
          <strong>{metadata.cmsMarketplaceName} handles Marketplace plans for {metadata.cmsMarketplaceState}.</strong>{' '}
          CMS does not provide plan-level estimates for this state-run Marketplace.{' '}
          {metadata.cmsMarketplaceUrl && (
            <a href={metadata.cmsMarketplaceUrl} target="_blank" rel="noreferrer">
              Review current plans on the official site ↗
            </a>
          )}
        </div>
      )}

      {metadata.cmsMarketplaceRequested
        && !metadata.cmsMarketplaceUnavailable
        && metadata.cmsMarketplacePlanEstimatesAvailable !== false
        && cmsMarketplacePlanCount > 0 && (
        <div className="source-notice">
          <strong>
            CMS Marketplace found {metadata.cmsMarketplaceTotal || cmsMarketplacePlanCount} current plan{(metadata.cmsMarketplaceTotal || cmsMarketplacePlanCount) === 1 ? '' : 's'} for {metadata.cmsMarketplaceCountyName}.
          </strong>{' '}
          Showing {cmsMarketplacePlanCount} of the lowest estimated monthly premiums for {metadata.cmsMarketplaceYear}.
        </div>
      )}

      {!metadata.policyEngineCatalogUnavailable
        && metadata.policyEngineCalculationAvailable !== false
        && policyEngineResultCount > 0 && (
        <div className="source-notice">
          <strong>PolicyEngine checked {metadata.policyEngineCatalogCount || policyEngineResultCount} modeled programs for {metadata.policyEngineCatalogStateName || metadata.policyEngineCatalogState}.</strong>{' '}
          {policyEngineLikelyCount > 0
            ? `${policyEngineLikelyCount} returned ${policyEngineLikelyCount === 1 ? 'a positive preliminary estimate' : 'positive preliminary estimates'}. `
            : ''}
          Cards marked Check eligibility need more information or an official review.
        </div>
      )}

      {results.length > 0 && <ExtensionPrompt />}

      <button
        id="start-new-questionnaire-button"
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
          Saved! View it anytime under <Link to="/screenings">🔖 My saved results</Link>.
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
            <Link
              id={`benefit-link-${b.id}`}
              to={`/benefits/${b.id}`}
              state={{
                matchReason: detailMatchReason(b),
                policyEngineCatalog: Boolean(b.policyEngineCatalog),
                ...((b.policyEngineCatalog || b.cmsMarketplace) ? { benefit: b } : {}),
              }}
              className="card"
              key={b.id}
            >
              <ResultCardContent benefit={b} />
            </Link>
          ))}
        </section>
      ))}

      <p className="disclaimer">
        CareCompass, PolicyEngine, and CMS results are estimates, not official determinations.
        Contact each program's agency to confirm availability, amounts, and eligibility.
      </p>
    </main>
  )
}
