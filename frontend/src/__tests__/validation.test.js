// @vitest-environment node
import { validateAge, validateIncome } from '../validation.js'

describe('validateAge', () => {
  it('accepts 18 (minimum)', () => {
    expect(validateAge('18')).toBe('')
  })

  it('accepts 67', () => {
    expect(validateAge('67')).toBe('')
  })

  it('accepts 120 (maximum)', () => {
    expect(validateAge('120')).toBe('')
  })

  it('rejects 17 as under the minimum age', () => {
    expect(validateAge('17')).toBe('You must be 18 or older to use CareCompass.')
  })

  it('rejects 0', () => {
    expect(validateAge('0')).toBe('You must be 18 or older to use CareCompass.')
  })

  it('rejects 121 as above the maximum', () => {
    expect(validateAge('121')).toBe('Enter an age of 120 or younger.')
  })

  it('rejects a decimal age', () => {
    expect(validateAge('45.5')).toBe('Enter your age as a whole number.')
  })

  it('rejects empty input', () => {
    expect(validateAge('')).toBe('Enter your age.')
  })
})

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
