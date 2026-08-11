(function startCareCompassContentScript() {
  'use strict'

  const helpers = globalThis.CareCompassExtension
  const elementRegistry = new Map()
  let latestInteractiveElements = []
  const VISIBLE_DIALOG_SELECTOR = [
    'dialog[open]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[aria-modal="true"]',
  ].join(',')
  const REMOVED_CONTENT_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'svg', 'canvas',
    'input', 'textarea', 'select', '[hidden]', '[aria-hidden="true"]',
    '[data-care-compass-private]',
  ].join(',')

  document.documentElement.setAttribute('data-care-compass-extension', 'installed')
  document.dispatchEvent(new Event('carecompass-extension-ready'))

  function isVisible(element) {
    if (!(element instanceof Element) || !element.isConnected) return false
    if (element.closest('[hidden], [aria-hidden="true"]')) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0
      && element.getClientRects().length > 0
  }

  function labelFor(element) {
    const labelledBy = element.getAttribute('aria-labelledby')
    const labelledText = labelledBy
      ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ')
      : ''
    const associatedLabel = element.labels?.length
      ? Array.from(element.labels).map((label) => label.textContent || '').join(' ')
      : ''
    const raw = element.getAttribute('aria-label')
      || labelledText
      || associatedLabel
      || element.innerText
      || element.textContent
      || element.getAttribute('title')
      || element.getAttribute('placeholder')
      || ''
    return helpers.cleanText(raw, 180)
  }

  function roleFor(element) {
    const explicit = element.getAttribute('role')
    if (explicit) return explicit
    const tag = element.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button') return 'button'
    if (['input', 'textarea', 'select'].includes(tag)) return 'field'
    return 'control'
  }

  function safePageUrl() {
    try {
      const current = new URL(location.href)
      return `${current.origin}${current.pathname}`
    } catch {
      return location.href
    }
  }

  function collectVisibleDialogs() {
    const candidates = Array.from(document.querySelectorAll(VISIBLE_DIALOG_SELECTOR))
      .filter(isVisible)
    return candidates.filter((element, index) => (
      !candidates.some((other, otherIndex) => otherIndex < index && other.contains(element))
    ))
  }

  function textFrom(source, { removeDialogs = false } = {}) {
    if (!source) return ''
    const clone = source.cloneNode(true)
    clone.querySelectorAll(REMOVED_CONTENT_SELECTOR).forEach((element) => element.remove())
    if (removeDialogs) {
      clone.querySelectorAll(VISIBLE_DIALOG_SELECTOR).forEach((element) => element.remove())
    }
    return clone.innerText || clone.textContent || ''
  }

  function collectPageText(dialogs) {
    const source = document.querySelector('main, [role="main"], article') || document.body
    const dialogTexts = dialogs.map((dialog) => textFrom(dialog))
    return helpers.prepareContextText(
      textFrom(source, { removeDialogs: true }),
      dialogTexts
    )
  }

  function collectInteractiveElements(dialogs) {
    elementRegistry.clear()
    const selector = [
      'a[href]',
      'button',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')
    const dialogElements = dialogs.flatMap((dialog) => Array.from(dialog.querySelectorAll(selector)))
    const elements = Array.from(new Set([
      ...dialogElements,
      ...document.querySelectorAll(selector),
    ]))
    const result = []

    for (const element of elements) {
      if (result.length >= 60 || !isVisible(element)) continue
      const tag = element.tagName.toLowerCase()
      const inputType = tag === 'input' ? String(element.type || '').toLowerCase() : ''
      if (inputType === 'password') continue

      const label = labelFor(element)
      if (!label) continue

      const descriptor = {
        id: `cc-element-${result.length + 1}`,
        role: roleFor(element),
        label,
        tag,
        inputType,
        inForm: Boolean(element.closest('form')),
        href: tag === 'a' ? element.href : null,
        allowedActions: ['scroll', 'focus'],
      }
      if (helpers.isSafeClickDescriptor(descriptor)) descriptor.allowedActions.push('click')

      elementRegistry.set(descriptor.id, element)
      result.push(descriptor)
    }

    latestInteractiveElements = result
    return result
  }

  function buildPageContext() {
    const dialogs = collectVisibleDialogs()
    const selectedText = helpers.preparePageText(String(getSelection?.() || ''), 1500)
    const dialogHeadings = dialogs.flatMap((dialog) => (
      Array.from(dialog.querySelectorAll('h1, h2, h3'))
    ))
    const headingElements = Array.from(new Set([
      ...dialogHeadings,
      ...document.querySelectorAll('h1, h2, h3'),
    ]))
    const headings = headingElements
      .filter(isVisible)
      .map((element) => helpers.cleanText(element.textContent, 240))
      .filter(Boolean)
      .slice(0, 24)

    return {
      url: safePageUrl(),
      domain: location.hostname,
      pageTitle: helpers.cleanText(document.title, 300),
      heading: headings[0] || '',
      sectionHeadings: headings.slice(1),
      pageText: collectPageText(dialogs),
      selectedText,
      interactiveElements: collectInteractiveElements(dialogs),
    }
  }

  function highlight(element) {
    const previousOutline = element.style.outline
    const previousOffset = element.style.outlineOffset
    element.style.outline = '4px solid #d9ae55'
    element.style.outlineOffset = '4px'
    setTimeout(() => {
      if (!element.isConnected) return
      element.style.outline = previousOutline
      element.style.outlineOffset = previousOffset
    }, 2500)
  }

  function executeAction(action, confirmed) {
    const safeAction = helpers.validateRequestedAction(action, latestInteractiveElements, { confirmed })
    if (!safeAction) return { ok: false, message: 'That action is not safe on this page.' }

    if (safeAction.type === 'go_back') {
      history.back()
      return { ok: true }
    }

    const element = elementRegistry.get(safeAction.target)
    const descriptor = latestInteractiveElements.find((item) => item.id === safeAction.target)
    if (!element || !descriptor || !isVisible(element)) {
      return { ok: false, message: 'That item is no longer visible. Please ask again.' }
    }

    if (safeAction.type === 'scroll_to_element') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlight(element)
      return { ok: true }
    }

    if (safeAction.type === 'focus_element') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.focus({ preventScroll: true })
      highlight(element)
      return { ok: true }
    }

    // Re-evaluate the element immediately before a confirmed click. This
    // catches controls whose role, label, or form membership changed after
    // the page snapshot was sent to the server.
    const currentDescriptor = {
      ...descriptor,
      label: labelFor(element),
      inForm: Boolean(element.closest('form')),
      href: element.tagName.toLowerCase() === 'a' ? element.href : null,
    }
    if (!helpers.isSafeClickDescriptor(currentDescriptor)) {
      return { ok: false, message: 'That item cannot be selected by the guide.' }
    }
    element.click()
    return { ok: true }
  }

  function handleCareCompassMessage(message, sender, sendResponse) {
    if (message?.type === 'CARE_COMPASS_PING') {
      sendResponse({ ok: true })
      return false
    }
    if (message?.type === 'CARE_COMPASS_GET_PAGE_CONTEXT') {
      sendResponse({ ok: true, pageContext: buildPageContext() })
      return false
    }
    if (message?.type === 'CARE_COMPASS_EXECUTE_ACTION') {
      sendResponse(executeAction(message.action, message.confirmed === true))
      return false
    }
    return false
  }

  // Chrome does not automatically rerun content scripts in tabs that were
  // already open when an unpacked extension is reloaded. popup.js injects
  // this file again when its ping fails. Replace the previous handler instead
  // of returning early, because the previous handler belongs to the invalid
  // extension context and can no longer receive messages.
  const previousHandler = globalThis.__CARE_COMPASS_MESSAGE_HANDLER__
  if (previousHandler) {
    try {
      chrome.runtime.onMessage.removeListener(previousHandler)
    } catch {
      // The old extension context may already be invalidated.
    }
  }
  globalThis.__CARE_COMPASS_MESSAGE_HANDLER__ = handleCareCompassMessage
  chrome.runtime.onMessage.addListener(handleCareCompassMessage)
})()
