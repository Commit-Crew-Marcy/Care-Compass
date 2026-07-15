// @vitest-environment jsdom
/**
 * Results must stay visible across navigation (clicking into a benefit and
 * coming back, refreshing, revisiting later) by falling back to a
 * localStorage cache whenever React Router's location.state isn't present.
 */
import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Results from '../pages/Results'

vi.mock('../api', () => ({
  createScreening: vi.fn(),
  getToken: () => null,
}))

const SAMPLE_RESULTS = [
  { id: 'b1', name: 'SNAP', eligibilitySummary: 'Food help', programType: 'snap' },
]
const SAMPLE_INTAKE = { age: 67, state: 'CT' }

function renderResults(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/results" element={<Results />} />
        <Route path="/questionnaire" element={<div>Questionnaire page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Results caching', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders results from location.state and caches them for later', () => {
    renderResults({ pathname: '/results', state: { results: SAMPLE_RESULTS, intake: SAMPLE_INTAKE } })
    expect(screen.getByText('SNAP')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('carecompass_latest_results'))).toEqual(SAMPLE_RESULTS)
    expect(JSON.parse(localStorage.getItem('carecompass_latest_answers'))).toEqual(SAMPLE_INTAKE)
  })

  it('falls back to the localStorage cache when there is no location.state', () => {
    localStorage.setItem('carecompass_latest_results', JSON.stringify(SAMPLE_RESULTS))
    localStorage.setItem('carecompass_latest_answers', JSON.stringify(SAMPLE_INTAKE))
    renderResults('/results')
    expect(screen.getByText('SNAP')).toBeInTheDocument()
  })

  it('shows "No results yet" when there is neither state nor a cache', () => {
    renderResults('/results')
    expect(screen.getByText(/no results yet/i)).toBeInTheDocument()
  })

  it('ignores a corrupted cache entry, removes it, and shows "No results yet"', () => {
    localStorage.setItem('carecompass_latest_results', '{not valid json')
    renderResults('/results')
    expect(screen.getByText(/no results yet/i)).toBeInTheDocument()
    expect(localStorage.getItem('carecompass_latest_results')).toBeNull()
  })

  it('still renders zero-match results ("No matches found") from the cache', () => {
    localStorage.setItem('carecompass_latest_results', JSON.stringify([]))
    renderResults('/results')
    expect(screen.getByText(/no matches found/i)).toBeInTheDocument()
  })

  it('"Start a new questionnaire" clears the cache and navigates to /questionnaire', async () => {
    const user = userEvent.setup()
    localStorage.setItem('carecompass_latest_results', JSON.stringify(SAMPLE_RESULTS))
    localStorage.setItem('carecompass_latest_answers', JSON.stringify(SAMPLE_INTAKE))
    renderResults('/results')

    await user.click(screen.getByRole('button', { name: /start a new questionnaire/i }))

    expect(screen.getByText('Questionnaire page')).toBeInTheDocument()
    expect(localStorage.getItem('carecompass_latest_results')).toBeNull()
    expect(localStorage.getItem('carecompass_latest_answers')).toBeNull()
  })
})
