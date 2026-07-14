// Pure validation helpers — no React deps so they can be unit-tested directly.

export const INCOME_MAX = 10_000_000

export function validateAge(val) {
  if (val === '') return 'Age is required.'
  const n = Number(val)
  if (!Number.isInteger(n) || n < 0 || n > 120) return 'Please enter a whole number from 0 to 120.'
  return ''
}

export function validateIncome(val) {
  if (val === '') return 'Enter your annual household income.'
  const n = Number(val)
  if (isNaN(n)) return 'Enter a whole-dollar amount without cents.'
  if (n < 0) return 'Income cannot be less than $0.'
  if (!Number.isInteger(n)) return 'Enter a whole-dollar amount without cents.'
  if (n > INCOME_MAX) return 'Enter an income of $10,000,000 or less.'
  return ''
}
