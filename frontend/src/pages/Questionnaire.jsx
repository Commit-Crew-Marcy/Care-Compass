import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkEligibility } from '../api'
import { saveLatestScreening } from '../resultsStorage'
import { validateAge, validateIncome } from '../validation'

// How long to wait before showing the "server may be waking up" notice —
// Render's free tier can take up to ~60s to spin up a sleeping instance.
const WAKE_NOTICE_DELAY_MS = 6000

function messageForSubmitError(err) {
  if (err?.isNetworkError) {
    return 'We could not connect to the CareCompass server. Please wait a moment and try again.'
  }
  if (err?.status === 422) {
    return 'Some of your answers could not be submitted. Go back and review the highlighted fields.'
  }
  return 'CareCompass could not process your answers right now. Please try again.'
}

// The 6-step wizard. One small group of questions per step so the form
// never overwhelms the user. Progress lives in a fixed bar at the bottom.
// Step 4 (immigration) is optional by design: "prefer not to say" still
// returns every program without a status requirement.

const STATES = [
  { abbr: 'AL', name: 'Alabama' },
  { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' },
  { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' },
  { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' },
  { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' },
  { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' },
  { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' },
  { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' },
  { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' },
  { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' },
  { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' },
  { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' },
  { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' },
  { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' },
  { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' },
  { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' },
  { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' },
  { abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' },
  { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' },
  { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' },
  { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' },
  { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' },
  { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' },
  { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' },
  { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' },
  { abbr: 'WY', name: 'Wyoming' },
  { abbr: 'DC', name: 'District of Columbia' },
]

const COVERAGE_OPTIONS = [
  { key: 'medicare', label: 'Medicare' },
  { key: 'medicaid', label: 'Medicaid' },
  { key: 'employer', label: 'Employer plan' },
  { key: 'marketplace', label: 'Marketplace plan' },
  { key: 'tricare', label: 'TRICARE' },
  { key: 'va', label: 'VA coverage' },
  { key: 'other', label: 'Other coverage' },
]

const IMMIGRATION_OPTIONS = [
  { key: 'citizen', label: 'U.S. citizen' },
  { key: 'green_card', label: 'Green card holder (permanent resident)' },
  { key: 'refugee_asylee', label: 'Refugee or asylee' },
  { key: 'visa', label: 'Visa holder' },
  { key: 'prefer_not', label: 'Prefer not to say' },
]

const DISABILITY_DETAILS = [
  { key: 'hearing',   label: 'Hearing' },
  { key: 'vision',    label: 'Vision' },
  { key: 'memory',    label: 'Memory, concentration, or decision-making' },
  { key: 'mobility',  label: 'Walking, stairs, or mobility' },
  { key: 'self_care', label: 'Dressing or bathing' },
  { key: 'errands',   label: 'Doing errands or attending appointments on your own' },
  { key: 'other',     label: 'Another disability or support need' },
]

const TOTAL_STEPS = 6

export default function Questionnaire() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [ageError, setAgeError] = useState('')
  const [incomeError, setIncomeError] = useState('')
  const [loading, setLoading] = useState(false)
  const [waking, setWaking] = useState(false)
  const [childUnder5Error, setChildUnder5Error] = useState('')
  const [form, setForm] = useState({
    age: '',
    state: '',
    income: '',
    householdSize: '1',
    disabilityStatus: null,       // null = no selection, true = yes, false = no
    disabilityDetails: [],
    disabilityOtherText: '',
    veteranStatus: false,
    isPregnant: false,
    hasChildrenUnder18: false,
    // false = no/not applicable; becomes null (unanswered) while
    // hasChildrenUnder18 is checked, until the user picks Yes or No
    hasChildrenUnder5: false,
    immigrationStatus: 'prefer_not',
    yearsInUs: '',
    insuranceStatus: false,
    currentCoverage: [],
    otherCoverageText: '',
  })

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const toggleDisabilityDetail = (key) =>
    setForm((f) => {
      const next = f.disabilityDetails.includes(key)
        ? f.disabilityDetails.filter((d) => d !== key)
        : [...f.disabilityDetails, key]
      return {
        ...f,
        disabilityDetails: next,
        // If 'other' was just unchecked, clear the free-text too
        disabilityOtherText: next.includes('other') ? f.disabilityOtherText : '',
      }
    })

  const toggleCoverage = (key) =>
    setForm((f) => {
      const wasSelected = f.currentCoverage.includes(key)
      return {
        ...f,
        currentCoverage: wasSelected
          ? f.currentCoverage.filter((c) => c !== key)
          : [...f.currentCoverage, key],
        // Unchecking "Other coverage" hides its description — clear it too
        otherCoverageText: key === 'other' && wasSelected ? '' : f.otherCoverageText,
      }
    })

  // Simple per-step validation so users can't continue with missing answers
  const stepValid = () => {
    if (step === 1) return validateAge(form.age) === '' && form.state !== ''
    if (step === 2) return validateIncome(form.income) === '' && Number(form.householdSize) >= 1
    if (step === 3) {
      if (form.disabilityStatus === null) return false
      return true
    }
    if (step === 4 && form.immigrationStatus === 'green_card') return form.yearsInUs !== ''
    return true
  }

  const next = () => {
    if (step === 1) {
      const ae = validateAge(form.age)
      if (ae) { setAgeError(ae); return }
      setAgeError('')
      if (!form.state) {
        setError('Please select your state before continuing.')
        return
      }
      setError('')
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
      return
    }
    if (step === 2) {
      const ie = validateIncome(form.income)
      if (ie) { setIncomeError(ie); return }
      setIncomeError('')
      if (Number(form.householdSize) < 1) {
        setError('Please enter a valid household size before continuing.')
        return
      }
      setError('')
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
      return
    }
    if (step === 3) {
      if (form.disabilityStatus === null) {
        setError('Please answer the disability question before continuing.')
        return
      }
      if (form.hasChildrenUnder18 && form.hasChildrenUnder5 === null) {
        setChildUnder5Error('Select whether any child in your household is under age 5.')
        return
      }
      setError('')
      setChildUnder5Error('')
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
      return
    }
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
    setWaking(false)
    setError('')
    const wakeTimer = setTimeout(() => setWaking(true), WAKE_NOTICE_DELAY_MS)
    try {
      const intake = {
        age: Number(form.age),
        income: Number(form.income),
        state: form.state,
        householdSize: Number(form.householdSize),
        disabilityStatus: form.disabilityStatus === true,
        // Descriptive field — saved for context only, does not affect eligibility matching
        disabilityDetails: form.disabilityStatus === true ? form.disabilityDetails : [],
        veteranStatus: form.veteranStatus,
        isPregnant: form.isPregnant,
        hasChildrenUnder18: form.hasChildrenUnder18,
        hasChildrenUnder5: form.hasChildrenUnder18 ? form.hasChildrenUnder5 === true : false,
        immigrationStatus: form.immigrationStatus,
        yearsInUs: form.immigrationStatus === 'green_card' && form.yearsInUs !== ''
          ? Number(form.yearsInUs)
          : null,
        insuranceStatus: form.insuranceStatus,
        // "other" is a frontend-only bucket for the optional description;
        // the rules engine doesn't recognize it as a coverage type.
        currentCoverage: form.currentCoverage.filter((c) => c !== 'other'),
      }
      const results = await checkEligibility(intake)
      saveLatestScreening(results, intake)
      navigate('/results', { state: { results, intake } })
    } catch (err) {
      if (import.meta.env.DEV) {
        // Structured diagnostics only — never log the user's answers.
        console.error('Eligibility request failed', {
          status: err?.status,
          detail: err?.detail,
          validationErrors: err?.validationErrors,
          isNetworkError: err?.isNetworkError,
        })
      }
      setError(messageForSubmitError(err))
    } finally {
      clearTimeout(wakeTimer)
      setLoading(false)
      setWaking(false)
    }
  }

  const immigrationLabel =
    IMMIGRATION_OPTIONS.find((o) => o.key === form.immigrationStatus)?.label || ''

  return (
    <main className="container">
      {error && <div className="error-box">{error}</div>}

      {step === 1 && (
        <>
          <div className="step1-intro">
            <h1 className="step1-heading">Find benefits that fit your situation</h1>
            <p className="step1-desc">
              Answer a few simple questions to discover health, food, family,
              housing, and financial-support programs.
            </p>
            <p className="step1-trust">Free &bull; Private &bull; No account required</p>
          </div>

          <h2 className="step1-question">First, tell us your age and state</h2>
          <p className="subtitle">We use this information to find programs available to you.</p>

          <div className="field-row">
            <div className="field-group">
              <label htmlFor="age">Your age</label>
              <input
                id="age"
                type="number"
                min="18"
                max="120"
                step="1"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Enter your age"
                value={form.age}
                aria-invalid={ageError ? 'true' : 'false'}
                aria-describedby={ageError ? 'age-error' : 'age-hint'}
                onChange={(e) => {
                  set('age', e.target.value)
                  if (ageError) setAgeError(validateAge(e.target.value))
                }}
              />
              {ageError
                ? <p id="age-error" className="field-error" role="alert">{ageError}</p>
                : <p id="age-hint" className="field-hint">
                    You must be 18 or older to complete this questionnaire. You can still
                    include children in your household.
                  </p>
              }
            </div>
            <div className="field-group">
              <label htmlFor="state">Your state</label>
              <select id="state" value={form.state} onChange={(e) => set('state', e.target.value)}>
                <option value="">Select your state</option>
                {STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>
                ))}
              </select>
              <p className="field-hint">Programs and income limits may differ by state.</p>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h1>Tell us about your household</h1>
          <p className="subtitle">This helps us check your income against federal guidelines.</p>

          <div className="field-group">
            <label htmlFor="income">Annual household income (in dollars)</label>
            <input
              id="income"
              type="number"
              min="0"
              max="10000000"
              step="1"
              inputMode="numeric"
              placeholder="0"
              value={form.income}
              aria-invalid={incomeError ? 'true' : 'false'}
              aria-describedby={incomeError ? 'income-error' : 'income-hint'}
              onChange={(e) => {
                set('income', e.target.value)
                if (incomeError) setIncomeError(validateIncome(e.target.value))
              }}
            />
            {incomeError
              ? <p id="income-error" className="field-error" role="alert">{incomeError}</p>
              : <p id="income-hint" className="field-hint">Enter your household's total yearly income before taxes.</p>
            }
            {!incomeError && form.income !== '' && validateIncome(form.income) === '' && (
              <p className="income-preview" aria-live="polite">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(form.income))} per year
              </p>
            )}
          </div>

          <label htmlFor="household">How many people live in your household?</label>
          <input id="household" type="number" min="1" value={form.householdSize}
            onChange={(e) => set('householdSize', e.target.value)} />
        </>
      )}

      {step === 3 && (
        <>
          <h1>Tell us about you and your family</h1>
          <p className="subtitle">Select everything that applies. Each one unlocks different programs.</p>

          {/* ---- Disability yes / no ---- */}
          <fieldset className="ds-fieldset">
            <legend className="ds-legend">
              Do you have a disability, long-term condition, or support need?
            </legend>
            <p id="disability-status-hint" className="field-hint ds-hint">
              Answer Yes if a physical, sensory, cognitive, mental, or emotional condition makes daily
              activities harder. You do not need to name a diagnosis.
            </p>
            <div className="ds-radio-group">
              <label className={`check-card ${form.disabilityStatus === true ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="disabilityStatus"
                  value="yes"
                  checked={form.disabilityStatus === true}
                  aria-describedby="disability-status-hint"
                  onChange={() => set('disabilityStatus', true)}
                />
                Yes
              </label>
              <label className={`check-card ${form.disabilityStatus === false ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="disabilityStatus"
                  value="no"
                  checked={form.disabilityStatus === false}
                  aria-describedby="disability-status-hint"
                  onChange={() =>
                    setForm((f) => ({
                      ...f,
                      disabilityStatus: false,
                      disabilityDetails: [],
                      disabilityOtherText: '',
                    }))
                  }
                />
                No
              </label>
            </div>
          </fieldset>

          {/* ---- Optional detail section (revealed when Yes) ---- */}
          {form.disabilityStatus === true && (
            <fieldset className="ds-detail-fieldset">
              <legend className="ds-detail-legend">
                What best describes your situation?
              </legend>
              <p id="disability-details-hint" className="field-hint">
                Select all that apply. This helps us describe support options more clearly.
                It does not change your eligibility matching right now.
              </p>
              <div className="ds-checkbox-grid">
                {DISABILITY_DETAILS.map((opt) => {
                  const isOther = opt.key === 'other'
                  const isChecked = form.disabilityDetails.includes(opt.key)
                  return (
                    <label
                      key={opt.key}
                      className={`check-card ds-detail-card ${isChecked ? 'selected' : ''}`}
                      {...(isOther ? { 'aria-expanded': isChecked, 'aria-controls': 'disability-other-container' } : {})}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        aria-describedby="disability-details-hint"
                        onChange={() => toggleDisabilityDetail(opt.key)}
                      />
                      {opt.label}
                    </label>
                  )
                })}
              </div>

              {/* Free-text field — only when 'other' is checked */}
              {form.disabilityDetails.includes('other') && (
                <div id="disability-other-container" className="field-group ds-other-group" aria-live="polite">
                  <label htmlFor="disability-other">Describe your disability or support need (optional)</label>
                  <p id="disability-other-hint" className="field-hint">
                    You do not need to provide a diagnosis. Share only what you are comfortable sharing.
                  </p>
                  <textarea
                    id="disability-other"
                    maxLength={300}
                    rows={4}
                    placeholder="For example, chronic pain, difficulty standing for long periods, or another support need"
                    value={form.disabilityOtherText}
                    aria-describedby="disability-other-hint"
                    onChange={(e) => set('disabilityOtherText', e.target.value)}
                  />
                  <p className="field-hint ds-char-count" aria-live="polite">
                    {form.disabilityOtherText.length} / 300
                  </p>
                  <p className="ds-privacy-note">This description does not change your benefit matches.</p>
                </div>
              )}
            </fieldset>
          )}

          {/* ---- Remaining questions — unchanged ---- */}
          <label className={`check-card ${form.veteranStatus ? 'selected' : ''}`}>
            <input type="checkbox" checked={form.veteranStatus}
              onChange={(e) => set('veteranStatus', e.target.checked)} />
            I am a veteran
          </label>
          <label className={`check-card ${form.isPregnant ? 'selected' : ''}`}>
            <input type="checkbox" checked={form.isPregnant}
              onChange={(e) => set('isPregnant', e.target.checked)} />
            Someone in my household is pregnant
          </label>
          <label className={`check-card ${form.hasChildrenUnder18 ? 'selected' : ''}`}>
            <input type="checkbox" checked={form.hasChildrenUnder18}
              onChange={(e) => {
                const checked = e.target.checked
                setForm((f) => ({
                  ...f,
                  hasChildrenUnder18: checked,
                  // Checking reopens the question (must re-answer); unchecking
                  // clears it to the concrete "false" the backend expects.
                  hasChildrenUnder5: checked ? null : false,
                }))
                if (!checked) setChildUnder5Error('')
              }} />
            I have children under 18
          </label>

          {form.hasChildrenUnder18 && (
            <fieldset className="ds-detail-fieldset">
              <legend className="ds-detail-legend">
                Is any child in your household under age 5?
              </legend>
              <p id="under5-hint" className="field-hint">
                This helps us check programs for infants and young children.
              </p>
              <div className="ds-radio-group">
                <label className={`check-card ${form.hasChildrenUnder5 === true ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="hasChildrenUnder5"
                    checked={form.hasChildrenUnder5 === true}
                    aria-describedby={childUnder5Error ? 'under5-error' : 'under5-hint'}
                    onChange={() => { set('hasChildrenUnder5', true); setChildUnder5Error('') }}
                  />
                  Yes
                </label>
                <label className={`check-card ${form.hasChildrenUnder5 === false ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="hasChildrenUnder5"
                    checked={form.hasChildrenUnder5 === false}
                    aria-describedby={childUnder5Error ? 'under5-error' : 'under5-hint'}
                    onChange={() => { set('hasChildrenUnder5', false); setChildUnder5Error('') }}
                  />
                  No
                </label>
              </div>
              {childUnder5Error && (
                <p id="under5-error" className="field-error" role="alert">{childUnder5Error}</p>
              )}
            </fieldset>
          )}
        </>
      )}

      {step === 4 && (
        <>
          <h1>Are you new to the United States?</h1>
          <p className="subtitle">
            Some programs have immigration rules, and some are open to everyone.
            We only use this answer to match you with programs. We never share it,
            and you can choose not to answer.
          </p>
          {IMMIGRATION_OPTIONS.map((opt) => (
            <label key={opt.key}
              className={`check-card ${form.immigrationStatus === opt.key ? 'selected' : ''}`}>
              <input type="radio" name="imm" checked={form.immigrationStatus === opt.key}
                onChange={() => set('immigrationStatus', opt.key)} />
              {opt.label}
            </label>
          ))}
          {form.immigrationStatus === 'green_card' && (
            <>
              <label htmlFor="years" style={{ marginTop: 16 }}>
                How many years have you lived in the U.S.?
              </label>
              <input id="years" type="number" min="0" placeholder="3" value={form.yearsInUs}
                onChange={(e) => set('yearsInUs', e.target.value)} />
              <p className="disclaimer">
                Some programs have a 5-year waiting period for green card holders.
                Others, like Marketplace insurance and WIC, have no wait at all.
              </p>
            </>
          )}
        </>
      )}

      {step === 5 && (
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
              onChange={() =>
                setForm((f) => ({
                  ...f,
                  insuranceStatus: false,
                  currentCoverage: [],
                  otherCoverageText: '',
                }))
              } />
            No, I do not have insurance
          </label>

          {form.insuranceStatus && (
            <>
              <label style={{ marginTop: 16 }}>Select all insurance you currently have</label>
              <div className="chip-grid">
                {COVERAGE_OPTIONS.map((opt) => {
                  const isOther = opt.key === 'other'
                  const isChecked = form.currentCoverage.includes(opt.key)
                  return (
                    <label key={opt.key}
                      className={`check-card ${isChecked ? 'selected' : ''}`}
                      style={{ marginBottom: 0 }}
                      {...(isOther ? { 'aria-expanded': isChecked, 'aria-controls': 'other-coverage-container' } : {})}>
                      <input type="checkbox" checked={isChecked}
                        onChange={() => toggleCoverage(opt.key)} />
                      {opt.label}
                    </label>
                  )
                })}
              </div>
              <p className="disclaimer">This helps us find supplemental programs you may still qualify for.</p>

              {form.currentCoverage.includes('other') && (
                <div id="other-coverage-container" className="field-group ds-other-group" aria-live="polite">
                  <label htmlFor="other-coverage-text">
                    Describe your other health coverage (optional)
                  </label>
                  <p id="other-coverage-hint" className="field-hint">
                    Share the type of coverage if you know it. Do not enter a member ID, policy
                    number, Social Security number, or other sensitive information.
                  </p>
                  <textarea
                    id="other-coverage-text"
                    maxLength={300}
                    rows={4}
                    placeholder="For example, student health insurance, coverage through a spouse, or another private plan"
                    value={form.otherCoverageText}
                    aria-describedby="other-coverage-hint"
                    onChange={(e) => set('otherCoverageText', e.target.value)}
                  />
                  <p className="field-hint ds-char-count" aria-live="polite">
                    {form.otherCoverageText.length} / 300
                  </p>
                  <p className="ds-privacy-note">
                    This description is for your review only and does not change your benefit matches.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}

      {step === 6 && (
        <>
          <h1>Review your information</h1>
          <p className="subtitle">Make sure everything looks right before we find your matches.</p>
          <div className="review-row"><span>Age</span><span>{form.age}</span></div>
          <div className="review-row"><span>State</span><span>{form.state}</span></div>
          <div className="review-row"><span>Annual income</span><span>${Number(form.income).toLocaleString()}</span></div>
          <div className="review-row"><span>Household size</span><span>{form.householdSize}</span></div>
          <div className="review-row">
            <span>Disability</span>
            <span>
              {form.disabilityStatus === true
                ? (form.disabilityDetails.length > 0
                    ? `Yes — ${form.disabilityDetails
                        .map((k) => DISABILITY_DETAILS.find((d) => d.key === k)?.label || k)
                        .join('; ')}`
                    : 'Yes')
                : 'No'}
            </span>
          </div>
          {form.disabilityStatus === true && form.disabilityOtherText && (
            <div className="review-row">
              <span>Additional disability or support need</span>
              <span>{form.disabilityOtherText}</span>
            </div>
          )}
          <div className="review-row"><span>Veteran</span><span>{form.veteranStatus ? 'Yes' : 'No'}</span></div>
          <div className="review-row"><span>Pregnancy in household</span><span>{form.isPregnant ? 'Yes' : 'No'}</span></div>
          <div className="review-row">
            <span>Children</span>
            <span>
              {form.hasChildrenUnder18
                ? (form.hasChildrenUnder5 === true
                    ? 'Children under 18, including a child under 5'
                    : 'Children under 18')
                : 'None'}
            </span>
          </div>
          <div className="review-row">
            <span>Immigration</span>
            <span>
              {immigrationLabel}
              {form.immigrationStatus === 'green_card' && form.yearsInUs !== ''
                ? `, ${form.yearsInUs} yr in U.S.`
                : ''}
            </span>
          </div>
          <div className="review-row">
            <span>Insurance</span>
            <span>{form.insuranceStatus ? (form.currentCoverage.join(', ') || 'Yes') : 'None'}</span>
          </div>
          {form.insuranceStatus === true && form.currentCoverage.includes('other') && form.otherCoverageText && (
            <div className="review-row">
              <span>Other health coverage</span>
              <span>{form.otherCoverageText}</span>
            </div>
          )}
        </>
      )}

      <div className="progress-bar">
        <div className="progress-inner">
          <div className="progress-label">Step {step} of {TOTAL_STEPS}</div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
          {step === TOTAL_STEPS && waking && (
            <p className="field-hint" style={{ textAlign: 'center' }} aria-live="polite">
              The secure server may be waking up. This can take up to a minute.
            </p>
          )}
          <div className="btn-row">
            {step > 1 && <button className="btn btn-outline" onClick={back} disabled={loading}>Back</button>}
            {step < TOTAL_STEPS && <button className="btn btn-primary" onClick={next}>Continue</button>}
            {step === TOTAL_STEPS && (
              <button className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? 'Connecting to CareCompass...' : 'Find my benefits'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
