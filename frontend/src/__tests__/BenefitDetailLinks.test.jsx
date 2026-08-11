// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { getBenefit } from '../api'
import BenefitDetail from '../pages/BenefitDetail'

vi.mock('../api', () => ({ getBenefit: vi.fn() }))
vi.mock('../components/ExtensionPrompt', () => ({ default: () => null }))

const BASE_BENEFIT = {
  id: 'nyc-P020en',
  name: 'School Food',
  description: 'Free breakfast and lunch for NYC public school students.',
  eligibilitySummary: 'Review the official requirements.',
  applicationSummary: 'Speak to the parent coordinator at your child’s school.',
  requirements: [],
  source: 'nyc_open_data',
  governmentAgency: 'NYC Department of Education (DOE)',
}

function renderDetail(initialEntry = '/benefits/nyc-P020en') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/benefits/:id" element={<BenefitDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.mocked(getBenefit).mockReset()
  localStorage.clear()
})

it('shows a PolicyEngine catalog entry inside CareCompass before opening the official site', async () => {
  const policyBenefit = {
    id: 'policyengine-az-snap',
    name: 'SNAP (Food Assistance)',
    description: 'Monthly help purchasing groceries under federal and state SNAP rules.',
    eligibilitySummary: 'PolicyEngine US models this nationwide program for households in Arizona.',
    matchReason: 'Included because snap is present in the PolicyEngine US model.',
    programType: 'snap',
    source: 'policyengine',
    scope: 'federal',
    eligibilityStatus: 'check_eligibility',
    eligibilityLabel: 'Check eligibility',
    calculationReason: 'More household information is needed before estimating this program.',
    calculationYear: 2026,
    modelCalculated: true,
    modelVariable: 'snap',
    applyUrl: 'https://www.fns.usda.gov/snap/state-directory',
  }

  renderDetail({
    pathname: `/benefits/${policyBenefit.id}`,
    state: { benefit: policyBenefit, matchReason: policyBenefit.matchReason },
  })

  expect(await screen.findByRole('heading', { name: /snap \(food assistance\)/i })).toBeInTheDocument()
  expect(screen.getByText(/^Check eligibility$/i)).toBeInTheDocument()
  expect(screen.queryByText(/PolicyEngine US · Modeled program/i)).not.toBeInTheDocument()
  expect(screen.getByText(/before you apply/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /view official program information/i })).toHaveAttribute(
    'href',
    policyBenefit.applyUrl
  )
  expect(screen.getByRole('link', { name: /^PolicyEngine US model$/i })).toHaveAttribute(
    'href',
    'https://github.com/PolicyEngine/policyengine-us'
  )
  expect(screen.queryByText(/snap is present/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/model variable/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/variable: snap/i)).not.toBeInTheDocument()
  expect(getBenefit).not.toHaveBeenCalled()
})

it('shows CMS plan pricing inside CareCompass before the official Marketplace', async () => {
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
    cmsMarketplaceYear: 2026,
    countyName: 'East Baton Rouge County',
    applyUrl: 'https://www.healthcare.gov/see-plans/',
    issuer: 'HMO Louisiana',
    metalLevel: 'Bronze',
    planType: 'POS',
    premium: 900.61,
    premiumWithCredit: 480.61,
    monthlySavings: 420,
    deductible: 12000,
    maximumOutOfPocket: 18000,
    costScope: 'Family',
    qualityRating: 3,
    benefitsUrl: 'https://issuer.example/sbc.pdf',
  }

  renderDetail({
    pathname: `/benefits/${cmsPlan.id}`,
    state: { benefit: cmsPlan, matchReason: cmsPlan.matchReason },
  })

  expect(await screen.findByRole('heading', { name: /community blue bronze/i })).toBeInTheDocument()
  expect(screen.getByText(/CMS Marketplace · Plan estimate/i)).toBeInTheDocument()
  expect(screen.getByText('$480.61')).toBeInTheDocument()
  expect(screen.getByText('$12,000')).toBeInTheDocument()
  expect(screen.getByText(/3 of 5/i)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /compare or enroll on the official marketplace/i })).toHaveAttribute(
    'href',
    cmsPlan.applyUrl
  )
  expect(screen.getByRole('link', { name: /summary of benefits and coverage/i })).toHaveAttribute(
    'href',
    cmsPlan.benefitsUrl
  )
  expect(getBenefit).not.toHaveBeenCalled()
})

it('opens a state-run Marketplace explanation before the official state site', async () => {
  const stateMarketplace = {
    id: 'cms-marketplace-2026-il-state',
    name: 'Get Covered Illinois',
    description: 'The official state-run health insurance Marketplace serving IL.',
    matchReason: 'CMS identifies Get Covered Illinois as the official state-run Marketplace for IL.',
    programType: 'marketplace_directory',
    source: 'cms_marketplace_directory',
    cmsMarketplace: true,
    cmsMarketplaceDirectory: true,
    cmsMarketplaceName: 'Get Covered Illinois',
    cmsMarketplaceYear: 2026,
    cmsMarketplaceSourceUrl: 'https://developer.cms.gov/marketplace-api/',
    applyUrl: 'https://getcoveredillinois.gov/',
  }

  renderDetail({
    pathname: `/benefits/${stateMarketplace.id}`,
    state: { benefit: stateMarketplace, matchReason: stateMarketplace.matchReason },
  })

  expect(await screen.findByRole('heading', { name: /get covered illinois/i })).toBeInTheDocument()
  expect(screen.getByText(/official state Marketplace/i)).toBeInTheDocument()
  expect(screen.getByText(/before you compare plans/i)).toBeInTheDocument()
  expect(screen.queryByText(/plan estimate/i)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /view plans on get covered illinois/i })).toHaveAttribute(
    'href',
    stateMarketplace.applyUrl
  )
  expect(getBenefit).not.toHaveBeenCalled()
})

it('shows a program-information button and a human-readable directory source', async () => {
  vi.mocked(getBenefit).mockResolvedValue({
    ...BASE_BENEFIT,
    applyUrl: 'https://www.schools.nyc.gov/school-life/school-meals',
    officialLinkType: 'information',
  })

  renderDetail()

  expect(await screen.findByRole('link', { name: /view official program information/i })).toHaveAttribute(
    'href',
    'https://www.schools.nyc.gov/school-life/school-meals'
  )
  const source = screen.getByRole('link', { name: /nyc benefits platform program directory/i })
  expect(source).toHaveAttribute('href', 'https://data.cityofnewyork.us/d/kvhd-5fmu')
  expect(source.getAttribute('href')).not.toMatch(/\.json$/)
})

it('labels an agency fallback without pretending it is an application', async () => {
  vi.mocked(getBenefit).mockResolvedValue({
    ...BASE_BENEFIT,
    applyUrl: 'https://www.schools.nyc.gov/home',
    officialLinkType: 'agency',
  })

  renderDetail()

  expect(await screen.findByRole('link', { name: /visit the agency website/i })).toBeInTheDocument()
  expect(screen.getByText(/does not list a direct online page/i)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /apply on the official site/i })).not.toBeInTheDocument()
})

it('provides a clear next step if no safe online destination exists', async () => {
  vi.mocked(getBenefit).mockResolvedValue({ ...BASE_BENEFIT, applyUrl: null })

  renderDetail()

  expect(await screen.findByText(/no official online page is listed/i)).toBeInTheDocument()
  expect(screen.getByText(/call 311/i)).toBeInTheDocument()
})
