importScripts('shared.js')

const LOCAL_API_BASE = 'http://localhost:8000'
const PRODUCTION_API_BASE = 'https://care-compass-4gi5.onrender.com'
const EXTENSION_CHAT_PATH = '/api/ai/extension/chat'
const RETRYABLE_STATUSES = new Set([502, 503, 504])

function apiBaseForPage(pageUrl) {
  try {
    const url = new URL(pageUrl)
    const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (localHost && ['5173', '5174', '5175'].includes(url.port)) return LOCAL_API_BASE
  } catch {
    // An invalid page URL is rejected by the content script. Use production
    // here so this helper never expands where the service worker can connect.
  }
  return PRODUCTION_API_BASE
}

async function parseResponse(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function requestClaude(body, pageUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 75000)

  try {
    const response = await fetch(`${apiBaseForPage(pageUrl)}${EXTENSION_CHAT_PATH}`, {
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

async function askClaude(message) {
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
    let result = await requestClaude(body, message.pageContext.url)
    if (RETRYABLE_STATUSES.has(result.response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      result = await requestClaude(body, message.pageContext.url)
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
  if (message?.type !== 'CARE_COMPASS_ASK_CLAUDE') return false

  askClaude(message)
    .then(sendResponse)
    .catch(() => sendResponse({
      ok: false,
      status: 0,
      message: 'I could not reach the CareCompass Guide. Please try again.',
    }))
  return true
})
