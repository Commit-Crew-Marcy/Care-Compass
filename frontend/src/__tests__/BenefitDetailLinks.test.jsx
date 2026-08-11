// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, vi } from 'vitest'
import { getBenefit } from '../api'
import BenefitDetail from '../pages/BenefitDetail'

vi.mock('../api', () => ({ getBenefit: vi.fn() }))
vi.mock('../components/ExtensionPrompt', () => ({ default: () => null }))

beforeEach(() => {
  vi.mocked(getBenefit).mockReset()
})

it('shows an official blue-button destination and a readable NYC dataset source', async () => {
  vi.mocked(getBenefit).mockResolvedValue({
    id: 'nyc-P073en',
    name: 'Family Assessment Program',
    description: 'Support for families experiencing conflict.',
    eligibilitySummary: 'Review the official requirements.',
    applicationSummary: 'Contact the Family Assessment Program for help.',
    requirements: [],
    source: 'nyc_open_data',
    governmentAgency: 'NYC Administration for Childrens Services (ACS)',
    officialLinkType: 'information',
    applyUrl: 'https://www.nyc.gov/site/acs/justice/family-assessment-program.page',
  })

  render(
    <MemoryRouter initialEntries={['/benefits/nyc-P073en']}>
      <Routes>
        <Route path="/benefits/:id" element={<BenefitDetail />} />
      </Routes>
    </MemoryRouter>
  )

  expect(await screen.findByRole('heading', { name: /family assessment program/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /view official program information/i })).toHaveAttribute(
    'href',
    'https://www.nyc.gov/site/acs/justice/family-assessment-program.page'
  )
  const source = screen.getByRole('link', { name: /nyc benefits and programs dataset/i })
  expect(source).toHaveAttribute('href', 'https://data.cityofnewyork.us/d/kvhd-5fmu')
  expect(source.getAttribute('href')).not.toMatch(/\.json$/)
})
