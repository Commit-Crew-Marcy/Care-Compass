import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { checkEligibility, scorePolicyEngineEligibility, searchCMSMarketplacePlans } from '../api'
import { saveLatestScreening } from '../resultsStorage'
import { useSetPageContext } from '../pageContext'
import { validateAge, validateIncome, validateOptionalZipCode } from '../validation'

// How long to wait before showing the "server may be waking up" notice —
// Render's free tier can take up to ~60s to spin up a sleeping instance.
const WAKE_NOTICE_DELAY_MS = 6000

function messageForSubmitError(err) {
  if (err?.aborted) {
    return 'The CareCompass server took too long to respond. Please try again.'
  }
  if (err?.isNetworkError) {
    return 'We could not connect to the CareCompass server. Please wait a moment and try again.'
  }
  if (err?.status === 422) {
    return 'Some of your answers could not be submitted. Go back and review the highlighted fields.'
  }
  return 'CareCompass could not process your answers right now. Please try again.'
}

// The 8-step wizard. One small group of questions per step so the form
// never overwhelms the user. Progress lives in a fixed bar at the bottom.
// The immigration step is optional by design: "prefer not to say" still
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

const HELP_CATEGORIES = [
  { key: 'all', label: 'Show me all kinds of help' },
  { key: 'health', label: 'Health and insurance' },
  { key: 'food', label: 'Food and groceries' },
  { key: 'housing', label: 'Housing and rent' },
  { key: 'money', label: 'Money, bills, and city services' },
  { key: 'family', label: 'Family, child care, and activities' },
  { key: 'work_education', label: 'Work and education' },
]

const TOTAL_STEPS = 8

// Safe, structural-only descriptions of each step for the AI Guide — labels
// only, never the values the user has entered.
const STEP_HEADINGS = {
  1: 'First, tell us your age, state, and optional ZIP code',
  2: 'Tell us about your household',
  3: 'Who else lives in your household?',
  4: 'Tell us about you and your family',
  5: 'Are you new to the United States?',
  6: 'Do you currently have health insurance?',
  7: 'What kind of help are you looking for?',
  8: 'Review your information',
}

const STEP_FIELD_CONTROLS = {
  1: [
    { id: 'age', type: 'input', label: 'Your age' },
    { id: 'state', type: 'select', label: 'Your state' },
    { id: 'zip-code', type: 'input', label: 'ZIP code for Marketplace plan estimates' },
  ],
  2: [
    { id: 'income', type: 'input', label: 'Annual household income' },
    { id: 'household', type: 'input', label: 'How many people live in your household' },
  ],
  3: [{ id: 'household-members', type: 'group', label: 'Other household members' }],
  4: [{ id: 'step-heading', type: 'heading', label: 'Do you have a disability, long-term condition, or support need?' }],
  5: [{ id: 'step-heading', type: 'heading', label: 'Are you new to the United States?' }],
  6: [{ id: 'step-heading', type: 'heading', label: 'Do you currently have health insurance?' }],
  7: [{ id: 'help-categories', type: 'group', label: 'Types of help' }],
  8: [],
}

function newHouseholdMember(index) {
  return {
    id: `person-${index + 2}`,
    relationship: 'dependent',
    age: '',
    annualEmploymentIncome: '0',
    isDisabled: false,
    isPregnant: false,
    usesTobacco: false,
  }
}

function mergePolicyEnginePrograms(localResults, catalog) {
  if (!catalog?.programs) return localResults
  const merged = localResults.map((result) => ({ ...result }))
  const mergeableTypes = new Set([
    'medicare_part_a', 'msp', 'medicaid', 'chip', 'marketplace', 'snap', 'wic',
    'school_lunch', 'ssi', 'eitc', 'ctc', 'housing', 'tanf',
  ])
  catalog.programs.forEach((program) => {
    const existingIndex = mergeableTypes.has(program.programType)
      ? merged.findIndex((result) => (
          result.programType === program.programType
          && result.source !== 'policyengine'
          && result.source !== 'nyc_open_data'
        ))
      : -1
    const catalogDetails = {
      policyEngineCatalog: true,
      policyEngineScope: program.scope,
      policyEngineMatchReason: program.matchReason,
      policyEngineEligibilityStatus: program.eligibilityStatus,
      policyEngineCalculationReason: program.calculationReason,
      policyEngineCalculationYear: program.calculationYear,
      policyEngineModelCalculated: program.modelCalculated,
    }
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...(program.scope === 'state' ? { name: program.name } : {}),
        ...(program.estimatedAnnualAmount != null
          ? { estimatedAnnualAmount: program.estimatedAnnualAmount }
          : {}),
        ...catalogDetails,
      }
    } else {
      merged.push({ ...program, ...catalogDetails })
    }
  })
  return merged
}

