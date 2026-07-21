(function attachCareCompassExtension(root, factory) {
  const api = factory()
  root.CareCompassExtension = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSharedHelpers() {
  'use strict'

  const MAX_PAGE_TEXT_LENGTH = 9000
  const ALLOWED_ACTION_TYPES = new Set([
    'scroll_to_element',
    'focus_element',
    'click_element',
    'go_back',
  ])

  // Clicking these controls could submit information, change an account, or
  // start an application. The guide may still scroll to or focus them so the
  // user can make the decision themselves.
  const BLOCKED_CLICK_WORDS = /\b(apply|submit|send|save|pay|buy|purchase|order|delete|remove|cancel|confirm|agree|accept|enroll|renew|upload|download|sign\s*out|log\s*out|log\s*in|sign\s*in|register|create\s+account|checkout)\b/i

  function cleanText(value, maxLength = 240) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim()
    if (text.length <= maxLength) return text
    return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
  }

  function redactSensitiveText(value) {
    let text = String(value ?? '')
    text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[number hidden]')
    text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email hidden]')
    text = text.replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone hidden]')
    text = text.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[number hidden]')
    return text
  }

  function preparePageText(value, maxLength = MAX_PAGE_TEXT_LENGTH) {
    return cleanText(redactSensitiveText(value), maxLength)
  }

  function isSupportedPageUrl(value) {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  function isLocalPageUrl(value) {
    try {
      const url = new URL(value)
      return url.protocol === 'http:'
        && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    } catch {
      return false
    }
  }

  function selectApiBase(mode, pageUrl, localBase, productionBase) {
    if (mode === 'local') return localBase
    if (mode === 'production') return productionBase
    return isLocalPageUrl(pageUrl) ? localBase : productionBase
  }

  function isSafeClickDescriptor(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') return false
    const label = cleanText(descriptor.label, 180)
    if (!label || BLOCKED_CLICK_WORDS.test(label)) return false
    if (descriptor.inForm) return false

    const role = String(descriptor.role || '').toLowerCase()
    const tag = String(descriptor.tag || '').toLowerCase()
    const type = String(descriptor.inputType || '').toLowerCase()

    if (['input', 'select', 'textarea'].includes(tag)) return false
    if (tag === 'button' || role === 'button') return type !== 'reset'

    if (tag === 'a' || role === 'link') {
      if (!descriptor.href) return false
      try {
        const url = new URL(descriptor.href, 'https://carecompass.invalid')
        return url.protocol === 'http:' || url.protocol === 'https:'
      } catch {
        return false
      }
    }

    return false
  }

  function validateRequestedAction(action, interactiveElements, { confirmed = false } = {}) {
    if (!action || typeof action !== 'object' || !ALLOWED_ACTION_TYPES.has(action.type)) return null

    if (action.type === 'go_back') {
      return { type: 'go_back' }
    }

    const elements = Array.isArray(interactiveElements) ? interactiveElements : []
    const target = elements.find((element) => element.id === action.target)
    if (!target) return null

    const requiredCapability = {
      scroll_to_element: 'scroll',
      focus_element: 'focus',
      click_element: 'click',
    }[action.type]
    if (!Array.isArray(target.allowedActions) || !target.allowedActions.includes(requiredCapability)) return null
    if (action.type === 'click_element' && !confirmed) return null

    return { type: action.type, target: action.target }
  }

  return Object.freeze({
    ALLOWED_ACTION_TYPES,
    BLOCKED_CLICK_WORDS,
    MAX_PAGE_TEXT_LENGTH,
    cleanText,
    isSafeClickDescriptor,
    isLocalPageUrl,
    isSupportedPageUrl,
    preparePageText,
    redactSensitiveText,
    selectApiBase,
    validateRequestedAction,
  })
})
