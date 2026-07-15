// Shared behavior for every "How It Works" entry point (the nav link and
// the hero's secondary button). One helper so the routing logic that
// decides "scroll in place" vs. "go home, then scroll" lives in one place.
export const HOW_IT_WORKS_ID = 'how-it-works'

export function goToHowItWorks(navigate, pathname) {
  if (pathname === '/') {
    // No explicit `behavior` — index.css's reduced-motion-aware
    // `scroll-behavior: smooth` on <html> governs the animation.
    document.getElementById(HOW_IT_WORKS_ID)?.scrollIntoView()
  } else {
    navigate('/', { state: { scrollTo: HOW_IT_WORKS_ID } })
  }
}
