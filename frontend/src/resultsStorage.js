// Keeps the user's most recent eligibility results alive across navigation
// (clicking into a benefit, refreshing, revisiting later) without relying on
// React Router's location.state, which is lost on refresh/direct navigation.
// Completely separate from the logged-in "My screenings" CRUD feature —
// this is just a navigation convenience cache, not a saved record.
const RESULTS_KEY = 'carecompass_latest_results'
const ANSWERS_KEY = 'carecompass_latest_answers'

function readJson(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem(key)
    return null
  }
}

export function saveLatestScreening(results, intake) {
  localStorage.setItem(RESULTS_KEY, JSON.stringify(results))
  localStorage.setItem(ANSWERS_KEY, JSON.stringify(intake ?? null))
}

// Returns { results, intake } or null if nothing valid is cached.
export function loadLatestScreening() {
  const results = readJson(RESULTS_KEY)
  if (!results) return null
  return { results, intake: readJson(ANSWERS_KEY) }
}

export function clearLatestScreening() {
  localStorage.removeItem(RESULTS_KEY)
  localStorage.removeItem(ANSWERS_KEY)
}
