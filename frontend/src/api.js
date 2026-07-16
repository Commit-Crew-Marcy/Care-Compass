// One place for every backend call. The JWT is kept in localStorage and
// attached as a Bearer header on protected requests.
//
// Base URL resolution order: an explicit VITE_API_BASE_URL always wins;
// otherwise dev mode talks to the local backend and a production build
// talks to the deployed Render API. Exported as a pure function (instead
// of reading import.meta.env inline) so it can be unit tested directly.
export function resolveApiBase(envUrl, isDev) {
  const raw = envUrl || (isDev ? 'http://localhost:8000' : 'https://care-compass-4gi5.onrender.com')
  return raw.replace(/\/+$/, '')
}

const BASE = resolveApiBase(import.meta.env.VITE_API_BASE_URL, import.meta.env.DEV)
export const ELIGIBILITY_REQUEST_TIMEOUT_MS = 45_000

// Structured error thrown by every failed request. UI code can branch on
// `status` / `isNetworkError` instead of parsing a message string.
export class ApiError extends Error {
  constructor({ status = null, detail = null, validationErrors = null, isNetworkError = false, aborted = false } = {}) {
    super(detail || (isNetworkError ? 'Network error' : `Request failed (${status})`))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.validationErrors = validationErrors
    this.isNetworkError = isNetworkError
    this.aborted = aborted
  }
}

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

async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiError({ isNetworkError: true, detail: 'Request stopped.', aborted: true })
    }
    // fetch() only throws for network-level failures (unreachable host,
    // CORS rejection, offline) — never for HTTP error status codes.
    throw new ApiError({ isNetworkError: true, detail: err.message })
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    let validationErrors = null
    try {
      const data = await res.json()
      if (res.status === 422 && Array.isArray(data.detail)) {
        // FastAPI validation errors: [{ loc: ["body", "age"], msg: "...", type: "..." }]
        validationErrors = data.detail.map((d) => ({
          field: Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body').join('.') : String(d.loc ?? ''),
          message: d.msg,
        }))
        detail = 'Validation failed'
      } else if (typeof data.detail === 'string') {
        detail = data.detail
      }
    } catch { /* body wasn't JSON — keep the default detail */ }
    throw new ApiError({ status: res.status, detail, validationErrors })
  }
  return res.json()
}

const RETRYABLE_STATUSES = [502, 503, 504]

// Retries exactly once, only for network errors or the given retryable HTTP
// statuses (Render cold starts commonly surface as one of these). Never
// retries 4xx — a validation error will fail identically on a second try.
async function requestWithRetry(path, opts) {
  try {
    return await request(path, opts)
  } catch (err) {
    const shouldRetry = err instanceof ApiError
      && !err.aborted
      && (err.isNetworkError || RETRYABLE_STATUSES.includes(err.status))
    if (!shouldRetry) throw err
    await new Promise((resolve) => setTimeout(resolve, 3000))
    return request(path, opts)
  }
}

// ---- public ----
export async function checkEligibility(intake) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ELIGIBILITY_REQUEST_TIMEOUT_MS)
  try {
    return await requestWithRetry('/api/eligibility/check', {
      method: 'POST',
      body: intake,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof ApiError && err.aborted) {
      throw new ApiError({
        isNetworkError: true,
        aborted: true,
        detail: 'The CareCompass server took too long to respond.',
      })
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

export const getBenefit = (id) => {
  const value = String(id)
  if (value.startsWith('nyc-')) {
    return request(`/api/nyc-benefits/${encodeURIComponent(value.slice(4))}`)
  }
  return request(`/api/benefits/${encodeURIComponent(value)}`)
}

// pageContext: safe semantic summary of the current page (see pageContext.jsx).
// responseMode: 'simple' | 'more_detail'. history: last few {role, text} turns.
export const askAi = (question, { pageContext = null, responseMode = 'simple', history = [], signal } = {}) =>
  request('/api/ai/chat', {
    method: 'POST',
    body: { question, pageContext, responseMode, history },
    signal,
  })

// ---- auth ----
export async function register(email, password) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: { email, password },
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
