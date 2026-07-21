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

let activeTab = null
let pageContext = null
let history = []
let pendingAction = null
let busy = false
let speakingButton = null

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

  try {
    const result = await callChrome((done) => chrome.runtime.sendMessage({
      type: 'CARE_COMPASS_ASK_GEMINI',
      question,
      pageContext,
      responseMode: responseMode(),
      history: recentHistory,
    }, done))

    if (!result?.ok) {
      addMessage('assistant', result?.message || 'The CareCompass Guide is unavailable right now.', { error: true })
      return
    }

    const answer = helpers.cleanText(result.data?.message, responseMode() === 'simple' ? 900 : 1800)
    addMessage('assistant', answer || 'I could not prepare an answer for this page.')
    history.push({ role: 'assistant', text: answer })
    handleAction(result.data?.action)
  } catch {
    addMessage('assistant', 'I could not reach the CareCompass Guide. Please try again.', { error: true })
  } finally {
    setBusy(false)
    questionInput.focus()
  }
}

async function initialize() {
  setBusy(true)
  try {
    const tabs = await callChrome((done) => chrome.tabs.query({ active: true, currentWindow: true }, done))
    activeTab = tabs?.[0]
    if (!activeTab || !helpers.isSupportedPageUrl(activeTab.url)) {
      throw new Error('Open a regular website to use the guide.')
    }

    await ensureContentScript()
    const result = await sendToTab({ type: 'CARE_COMPASS_GET_PAGE_CONTEXT' })
    if (!result?.ok || !result.pageContext) throw new Error('I could not read this page safely.')
    pageContext = result.pageContext
    pageTitleElement.textContent = pageContext.pageTitle || pageContext.domain
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

questionForm.addEventListener('submit', (event) => {
  event.preventDefault()
  sendQuestion(questionInput.value)
})

document.querySelectorAll('.suggestion').forEach((button) => {
  button.addEventListener('click', () => sendQuestion(button.dataset.question))
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
  await executeAction(action, true)
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
  initialize()
})
