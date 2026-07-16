import { createContext, useContext, useEffect, useState } from 'react'

// Holds a SAFE semantic summary of whatever page is currently mounted, so a
// single global ChatPanel (mounted once in App.jsx) can send it to the AI
// Guide. Each page publishes its own context object — never scraped from the
// DOM — so only approved fields ever end up here. See routers/ai.py's
// PageContext schema for the exact shape and the "safe to send" field list.

const PageContextCtx = createContext({ pageContext: null, setPageContext: () => {} })

export function PageContextProvider({ children }) {
  const [pageContext, setPageContext] = useState(null)
  return (
    <PageContextCtx.Provider value={{ pageContext, setPageContext }}>
      {children}
    </PageContextCtx.Provider>
  )
}

// Read the current page context (used by ChatPanel).
export function usePageContext() {
  return useContext(PageContextCtx).pageContext
}

// Call from a page component to publish its context while mounted. Pass a
// plain object built only from approved fields (route, heading, visible
// control ids/labels, etc.) — never raw HTML, tokens, or free-text answers.
export function useSetPageContext(context) {
  const { setPageContext } = useContext(PageContextCtx)
  useEffect(() => {
    setPageContext(context)
    return () => setPageContext(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context])
}
