// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import Questionnaire from '../pages/Questionnaire'

const checkEligibility = vi.fn().mockResolvedValue([])
const scorePolicyEngineEligibility = vi.fn().mockResolvedValue({
  state: 'AZ',
  stateName: 'Arizona',
  programs: [],
})

vi.mock('../api', () => ({
  checkEligibility: (...args) => checkEligibility(...args),
  scorePolicyEngineEligibility: (...args) => scorePolicyEngineEligibility(...args),
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  checkEligibility.mockClear()
  scorePolicyEngineEligibility.mockClear()
  render(
    <MemoryRouter>
      <Questionnaire />
    </MemoryRouter>
  )
})

it('sends household-member answers to PolicyEngine eligibility scoring', async () => {
  const user = userEvent.setup()

  await user.type(screen.getByLabelText(/your age/i), '40')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'AZ')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.type(screen.getByLabelText(/annual household income/i), '50000')
  const householdSize = screen.getByLabelText(/how many people live in your household/i)
  await user.clear(householdSize)
  await user.type(householdSize, '2')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.selectOptions(screen.getByLabelText(/relationship to you/i), 'spouse')
  await user.type(screen.getByLabelText(/^age$/i), '38')
  await user.clear(screen.getByLabelText(/yearly employment income/i))
  await user.type(screen.getByLabelText(/yearly employment income/i), '20000')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(screen.getByRole('radio', { name: /^no$/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('radio', { name: /no, i do not have insurance/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('checkbox', { name: /show me all kinds of help/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  await user.click(screen.getByRole('button', { name: /find my benefits/i }))

  expect(scorePolicyEngineEligibility).toHaveBeenCalledTimes(1)
  expect(scorePolicyEngineEligibility).toHaveBeenCalledWith(expect.objectContaining({
    age: 40,
    income: 50000,
    state: 'AZ',
    householdSize: 2,
    additionalPeople: [{
      relationship: 'spouse',
      age: 38,
      annualEmploymentIncome: 20000,
      isDisabled: false,
      isPregnant: false,
    }],
  }))
})
