import { isApprovedRoute } from './navigation'

// Mirrors backend/routers/ai.py's ALLOWED_ACTION_TYPES / validate_action.
// The backend already re-validates before ever sending an action down to the
// frontend, but the frontend validates again — belt-and-suspenders — before
// touching the DOM or the router, since a response could be replayed, mocked,
// or (in tests) constructed directly.
export const ALLOWED_ACTION_TYPES = new Set([
  'navigate_to_route',
  'scroll_to_element',
  'focus_element',
  'go_back',
  'open_chat',
  'close_chat',
])

// Returns the action unchanged if it's safe to run against the given page
// context, otherwise null. Never throws.
export function validateAction(action, pageContext) {
  if (!action || typeof action !== 'object') return null
  if (!ALLOWED_ACTION_TYPES.has(action.type)) return null

  if (action.type === 'navigate_to_route') {
    if (!action.target || !isApprovedRoute(action.target)) return null
    return action
  }

  if (action.type === 'scroll_to_element' || action.type === 'focus_element') {
    const ids = new Set([
      ...(pageContext?.visibleControls ?? []).map((c) => c.id),
      ...(pageContext?.visibleLinks ?? []).map((l) => l.id),
    ])
    if (!action.target || !ids.has(action.target)) return null
    // The id must also actually be on the page right now — the page context
    // can be a little stale (e.g. a control that just unmounted).
    if (typeof document !== 'undefined' && !document.getElementById(action.target)) return null
    return action
  }

  // go_back, open_chat, close_chat take no target
  return action
}
