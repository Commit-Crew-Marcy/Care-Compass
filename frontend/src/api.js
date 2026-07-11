// One place for every backend call. The JWT is kept in localStorage and
// attached as a Bearer header on protected requests.
const BASE = 'https://care-compass-4gi5.onrender.com'

// ---- token + user helpers ----
export function getToken() { return localStorage.getItem('cc_token') }
export function getUser() {
  const raw = localStorage.getItem('cc_user')
  return raw ? JSON.parse(raw) : null
}
function saveSession(data) {
  localStorage.setItem('cc_token', data.token)
  localStorage.setItem('cc_user', JSON.stringify(data.user))
}
export function clearSession() {
  localStorage.removeItem('cc_token')
  localStorage.removeItem('cc_user')
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try { detail = (await res.json()).detail || detail } catch { /* keep default */ }
    throw new Error(detail)
  }
  return res.json()
}

// ---- public ----
export const checkEligibility = (intake) =>
  request('/api/eligibility/check', { method: 'POST', body: intake })

export const getBenefit = (id) => request(`/api/benefits/${id}`)

// ---- auth ----
export async function register(email, password, displayName) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
  })
  saveSession(data)
  return data.user
}

export async function login(email, password) {
  const data = await request('/api/auth/login', { method: 'POST', body: { email, password } })
  saveSession(data)
  return data.user
}

export async function logout() {
  try { await request('/api/auth/logout', { method: 'POST', auth: true }) } catch { /* token may be expired */ }
  clearSession()
}

// ---- screenings CRUD ----
export const createScreening = (screening) =>
  request('/api/screenings', { method: 'POST', body: screening, auth: true })

export const listScreenings = () => request('/api/screenings', { auth: true })

export const updateScreening = (id, changes) =>
  request(`/api/screenings/${id}`, { method: 'PUT', body: changes, auth: true })

export const deleteScreening = (id) =>
  request(`/api/screenings/${id}`, { method: 'DELETE', auth: true })
