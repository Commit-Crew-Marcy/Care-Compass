import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { askAi } from '../api'
import { usePageContext } from '../pageContext'
import { validateAction } from '../aiActions'

// Senior-friendly, in-page AI Guide. Mounted once, globally, in App.jsx.
// Reads whatever page context the current page has published (see
// pageContext.jsx) and sends it to the backend along with the question.
// The backend decides eligibility explanations and may suggest at most one
// safe UI action; this component re-validates that action before ever
// touching the DOM or the router.

const SUGGESTED = [
  'Explain this page',
  'What should I do next?',
  'Summarize my results',
  'Help me find the Continue button',
]

const PRIVACY_NOTICE = 'Do not enter passwords, SSNs, or ID numbers.'

let nextMessageId = 1

// Remembers where the user dragged the floating "Ask a question" button so
// it stays put across reloads. Silently no-ops in private browsing / quota
// errors — losing the remembered spot just means it falls back to default.
const FAB_POSITION_KEY = 'cc_chat_fab_position'
const DRAG_THRESHOLD_PX = 6

function loadFabPosition() {
  try {
    const raw = localStorage.getItem(FAB_POSITION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveFabPosition(position) {
  try {
    localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position))
  } catch {
    // ignore
  }
}

// Best-effort language guess for read-aloud, based on the script used in the
// response text. Falls back to the browser's language. No dependency added.
function guessSpeechLang(text) {
  if (/[一-鿿]/.test(text)) return 'zh-CN'
  if (/[぀-ヿ]/.test(text)) return 'ja-JP'
  if (/[가-힯]/.test(text)) return 'ko-KR'
  if (/[؀-ۿ]/.test(text)) return 'ar-SA'
  if (/[Ѐ-ӿ]/.test(text)) return 'ru-RU'
  if (/[ঀ-৿]/.test(text)) return 'bn-BD'
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es-ES'
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US'
}

function confirmationMessageFor(action, pageContext) {
  if (action.type !== 'navigate_to_route') return 'Continue?'
  if (pageContext?.route === '/questionnaire') {
    return 'This will leave your questionnaire. Your answers may not be saved. Continue?'
  }
  if (pageContext?.route === '/results') {
    return 'This will replace your current results. Continue?'
  }
  return 'Continue?'
}

export default function ChatPanel() {
  const navigate = useNavigate()
  const pageContext = usePageContext()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [responseMode, setResponseMode] = useState('simple')
  const [pendingAction, setPendingAction] = useState(null)
  const [speakingId, setSpeakingId] = useState(null)
  const [fabPosition, setFabPosition] = useState(loadFabPosition)

  const bottomRef = useRef(null)
  const askButtonRef = useRef(null)
  const panelRef = useRef(null)
  const abortRef = useRef(null)
  const wasOpenRef = useRef(false)
  const dragRef = useRef(null)
  const draggedRef = useRef(false)

  const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Return focus to the toggle button after the panel closes (but not on
  // first mount, and not while it's still open).
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      askButtonRef.current?.focus()
    }
    wasOpenRef.current = open
  }, [open])

  // Stop any active response and any speech when the panel closes.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      if (speechSupported) window.speechSynthesis.cancel()
      setSpeakingId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Stop speech entirely on unmount (e.g. navigating away closes nothing,
  // but if the whole app tears down we shouldn't leave audio playing).
  useEffect(() => () => {
    if (speechSupported) window.speechSynthesis.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape closes the panel no matter which control inside it has focus.
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Keep a dragged button on-screen if the window shrinks (e.g. rotating a
  // phone) after it was moved near an edge.
  useEffect(() => {
    const handleResize = () => {
      setFabPosition((pos) => {
        if (!pos || !askButtonRef.current) return pos
        const rect = askButtonRef.current.getBoundingClientRect()
        const maxLeft = Math.max(window.innerWidth - rect.width, 0)
        const maxTop = Math.max(window.innerHeight - rect.height, 0)
        const clamped = {
          left: Math.min(Math.max(pos.left, 0), maxLeft),
          top: Math.min(Math.max(pos.top, 0), maxTop),
        }
        if (clamped.left === pos.left && clamped.top === pos.top) return pos
        saveFabPosition(clamped)
        return clamped
      })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const recentHistory = useMemo(
    () => messages.slice(-6).map((m) => ({ role: m.role, text: m.text })),
    [messages]
  )

  const executeAction = (action) => {
    switch (action.type) {
      case 'navigate_to_route':
        navigate(action.target)
        break
      case 'scroll_to_element':
        document.getElementById(action.target)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        break
      case 'focus_element':
        document.getElementById(action.target)?.focus()
        break
      case 'go_back':
        navigate(-1)
        break
      case 'open_chat':
        setOpen(true)
        break
      case 'close_chat':
        setOpen(false)
        break
      default:
        break
    }
  }

  const handleActionFromResponse = (action) => {
    const safeAction = validateAction(action, pageContext)
    if (!safeAction) return
    if (safeAction.requiresConfirmation) {
      setPendingAction(safeAction)
      return
    }
    executeAction(safeAction)
  }

  const confirmPendingAction = () => {
    if (pendingAction) executeAction(pendingAction)
    setPendingAction(null)
  }
  const cancelPendingAction = () => setPendingAction(null)

  const send = async (text) => {
    const question = (text ?? input).trim()
    if (!question || busy) return
    setPendingAction(null)
    setInput('')
    setMessages((m) => [...m, { id: nextMessageId++, role: 'user', text: question }])
    setBusy(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { message, action } = await askAi(question, {
        pageContext,
        responseMode,
        history: recentHistory,
        signal: controller.signal,
      })
      setMessages((m) => [...m, { id: nextMessageId++, role: 'assistant', text: message }])
      if (action) handleActionFromResponse(action)
    } catch (err) {
      if (err.aborted) {
        setMessages((m) => [...m, { id: nextMessageId++, role: 'assistant', text: 'Stopped.', muted: true }])
      } else if (err.status === 503) {
        setMessages((m) => [...m, { id: nextMessageId++, role: 'assistant', text: err.detail, error: true }])
      } else {
        setMessages((m) => [
          ...m,
          { id: nextMessageId++, role: 'assistant', text: 'I could not reach the CareCompass Guide. Please try again in a moment.', error: true },
        ])
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const stopResponse = () => {
    abortRef.current?.abort()
  }

  // Lets the closed "Ask a question" button be dragged anywhere on screen.
  // Pointer events cover mouse + touch in one path; a small movement
  // threshold distinguishes a drag from a tap/click so the button still
  // opens the chat on a plain click.
  const handleFabPointerDown = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      width: rect.width,
      height: rect.height,
    }
    draggedRef.current = false
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handleFabPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    draggedRef.current = true
    const maxLeft = Math.max(window.innerWidth - drag.width, 0)
    const maxTop = Math.max(window.innerHeight - drag.height, 0)
    setFabPosition({
      left: Math.min(Math.max(drag.originLeft + dx, 0), maxLeft),
      top: Math.min(Math.max(drag.originTop + dy, 0), maxTop),
    })
  }

  const handleFabPointerUp = (e) => {
    if (dragRef.current) e.currentTarget.releasePointerCapture?.(dragRef.current.pointerId)
    dragRef.current = null
    if (draggedRef.current) {
      setFabPosition((pos) => {
        if (pos) saveFabPosition(pos)
        return pos
      })
    }
  }

  const handleFabClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false
      return
    }
    setOpen(true)
  }

  const toggleReadAloud = (m) => {
    if (!speechSupported) return
    if (speakingId === m.id) {
      window.speechSynthesis.cancel()
      setSpeakingId(null)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(m.text)
    utterance.lang = guessSpeechLang(m.text)
    utterance.onend = () => setSpeakingId((id) => (id === m.id ? null : id))
    utterance.onerror = () => setSpeakingId((id) => (id === m.id ? null : id))
    setSpeakingId(m.id)
    window.speechSynthesis.speak(utterance)
  }

  const closeChat = () => setOpen(false)

  if (!open) {
    return (
      <button
        ref={askButtonRef}
        className="chat-fab"
        style={fabPosition ? { left: fabPosition.left, top: fabPosition.top, right: 'auto', bottom: 'auto' } : undefined}
        onPointerDown={handleFabPointerDown}
        onPointerMove={handleFabPointerMove}
        onPointerUp={handleFabPointerUp}
        onClick={handleFabClick}
        aria-label="Ask a question. Press and drag to move this button."
      >
        <span aria-hidden="true">💬</span>
      </button>
    )
  }

  return (
    <div className="chat-panel" role="dialog" aria-label="CareCompass Guide" ref={panelRef}>
      <div className="chat-header">
        <strong>CareCompass Guide</strong>
        <button className="chat-close" onClick={closeChat}>
          <span aria-hidden="true">✕</span> Close
        </button>
      </div>

      <div className="chat-mode-row">
        <span className="chat-mode-label" id="response-mode-legend">Response length</span>
        <div className="chat-mode-options" role="radiogroup" aria-labelledby="response-mode-legend">
          <label className={`chat-mode-option${responseMode === 'simple' ? ' selected' : ''}`}>
            <input
              type="radio"
              name="response-mode"
              value="simple"
              checked={responseMode === 'simple'}
              onChange={() => setResponseMode('simple')}
            />
            Simple
          </label>
          <label className={`chat-mode-option${responseMode === 'more_detail' ? ' selected' : ''}`}>
            <input
              type="radio"
              name="response-mode"
              value="more_detail"
              checked={responseMode === 'more_detail'}
              onChange={() => setResponseMode('more_detail')}
            />
            More detail
          </label>
        </div>
      </div>

      <div className="chat-body" aria-live="polite" aria-atomic="false">
        {messages.length === 0 && (
          <>
            <p className="chat-intro">
              Ask me about this page or your results, in any language. I explain; the
              official agency always confirms.
            </p>
            <div className="chat-suggested">
              {SUGGESTED.slice(0, 4).map((q) => (
                <button key={q} className="chat-chip" onClick={() => send(q)} disabled={busy}>
                  {q}
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}${m.error ? ' error' : ''}${m.muted ? ' muted' : ''}`}>
            <p>{m.text}</p>
            {m.role === 'assistant' && !m.error && !m.muted && speechSupported && (
              <button
                type="button"
                className="chat-read-aloud"
                onClick={() => toggleReadAloud(m)}
              >
                {speakingId === m.id ? 'Stop reading' : 'Read aloud'}
              </button>
            )}
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant chat-loading" role="status">
            CareCompass is preparing a simple answer.
          </div>
        )}
        {pendingAction && (
          <div className="chat-confirm" role="alertdialog" aria-label="Confirm action">
            <p>{confirmationMessageFor(pendingAction, pageContext)}</p>
            <div className="chat-confirm-actions">
              <button className="btn btn-outline" onClick={cancelPendingAction}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmPendingAction}>Continue</button>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <p className="chat-privacy-notice">{PRIVACY_NOTICE}</p>

      <div className="chat-input-row">
        <label htmlFor="chat-question-input" className="sr-only">Type your question</label>
        <input
          id="chat-question-input"
          value={input}
          placeholder="Type your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={busy}
        />
        {busy ? (
          <button type="button" className="btn btn-outline chat-stop" onClick={stopResponse}>
            Stop
          </button>
        ) : (
          <button className="btn btn-primary chat-send" onClick={() => send()} disabled={busy || !input.trim()}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}
