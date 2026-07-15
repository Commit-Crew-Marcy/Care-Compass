// Pure validation helpers — no React deps so they can be unit-tested directly.

export const INCOME_MAX = 10_000_000
export const AGE_MIN = 18
export const AGE_MAX = 120

// The person completing CareCompass must be an adult; this does not limit
// which household programs they can be matched to (see IntakeForm.age).
export function validateAge(val) {
  if (val === '') return 'Enter your age.'
  const n = Number(val)
  if (!Number.isInteger(n)) return 'Enter your age as a whole number.'
  if (n < AGE_MIN) return 'You must be 18 or older to use CareCompass.'
  if (n > AGE_MAX) return 'Enter an age of 120 or younger.'
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
