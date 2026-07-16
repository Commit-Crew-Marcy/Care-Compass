// @vitest-environment jsdom
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Questionnaire from '../pages/Questionnaire'

vi.mock('../api', () => ({ checkEligibility: vi.fn().mockResolvedValue([]) }))

beforeEach(() => {
  render(
    <MemoryRouter>
      <Questionnaire />
    </MemoryRouter>
  )
})

it('asks about NYC residency only when New York is selected', async () => {
  const user = userEvent.setup()
  expect(screen.queryByRole('group', { name: /live in new york city/i })).not.toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText(/your state/i), 'NY')
  expect(screen.getByRole('group', { name: /live in new york city/i })).toBeInTheDocument()

  await user.selectOptions(screen.getByLabelText(/your state/i), 'CT')
  expect(screen.queryByRole('group', { name: /live in new york city/i })).not.toBeInTheDocument()
})

it('requires the NYC residency answer for New York residents', async () => {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/your age/i), '70')
  await user.selectOptions(screen.getByLabelText(/your state/i), 'NY')
  await user.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(/whether you live in new york city/i)

  await user.click(screen.getByRole('radio', { name: /^yes$/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByRole('heading', { name: /tell us about your household/i })).toBeInTheDocument()
})
