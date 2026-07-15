// @vitest-environment jsdom
import { validateAction } from '../aiActions'

const PAGE_CONTEXT = {
  route: '/questionnaire',
  visibleControls: [{ id: 'continue-button', type: 'button', label: 'Continue' }],
  visibleLinks: [{ id: 'benefit-link-1', label: 'SNAP', route: '/benefits/1' }],
}

describe('validateAction', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="continue-button">Continue</button>'
  })

  it('rejects null/undefined and malformed payloads without throwing', () => {
    expect(validateAction(null, PAGE_CONTEXT)).toBeNull()
    expect(validateAction(undefined, PAGE_CONTEXT)).toBeNull()
    expect(validateAction({}, PAGE_CONTEXT)).toBeNull()
    expect(validateAction('not-an-object', PAGE_CONTEXT)).toBeNull()
    expect(validateAction({ type: 'delete_screening' }, PAGE_CONTEXT)).toBeNull()
    expect(validateAction({ type: 'submit_form' }, PAGE_CONTEXT)).toBeNull()
  })

  it('accepts approved internal routes for navigate_to_route', () => {
    expect(validateAction({ type: 'navigate_to_route', target: '/results' }, PAGE_CONTEXT)).toEqual({
      type: 'navigate_to_route',
      target: '/results',
    })
    expect(validateAction({ type: 'navigate_to_route', target: '/benefits/42' }, PAGE_CONTEXT)).not.toBeNull()
  })

  it('rejects arbitrary or external URLs', () => {
    expect(validateAction({ type: 'navigate_to_route', target: 'https://evil.example.com' }, PAGE_CONTEXT)).toBeNull()
    expect(validateAction({ type: 'navigate_to_route', target: '/admin' }, PAGE_CONTEXT)).toBeNull()
    expect(validateAction({ type: 'navigate_to_route' }, PAGE_CONTEXT)).toBeNull()
  })

  it('accepts scroll_to_element only for ids present in the page context AND the DOM', () => {
    expect(validateAction({ type: 'scroll_to_element', target: 'continue-button' }, PAGE_CONTEXT)).not.toBeNull()
    expect(validateAction({ type: 'scroll_to_element', target: 'delete-account-button' }, PAGE_CONTEXT)).toBeNull()
  })

  it('rejects scroll_to_element when the id is in context but no longer in the DOM', () => {
    document.body.innerHTML = '' // element removed since the context was built
    expect(validateAction({ type: 'scroll_to_element', target: 'continue-button' }, PAGE_CONTEXT)).toBeNull()
  })

  it('accepts focus_element for a link id present in context', () => {
    document.body.innerHTML = '<a id="benefit-link-1" href="/benefits/1">SNAP</a>'
    expect(validateAction({ type: 'focus_element', target: 'benefit-link-1' }, PAGE_CONTEXT)).not.toBeNull()
  })

  it('accepts go_back, open_chat, and close_chat with no target', () => {
    for (const type of ['go_back', 'open_chat', 'close_chat']) {
      expect(validateAction({ type }, PAGE_CONTEXT)).toEqual({ type })
    }
  })

  it('handles a missing page context safely', () => {
    expect(validateAction({ type: 'scroll_to_element', target: 'continue-button' }, null)).toBeNull()
    expect(validateAction({ type: 'navigate_to_route', target: '/results' }, null)).not.toBeNull()
  })
})
