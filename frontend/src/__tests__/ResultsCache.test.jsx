// @vitest-environment jsdom
/**
 * Results must stay visible across navigation (clicking into a benefit and
 * coming back, refreshing, revisiting later) by falling back to a
 * localStorage cache whenever React Router's location.state isn't present.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Results from '../pages/Results'

vi.mock('../api', () => ({
  createScreening: vi.fn(),
  getToken: () => null,
}))

const SAMPLE_RESULTS = [
  { id: 'b1', name: 'SNAP', eligibilitySummary: 'Food help', programType: 'snap' },
]
const SAMPLE_INTAKE = { age: 67, state: 'CT' }

function renderResults(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/results" element={<Results />} />
        <Route path="/questionnaire" element={<div>Questionnaire page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Results caching', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders results from location.state and caches them for later', () => {
    const metadata = { policyEngineCatalogState: 'CT' }
    renderResults({ pathname: '/results', state: { results: SAMPLE_RESULTS, intake: SAMPLE_INTAKE, metadata } })
    expect(screen.getByText('SNAP')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('carecompass_latest_results'))).toEqual(SAMPLE_RESULTS)
    expect(JSON.parse(localStorage.getItem('carecompass_latest_answers'))).toEqual(SAMPLE_INTAKE)
    expect(JSON.parse(localStorage.getItem('carecompass_latest_result_metadata'))).toEqual(metadata)
  })

  it('falls back to the localStorage cache when there is no location.state', () => {
    localStorage.setItem('carecompass_latest_results', JSON.stringify(SAMPLE_RESULTS))
    localStorage.setItem('carecompass_latest_answers', JSON.stringify(SAMPLE_INTAKE))
    localStorage.setItem('carecompass_latest_result_metadata', JSON.stringify({ policyEngineCatalogUnavailable: true }))
    renderResults('/results')
    expect(screen.getByText('SNAP')).toBeInTheDocument()
  })

  it('shows "No results yet" when there is neither state nor a cache', () => {
    renderResults('/results')
    expect(screen.getByText(/no results yet/i)).toBeInTheDocument()
  })

  it('ignores a corrupted cache entry, removes it, and shows "No results yet"', () => {
    localStorage.setItem('carecompass_latest_results', '{not valid json')
    renderResults('/results')
    expect(screen.getByText(/no results yet/i)).toBeInTheDocument()
    expect(localStorage.getItem('carecompass_latest_results')).toBeNull()
  })

  it('still renders zero-match results ("No matches found") from the cache', () => {
    localStorage.setItem('carecompass_latest_results', JSON.stringify([]))
    renderResults('/results')
    expect(screen.getByText(/no matches found/i)).toBeInTheDocument()
  })

  it('"Start a new questionnaire" clears the cache and navigates to /questionnaire', async () => {
    const user = userEvent.setup()
    localStorage.setItem('carecompass_latest_results', JSON.stringify(SAMPLE_RESULTS))
    localStorage.setItem('carecompass_latest_answers', JSON.stringify(SAMPLE_INTAKE))
    renderResults('/results')

    await user.click(screen.getByRole('button', { name: /start a new questionnaire/i }))

    expect(screen.getByText('Questionnaire page')).toBeInTheDocument()
    expect(localStorage.getItem('carecompass_latest_results')).toBeNull()
    expect(localStorage.getItem('carecompass_latest_answers')).toBeNull()
    expect(localStorage.getItem('carecompass_latest_result_metadata')).toBeNull()
  })

  it('routes a neutral PolicyEngine score through the detail page with a check eligibility label', () => {
    const policyResult = {
      id: 'policyengine-ct-eitc',
      name: 'Earned Income Tax Credit (EITC)',
      description: 'A refundable federal income-tax credit for qualifying workers and families.',
      eligibilitySummary: 'PolicyEngine US models this nationwide program for households in Connecticut.',
      programType: 'eitc',
      source: 'policyengine',
      applyUrl: 'https://www.irs.gov/credits-deductions/individuals/earned-income-tax-credit-eitc',
      policyEngineCatalog: true,
      scope: 'federal',
      eligibilityStatus: 'check_eligibility',
      eligibilityLabel: 'Check eligibility',
      calculationReason: 'More information is needed.',
      modelCalculated: true,
    }
    renderResults({
      pathname: '/results',
      state: {
        results: [policyResult],
        intake: SAMPLE_INTAKE,
        metadata: {
          policyEngineCatalogState: 'CT',
          policyEngineCatalogStateName: 'Connecticut',
          policyEngineCatalogCount: 18,
          policyEngineCalculationAvailable: true,
        },
      },
    })

    expect(screen.queryByText('$5,454')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /earned income tax credit/i })).toHaveAttribute(
      'href',
      `/benefits/${policyResult.id}`
    )
    expect(screen.getByText(/^Check eligibility$/i)).toBeInTheDocument()
    expect(screen.getByText(policyResult.description)).toBeInTheDocument()
    expect(screen.queryByText(policyResult.eligibilitySummary)).not.toBeInTheDocument()
    expect(screen.getByText(/checked 18 modeled programs for Connecticut/i)).toBeInTheDocument()
  })

  it('shows a green PolicyEngine rating and annual estimate for a positive model result', () => {
    const policyResult = {
      id: 'policyengine-ct-snap',
      name: 'SNAP (Food Assistance)',
      description: 'Monthly help purchasing groceries.',
      eligibilitySummary: 'PolicyEngine models SNAP.',
      programType: 'snap',
      source: 'policyengine',
      applyUrl: 'https://www.fns.usda.gov/snap/state-directory',
      policyEngineCatalog: true,
      scope: 'federal',
      eligibilityStatus: 'likely_eligible',
      eligibilityLabel: 'Likely eligible',
      estimatedAnnualAmount: 3205,
    }
    renderResults({
      pathname: '/results',
      state: {
        results: [policyResult],
        intake: SAMPLE_INTAKE,
        metadata: {
          policyEngineCatalogStateName: 'Connecticut',
          policyEngineCatalogCount: 1,
          policyEngineCalculationAvailable: true,
        },
      },
    })

    expect(screen.getByText(/Likely eligible/i)).toBeInTheDocument()
    expect(screen.getByText('$3,205')).toBeInTheDocument()
    expect(screen.getByText(/1 returned a positive preliminary estimate/i)).toBeInTheDocument()
  })

  it('shows current CMS Marketplace plan estimates as internal CareCompass links', () => {
    const cmsPlan = {
      id: 'cms-marketplace-2026-19636LA0230012',
      externalId: '19636LA0230012',
      name: 'Community Blue Bronze',
      description: 'Bronze POS health plan from HMO Louisiana.',
      eligibilitySummary: 'Estimated monthly premium: $480.61.',
      matchReason: 'CMS returned this plan for East Baton Rouge County.',
      programType: 'marketplace_plan',
      source: 'cms_marketplace',
      cmsMarketplace: true,
      applyUrl: 'https://www.healthcare.gov/see-plans/',
      premium: 900.61,
      premiumWithCredit: 480.61,
      monthlySavings: 420,
    }
    renderResults({
      pathname: '/results',
      state: {
        results: [cmsPlan],
        intake: SAMPLE_INTAKE,
        metadata: {
          cmsMarketplaceRequested: true,
          cmsMarketplaceYear: 2026,
          cmsMarketplaceCountyName: 'East Baton Rouge County',
          cmsMarketplaceTotal: 59,
          cmsMarketplacePlanCount: 1,
        },
      },
    })

    expect(screen.getByText(/CMS Marketplace · Plan estimate/i)).toBeInTheDocument()
    expect(screen.getByText(/after an estimated \$420 tax credit/i)).toBeInTheDocument()
    expect(screen.getByText(/found 59 current plans for East Baton Rouge County/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /community blue bronze/i })).toHaveAttribute(
      'href',
      `/benefits/${cmsPlan.id}`
    )
  })

  it('explains state-run Marketplace coverage without presenting it as an API outage', () => {
    const stateMarketplace = {
      id: 'cms-marketplace-2026-ny-state',
      name: 'NY State of Health',
      description: 'The official state-run health insurance Marketplace serving NY.',
      matchReason: 'CMS identifies NY State of Health as the official state-run Marketplace for NY.',
      programType: 'marketplace_directory',
      source: 'cms_marketplace_directory',
      cmsMarketplace: true,
      applyUrl: 'https://nystateofhealth.ny.gov/',
    }
    renderResults({
      pathname: '/results',
      state: {
        results: [stateMarketplace],
        intake: SAMPLE_INTAKE,
        metadata: {
          cmsMarketplaceRequested: true,
          cmsMarketplaceUnavailable: false,
          cmsMarketplacePlanEstimatesAvailable: false,
          cmsMarketplaceState: 'New York',
          cmsMarketplaceName: 'NY State of Health',
          cmsMarketplaceUrl: 'https://nystateofhealth.ny.gov/',
        },
      },
    })

    expect(screen.queryByText(/plan estimates could not be loaded/i)).not.toBeInTheDocument()
    expect(screen.getByText(/NY State of Health handles Marketplace plans for New York/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /review current plans on the official site/i })).toHaveAttribute(
      'href',
      stateMarketplace.applyUrl
    )
    expect(screen.getByText(/official state Marketplace/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /NY State of Health/i })).toHaveAttribute(
      'href',
      `/benefits/${stateMarketplace.id}`
    )
  })

  it('silently keeps other results when CMS returns no plans or is unavailable', () => {
    renderResults({
      pathname: '/results',
      state: {
        results: SAMPLE_RESULTS,
        intake: SAMPLE_INTAKE,
        metadata: {
          cmsMarketplaceRequested: true,
          cmsMarketplaceUnavailable: true,
          cmsMarketplacePlanCount: 0,
        },
      },
    })

    expect(screen.getByText('SNAP')).toBeInTheDocument()
    expect(screen.queryByText(/CMS Marketplace plan estimates could not be loaded/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/CMS did not return Marketplace plans/i)).not.toBeInTheDocument()
  })
})
