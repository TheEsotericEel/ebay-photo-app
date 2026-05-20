import { useEffect, useState } from 'react'

// Temporary: native iOS is the capture client; web is desktop management only.
const DESKTOP_ONLY_MODE = true

function readMatchMedia(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(query).matches
}

export function useIsMobile(breakpointPx = 900): boolean {
  if (DESKTOP_ONLY_MODE) {
    return false
  }

  const query = `(max-width: ${breakpointPx}px)`
  const [matches, setMatches] = useState(() => readMatchMedia(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQueryList = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    setMatches(mediaQueryList.matches)

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return () => mediaQueryList.removeEventListener('change', handleChange)
    }

    mediaQueryList.addListener(handleChange)
    return () => mediaQueryList.removeListener(handleChange)
  }, [query])

  return matches
}
