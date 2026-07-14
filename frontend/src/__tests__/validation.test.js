// @vitest-environment node
import { validateIncome } from '../validation.js'

describe('validateIncome', () => {
  // --- valid values ---
  it('accepts 0', () => {
    expect(validateIncome('0')).toBe('')
  })

  it('accepts 45000', () => {
    expect(validateIncome('45000')).toBe('')
  })

  it('accepts 10000000 (maximum)', () => {
    expect(validateIncome('10000000')).toBe('')
  })

  // --- invalid values ---
  it('rejects 10000001 (above maximum)', () => {
    expect(validateIncome('10000001')).toBe('Enter an income of $10,000,000 or less.')
  })

  it('rejects negative income', () => {
    expect(validateIncome('-1')).toBe('Income cannot be less than $0.')
  })

  it('rejects decimal income', () => {
    expect(validateIncome('45000.50')).toBe('Enter a whole-dollar amount without cents.')
  })

  it('rejects empty input', () => {
    expect(validateIncome('')).toBe('Enter your annual household income.')
  })
})
