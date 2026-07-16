// @vitest-environment jsdom
import { vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel'
import { askAi } from '../api'
import { PageContextProvider, useSetPageContext } from '../pageContext'

vi.mock('../api', () => ({
  askAi: vi.fn(),
}))

// Publishes a fixed page context for tests that need ChatPanel to see one
// (e.g. the exact confirmation wording depends on the current route).
function WithPageContext({ context, children }) {
  useSetPageContext(context)
  return children
}

function renderChatPanel(initialEntry = '/questionnaire') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/questionnaire" element={<ChatPanel />} />
        <Route path="/results" element={<div>Results Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

async function openPanel(user) {
  await user.click(screen.getByRole('button', { name: /ask a question/i }))
}

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  askAi.mockReset()
  window.speechSynthesis = { speak: vi.fn(), cancel: vi.fn() }
  // Minimal stub — jsdom doesn't implement SpeechSynthesisUtterance.
  global.SpeechSynthesisUtterance = function (text) {
    this.text = text
  }
})

describe('ChatPanel — opening and basic layout', () => {
  it('opens the panel and shows the privacy notice, suggested questions, and response-mode selector', async () => {
    const user = userEvent.setup()
    renderChatPanel()
    await openPanel(user)

    expect(screen.getByText(/do not enter passwords/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /simple/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /more detail/i })).not.toBeChecked()

    // No more than 4 suggested questions.
    const chips = screen.getAllByRole('button', { name: /explain this page|what should i do next|summarize my results|help me find the continue button/i })
    expect(chips.length).toBeLessThanOrEqual(4)
  })
})

describe('ChatPanel — sending questions and duplicate-submission prevention', () => {
  it('disables Send and shows Stop while a response is pending, and prevents a second submission', async () => {
    const user = userEvent.setup()
    let resolveAsk
    askAi.mockReturnValue(new Promise((resolve) => { resolveAsk = resolve }))
    renderChatPanel()
    await openPanel(user)

    await user.type(screen.getByLabelText(/type your question/i), 'Explain this page')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    expect(askAi).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
    expect(screen.getByText(/preparing a simple answer/i)).toBeInTheDocument()

    resolveAsk({ message: 'This page explains your options.', action: null })
    await waitFor(() => expect(screen.getByText('This page explains your options.')).toBeInTheDocument())
    expect(askAi).toHaveBeenCalledTimes(1)
  })

  it('stops an in-flight response and shows a stopped message instead of an error', async () => {
    const user = userEvent.setup()
    askAi.mockImplementation((question, opts) => new Promise((resolve, reject) => {
      opts.signal?.addEventListener('abort', () => {
        const err = new Error('Request stopped.')
        err.aborted = true
        reject(err)
      })
    }))
    renderChatPanel()
    await openPanel(user)
    await user.type(screen.getByLabelText(/type your question/i), 'Explain this page')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    await user.click(screen.getByRole('button', { name: /^stop$/i }))

    await waitFor(() => expect(screen.getByText('Stopped.')).toBeInTheDocument())
  })
})

describe('ChatPanel — action handling', () => {
  it('navigates for an approved action with no confirmation required', async () => {
    const user = userEvent.setup()
    askAi.mockResolvedValue({
      message: 'Taking you to your results.',
      action: { type: 'navigate_to_route', target: '/results', requiresConfirmation: false },
    })
    renderChatPanel()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /explain this page/i }))

    await waitFor(() => expect(screen.getByText('Results Page')).toBeInTheDocument())
  })

  it('asks for confirmation before an action that requires it, and only navigates on Continue', async () => {
    const user = userEvent.setup()
    askAi.mockResolvedValue({
      message: 'This will start over.',
      action: { type: 'navigate_to_route', target: '/questionnaire', requiresConfirmation: true },
    })
    render(
      <MemoryRouter initialEntries={['/results']}>
        <PageContextProvider>
          <Routes>
            <Route
              path="/results"
              element={
                <WithPageContext context={{ route: '/results' }}>
                  <ChatPanel />
                </WithPageContext>
              }
            />
            <Route path="/questionnaire" element={<div>Questionnaire Page</div>} />
          </Routes>
        </PageContextProvider>
      </MemoryRouter>
    )
    await openPanel(user)
    await user.type(screen.getByLabelText(/type your question/i), 'Start over')
    await user.click(screen.getByRole('button', { name: /^send$/i }))

    await waitFor(() => expect(screen.getByText(/replace your current results/i)).toBeInTheDocument())
    expect(screen.queryByText('Questionnaire Page')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^continue$/i }))
    await waitFor(() => expect(screen.getByText('Questionnaire Page')).toBeInTheDocument())
  })

  it('does not crash and simply ignores an out-of-allowlist action', async () => {
    const user = userEvent.setup()
    askAi.mockResolvedValue({
      message: 'I cannot perform that action, but I can explain how to do it.',
      action: { type: 'delete_screening', target: '1' },
    })
    renderChatPanel()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /explain this page/i }))

    await waitFor(() =>
      expect(screen.getByText('I cannot perform that action, but I can explain how to do it.')).toBeInTheDocument()
    )
  })
})

describe('ChatPanel — read aloud', () => {
  it('starts and stops reading an assistant message aloud', async () => {
    const user = userEvent.setup()
    askAi.mockResolvedValue({ message: 'Here is a simple answer.', action: null })
    renderChatPanel()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /explain this page/i }))
    await waitFor(() => expect(screen.getByText('Here is a simple answer.')).toBeInTheDocument())

    const readAloudBtn = screen.getByRole('button', { name: /^read aloud$/i })
    await user.click(readAloudBtn)
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: /^stop reading$/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^stop reading$/i }))
    expect(window.speechSynthesis.cancel).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /^read aloud$/i })).toBeInTheDocument()
  })

  it('hides the read-aloud control when speech synthesis is unsupported', async () => {
    delete window.speechSynthesis
    const user = userEvent.setup()
    askAi.mockResolvedValue({ message: 'Here is a simple answer.', action: null })
    renderChatPanel()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /explain this page/i }))
    await waitFor(() => expect(screen.getByText('Here is a simple answer.')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /read aloud/i })).not.toBeInTheDocument()
  })
})

describe('ChatPanel — keyboard and focus', () => {
  it('closes on Escape and returns focus to the "Ask a question" button', async () => {
    const user = userEvent.setup()
    renderChatPanel()
    const askButton = screen.getByRole('button', { name: /ask a question/i })
    await user.click(askButton)
    expect(screen.getByRole('dialog', { name: /carecompass guide/i })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ask a question/i })).toHaveFocus()
  })

  it('closing via the Close button also returns focus to the toggle button', async () => {
    const user = userEvent.setup()
    renderChatPanel()
    await openPanel(user)
    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(screen.getByRole('button', { name: /ask a question/i })).toHaveFocus()
  })
})
