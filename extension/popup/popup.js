'use strict'

const helpers = globalThis.CareCompassExtension
const statusElement = document.querySelector('#status')
const statusDot = document.querySelector('#status-dot')
const pageTitleElement = document.querySelector('#page-title')
const messagesElement = document.querySelector('#messages')
const welcomeElement = document.querySelector('#welcome')
const questionForm = document.querySelector('#question-form')
const questionInput = document.querySelector('#question')
const sendButton = document.querySelector('#send-button')
const confirmationElement = document.querySelector('#confirmation')
const confirmationText = document.querySelector('#confirmation-text')
const confirmActionButton = document.querySelector('#confirm-action')
const cancelActionButton = document.querySelector('#cancel-action')

const welcomeHTML = welcomeElement ? welcomeElement.outerHTML : ''

let activeTab = null
let pageContext = null
let history = []
let pendingAction = null
let busy = false
let speakingButton = null
let responseStatusTimer = null

function callChrome(fn) {
  return new Promise((resolve, reject) => {
    fn((result) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(result)
    })
  })
}

function sendToTab(message) {
  return callChrome((done) => chrome.tabs.sendMessage(activeTab.id, message, done))
}

function setStatus(text, state = '') {
  statusElement.textContent = text
  statusDot.className = `status-dot${state ? ` ${state}` : ''}`
}

function setBusy(nextBusy) {
  busy = nextBusy
  sendButton.disabled = nextBusy || !pageContext
  sendButton.textContent = nextBusy ? 'Working…' : 'Send'
  questionInput.disabled = nextBusy || !pageContext
  document.querySelectorAll('.suggestion').forEach((button) => {
    button.disabled = nextBusy || !pageContext
  })
}

function scrollMessagesToBottom() {
  messagesElement.scrollTop = messagesElement.scrollHeight
}

function guessSpeechLanguage(text) {
  if (/[一-鿿]/.test(text)) return 'zh-CN'
  if (/[぀-ヿ]/.test(text)) return 'ja-JP'
  if (/[가-힯]/.test(text)) return 'ko-KR'
  if (/[؀-ۿ]/.test(text)) return 'ar-SA'
  if (/[Ѐ-ӿ]/.test(text)) return 'ru-RU'
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es-ES'
  return navigator.language || 'en-US'
}

function addMessage(role, text, { error = false, muted = false } = {}) {
  welcomeElement?.remove()
  const wrapper = document.createElement('div')
  wrapper.className = `message message-${role}${error ? ' message-error' : ''}${muted ? ' message-muted' : ''}`

  const paragraph = document.createElement('div')
  paragraph.textContent = text
  wrapper.append(paragraph)

  if (role === 'assistant' && !error && !muted && 'speechSynthesis' in window) {
    const readButton = document.createElement('button')
    readButton.type = 'button'
    readButton.className = 'read-button'
    readButton.textContent = 'Read aloud'
    readButton.addEventListener('click', () => {
      if (speakingButton === readButton) {
        speechSynthesis.cancel()
        readButton.textContent = 'Read aloud'
        speakingButton = null
        return
      }
      speechSynthesis.cancel()
      if (speakingButton) speakingButton.textContent = 'Read aloud'
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = guessSpeechLanguage(text)
      utterance.onend = utterance.onerror = () => {
        readButton.textContent = 'Read aloud'
        if (speakingButton === readButton) speakingButton = null
      }
      speakingButton = readButton
      readButton.textContent = 'Stop reading'
      speechSynthesis.speak(utterance)
    })
    wrapper.append(readButton)
  }

  messagesElement.append(wrapper)
  scrollMessagesToBottom()
}

function responseMode() {
  return document.querySelector('input[name="response-mode"]:checked')?.value || 'simple'
}

async function ensureContentScript() {
  try {
    await sendToTab({ type: 'CARE_COMPASS_PING' })
  } catch {
    await callChrome((done) => chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      files: ['shared.js', 'content.js'],
    }, done))
    await sendToTab({ type: 'CARE_COMPASS_PING' })
  }
}

async function refreshPageContext() {
  try {
    await ensureContentScript()
    const result = await sendToTab({ type: 'CARE_COMPASS_GET_PAGE_CONTEXT' })
    if (!result?.ok || !result.pageContext) throw new Error('Missing page context')
    pageContext = result.pageContext
    pageTitleElement.textContent = pageContext.pageTitle || pageContext.domain
    return pageContext
  } catch {
    const error = new Error('I could not read the latest version of this page. Please select the extension again.')
    error.name = 'PageContextError'
    throw error
  }
}

function labelForAction(action) {
  return pageContext?.interactiveElements?.find((element) => element.id === action.target)?.label || 'this item'
}

async function executeAction(action, confirmed = false) {
  const result = await sendToTab({
    type: 'CARE_COMPASS_EXECUTE_ACTION',
    action,
    confirmed,
  })
  if (!result?.ok) {
    addMessage('assistant', result?.message || 'I could not complete that action.', { error: true })
    return false
  }
  return true
}

function handleAction(action) {
  if (!action) return
  if (action.requiresConfirmation) {
    pendingAction = action
    confirmationText.textContent = `Select “${labelForAction(action)}” on this page? The guide will not submit a form.`
    confirmationElement.hidden = false
    confirmActionButton.focus()
    return
  }
  executeAction(action).catch(() => {
    addMessage('assistant', 'I could not complete that action.', { error: true })
  })
}

