import { useEffect } from 'react'
import { DesktopListerPrototype } from './phase1/DesktopListerPrototype'

export function App() {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousBodyOverflow = body.style.overflow
    const previousRootOverscroll = root.style.overscrollBehavior
    const previousBodyOverscroll = body.style.overscrollBehavior

    root.style.overflow = 'auto'
    body.style.overflow = 'auto'
    root.style.overscrollBehavior = 'auto'
    body.style.overscrollBehavior = 'auto'

    return () => {
      root.style.overflow = previousRootOverflow
      body.style.overflow = previousBodyOverflow
      root.style.overscrollBehavior = previousRootOverscroll
      body.style.overscrollBehavior = previousBodyOverscroll
    }
  }, [])

  return <DesktopListerPrototype />
}