function cmsMarketplacePlanCard(plan, marketplace) {
  const price = plan.premiumWithCredit ?? plan.premium
  const planDescription = [plan.metalLevel, plan.planType, 'health plan']
    .filter(Boolean)
    .join(' ')
  const issuerText = plan.issuer ? ` from ${plan.issuer}` : ''
  const priceText = price != null
    ? `Estimated monthly premium: $${Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 })}.`
    : 'Contact the Marketplace for a current premium estimate.'
  return {
    id: `cms-marketplace-${marketplace.year}-${plan.id}`,
    externalId: plan.id,
    name: plan.name,
    description: `${planDescription}${issuerText}.`,
    eligibilitySummary: priceText,
    matchReason: `CMS returned this ${marketplace.year} plan for ${marketplace.countyName} using the household and ZIP code information you provided. Prices are estimates until the Marketplace verifies the application.`,
    applyUrl: marketplace.marketplaceUrl,
    officialLinkType: 'application',
    programType: 'marketplace_plan',
    source: 'cms_marketplace',
    cmsMarketplace: true,
    cmsMarketplaceYear: marketplace.year,
    cmsMarketplaceName: marketplace.marketplaceName,
    cmsMarketplaceSourceUrl: marketplace.sourceUrl,
    countyName: marketplace.countyName,
    issuer: plan.issuer,
    metalLevel: plan.metalLevel,
    planType: plan.planType,
    premium: plan.premium,
    premiumWithCredit: plan.premiumWithCredit,
    monthlySavings: plan.monthlySavings,
    deductible: plan.deductible,
    maximumOutOfPocket: plan.maximumOutOfPocket,
    costScope: plan.costScope,
    qualityRating: plan.qualityRating,
    hsaEligible: plan.hsaEligible,
    guaranteedRate: plan.guaranteedRate,
    benefitsUrl: plan.benefitsUrl,
    brochureUrl: plan.brochureUrl,
    networkUrl: plan.networkUrl,
    issuerUrl: plan.issuerUrl,
  }
}

function cmsStateMarketplaceCard(marketplace) {
  const marketplaceName = marketplace.marketplaceName || 'Your state Marketplace'
  const stateName = marketplace.stateName || marketplace.state
  return {
    id: `cms-marketplace-${marketplace.year}-${marketplace.state.toLowerCase()}-state`,
    name: marketplaceName,
    description: `The official state-run health insurance Marketplace serving ${stateName}.`,
    eligibilitySummary: 'Review current health plans, prices, financial help, and enrollment options on the official state Marketplace.',
    matchReason: `CMS identifies ${marketplaceName} as the official state-run Marketplace for ${stateName}. CMS does not provide plan-level premium estimates for states that operate their own Marketplace platform.`,
    applyUrl: marketplace.marketplaceUrl,
    officialLinkType: 'information',
    programType: 'marketplace_directory',
    source: 'cms_marketplace_directory',
    cmsMarketplace: true,
    cmsMarketplaceDirectory: true,
    cmsMarketplaceYear: marketplace.year,
    cmsMarketplaceName: marketplaceName,
    cmsMarketplaceModel: marketplace.marketplaceModel,
    cmsMarketplaceSourceUrl: marketplace.sourceUrl,
    countyName: marketplace.countyName,
    estimatedAnnualAmount: null,
  }
}