async function sendQuestion(rawQuestion) {
  const question = helpers.cleanText(rawQuestion, 2000)
  if (!question || busy || !pageContext) return

  confirmationElement.hidden = true
  pendingAction = null
  questionInput.value = ''
  addMessage('user', question)
  const recentHistory = history.slice(-6)
  history.push({ role: 'user', text: question })
  setBusy(true)
  setStatus('Reading the latest page…')

  try {
    // Benefits sites often update in place without a full page load. Always
    // take a fresh snapshot so the answer reflects the form step, results, or
    // dialog the user is looking at right now.
    const currentPageContext = await refreshPageContext()
    setStatus('Preparing your answer…')
    responseStatusTimer = setTimeout(() => {
      setStatus('Still working. This may take a few more seconds.')
    }, 5_000)
    const result = await callChrome((done) => chrome.runtime.sendMessage({
      type: 'CARE_COMPASS_ASK_GEMINI',
      question,
      pageContext: currentPageContext,
      responseMode: responseMode(),
      history: recentHistory,
    }, done))

    if (!result?.ok) {
      setStatus('The guide could not answer right now.', 'error')
      addMessage('assistant', result?.message || 'The CareCompass Guide is unavailable right now.', { error: true })
      return
    }

    const answer = helpers.cleanText(result.data?.message, responseMode() === 'simple' ? 900 : 1800)
    addMessage('assistant', answer || 'I could not prepare an answer for this page.')
    history.push({ role: 'assistant', text: answer })
    handleAction(result.data?.action)
    setStatus('Ready to help with this page', 'ready')
  } catch (error) {
    const message = error?.name === 'PageContextError'
      ? error.message
      : 'I could not reach the CareCompass Guide. Please try again.'
    setStatus(message, 'error')
    addMessage('assistant', message, { error: true })
  } finally {
    clearTimeout(responseStatusTimer)
    responseStatusTimer = null
    setBusy(false)
    questionInput.focus()
  }
}

function wireSuggestionButtons() {
  messagesElement.querySelectorAll('.suggestion').forEach((button) => {
    button.addEventListener('click', () => sendQuestion(button.dataset.question))
  })
}

// Clears the conversation back to a fresh "welcome" state — used when the
// panel switches to a different tab, so an old page's chat history doesn't
// linger next to a new page's context.
function resetConversation() {
  history = []
  pendingAction = null
  confirmationElement.hidden = true
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  speakingButton = null
  messagesElement.innerHTML = welcomeHTML
  wireSuggestionButtons()
}

async function loadTab(tab) {
  setBusy(true)
  try {
    activeTab = tab
    if (!activeTab || !helpers.isSupportedPageUrl(activeTab.url)) {
      throw new Error('Open a regular website to use the guide.')
    }

    await refreshPageContext()
    setStatus('Ready to help with this page', 'ready')
  } catch (error) {
    pageContext = null
    pageTitleElement.textContent = ''
    setStatus(error.message || 'This page cannot be read.', 'error')
    addMessage('assistant', 'Open a normal website, then select the CareCompass extension again.', { error: true })
  } finally {
    setBusy(false)
  }
}

async function initialize() {
  const tabs = await callChrome((done) => chrome.tabs.query({ active: true, currentWindow: true }, done))
  await loadTab(tabs?.[0])
}

questionForm.addEventListener('submit', (event) => {
  event.preventDefault()
  sendQuestion(questionInput.value)
})

questionInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  questionForm.requestSubmit()
})

wireSuggestionButtons()

// Unlike the old popup — which closed and reopened fresh every time —
// the side panel stays docked while the user switches tabs. background.js
// sends this on every icon click, including a second click while the
// panel is already open on a different tab, which is also the gesture
// Chrome requires before it will grant activeTab for that tab. (Plain tab
// switches, with no click, deliberately do *not* trigger a re-read here —
// same "only reads a page the user explicitly asked about" behavior the
// popup always had.)
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'CARE_COMPASS_ACTIVE_TAB') return
  if (message.tabId === activeTab?.id) return
  callChrome((done) => chrome.tabs.get(message.tabId, done))
    .then((tab) => {
      resetConversation()
      return loadTab(tab)
    })
    .catch(() => {})
})

document.querySelectorAll('input[name="response-mode"]').forEach((input) => {
  input.addEventListener('change', () => {
    document.querySelectorAll('.mode-option').forEach((label) => {
      label.classList.toggle('selected', label.contains(input) && input.checked)
    })
    chrome.storage.local.set({ careCompassResponseMode: responseMode() })
  })
})

confirmActionButton.addEventListener('click', async () => {
  if (!pendingAction) return
  const action = pendingAction
  pendingAction = null
  confirmationElement.hidden = true
  try {
    await executeAction(action, true)
  } catch {
    addMessage('assistant', 'I could not complete that action.', { error: true })
  }
})

cancelActionButton.addEventListener('click', () => {
  pendingAction = null
  confirmationElement.hidden = true
  questionInput.focus()
})

chrome.storage.local.get({ careCompassResponseMode: 'simple' }, ({ careCompassResponseMode }) => {
  const input = document.querySelector(`input[name="response-mode"][value="${careCompassResponseMode}"]`)
  if (input) {
    input.checked = true
    input.dispatchEvent(new Event('change'))
  }
  initialize().catch(() => {
    pageContext = null
    setBusy(false)
    setStatus('The extension was reloaded. Please select it again.', 'error')
  })
})
