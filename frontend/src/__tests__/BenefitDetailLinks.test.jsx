// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { getBenefit } from '../api'
import BenefitDetail from '../pages/BenefitDetail'

vi.mock('../api', () => ({ getBenefit: vi.fn() }))
vi.mock('../components/ExtensionPrompt', () => ({ default: () => null }))

const BASE_BENEFIT = {
  id: 'nyc-P020en',
  name: 'School Food',
  description: 'Free breakfast and lunch for NYC public school students.',
  eligibilitySummary: 'Review the official requirements.',
  applicationSummary: 'Speak to the parent coordinator at your child’s school.',
  requirements: [],
  source: 'nyc_open_data',
  governmentAgency: 'NYC Department of Education (DOE)',
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/benefits/nyc-P020en']}>
      <Routes>
        <Route path="/benefits/:id" element={<BenefitDetail />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.mocked(getBenefit).mockReset()
})

it('shows a program-information button and a human-readable directory source', async () => {
  vi.mocked(getBenefit).mockResolvedValue({
    ...BASE_BENEFIT,
    applyUrl: 'https://www.schools.nyc.gov/school-life/school-meals',
    officialLinkType: 'information',
  })

  renderDetail()

  expect(await screen.findByRole('link', { name: /view official program information/i })).toHaveAttribute(
    'href',
    'https://www.schools.nyc.gov/school-life/school-meals'
  )
  const source = screen.getByRole('link', { name: /nyc benefits platform program directory/i })
  expect(source).toHaveAttribute('href', 'https://data.cityofnewyork.us/d/kvhd-5fmu')
  expect(source.getAttribute('href')).not.toMatch(/\.json$/)
})

it('labels an agency fallback without pretending it is an application', async () => {
  vi.mocked(getBenefit).mockResolvedValue({
    ...BASE_BENEFIT,
    applyUrl: 'https://www.schools.nyc.gov/home',
    officialLinkType: 'agency',
  })

  renderDetail()

  expect(await screen.findByRole('link', { name: /visit the agency website/i })).toBeInTheDocument()
  expect(screen.getByText(/does not list a direct online page/i)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /apply on the official site/i })).not.toBeInTheDocument()
})

it('provides a clear next step if no safe online destination exists', async () => {
  vi.mocked(getBenefit).mockResolvedValue({ ...BASE_BENEFIT, applyUrl: null })

  renderDetail()

  expect(await screen.findByText(/no official online page is listed/i)).toBeInTheDocument()
  expect(screen.getByText(/call 311/i)).toBeInTheDocument()
})