export function mergeCMSMarketplacePlans(results, marketplace) {
  if (!marketplace) return results
  if (marketplace.planEstimatesAvailable === false) {
    const directoryCard = cmsStateMarketplaceCard(marketplace)
    const existingMarketplaceIndex = results.findIndex(
      (result) => result.programType === 'marketplace'
    )
    if (existingMarketplaceIndex < 0) return [...results, directoryCard]
    return results.map((result, index) => (
      index === existingMarketplaceIndex
        ? { ...result, ...directoryCard }
        : result
    ))
  }
  if (!marketplace.plans?.length) return results
  return [
    ...results,
    ...marketplace.plans.map((plan) => cmsMarketplacePlanCard(plan, marketplace)),
  ]
}

export default function Questionnaire() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [error, setError] = useState('')
  const [ageError, setAgeError] = useState('')
  const [incomeError, setIncomeError] = useState('')
  const [zipError, setZipError] = useState('')
  const [loading, setLoading] = useState(false)
  const [waking, setWaking] = useState(false)
  const submitErrorRef = useRef(null)
  const disabilityDetailsRef = useRef(null)
  const coverageDetailsRef = useRef(null)
  const [childUnder5Error, setChildUnder5Error] = useState('')
  const [form, setForm] = useState({
    age: '',
    state: '',
    zipCode: '',
    nycResident: null,
    income: '',
    householdSize: '1',
    additionalPeople: [],
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
    usesTobacco: false,
    helpCategories: [],
  })

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const updateHouseholdSize = (value) => {
    const parsed = Number(value)
    setForm((current) => {
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
        return { ...current, householdSize: value }
      }
      const count = parsed - 1
      const additionalPeople = Array.from(
        { length: count },
        (_, index) => current.additionalPeople[index] || newHouseholdMember(index)
      )
      return { ...current, householdSize: value, additionalPeople }
    })
  }

  const updateHouseholdMember = (index, field, value) => {
    setForm((current) => ({
      ...current,
      additionalPeople: current.additionalPeople.map((person, personIndex) =>
        personIndex === index ? { ...person, [field]: value } : person
      ),
    }))
  }

  // A submit error is rendered beside the submit button. Move focus there so
  // keyboard and screen-reader users do not miss it after a failed request.
  useEffect(() => {
    if (step === TOTAL_STEPS && error) submitErrorRef.current?.focus()
  }, [error, step])

  // Selecting "Yes" reveals a follow-up section below the fold — scroll it
  // into view so the user notices it instead of just seeing nothing happen.
  useEffect(() => {
    if (form.disabilityStatus === true) {
      disabilityDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [form.disabilityStatus])

  useEffect(() => {
    if (form.insuranceStatus) {
      coverageDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [form.insuranceStatus])

  const validationMessages = [error, ageError, incomeError, zipError, childUnder5Error].filter(Boolean)

  const navControls = [
    ...(step > 1 ? [{ id: 'back-button', type: 'button', label: 'Back' }] : []),
    ...(step < TOTAL_STEPS
      ? [{ id: 'continue-button', type: 'button', label: 'Continue' }]
      : [{ id: 'questionnaire-submit-button', type: 'button', label: 'Find my benefits' }]),
  ]

  const pageContext = useMemo(
    () => ({
      route: '/questionnaire',
      pageTitle: 'CareCompass Questionnaire',
      heading: STEP_HEADINGS[step] || '',
      questionnaireStep: step,
      visibleControls: [...(STEP_FIELD_CONTROLS[step] || []), ...navControls],
      validationMessages,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, error, ageError, incomeError, zipError, childUnder5Error]
  )
  useSetPageContext(pageContext)

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

  const toggleHelpCategory = (key) =>
    setForm((f) => {
      if (key === 'all') {
        return { ...f, helpCategories: f.helpCategories.includes('all') ? [] : ['all'] }
      }
      const withoutAll = f.helpCategories.filter((category) => category !== 'all')
      const next = withoutAll.includes(key)
        ? withoutAll.filter((category) => category !== key)
        : [...withoutAll, key]
      return { ...f, helpCategories: next }
    })

  // Simple per-step validation so users can't continue with missing answers
  const stepValid = () => {
    if (step === 1) {
      return validateAge(form.age) === ''
        && form.state !== ''
        && validateOptionalZipCode(form.zipCode) === ''
        && (form.state !== 'NY' || form.nycResident !== null)
    }
    if (step === 2) {
      return validateIncome(form.income) === ''
        && Number.isInteger(Number(form.householdSize))
        && Number(form.householdSize) >= 1
        && Number(form.householdSize) <= 12
    }
    if (step === 3) {
      const peopleAreValid = form.additionalPeople.length === Number(form.householdSize) - 1
        && form.additionalPeople.every((person) => (
          person.age !== ''
          && Number.isInteger(Number(person.age))
          && Number(person.age) >= 0
          && Number(person.age) <= 120
          && person.annualEmploymentIncome !== ''
          && Number(person.annualEmploymentIncome) >= 0
          && Number(person.annualEmploymentIncome) <= 10_000_000
        ))
      const spouseCount = form.additionalPeople.filter((person) => person.relationship === 'spouse').length
      const otherIncome = form.additionalPeople.reduce(
        (total, person) => total + Number(person.annualEmploymentIncome || 0),
        0
      )
      return peopleAreValid && spouseCount <= 1 && otherIncome <= Number(form.income)
    }
    if (step === 4) {
      if (form.disabilityStatus === null) return false
      return true
    }
    if (step === 5 && form.immigrationStatus === 'green_card') return form.yearsInUs !== ''
    if (step === 7) return form.helpCategories.length > 0
    return true
  }

  const next = () => {
    if (step === 1) {
      const ae = validateAge(form.age)
      if (ae) { setAgeError(ae); return }
      setAgeError('')
      const ze = validateOptionalZipCode(form.zipCode)
      if (ze) { setZipError(ze); return }
      setZipError('')
      if (!form.state) {
        setError('Please select your state before continuing.')
        return
      }
      if (form.state === 'NY' && form.nycResident === null) {
        setError('Please select whether you live in New York City.')
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
      if (!Number.isInteger(Number(form.householdSize)) || Number(form.householdSize) < 1 || Number(form.householdSize) > 12) {
        setError('Enter a household size from 1 to 12 before continuing.')
        return
      }
      setError('')
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
      return
    }
    if (step === 3) {
      if (!stepValid()) {
        const otherIncome = form.additionalPeople.reduce(
          (total, person) => total + Number(person.annualEmploymentIncome || 0),
          0
        )
        setError(otherIncome > Number(form.income)
          ? 'The other household members’ work income cannot exceed the total household income.'
          : 'Enter an age, relationship, and yearly work income for each household member.')
        return
      }
      const childMembers = form.additionalPeople.filter(
        (person) => person.relationship !== 'spouse' && Number(person.age) < 18
      )
      if (childMembers.length > 0) {
        setForm((current) => ({
          ...current,
          hasChildrenUnder18: true,
          hasChildrenUnder5: childMembers.some((person) => Number(person.age) < 5),
        }))
      }
      setError('')
      setStep((s) => Math.min(s + 1, TOTAL_STEPS))
      return
    }
    if (step === 4) {
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
    if (step === 7 && form.helpCategories.length === 0) {
      setError('Select at least one type of help, or choose “Show me all kinds of help.”')
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
      const householdHasChild = form.additionalPeople.some(
        (person) => person.relationship !== 'spouse' && Number(person.age) < 18
      )
      const householdHasYoungChild = form.additionalPeople.some(
        (person) => person.relationship !== 'spouse' && Number(person.age) < 5
      )
      const householdHasDisability = form.disabilityStatus === true
        || form.additionalPeople.some((person) => person.isDisabled)
      const householdHasPregnancy = form.isPregnant
        || form.additionalPeople.some((person) => person.isPregnant)
      const intake = {
        age: Number(form.age),
        income: Number(form.income),
        state: form.state,
        nycResident: form.state === 'NY' && form.nycResident === true,
        helpCategories: form.helpCategories,
        householdSize: Number(form.householdSize),
        disabilityStatus: householdHasDisability,
        // Descriptive field — saved for context only, does not affect eligibility matching
        disabilityDetails: form.disabilityStatus === true ? form.disabilityDetails : [],
        veteranStatus: form.veteranStatus,
        isPregnant: householdHasPregnancy,
        hasChildrenUnder18: form.hasChildrenUnder18 || householdHasChild,
        hasChildrenUnder5: form.hasChildrenUnder5 === true || householdHasYoungChild,
        immigrationStatus: form.immigrationStatus,
        yearsInUs: form.immigrationStatus === 'green_card' && form.yearsInUs !== ''
          ? Number(form.yearsInUs)
          : null,
        insuranceStatus: form.insuranceStatus,
        // "other" is a frontend-only bucket for the optional description;
        // the rules engine doesn't recognize it as a coverage type.
        currentCoverage: form.currentCoverage.filter((c) => c !== 'other'),
      }
      const policyEngineIntake = {
        age: intake.age,
        income: intake.income,
        state: intake.state,
        householdSize: intake.householdSize,
        // PolicyEngine receives person-level flags below; do not reuse the
        // household-wide rollups sent to CareCompass's rules engine.
        disabilityStatus: form.disabilityStatus === true,
        isPregnant: form.isPregnant,
        immigrationStatus: intake.immigrationStatus,
        yearsInUs: intake.yearsInUs,
        insuranceStatus: intake.insuranceStatus,
        currentCoverage: intake.currentCoverage,
        additionalPeople: form.additionalPeople.map((person) => ({
          relationship: person.relationship,
          age: Number(person.age),
          annualEmploymentIncome: Number(person.annualEmploymentIncome || 0),
          isDisabled: person.isDisabled,
          isPregnant: person.isPregnant,
        })),
      }
      const cmsMarketplaceRequested = Boolean(
        form.zipCode
        && (form.helpCategories.includes('all') || form.helpCategories.includes('health'))
      )
      const cmsMarketplaceIntake = cmsMarketplaceRequested ? {
        state: intake.state,
        zipCode: form.zipCode,
        income: intake.income,
        immigrationStatus: intake.immigrationStatus,
        currentCoverage: intake.currentCoverage,
        people: [
          {
            age: intake.age,
            relationship: 'self',
            isPregnant: form.isPregnant,
            usesTobacco: form.usesTobacco,
          },
          ...form.additionalPeople.map((person) => ({
            age: Number(person.age),
            relationship: person.relationship,
            isPregnant: person.isPregnant,
            usesTobacco: person.usesTobacco,
          })),
        ],
      } : null
      const [eligibilityResult, policyEngineResult, cmsMarketplaceResult] = await Promise.allSettled([
        checkEligibility(intake),
        scorePolicyEngineEligibility(policyEngineIntake),
        cmsMarketplaceRequested
          ? searchCMSMarketplacePlans(cmsMarketplaceIntake)
          : Promise.resolve(null),
      ])
      if (eligibilityResult.status === 'rejected') throw eligibilityResult.reason

      const catalog = policyEngineResult.status === 'fulfilled' ? policyEngineResult.value : null
      const marketplace = cmsMarketplaceResult.status === 'fulfilled'
        ? cmsMarketplaceResult.value
        : null
      const results = mergeCMSMarketplacePlans(
        mergePolicyEnginePrograms(eligibilityResult.value, catalog),
        marketplace
      )
      const metadata = {
        policyEngineCatalogUnavailable: policyEngineResult.status === 'rejected',
        policyEngineCatalogState: catalog?.state || form.state,
        policyEngineCatalogStateName: catalog?.stateName || null,
        policyEngineCatalogCount: catalog?.programs?.length || 0,
        policyEngineCatalogSource: catalog?.sourceRepository || null,
        policyEngineCatalogCommit: catalog?.sourceCommit || null,
        policyEngineCalculationAvailable: catalog?.calculationAvailable === true,
        policyEngineCalculationYear: catalog?.calculationYear || null,
        policyEngineCalculationNote: catalog?.calculationNote || null,
        cmsMarketplaceRequested,
        cmsMarketplaceUnavailable: cmsMarketplaceRequested
          && cmsMarketplaceResult.status === 'rejected',
        cmsMarketplaceYear: marketplace?.year || null,
        cmsMarketplaceState: marketplace?.stateName || marketplace?.state || form.state,
        cmsMarketplaceCountyName: marketplace?.countyName || null,
        cmsMarketplaceName: marketplace?.marketplaceName || null,
        cmsMarketplaceUrl: marketplace?.marketplaceUrl || null,
        cmsMarketplaceModel: marketplace?.marketplaceModel || null,
        cmsMarketplacePlanEstimatesAvailable: marketplace?.planEstimatesAvailable !== false,
        cmsMarketplaceTotal: marketplace?.total || 0,
        cmsMarketplacePlanCount: marketplace?.plans?.length || 0,
        cmsMarketplaceSourceUrl: marketplace?.sourceUrl || null,
      }
      if (import.meta.env.DEV && policyEngineResult.status === 'rejected') {
        console.warn('PolicyEngine eligibility request failed; showing CareCompass matches only', {
          status: policyEngineResult.reason?.status,
          detail: policyEngineResult.reason?.detail,
        })
      }
      if (import.meta.env.DEV && cmsMarketplaceRequested && cmsMarketplaceResult.status === 'rejected') {
        console.warn('CMS Marketplace request failed; showing other CareCompass results', {
          status: cmsMarketplaceResult.reason?.status,
          detail: cmsMarketplaceResult.reason?.detail,
        })
      }
      saveLatestScreening(results, intake, metadata)
      navigate('/results', { state: { results, intake, metadata } })
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
  const additionalChildren = form.additionalPeople.filter(
    (person) => person.relationship !== 'spouse' && Number(person.age) < 18
  )
  const householdHasYoungChild = additionalChildren.some((person) => Number(person.age) < 5)
  const householdHasPregnancy = form.isPregnant || form.additionalPeople.some((person) => person.isPregnant)

  return (
    <main className="container">
      {error && step !== TOTAL_STEPS && <div className="error-box" role="alert">{error}</div>}

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

          <h2 id="step-heading" className="step1-question">First, tell us your age and state</h2>
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
              <select
                id="state"
                value={form.state}
                onChange={(e) => {
                  const state = e.target.value
                  setForm((current) => ({
                    ...current,
                    state,
                    zipCode: state === current.state ? current.zipCode : '',
                    nycResident: state === 'NY'
                      ? (current.state === 'NY' ? current.nycResident : null)
                      : false,
                  }))
                }}
              >
                <option value="">Select your state</option>
                {STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>
                ))}
              </select>
              <p className="field-hint">Programs and income limits may differ by state.</p>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="zip-code">ZIP code (optional)</label>
            <input
              id="zip-code"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              placeholder="For example, 70802"
              value={form.zipCode}
              aria-invalid={zipError ? 'true' : 'false'}
              aria-describedby={zipError ? 'zip-code-error' : 'zip-code-hint'}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 5)
                set('zipCode', value)
                if (zipError) setZipError(validateOptionalZipCode(value))
              }}
            />
            {zipError
              ? <p id="zip-code-error" className="field-error" role="alert">{zipError}</p>
              : (
                <p id="zip-code-hint" className="field-hint">
                  Add your ZIP code to see current CMS Marketplace plans and premium estimates.
                  CareCompass sends no name, address, or Social Security number to CMS.
                </p>
                )}
          </div>

          {form.state === 'NY' && (
            <fieldset className="ds-fieldset">
              <legend className="ds-legend">Do you live in New York City?</legend>
              <p id="nyc-resident-hint" className="field-hint ds-hint">
                New York City publishes a separate directory of city programs.
                This includes the Bronx, Brooklyn, Manhattan, Queens, and Staten Island.
              </p>
              <div className="ds-radio-group">
                <label className={`check-card ${form.nycResident === true ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="nycResident"
                    checked={form.nycResident === true}
                    aria-describedby="nyc-resident-hint"
                    onChange={() => set('nycResident', true)}
                  />
                  Yes
                </label>
                <label className={`check-card ${form.nycResident === false ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="nycResident"
                    checked={form.nycResident === false}
                    aria-describedby="nyc-resident-hint"
                    onChange={() => set('nycResident', false)}
                  />
                  No
                </label>
              </div>
            </fieldset>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h1 id="step-heading">Tell us about your household</h1>
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
          <input id="household" type="number" min="1" max="12" step="1" value={form.householdSize}
            onChange={(e) => updateHouseholdSize(e.target.value)} />
          <p className="field-hint">Include yourself, a spouse, children, and other people who share finances with you.</p>

        </>
      )}

      {step === 3 && (
        <>
          <h1 id="step-heading">Who else lives in your household?</h1>
          <p className="subtitle">
            This helps CareCompass recognize child, family, disability, and pregnancy-related programs.
          </p>
          {form.additionalPeople.length === 0 ? (
            <div className="source-notice" role="status">
              You entered a one-person household, so there are no other people to add.
            </div>
          ) : (
            <div id="household-members" className="household-member-list">
              {form.additionalPeople.map((person, index) => {
                const anotherSpouseSelected = form.additionalPeople.some(
                  (candidate, candidateIndex) => candidateIndex !== index && candidate.relationship === 'spouse'
                )
                return (
                  <fieldset className="household-member-card" key={person.id}>
                    <legend>Person {index + 2}</legend>
                    <div className="field-row">
                      <div className="field-group">
                        <label htmlFor={`relationship-${index}`}>Relationship to you</label>
                        <select
                          id={`relationship-${index}`}
                          value={person.relationship}
                          onChange={(e) => updateHouseholdMember(index, 'relationship', e.target.value)}
                        >
                          <option value="dependent">Child or tax dependent</option>
                          <option value="spouse" disabled={anotherSpouseSelected}>Spouse</option>
                          <option value="other">Other tax dependent</option>
                        </select>
                      </div>
                      <div className="field-group">
                        <label htmlFor={`person-age-${index}`}>Age</label>
                        <input
                          id={`person-age-${index}`}
                          type="number"
                          min="0"
                          max="120"
                          step="1"
                          value={person.age}
                          onChange={(e) => updateHouseholdMember(index, 'age', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="field-group">
                      <label htmlFor={`person-income-${index}`}>Yearly employment income</label>
                      <input
                        id={`person-income-${index}`}
                        type="number"
                        min="0"
                        max="10000000"
                        step="1"
                        value={person.annualEmploymentIncome}
                        onChange={(e) => updateHouseholdMember(index, 'annualEmploymentIncome', e.target.value)}
                      />
                      <p className="field-hint">Enter 0 if this person has no income from work.</p>
                    </div>
                    <div className="household-member-flags">
                      <label className={`check-card ${person.isDisabled ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={person.isDisabled}
                          onChange={(e) => updateHouseholdMember(index, 'isDisabled', e.target.checked)}
                        />
                        This person has a disability
                      </label>
                      <label className={`check-card ${person.isPregnant ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={person.isPregnant}
                          onChange={(e) => updateHouseholdMember(index, 'isPregnant', e.target.checked)}
                        />
                        This person is pregnant
                      </label>
                      <label className={`check-card ${person.usesTobacco ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={person.usesTobacco}
                          onChange={(e) => updateHouseholdMember(index, 'usesTobacco', e.target.checked)}
                        />
                        This person currently uses tobacco
                      </label>
                    </div>
                  </fieldset>
                )
              })}
            </div>
          )}
          <p className="disclaimer">
            The work-income amounts for other people should already be included in the total household income you entered.
          </p>
        </>
      )}

      {step === 4 && (
        <>
          <h1 id="step-heading">Tell us about you and your family</h1>
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
            <fieldset className="ds-detail-fieldset" ref={disabilityDetailsRef}>
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

      {step === 5 && (
        <>
          <h1 id="step-heading">Are you new to the United States?</h1>
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

      {step === 6 && (
        <>
          <h1 id="step-heading">Do you currently have health insurance?</h1>
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
            <div ref={coverageDetailsRef}>
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
            </div>
          )}

          <label className={`check-card ${form.usesTobacco ? 'selected' : ''}`}>
            <input
              type="checkbox"
              checked={form.usesTobacco}
              onChange={(e) => set('usesTobacco', e.target.checked)}
            />
            I currently use tobacco
          </label>
          <p className="field-hint">
            CMS uses tobacco status only to improve Marketplace premium estimates where state rules allow it.
          </p>
        </>
      )}

      {step === 7 && (
        <>
          <h1 id="step-heading">What kind of help are you looking for?</h1>
          <p className="subtitle">
            Select one or more. This keeps directory and Marketplace results focused and useful.
          </p>
          <fieldset id="help-categories" className="ds-detail-fieldset">
            <legend className="sr-only">Types of help</legend>
            <div className="ds-checkbox-grid">
              {HELP_CATEGORIES.map((option) => {
                const checked = form.helpCategories.includes(option.key)
                return (
                  <label key={option.key} className={`check-card ${checked ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleHelpCategory(option.key)}
                    />
                    {option.label}
                  </label>
                )
              })}
            </div>
          </fieldset>
          <p className="disclaimer">
            These choices filter suggestions and plan results. They do not change whether you qualify.
          </p>
        </>
      )}

      {step === 8 && (
        <>
          <h1 id="step-heading">Review your information</h1>
          <p className="subtitle">Make sure everything looks right before we find your matches.</p>
          <div className="review-row"><span>Age</span><span>{form.age}</span></div>
          <div className="review-row"><span>State</span><span>{form.state}</span></div>
          {form.zipCode && <div className="review-row"><span>ZIP code</span><span>{form.zipCode}</span></div>}
          {form.state === 'NY' && (
            <div className="review-row">
              <span>New York City resident</span>
              <span>{form.nycResident ? 'Yes' : 'No'}</span>
            </div>
          )}
          <div className="review-row"><span>Annual income</span><span>${Number(form.income).toLocaleString()}</span></div>
          <div className="review-row"><span>Household size</span><span>{form.householdSize}</span></div>
          {form.additionalPeople.map((person, index) => (
            <div className="review-row" key={person.id}>
              <span>Person {index + 2}</span>
              <span>
                {person.relationship} · age {person.age} · ${Number(person.annualEmploymentIncome || 0).toLocaleString()} work income
                {person.usesTobacco ? ' · uses tobacco' : ''}
              </span>
            </div>
          ))}
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
          <div className="review-row"><span>Pregnancy in household</span><span>{householdHasPregnancy ? 'Yes' : 'No'}</span></div>
          <div className="review-row">
            <span>Children</span>
            <span>
              {(form.hasChildrenUnder18 || additionalChildren.length > 0)
                ? ((form.hasChildrenUnder5 === true || householdHasYoungChild)
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
          <div className="review-row"><span>Tobacco use</span><span>{form.usesTobacco ? 'Yes' : 'No'}</span></div>
          {form.insuranceStatus === true && form.currentCoverage.includes('other') && form.otherCoverageText && (
            <div className="review-row">
              <span>Other health coverage</span>
              <span>{form.otherCoverageText}</span>
            </div>
          )}
          <div className="review-row">
            <span>Looking for</span>
            <span>
              {form.helpCategories
                .map((key) => HELP_CATEGORIES.find((option) => option.key === key)?.label || key)
                .join(', ')}
            </span>
          </div>
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
          {step === TOTAL_STEPS && error && (
            <div
              id="questionnaire-submit-error"
              className="error-box submit-error"
              role="alert"
              tabIndex={-1}
              ref={submitErrorRef}
            >
              {error}
            </div>
          )}
          <div className="btn-row">
            {step > 1 && <button id="back-button" className="btn btn-outline" onClick={back} disabled={loading}>Back</button>}
            {step < TOTAL_STEPS && <button id="continue-button" className="btn btn-primary" onClick={next}>Continue</button>}
            {step === TOTAL_STEPS && (
              <button id="questionnaire-submit-button" className="btn btn-primary" onClick={submit} disabled={loading}>
                {loading ? 'Connecting to CareCompass...' : 'Find my benefits'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
