import type { CSSProperties } from 'react'

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.82)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 5,
  },
  card: {
    width: 'min(100%, 420px)',
    background: '#111111',
    border: '1px solid #2b2b2b',
    borderRadius: 20,
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
    padding: 16,
    display: 'grid',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  titleBlock: {
    display: 'grid',
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
    color: '#f2f2f2',
  },
  subtitle: {
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 1.45,
  },
  fieldGroup: {
    display: 'grid',
    gap: 10,
  },
  label: {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: 700,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #2e2e2e',
    background: '#171717',
    color: '#f2f2f2',
    fontSize: 14,
    outline: 'none',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  button: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid #2d2d2d',
    background: '#1c1c1c',
    color: '#eee',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
  },
}

interface Props {
  open: boolean
  itemLabel: string
  sku: string
  weight: string
  dimensions: string
  onChangeSku: (value: string) => void
  onChangeWeight: (value: string) => void
  onChangeDimensions: (value: string) => void
  onClose: () => void
}

export function CaptureMetadataOverlay({
  open,
  itemLabel,
  sku,
  weight,
  dimensions,
  onChangeSku,
  onChangeWeight,
  onChangeDimensions,
  onClose,
}: Props) {
  if (!open) {
    return null
  }

  return (
    <div style={s.overlay} role="dialog" aria-modal="true" aria-label="Item metadata">
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.titleBlock}>
            <div style={s.title}>{itemLabel}</div>
            <div style={s.subtitle}>Keep this open while the camera stays live behind it.</div>
          </div>
          <button style={s.button} onClick={onClose}>
            Back
          </button>
        </div>

        <div style={s.fieldGroup}>
          <div>
            <div style={s.label}>SKU</div>
            <input
              style={s.input}
              value={sku}
              onChange={(e) => onChangeSku(e.target.value)}
              placeholder="SKU"
              inputMode="text"
              autoCapitalize="characters"
            />
          </div>

          <div>
            <div style={s.label}>Weight</div>
            <input
              style={s.input}
              value={weight}
              onChange={(e) => onChangeWeight(e.target.value)}
              placeholder="Weight"
              inputMode="text"
            />
          </div>

          <div>
            <div style={s.label}>Dimensions</div>
            <input
              style={s.input}
              value={dimensions}
              onChange={(e) => onChangeDimensions(e.target.value)}
              placeholder="Dimensions"
              inputMode="text"
            />
          </div>
        </div>

        <div style={s.footer}>
          <button style={s.button} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
