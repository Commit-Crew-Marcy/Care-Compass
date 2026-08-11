// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Questionnaire, { mergeCMSMarketplacePlans } from '../pages/Questionnaire'


const checkEligibility = vi.fn().mockResolvedValue([])
const scorePolicyEngineEligibility = vi.fn().mockResolvedValue({ programs: [] })
const searchCMSMarketplacePlans = vi.fn().mockResolvedValue({
  year: 2026,
  countyName: 'East Baton Rouge County',
  marketplaceName: 'HealthCare.gov',
  marketplaceUrl: 'https://www.healthcare.gov/see-plans/',
  total: 0,
  plans: [],
})

vi.mock('../api', () => ({
  checkEligibility: (...args) => checkEligibility(...args),
  scorePolicyEngineEligibility: (...args) => scorePolicyEngineEligibility(...args),
  searchCMSMarketplacePlans: (...args) => searchCMSMarketplacePlans(...args),
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  checkEligibility.mockClear()
  scorePolicyEngineEligibility.mockClear()
  searchCMSMarketplacePlans.mockClear()
  render(
    <MemoryRouter>
      <Questionnaire />
    </MemoryRouter>
  )
})

it('sends ZIP and household pricing fields to CMS when health plans are requested', async () => {
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/your age/i), '32')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'LA')
  await user.type(screen.getByLabelText(/zip code \(optional\)/i), '70802')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.type(screen.getByLabelText(/annual household income/i), '52000')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(screen.getByRole('radio', { name: /^no$/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(screen.getByRole('radio', { name: /no, i do not have insurance/i }))
  await user.click(screen.getByRole('checkbox', { name: /i currently use tobacco/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(screen.getByRole('checkbox', { name: /health and insurance/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /find my benefits/i }))

  expect(searchCMSMarketplacePlans).toHaveBeenCalledTimes(1)
  expect(searchCMSMarketplacePlans).toHaveBeenCalledWith({
    state: 'LA',
    zipCode: '70802',
    income: 52000,
    immigrationStatus: 'prefer_not',
    currentCoverage: [],
    people: [{
      age: 32,
      relationship: 'self',
      isPregnant: false,
      usesTobacco: true,
    }],
  })
})

it('keeps the general benefit screening working when ZIP is left blank', async () => {
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/your age/i), '32')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'LA')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.type(screen.getByLabelText(/annual household income/i), '52000')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('radio', { name: /^no$/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('radio', { name: /no, i do not have insurance/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('checkbox', { name: /health and insurance/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /find my benefits/i }))

  expect(searchCMSMarketplacePlans).not.toHaveBeenCalled()
  expect(checkEligibility).toHaveBeenCalledTimes(1)
})

it('replaces the generic ACA result with the official state Marketplace when CMS cannot price SBM plans', () => {
  const results = mergeCMSMarketplacePlans(
    [{
      id: 11,
      name: 'Health Insurance Marketplace (ACA)',
      programType: 'marketplace',
      source: 'carecompass',
      applyUrl: 'https://www.healthcare.gov/',
    }],
    {
      planEstimatesAvailable: false,
      year: 2026,
      state: 'NY',
      stateName: 'New York',
      countyName: 'New York County',
      marketplaceName: 'NY State of Health',
      marketplaceUrl: 'https://nystateofhealth.ny.gov/',
      marketplaceModel: 'SBM',
      sourceUrl: 'https://developer.cms.gov/marketplace-api/',
      plans: [],
    }
  )

  expect(results).toHaveLength(1)
  expect(results[0]).toMatchObject({
    id: 'cms-marketplace-2026-ny-state',
    name: 'NY State of Health',
    source: 'cms_marketplace_directory',
    programType: 'marketplace_directory',
    applyUrl: 'https://nystateofhealth.ny.gov/',
  })
})
