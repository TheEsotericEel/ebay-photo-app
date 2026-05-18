import { useState } from 'react'
import { Phase0Screen } from './phase0/Phase0Screen'
import { CameraLab } from './phase0/CameraLab'
import { ItemReview } from './phase0/ItemReview'

type View = 'phase0' | 'lab' | 'review'

export function App() {
  const [view, setView] = useState<View>('phase0')

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
          Phase 0 Camera
        </button>
        <button
          onClick={() => setView('review')}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 6,
            border: view === 'review' ? '1px solid #666' : '1px solid #333',
            background: view === 'review' ? '#2a2a2a' : 'transparent',
            color: view === 'review' ? '#eee' : '#888',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Item Review
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
      {view === 'phase0' && <Phase0Screen />}
      {view === 'lab' && <CameraLab />}
      {view === 'review' && <ItemReview />}
    </div>
  )
}
