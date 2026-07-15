// @vitest-environment jsdom
/**
 * The optional "other coverage" description must appear only when the
 * "Other coverage" checkbox is selected — not just because the user
 * answered Yes to having insurance.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Questionnaire from '../pages/Questionnaire'

vi.mock('../api', () => ({
  checkEligibility: vi.fn().mockResolvedValue([]),
}))

async function advanceToStep5(user) {
  await user.type(screen.getByLabelText(/your age/i), '45')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'NY')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.type(screen.getByLabelText(/annual household income/i), '18000')
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(screen.getByRole('radio', { name: /^no$/i })) // disability: No
  await user.click(screen.getByRole('button', { name: /continue/i }))

  await user.click(screen.getByRole('button', { name: /continue/i })) // immigration: default
}

describe('Other health coverage description (Step 5)', () => {
  let user

  beforeEach(async () => {
    user = userEvent.setup()
    render(
      <MemoryRouter>
        <Questionnaire />
      </MemoryRouter>
    )
    await advanceToStep5(user)
  })

  it('does not show the description just because Yes is selected', async () => {
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    expect(screen.queryByLabelText(/describe your other health coverage/i)).not.toBeInTheDocument()
  })

  it('does not reveal the description for a normal coverage option', async () => {
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    await user.click(screen.getByRole('checkbox', { name: /^medicare$/i }))
    expect(screen.queryByLabelText(/describe your other health coverage/i)).not.toBeInTheDocument()
  })

  it('reveals the description when "Other coverage" is selected', async () => {
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    await user.click(screen.getByRole('checkbox', { name: /other coverage/i }))
    expect(screen.getByLabelText(/describe your other health coverage/i)).toBeInTheDocument()
  })

  it('unchecking "Other coverage" hides the textarea and clears its value', async () => {
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    await user.click(screen.getByRole('checkbox', { name: /other coverage/i }))

    const textarea = screen.getByLabelText(/describe your other health coverage/i)
    await user.type(textarea, 'Student health plan')
    expect(textarea.value).toBe('Student health plan')

    await user.click(screen.getByRole('checkbox', { name: /other coverage/i }))
    expect(screen.queryByLabelText(/describe your other health coverage/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /other coverage/i }))
    expect(screen.getByLabelText(/describe your other health coverage/i).value).toBe('')
  })

  it('selecting No clears coverage selections, hides the options, and clears the description', async () => {
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    await user.click(screen.getByRole('checkbox', { name: /other coverage/i }))
    await user.type(screen.getByLabelText(/describe your other health coverage/i), 'Some plan')

    await user.click(screen.getByRole('radio', { name: /no, i do not have insurance/i }))

    expect(screen.queryByRole('checkbox', { name: /other coverage/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/describe your other health coverage/i)).not.toBeInTheDocument()

    // Selecting Yes again shows coverage options with nothing pre-selected
    await user.click(screen.getByRole('radio', { name: /yes, i have insurance/i }))
    expect(screen.getByRole('checkbox', { name: /other coverage/i })).not.toBeChecked()
  })
})
