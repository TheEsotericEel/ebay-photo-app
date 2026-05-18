import { CameraLab } from './phase0/CameraLab'
import { WorkspaceScreen } from './phase1/Phase1Screen'
import { useIsMobile } from './lib/useViewportMode'

export function App() {
  const isMobile = useIsMobile()
  const isLabView = !isMobile && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lab') === '1'

  if (isLabView) {
    return <CameraLab />
  }

  return <WorkspaceScreen />
}
