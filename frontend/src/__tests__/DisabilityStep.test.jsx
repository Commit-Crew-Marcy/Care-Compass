// @vitest-environment jsdom
/**
 * Disability step UI behaviour tests.
 *
 * These render the full Questionnaire and navigate through steps 1–2 so the
 * disability UI (step 3) becomes visible, then assert conditional rendering
 * and state-clearing behaviour.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Questionnaire from '../pages/Questionnaire'

// Mock the eligibility API — tests don't need a live backend
vi.mock('../api', () => ({
  checkEligibility: vi.fn().mockResolvedValue([]),
}))

// ---- helpers ----

async function advanceToStep3(user) {
  // Step 1 — age + state
  await user.type(screen.getByLabelText(/your age/i), '50')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'NY')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  // Step 2 — income (household size defaults to 1)
  await user.type(screen.getByLabelText(/annual household income/i), '18000')
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

describe('Disability Step (Step 3)', () => {
  let user

  beforeEach(() => {
    user = userEvent.setup()
    render(
      <MemoryRouter>
        <Questionnaire />
      </MemoryRouter>
    )
  })

  it('shows the disability question on step 3', async () => {
    await advanceToStep3(user)
    expect(
      screen.getByText(/do you have a disability, long-term condition, or support need/i)
    ).toBeInTheDocument()
  })

  it('selecting Yes reveals the follow-up section', async () => {
    await advanceToStep3(user)
    // Follow-up is hidden initially
    expect(screen.queryByText(/what best describes your situation/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /^yes$/i }))

    expect(screen.getByText(/what best describes your situation/i)).toBeInTheDocument()
  })

  it('selecting No hides the follow-up section', async () => {
    await advanceToStep3(user)
    // Reveal first, then hide
    await user.click(screen.getByRole('radio', { name: /^yes$/i }))
    expect(screen.getByText(/what best describes your situation/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /^no$/i }))

    expect(screen.queryByText(/what best describes your situation/i)).not.toBeInTheDocument()
  })

  it('checking "Another disability or support need" reveals the textarea', async () => {
    await advanceToStep3(user)
    await user.click(screen.getByRole('radio', { name: /^yes$/i }))

    expect(screen.queryByLabelText(/describe your disability or support need/i)).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('checkbox', { name: /another disability or support need/i })
    )

    expect(screen.getByLabelText(/describe your disability or support need/i)).toBeInTheDocument()
  })

  it('switching from Yes to No clears disability detail checkboxes', async () => {
    await advanceToStep3(user)
    await user.click(screen.getByRole('radio', { name: /^yes$/i }))
    await user.click(screen.getByRole('checkbox', { name: /^hearing$/i }))
    await user.click(screen.getByRole('checkbox', { name: /^vision$/i }))

    // Sanity: boxes are checked
    expect(screen.getByRole('checkbox', { name: /^hearing$/i })).toBeChecked()

    // Switch to No
    await user.click(screen.getByRole('radio', { name: /^no$/i }))
    // Switch back to Yes — detail section re-renders with cleared state
    await user.click(screen.getByRole('radio', { name: /^yes$/i }))

    expect(screen.getByRole('checkbox', { name: /^hearing$/i })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /^vision$/i })).not.toBeChecked()
  })

  it('unchecking "Another" also hides the textarea and clears its text', async () => {
    await advanceToStep3(user)
    await user.click(screen.getByRole('radio', { name: /^yes$/i }))
    await user.click(
      screen.getByRole('checkbox', { name: /another disability or support need/i })
    )

    const textarea = screen.getByLabelText(/describe your disability or support need/i)
    await user.type(textarea, 'Chronic fatigue')
    expect(textarea.value).toBe('Chronic fatigue')

    // Uncheck 'other' — textarea should disappear
    await user.click(
      screen.getByRole('checkbox', { name: /another disability or support need/i })
    )
    expect(screen.queryByLabelText(/describe your disability or support need/i)).not.toBeInTheDocument()

    // Re-check — textarea reappears blank
    await user.click(
      screen.getByRole('checkbox', { name: /another disability or support need/i })
    )
    expect(screen.getByLabelText(/describe your disability or support need/i).value).toBe('')
  })
})
