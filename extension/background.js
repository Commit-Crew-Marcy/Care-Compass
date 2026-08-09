importScripts('shared.js')

// Dock the guide as a side panel — like Chrome's own AI panels — instead
// of a popup that closes the moment you click anywhere else on the page.
//
// Handled via action.onClicked (rather than the simpler
// setPanelBehavior({ openPanelOnActionClick: true })) so that every icon
// click — even a second click while the panel is already open on a
// different tab — re-grants activeTab for whichever tab is active right
// now and tells the panel to read it. Chrome only grants activeTab to the
// tab that was active *at the moment the icon was clicked*; a docked panel
// that tried to read a tab the user merely switched to, without a fresh
// click, would have no permission to read it and would fail on every
// ordinary website, not just unsupported ones.
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) return
  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    console.error('CareCompass: could not open the side panel', error)
  })
  chrome.runtime.sendMessage({ type: 'CARE_COMPASS_ACTIVE_TAB', tabId: tab.id }).catch(() => {})
})

const LOCAL_API_BASE = 'http://localhost:8000'
const PRODUCTION_API_BASE = 'https://care-compass-4gj5.onrender.com'
const EXTENSION_CHAT_PATH = '/api/ai/extension/chat'
const RETRYABLE_STATUSES = new Set([502, 503, 504])

function getApiMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ careCompassApiMode: 'automatic' }, ({ careCompassApiMode }) => {
      resolve(careCompassApiMode)
    })
  })
}

async function apiBaseForPage(pageUrl) {
  const mode = await getApiMode()
  return CareCompassExtension.selectApiBase(
    mode,
    pageUrl,
    LOCAL_API_BASE,
    PRODUCTION_API_BASE
  )
}

async function parseResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function requestGemini(body, pageUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 75000)

  try {
    const apiBase = await apiBaseForPage(pageUrl)
    const response = await fetch(`${apiBase}${EXTENSION_CHAT_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const data = await parseResponse(response)
    return { response, data }
  } finally {
    clearTimeout(timeout)
  }
}

async function askGemini(message) {
  const question = CareCompassExtension.cleanText(message.question, 2000)
  if (!question || !message.pageContext || !CareCompassExtension.isSupportedPageUrl(message.pageContext.url)) {
    return { ok: false, status: 400, message: 'I could not read this page safely.' }
  }

  const body = {
    question,
    pageContext: message.pageContext,
    responseMode: message.responseMode === 'more_detail' ? 'more_detail' : 'simple',
    history: Array.isArray(message.history) ? message.history.slice(-6) : [],
  }

  try {
    let result = await requestGemini(body, message.pageContext.url)
    if (RETRYABLE_STATUSES.has(result.response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      result = await requestGemini(body, message.pageContext.url)
    }

    if (!result.response.ok) {
      const detail = typeof result.data?.detail === 'string'
        ? result.data.detail
        : 'The CareCompass Guide is unavailable right now. Please try again.'
      return { ok: false, status: result.response.status, message: detail }
    }

    return { ok: true, data: result.data }
  } catch (error) {
    const messageText = error?.name === 'AbortError'
      ? 'The request took too long. Please try again.'
      : 'I could not reach the CareCompass Guide. Please check your connection.'
    return { ok: false, status: 0, message: messageText }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'CARE_COMPASS_ASK_GEMINI') return false

  askGemini(message)
    .then(sendResponse)
    .catch(() => sendResponse({
      ok: false,
      status: 0,
      message: 'I could not reach the CareCompass Guide. Please try again.',
    }))
  return true
})
