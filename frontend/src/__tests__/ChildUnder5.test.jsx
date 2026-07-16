// @vitest-environment jsdom
/**
 * The "child under 5" follow-up is now a required conditional question
 * (radio Yes/No) instead of a standalone checkbox, gated on "I have
 * children under 18". The user must answer it before continuing.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Questionnaire from '../pages/Questionnaire'

vi.mock('../api', () => ({
  checkEligibility: vi.fn().mockResolvedValue([]),
}))

async function advanceToStep3(user) {
  await user.type(screen.getByLabelText(/your age/i), '30')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'CT')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.type(screen.getByLabelText(/annual household income/i), '18000')
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

describe('Child under 5 follow-up (Step 3)', () => {
  let user

  beforeEach(async () => {
    user = userEvent.setup()
    render(
      <MemoryRouter>
        <Questionnaire />
      </MemoryRouter>
    )
    await advanceToStep3(user)
    await user.click(screen.getByRole('radio', { name: /^no$/i })) // disability: No
  })

  it('is hidden until "I have children under 18" is checked', () => {
    expect(screen.queryByText(/is any child in your household under age 5/i)).not.toBeInTheDocument()
  })

  it('reveals the Yes/No follow-up when children under 18 is checked', async () => {
    await user.click(screen.getByRole('checkbox', { name: /i have children under 18/i }))
    expect(screen.getByText(/is any child in your household under age 5/i)).toBeInTheDocument()
    // Two "Yes" radios now exist on this step (disability + under-5)
    expect(screen.getAllByRole('radio', { name: /^yes$/i })).toHaveLength(2)
  })

  it('blocks continuing until the follow-up is answered', async () => {
    await user.click(screen.getByRole('checkbox', { name: /i have children under 18/i }))
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(
      screen.getByText(/select whether any child in your household is under age 5/i)
    ).toBeInTheDocument()
  })

  it('allows continuing once Yes or No is selected', async () => {
    await user.click(screen.getByRole('checkbox', { name: /i have children under 18/i }))
    const under5Radios = screen.getAllByRole('radio', { name: /^no$/i })
    // Two "No" radios exist on this step (disability + under-5) — the
    // under-5 one is the one added after checking the parent checkbox.
    await user.click(under5Radios[under5Radios.length - 1])
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(screen.getByText(/are you new to the united states/i)).toBeInTheDocument()
  })

  it('unchecking "I have children under 18" hides and clears the follow-up answer', async () => {
    await user.click(screen.getByRole('checkbox', { name: /i have children under 18/i }))
    const yesRadios = screen.getAllByRole('radio', { name: /^yes$/i })
    await user.click(yesRadios[yesRadios.length - 1]) // answer Yes to under-5

    await user.click(screen.getByRole('checkbox', { name: /i have children under 18/i })) // uncheck parent
    expect(screen.queryByText(/is any child in your household under age 5/i)).not.toBeInTheDocument()

    // Re-checking reopens the question unanswered — continuing is blocked again
    await user.click(screen.getByRole('checkbox', { name: /i have children under 18/i }))
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(
      screen.getByText(/select whether any child in your household is under age 5/i)
    ).toBeInTheDocument()
  })
})
