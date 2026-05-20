import { useEffect } from 'react'
import { CameraLab } from './phase0/CameraLab'
import { DesktopListerPrototype } from './phase1/DesktopListerPrototype'
import { WorkspaceScreen } from './phase1/Phase1Screen'
import { useIsMobile } from './lib/useViewportMode'

export function App() {
  const isMobile = useIsMobile()
  const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const isLabView = !isMobile && query?.get('lab') === '1'
  const isLegacyWorkspace = !isMobile && query?.get('legacy') === '1'

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

  if (isLabView) {
    return <CameraLab />
  }

  if (isLegacyWorkspace) {
    return <WorkspaceScreen />
  }

  return <DesktopListerPrototype />
}
