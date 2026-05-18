import { useState } from 'react'
import { CameraLab } from './phase0/CameraLab'
import { WorkspaceScreen } from './phase1/Phase1Screen'
import { useIsMobile } from './lib/useViewportMode'

type View = 'workspace' | 'lab'

export function App() {
  const [view, setView] = useState<View>('workspace')
  const isMobile = useIsMobile()

  if (view === 'workspace' && isMobile) {
    return <WorkspaceScreen />
  }

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {!isMobile && (
        <div
          style={{
            padding: '12px',
            background: '#1a1a1a',
            borderBottom: '1px solid #333',
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            onClick={() => setView('workspace')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: view === 'workspace' ? '1px solid #666' : '1px solid #333',
              background: view === 'workspace' ? '#2a2a2a' : 'transparent',
              color: view === 'workspace' ? '#eee' : '#888',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Workspace
          </button>
          <button
            onClick={() => setView('lab')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: view === 'lab' ? '1px solid #666' : '1px solid #333',
              background: view === 'lab' ? '#2a2a2a' : 'transparent',
              color: view === 'lab' ? '#eee' : '#888',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Raw Camera Lab
          </button>
        </div>
      )}
      {view === 'workspace' && <WorkspaceScreen />}
      {view === 'lab' && <CameraLab />}
    </div>
  )
}
