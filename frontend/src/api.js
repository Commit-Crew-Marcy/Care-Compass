// One place for every backend call. If the API URL changes, change it here.
const BASE = 'http://localhost:8000'

export async function checkEligibility(intake) {
  const res = await fetch(`${BASE}/api/eligibility/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(intake),
  })
  if (!res.ok) throw new Error(`Eligibility check failed (${res.status})`)
  return res.json()
}

export async function getBenefit(id) {
  const res = await fetch(`${BASE}/api/benefits/${id}`)
  if (!res.ok) throw new Error(`Benefit not found (${res.status})`)
  return res.json()
}
