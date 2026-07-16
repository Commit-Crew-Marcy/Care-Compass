import { useEffect, useState } from 'react'

const EXTENSION_MARKER = 'data-care-compass-extension'
const DISMISS_KEY = 'carecompass_extension_prompt_dismissed'
const INSTALL_HELP_URL =
  'https://github.com/Commit-Crew-Marcy/Care-Compass/tree/feature/ai-extension/extension#run-locally'

function extensionIsInstalled() {
  return typeof document !== 'undefined'
    && document.documentElement.getAttribute(EXTENSION_MARKER) === 'installed'
}

function wasDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

export default function ExtensionPrompt() {
  const [installed, setInstalled] = useState(extensionIsInstalled)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const storeUrl = import.meta.env.VITE_EXTENSION_INSTALL_URL?.trim()
  const installUrl = storeUrl || INSTALL_HELP_URL

  useEffect(() => {
    const detectExtension = () => setInstalled(extensionIsInstalled())
    document.addEventListener('carecompass-extension-ready', detectExtension)
    const observer = new MutationObserver(detectExtension)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [EXTENSION_MARKER],
    })
    return () => {
      document.removeEventListener('carecompass-extension-ready', detectExtension)
      observer.disconnect()
    }
  }, [])

  if (installed || dismissed) return null

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // The prompt can still close if browser storage is unavailable.
    }
    setDismissed(true)
  }

  return (
    <aside
      className="extension-prompt"
      role="dialog"
      aria-modal="false"
      aria-labelledby="extension-prompt-title"
    >
      <button
        type="button"
        className="extension-prompt-close"
        onClick={dismiss}
        aria-label="Close extension suggestion"
      >
        ×
      </button>
      <p className="extension-prompt-kicker">Before you apply</p>
      <h2 id="extension-prompt-title">Take the CareCompass Guide with you</h2>
      <p>
        Our free Chrome extension explains official benefits pages in short,
        simple language and helps you find the next step.
      </p>
      <div className="extension-prompt-actions">
        <a className="btn btn-primary" href={installUrl} target="_blank" rel="noreferrer">
          {storeUrl ? 'Install free extension' : 'See free installation steps'}
        </a>
        <button type="button" className="btn btn-outline" onClick={dismiss}>Not now</button>
      </div>
    </aside>
  )
}
