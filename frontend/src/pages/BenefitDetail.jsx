import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { getBenefit } from '../api'
import ExtensionPrompt from '../components/ExtensionPrompt'
import { useSetPageContext } from '../pageContext'
import { loadLatestScreening } from '../resultsStorage'

const NYC_DATASET_PAGE = 'https://data.cityofnewyork.us/d/kvhd-5fmu'
const POLICYENGINE_REPOSITORY = 'https://github.com/PolicyEngine/policyengine-us'
const CMS_MARKETPLACE_SOURCE = 'https://developer.cms.gov/marketplace-api/'

function officialLinkLabel(benefit, isNycProgram, isPolicyEngineProgram, isCmsMarketplacePlan, isCmsMarketplaceDirectory) {
  if (isCmsMarketplacePlan) return 'Compare or enroll on the official Marketplace ↗'
  if (isCmsMarketplaceDirectory) return `View plans on ${benefit?.cmsMarketplaceName || 'the official state Marketplace'} ↗`
  if (isPolicyEngineProgram) return 'View official program information ↗'
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
  const routedBenefit = state?.benefit || null
  const [benefit, setBenefit] = useState(
    String(routedBenefit?.id) === id ? routedBenefit : null
  )
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    if (String(routedBenefit?.id) === id) {
      setBenefit(routedBenefit)
      return
    }

    if (id.startsWith('policyengine-') || id.startsWith('cms-marketplace-')) {
      const cachedBenefit = loadLatestScreening()?.results?.find((item) => item.id === id)
      if (cachedBenefit) {
        setBenefit(cachedBenefit)
      } else {
        setBenefit(null)
        setError('We could not load this program. Please return to your results and try again.')
      }
      return
    }

    setBenefit(null)
    let cancelled = false
    getBenefit(id)
      .then((loadedBenefit) => {
        if (!cancelled) setBenefit(loadedBenefit)
      })
      .catch(() => {
        if (!cancelled) setError('We could not load this benefit.')
      })
    return () => { cancelled = true }
  }, [id, routedBenefit])

  const isNycProgram = benefit?.source === 'nyc_open_data'
  const isPolicyEngineProgram = benefit?.source === 'policyengine'
  const isCmsMarketplacePlan = benefit?.source === 'cms_marketplace'
  const isCmsMarketplaceDirectory = benefit?.source === 'cms_marketplace_directory'
  const hasPolicyEngineSource = isPolicyEngineProgram || state?.policyEngineCatalog === true
  const policyEngineYear = benefit?.calculationYear || benefit?.policyEngineCalculationYear
  const matchReason = isPolicyEngineProgram
    ? benefit?.calculationReason
      || `${benefit?.eligibilitySummary || 'PolicyEngine US includes this program in its catalog.'} Review the official requirements to find out whether your household may qualify.`
    : isCmsMarketplacePlan
      ? benefit?.matchReason || 'CMS returned this plan for the ZIP code and household information provided.'
    : isCmsMarketplaceDirectory
      ? benefit?.matchReason || 'CMS identified the official Marketplace for your selected state.'
    : state?.matchReason
      || benefit?.matchReason
      || benefit?.eligibilitySummary
      || ''
  const actionLabel = officialLinkLabel(
    benefit,
    isNycProgram,
    isPolicyEngineProgram,
    isCmsMarketplacePlan,
    isCmsMarketplaceDirectory
  )

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
            isNycProgram || isPolicyEngineProgram || isCmsMarketplacePlan || isCmsMarketplaceDirectory ? 'Why we showed this' : 'Why you may qualify',
            ...(isCmsMarketplacePlan ? ['Plan estimate'] : []),
            ...(isNycProgram && benefit.eligibilityDetails ? ['Official eligibility details'] : []),
            ...(benefit.requirements?.length ? ['What you will need to apply'] : []),
            ...(isPolicyEngineProgram ? ['Before you apply'] : []),
            ...(isCmsMarketplacePlan ? ['Before you enroll'] : []),
            ...(isCmsMarketplaceDirectory ? ['Before you compare plans'] : []),
          ]
        : [],
      visibleControls: [
        { id: 'back-to-results-link', type: 'link', label: 'Back to results' },
        ...(benefit?.applyUrl ? [{ id: 'apply-official-site-link', type: 'link', label: actionLabel.replace(' ↗', '') }] : []),
      ],
      benefitDetail: benefit ? { name: benefit.name, description: benefit.description } : null,
      matchedBenefits: benefit ? [{ name: benefit.name, description: matchReason }] : [],
    }),
    [actionLabel, benefit, id, isCmsMarketplaceDirectory, isCmsMarketplacePlan, isNycProgram, isPolicyEngineProgram, matchReason]
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
      ) : isCmsMarketplaceDirectory ? (
        <span className="badge badge--estimate">Official state Marketplace</span>
      ) : isCmsMarketplacePlan ? (
        <span className="badge badge--estimate">CMS Marketplace · Plan estimate</span>
      ) : isPolicyEngineProgram ? (
        benefit.eligibilityStatus === 'likely_eligible'
          ? <span className="badge">✓ Likely eligible · Estimate</span>
          : <span className="badge badge--estimate">Check eligibility</span>
      ) : (
        <>
          <span className="badge">✓ Likely eligible</span>
          <span className="badge badge--estimate">Estimate, not final</span>
        </>
      )}

      <div className="detail-section">
        <h3>What is this program?</h3>
        <p>{benefit.description}</p>

        <h3>{isNycProgram || isPolicyEngineProgram || isCmsMarketplacePlan || isCmsMarketplaceDirectory ? 'Why we showed this' : 'Why you may qualify'}</h3>
        <p>{matchReason}</p>

        {isCmsMarketplacePlan && (
          <>
            <h3>Plan estimate</h3>
            <div className="marketplace-plan-facts">
              <div className="review-row">
                <span>Estimated monthly premium</span>
                <span>
                  {(benefit.premiumWithCredit ?? benefit.premium) != null
                    ? `$${Number(benefit.premiumWithCredit ?? benefit.premium).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : 'Contact Marketplace'}
                </span>
              </div>
              {benefit.monthlySavings > 0 && (
                <div className="review-row">
                  <span>Estimated monthly tax credit</span>
                  <span>${Number(benefit.monthlySavings).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {benefit.premium != null && benefit.monthlySavings > 0 && (
                <div className="review-row">
                  <span>Full monthly premium</span>
                  <span>${Number(benefit.premium).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {benefit.deductible != null && (
                <div className="review-row">
                  <span>{benefit.costScope || 'Plan'} deductible</span>
                  <span>${Number(benefit.deductible).toLocaleString()}</span>
                </div>
              )}
              {benefit.maximumOutOfPocket != null && (
                <div className="review-row">
                  <span>{benefit.costScope || 'Plan'} out-of-pocket maximum</span>
                  <span>${Number(benefit.maximumOutOfPocket).toLocaleString()}</span>
                </div>
              )}
              <div className="review-row">
                <span>Plan</span>
                <span>{[benefit.metalLevel, benefit.planType].filter(Boolean).join(' · ') || 'Health plan'}</span>
              </div>
              {benefit.issuer && <div className="review-row"><span>Issuer</span><span>{benefit.issuer}</span></div>}
              {benefit.qualityRating && (
                <div className="review-row"><span>CMS quality rating</span><span>{benefit.qualityRating} of 5</span></div>
              )}
            </div>
          </>
        )}

        {isCmsMarketplaceDirectory && (
          <>
            <h3>Before you compare plans</h3>
            <p>
              This state operates its own Marketplace platform, so plan availability,
              premiums, financial assistance, and enrollment dates must be checked on
              the official state website.
            </p>
          </>
        )}

        {hasPolicyEngineSource && benefit.estimatedAnnualAmount != null && (
          <p className="policyengine-amount">
            Estimated for {policyEngineYear}: <strong>${Number(benefit.estimatedAnnualAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
          </p>
        )}

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

        {isPolicyEngineProgram && (
          <>
            <h3>Before you apply</h3>
            <p>
              Review the official program page for current eligibility rules, required documents,
              deadlines, and application instructions. This PolicyEngine result uses the answers
              in your questionnaire and defaults for details CareCompass does not collect; it is
              not an official eligibility decision.
            </p>
          </>
        )}

        {isCmsMarketplacePlan && (
          <>
            <h3>Before you enroll</h3>
            <p>
              CMS calculated this preliminary price from the household and ZIP code information
              entered in CareCompass. The official Marketplace will verify eligibility, tax credits,
              final premiums, enrollment dates, and whether household members can join this plan.
            </p>
            <div className="marketplace-resource-links">
              {benefit.benefitsUrl && <a href={benefit.benefitsUrl} target="_blank" rel="noreferrer">Summary of benefits and coverage ↗</a>}
              {benefit.brochureUrl && <a href={benefit.brochureUrl} target="_blank" rel="noreferrer">Plan brochure ↗</a>}
              {benefit.networkUrl && <a href={benefit.networkUrl} target="_blank" rel="noreferrer">Provider network ↗</a>}
            </div>
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

      {hasPolicyEngineSource && (
        <p className="source-attribution">
          Eligibility model source: <a href={POLICYENGINE_REPOSITORY} target="_blank" rel="noreferrer">PolicyEngine US model</a>
        </p>
      )}

      {isCmsMarketplacePlan && (
        <p className="source-attribution">
          Plan and premium source: <a href={benefit.cmsMarketplaceSourceUrl || CMS_MARKETPLACE_SOURCE} target="_blank" rel="noreferrer">CMS Marketplace API</a>
          {benefit.cmsMarketplaceYear ? ` · ${benefit.cmsMarketplaceYear}` : ''}
          {benefit.countyName ? ` · ${benefit.countyName}` : ''}
        </p>
      )}

      {isCmsMarketplaceDirectory && (
        <p className="source-attribution">
          Marketplace directory source: <a href={benefit.cmsMarketplaceSourceUrl || CMS_MARKETPLACE_SOURCE} target="_blank" rel="noreferrer">CMS Marketplace API</a>
          {benefit.cmsMarketplaceYear ? ` · ${benefit.cmsMarketplaceYear}` : ''}
        </p>
      )}

      <p className="disclaimer">
        CareCompass is an informational guide, not an official eligibility
        determination. Confirm details with the program's agency before applying.
      </p>
    </main>
  )
}
