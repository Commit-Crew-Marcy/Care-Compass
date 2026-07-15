// @vitest-environment jsdom
/**
 * Home page should have exactly one call-to-action that opens the
 * questionnaire, plus one scroll-to-info action and one nav link to
 * How It Works — not three duplicate paths to /questionnaire.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import Questionnaire from '../pages/Questionnaire'

vi.mock('../api', () => ({
  checkEligibility: vi.fn().mockResolvedValue([]),
}))

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
})

describe('Home page CTAs', () => {
  it('has exactly one button/link that opens the questionnaire', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
        </Routes>
      </MemoryRouter>
    )
    // "Find my benefits" (hero) is the only questionnaire entry point on
    // the page; the old bottom "Start the questionnaire" button is gone.
    expect(screen.getAllByRole('button', { name: /find my benefits/i })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /start the questionnaire/i })).not.toBeInTheDocument()
  })

  it('navigates to /questionnaire from the hero button', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/questionnaire" element={<Questionnaire />} />
        </Routes>
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /find my benefits/i }))
    expect(screen.getByText(/find benefits that fit your situation/i)).toBeInTheDocument()
  })

  it('scrolls to the How It Works section instead of navigating away', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>
    )
    await user.click(screen.getByRole('button', { name: /see how it works/i }))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    // Still on Home — no navigation occurred
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument()
  })

  it('the How It Works section has the expected id for deep-linking', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </MemoryRouter>
    )
    expect(document.getElementById('how-it-works')).toBeInTheDocument()
  })
})
