import { ELIGIBILITY_REQUEST_TIMEOUT_MS, getBenefit, resolveApiBase } from '../api'

describe('resolveApiBase', () => {
  it('uses the Render URL in production when VITE_API_BASE_URL is absent', () => {
    expect(resolveApiBase(undefined, false)).toBe('https://care-compass-4gi5.onrender.com')
  })

  it('uses localhost in development when VITE_API_BASE_URL is absent', () => {
    expect(resolveApiBase(undefined, true)).toBe('http://localhost:8000')
  })

  it('prefers VITE_API_BASE_URL over the dev/prod default in either mode', () => {
    expect(resolveApiBase('https://example.com', true)).toBe('https://example.com')
    expect(resolveApiBase('https://example.com', false)).toBe('https://example.com')
  })

  it('strips a trailing slash so requests never double up', () => {
    expect(resolveApiBase('https://example.com/', false)).toBe('https://example.com')
    expect(resolveApiBase(undefined, true)).not.toMatch(/\/$/)
  })
})

describe('request() error handling', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('preserves the backend detail message for a non-2xx JSON response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'That state code is not supported.' }),
    })
    const { checkEligibility } = await import('../api')
    await expect(checkEligibility({})).rejects.toMatchObject({
      status: 400,
      detail: 'That state code is not supported.',
    })
  })

  it('maps FastAPI 422 validation arrays into field-level validationErrors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        detail: [{ loc: ['body', 'age'], msg: 'field required', type: 'missing' }],
      }),
    })
    const { checkEligibility } = await import('../api')
    await expect(checkEligibility({})).rejects.toMatchObject({
      status: 422,
      validationErrors: [{ field: 'age', message: 'field required' }],
    })
  })

  it('flags a network failure with isNetworkError instead of a generic error', async () => {
    // checkEligibility retries once after ~3s on a network error, so fake
    // timers keep this test from actually waiting 3 seconds.
    vi.useFakeTimers()
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const { checkEligibility } = await import('../api')

    const pending = expect(checkEligibility({})).rejects.toMatchObject({ isNetworkError: true })
    await vi.runAllTimersAsync()
    await pending
    vi.useRealTimers()
  })

  it('stops an eligibility request that never responds', async () => {
    vi.useFakeTimers()
    global.fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      })
    }))

    const pending = expect(import('../api').then(({ checkEligibility }) => checkEligibility({})))
      .rejects.toMatchObject({ aborted: true, isNetworkError: true })
    await vi.advanceTimersByTimeAsync(ELIGIBILITY_REQUEST_TIMEOUT_MS)
    await pending
    vi.useRealTimers()
  })
})

describe('getBenefit', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('routes NYC directory IDs to the NYC detail endpoint', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'nyc-P015en' }),
    })

    await getBenefit('nyc-P015en')

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/nyc-benefits\/P015en$/),
      expect.any(Object)
    )
  })
})
