// @vitest-environment jsdom
/**
 * Verifies the eligibility request built in Questionnaire.jsx's submit()
 * never leaks frontend-only fields (the optional disability/insurance
 * descriptions), and that declining insurance clears currentCoverage.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Questionnaire from '../pages/Questionnaire'

const checkEligibility = vi.fn().mockResolvedValue([])
vi.mock('../api', () => ({
  checkEligibility: (...args) => checkEligibility(...args),
}))

const ALLOWED_FIELDS = [
  'age', 'income', 'state', 'householdSize', 'disabilityStatus', 'disabilityDetails',
  'veteranStatus', 'isPregnant', 'hasChildrenUnder18', 'hasChildrenUnder5',
  'immigrationStatus', 'yearsInUs', 'insuranceStatus', 'currentCoverage',
]

async function fillThroughStep5AndReachReview(user, { withDescriptions } = {}) {
  // Step 1
  await user.type(screen.getByLabelText(/your age/i), '67')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'CT')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  // Step 2 — household size defaults to 1
  await user.type(screen.getByLabelText(/annual household income/i), '68888')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  // Step 3 — disability
  if (withDescriptions) {
    await user.click(screen.getByRole('radio', { name: /^yes$/i }))
    await user.click(screen.getByRole('checkbox', { name: /another disability or support need/i }))
    await user.type(
      screen.getByLabelText(/describe your disability or support need/i),
      'Uses a cane sometimes'
    )
  } else {
    await user.click(screen.getByRole('radio', { name: /^no$/i }))
  }
  await user.click(screen.getByRole('button', { name: /continue/i }))

  // Step 4 — immigration (leave default "prefer not to say")
  await user.click(screen.getByRole('button', { name: /continue/i }))

  // Step 5 — insurance
  if (withDescriptions) {
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    await user.click(screen.getByRole('checkbox', { name: /other coverage/i }))
    await user.type(
      screen.getByLabelText(/describe your other health coverage/i),
      'Covered through my spouse'
    )
  } else {
    await user.click(screen.getByRole('radio', { name: /no, i do not have insurance/i }))
  }
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

describe('Questionnaire submit payload', () => {
  let user

  beforeEach(() => {
    checkEligibility.mockClear()
    user = userEvent.setup()
    render(
      <MemoryRouter>
        <Questionnaire />
      </MemoryRouter>
    )
  })

  it('sends only the fields the backend expects, excluding the optional descriptions', async () => {
    await fillThroughStep5AndReachReview(user, { withDescriptions: true })
    await user.click(screen.getByRole('button', { name: /find my benefits/i }))

    expect(checkEligibility).toHaveBeenCalledTimes(1)
    const payload = checkEligibility.mock.calls[0][0]

    expect(Object.keys(payload).sort()).toEqual([...ALLOWED_FIELDS].sort())
    expect(payload).not.toHaveProperty('disabilityOtherText')
    expect(payload).not.toHaveProperty('otherCoverageText')
    expect(payload).not.toHaveProperty('insuranceOtherText')
    expect(payload).not.toHaveProperty('disabilityDescription')
    expect(payload).not.toHaveProperty('otherCoverageDescription')
    expect(payload).not.toHaveProperty('insuranceDescription')

    expect(payload.age).toBe(67)
    expect(payload.income).toBe(68888)
    expect(payload.householdSize).toBe(1)
    expect(payload.state).toBe('CT')
    // "other" is a frontend-only bucket for the description — the rules
    // engine doesn't recognize it, so it must never reach the API.
    expect(payload.currentCoverage).toEqual([])
  })

  it('sends currentCoverage as [] when insuranceStatus is false', async () => {
    await fillThroughStep5AndReachReview(user, { withDescriptions: false })
    await user.click(screen.getByRole('button', { name: /find my benefits/i }))

    const payload = checkEligibility.mock.calls[0][0]
    expect(payload.insuranceStatus).toBe(false)
    expect(payload.currentCoverage).toEqual([])
    expect(payload.yearsInUs).toBeNull()
  })
})
