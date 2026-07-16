// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExtensionPrompt from '../components/ExtensionPrompt'

const MARKER = 'data-care-compass-extension'
const DISMISS_KEY = 'carecompass_extension_prompt_dismissed'

beforeEach(() => {
  document.documentElement.removeAttribute(MARKER)
  sessionStorage.removeItem(DISMISS_KEY)
})

it('offers installation help before the extension is installed', () => {
  render(<ExtensionPrompt />)
  expect(screen.getByRole('dialog', { name: /take the carecompass guide/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /installation steps/i })).toHaveAttribute(
    'href',
    expect.stringContaining('/extension#run-locally')
  )
})

it('can be dismissed for the current browser session', async () => {
  const user = userEvent.setup()
  render(<ExtensionPrompt />)
  await user.click(screen.getByRole('button', { name: /not now/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(sessionStorage.getItem(DISMISS_KEY)).toBe('true')
})

it('does not show when the extension marker is present', () => {
  document.documentElement.setAttribute(MARKER, 'installed')
  render(<ExtensionPrompt />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
