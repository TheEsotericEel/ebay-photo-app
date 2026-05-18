import { useState } from 'react'
import { Phase1Screen } from './phase1/Phase1Screen'
import { Phase0Screen } from './phase0/Phase0Screen'
import { CameraLab } from './phase0/CameraLab'

type View = 'phase1' | 'phase0' | 'lab'

export function App() {
  const [view, setView] = useState<View>('phase1')

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
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
          onClick={() => setView('phase1')}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: view === 'phase1' ? '1px solid #666' : '1px solid #333',
            background: view === 'phase1' ? '#2a2a2a' : 'transparent',
            color: view === 'phase1' ? '#eee' : '#888',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Phase 1
        </button>
        <button
          onClick={() => setView('phase0')}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: view === 'phase0' ? '1px solid #666' : '1px solid #333',
            background: view === 'phase0' ? '#2a2a2a' : 'transparent',
            color: view === 'phase0' ? '#eee' : '#888',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Phase 0 Spike
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
      {view === 'phase1' && <Phase1Screen />}
      {view === 'phase0' && <Phase0Screen />}
      {view === 'lab' && <CameraLab />}
    </div>
  )
}
