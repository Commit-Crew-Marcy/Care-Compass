import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkEligibility } from '../api'

// The 5-step wizard from the wireframe. One small group of questions per
// step so the form never overwhelms older users. Progress lives in a fixed
// bar at the bottom with a "Step X of 5" counter.

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']

const COVERAGE_OPTIONS = [
  { key: 'medicare', label: 'Medicare' },
  { key: 'medicaid', label: 'Medicaid' },
  { key: 'employer', label: 'Employer plan' },
  { key: 'marketplace', label: 'Marketplace plan' },
  { key: 'tricare', label: 'TRICARE' },
  { key: 'va', label: 'VA coverage' },
]

const TOTAL_STEPS = 5

export default function Questionnaire() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    age: '',
    state: '',
    income: '',
    householdSize: '1',
    disabilityStatus: false,
    veteranStatus: false,
    insuranceStatus: false,
    currentCoverage: [],
  })

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const toggleCoverage = (key) =>
    setForm((f) => ({
      ...f,
      currentCoverage: f.currentCoverage.includes(key)
        ? f.currentCoverage.filter((c) => c !== key)
        : [...f.currentCoverage, key],
    }))

  // Simple per-step validation so users can't continue with missing answers
  const stepValid = () => {
    if (step === 1) return form.age !== '' && form.state !== ''
    if (step === 2) return form.income !== '' && Number(form.householdSize) >= 1
    return true
  }

  const next = () => {
    if (!stepValid()) {
      setError('Please answer the questions on this page before continuing.')
      return
    }
    setError('')
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  const back = () => {
    setError('')
    setStep((s) => Math.max(s - 1, 1))
  }

  const submit = async () => {
    setLoading(true)
    setError('')
    try {
      const intake = {
        age: Number(form.age),
        income: Number(form.income),
        state: form.state,
        householdSize: Number(form.householdSize),
        disabilityStatus: form.disabilityStatus,
        veteranStatus: form.veteranStatus,
        insuranceStatus: form.insuranceStatus,
        currentCoverage: form.currentCoverage,
      }
      const results = await checkEligibility(intake)
      navigate('/results', { state: { results, intake } })
    } catch (err) {
      setError('Something went wrong finding your benefits. Please make sure the server is running and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container">
      {error && <div className="error-box">{error}</div>}

      {step === 1 && (
        <>
          <h1>How old are you?</h1>
          <p className="subtitle">We use your age and location to find matching programs.</p>
          <div className="field-row">
            <div>
              <label htmlFor="age">Your age</label>
              <input id="age" type="number" min="0" placeholder="67" value={form.age}
                onChange={(e) => set('age', e.target.value)} />
            </div>
            <div>
              <label htmlFor="state">Your state</label>
              <select id="state" value={form.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">Select your state</option>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Tell us about your household</h1>
          <p className="subtitle">This helps us check your income against federal guidelines.</p>
          <label htmlFor="income">Annual household income (in dollars)</label>
          <input id="income" type="number" min="0" placeholder="18000" value={form.income}
            onChange={(e) => set('income', e.target.value)} />
          <label htmlFor="household">How many people live in your household?</label>
          <input id="household" type="number" min="1" value={form.householdSize}
            onChange={(e) => set('householdSize', e.target.value)} />
        </>
      )}

      {step === 3 && (
        <>
          <h1>Tell us about your situation</h1>
          <p className="subtitle">Select anything that applies to you. Both may apply.</p>
          <label className={`check-card ${form.disabilityStatus ? 'selected' : ''}`}>
            <input type="checkbox" checked={form.disabilityStatus}
              onChange={(e) => set('disabilityStatus', e.target.checked)} />
            I have a disability
          </label>
          <label className={`check-card ${form.veteranStatus ? 'selected' : ''}`}>
            <input type="checkbox" checked={form.veteranStatus}
              onChange={(e) => set('veteranStatus', e.target.checked)} />
            I am a veteran
          </label>
        </>
      )}

      {step === 4 && (
        <>
          <h1>Do you currently have health insurance?</h1>
          <p className="subtitle">Even if you do, you may still qualify for additional programs.</p>
          <label className={`check-card ${form.insuranceStatus ? 'selected' : ''}`}>
            <input type="radio" name="ins" checked={form.insuranceStatus}
              onChange={() => set('insuranceStatus', true)} />
            Yes, I have insurance
          </label>
          <label className={`check-card ${!form.insuranceStatus ? 'selected' : ''}`}>
            <input type="radio" name="ins" checked={!form.insuranceStatus}
              onChange={() => { set('insuranceStatus', false); set('currentCoverage', []) }} />
            No, I do not have insurance
          </label>

          {form.insuranceStatus && (
            <>
              <label style={{ marginTop: 16 }}>Select all insurance you currently have</label>
              <div className="chip-grid">
                {COVERAGE_OPTIONS.map((opt) => (
                  <label key={opt.key}
                    className={`check-card ${form.currentCoverage.includes(opt.key) ? 'selected' : ''}`}
                    style={{ marginBottom: 0 }}>
                    <input type="checkbox" checked={form.currentCoverage.includes(opt.key)}
                      onChange={() => toggleCoverage(opt.key)} />
                    {opt.label}
                  </label>
                ))}
              </div>
              <p className="disclaimer">This helps us find supplemental programs you may still qualify for.</p>
            </>
          )}
        </>
      )}

      {step === 5 && (
        <>
          <h1>Review your information</h1>
          <p className="subtitle">Make sure everything looks right before we find your matches.</p>
          <div className="review-row"><span>Age</span><span>{form.age}</span></div>
          <div className="review-row"><span>State</span><span>{form.state}</span></div>
          <div className="review-row"><span>Annual income</span><span>${Number(form.income).toLocaleString()}</span></div>
          <div className="review-row"><span>Household size</span><span>{form.householdSize}</span></div>
          <div className="review-row"><span>Disability</span><span>{form.disabilityStatus ? 'Yes' : 'No'}</span></div>
          <div className="review-row"><span>Veteran</span><span>{form.veteranStatus ? 'Yes' : 'No'}</span></div>
          <div className="review-row">
            <span>Insurance</span>
            <span>{form.insuranceStatus ? (form.currentCoverage.join(', ') || 'Yes') : 'None'}</span>
          </div>
        </>
      )}

      <div className="progress-bar">
        <div className="progress-inner">
          <div className="progress-label">Step {step} of {TOTAL_STEPS}</div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
          <div className="btn-row">
            {step > 1 && <button className="btn btn-outline" onClick={back}>Back</button>}
            {step < TOTAL_STEPS && <button className="btn btn-primary" onClick={next}>Continue</button>}
            {step === TOTAL_STEPS && (
              <button className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? 'Finding your benefits...' : 'Find my benefits'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
