import { useEffect, useRef, useState } from 'react'
import { askAi } from '../api'

// Floating "Ask a question" helper. Mounted on Results and BenefitDetail
// with the user's matched benefits as context, so the assistant can explain
// THEIR results. The engine decides eligibility; this only explains.

const SUGGESTED = [
  'What is the difference between Medicare Part A and Part B?',
  'I just arrived in the U.S. What can my family get right now?',
  'Is the mail I keep getting about Medicare plans official?',
  'What does this program cost?',
]

export default function ChatPanel({ contextBenefits = [] }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const send = async (text) => {
    const question = (text ?? input).trim()
    if (!question || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: question }])
    setBusy(true)
    try {
      const { answer } = await askAi(question, contextBenefits)
      setMessages((m) => [...m, { role: 'assistant', text: answer }])
    } catch (err) {
      const friendly = String(err.message || '').includes('AI service unavailable')
        ? 'The assistant is not turned on yet. You can still open each program above for a plain-language explanation, or call the agency on its official page.'
        : 'Something went wrong. Please try again in a moment.'
      setMessages((m) => [...m, { role: 'assistant', text: friendly, error: true }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Ask a question">
        Ask a question
      </button>
    )
  }

  return (
    <div className="chat-panel" role="dialog" aria-label="CareCompass assistant">
      <div className="chat-header">
        <strong>CareCompass assistant</strong>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>

      <div className="chat-body">
        {messages.length === 0 && (
          <>
            <p className="chat-intro">
              Ask anything about your results, in any language. I explain; the
              official agency always confirms.
            </p>
            <div className="chat-suggested">
              {SUGGESTED.map((q) => (
                <button key={q} className="chat-chip" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}${m.error ? ' error' : ''}`}>{m.text}</div>
        ))}
        {busy && <div className="chat-msg assistant">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          placeholder="Type your question"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn btn-primary chat-send" onClick={() => send()} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  )
}
