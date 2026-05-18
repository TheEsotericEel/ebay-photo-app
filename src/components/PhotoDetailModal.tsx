import { useEffect, useState } from 'react'
import { StoredPhoto } from '../adapters/localPhotoStore'

interface Props {
  photo: StoredPhoto | null
  onClose: () => void
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  },
  modal: {
    background: '#1a1a1a',
    borderRadius: 12,
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid #333',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#ddd',
    fontSize: 14,
    fontWeight: 600,
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 24,
    cursor: 'pointer',
    padding: '4px 8px',
    lineHeight: 1,
  },
  imageContainer: {
    padding: 16,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'auto',
    background: '#111',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '70vh',
    objectFit: 'contain',
    borderRadius: 4,
  },
  details: {
    padding: '12px 16px',
    borderTop: '1px solid #333',
    fontSize: 12,
    color: '#aaa',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    color: '#666',
  },
  detailValue: {
    color: '#ddd',
  },
  actions: {
    padding: '12px 16px',
    borderTop: '1px solid #333',
    display: 'flex',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    padding: '10px 0',
    borderRadius: 6,
    border: '1px solid #444',
    background: '#2a2a2a',
    color: '#ddd',
    fontSize: 14,
    cursor: 'pointer',
  },
  actionButtonPrimary: {
    background: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
  },
}

export function PhotoDetailModal({ photo, onClose }: Props) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [listingUrl, setListingUrl] = useState<string | null>(null)
  const [canShareFiles, setCanShareFiles] = useState(false)
  const [viewMode, setViewMode] = useState<'original' | 'listing'>('listing')

  useEffect(() => {
    if (!photo) {
      setOriginalUrl(null)
      setListingUrl(null)
      return
    }

    // Create URLs for both original and listing-ready variants
    const listingObjUrl = URL.createObjectURL(photo.blob)
    setListingUrl(listingObjUrl)
    
    let originalObjUrl: string | null = null
    if (photo.originalBlob) {
      originalObjUrl = URL.createObjectURL(photo.originalBlob)
      setOriginalUrl(originalObjUrl)
    }
    
    // Default to showing original if available, otherwise listing
    setViewMode(originalObjUrl ? 'original' : 'listing')

    // Check if Web Share API with files is supported
    const file = new File([photo.blob], `ebay-photo-${photo.id}.jpg`, { type: photo.mimeType })
    const hasShare = !!navigator.share
    const hasCanShare = 'canShare' in navigator
    if (hasShare && hasCanShare) {
      try {
        setCanShareFiles((navigator as any).canShare({ files: [file] }))
      } catch {
        setCanShareFiles(false)
      }
    } else {
      setCanShareFiles(false)
    }

    return () => {
      URL.revokeObjectURL(listingObjUrl)
      if (originalObjUrl) URL.revokeObjectURL(originalObjUrl)
    }
  }, [photo])

  if (!photo) return null

  const handleDownload = (variant: 'original' | 'listing') => {
    const url = variant === 'original' ? originalUrl : listingUrl
    if (!url) return
    const suffix = variant === 'original' ? '-original' : '-listing'
    const a = document.createElement('a')
    a.href = url
    a.download = `ebay-photo-${photo.id}${suffix}.jpg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleOpenOriginal = () => {
    if (!originalUrl) return
    window.open(originalUrl, '_blank')
  }

  const handleShare = async (variant: 'original' | 'listing') => {
    const blob = variant === 'original' ? photo.originalBlob : photo.blob
    const mimeType = variant === 'original' ? (photo.originalMimeType || photo.mimeType) : photo.mimeType
    if (!blob) return

    // Try Web Share API with files first
    if (canShareFiles) {
      const suffix = variant === 'original' ? '-original' : '-listing'
      const file = new File([blob], `ebay-photo-${photo.id}${suffix}.jpg`, { type: mimeType })
      try {
        await navigator.share({ files: [file] })
        return
      } catch (err) {
        console.warn('Web Share API failed, falling back to download:', err)
        // Fall through to download
      }
    }

    // Fallback to download
    handleDownload(variant)
  }

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString()
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'N/A'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  }

  const hasOriginal = !!photo.originalBlob
  const currentUrl = viewMode === 'original' ? originalUrl : listingUrl

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Photo Details</span>
          <button style={s.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={s.imageContainer}>
          {currentUrl && <img src={currentUrl} alt="Captured photo" style={s.image} />}
        </div>

        {hasOriginal && (
          <div style={{ padding: '8px 16px', display: 'flex', gap: 8, justifyContent: 'center', borderTop: '1px solid #333' }}>
            <button
              onClick={() => {
                setViewMode('original')
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: viewMode === 'original' ? '1px solid #3b82f6' : '1px solid #333',
                background: viewMode === 'original' ? '#3b82f6' : '#2a2a2a',
                color: viewMode === 'original' ? '#fff' : '#888',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Original ({photo.originalWidth}x{photo.originalHeight})
            </button>
            <button
              onClick={() => {
                setViewMode('listing')
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                border: viewMode === 'listing' ? '1px solid #3b82f6' : '1px solid #333',
                background: viewMode === 'listing' ? '#3b82f6' : '#2a2a2a',
                color: viewMode === 'listing' ? '#fff' : '#888',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Listing-ready ({photo.outputWidth}x{photo.outputHeight})
            </button>
          </div>
        )}

        <div style={s.details}>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Capture method:</span>
            <span style={s.detailValue}>{photo.captureMethod || 'N/A'}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Captured:</span>
            <span style={s.detailValue}>{formatDate(photo.capturedAt)}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>ID:</span>
            <span style={s.detailValue}>{photo.id}</span>
          </div>
          
          {hasOriginal && (
            <>
              <div style={{ ...s.detailRow, marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
                <span style={{ ...s.detailLabel, color: '#3b82f6' }}>Original capture:</span>
                <span style={s.detailValue}>{photo.originalWidth}x{photo.originalHeight}</span>
              </div>
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Original size:</span>
                <span style={s.detailValue}>{formatBytes(photo.originalSize)}</span>
              </div>
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Original type:</span>
                <span style={s.detailValue}>{photo.originalMimeType || 'N/A'}</span>
              </div>
            </>
          )}
          
          <div style={{ ...s.detailRow, marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
            <span style={{ ...s.detailLabel, color: '#22c55e' }}>Listing-ready:</span>
            <span style={s.detailValue}>{photo.outputWidth}x{photo.outputHeight}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Listing size:</span>
            <span style={s.detailValue}>{formatBytes(photo.size)}</span>
          </div>
          <div style={s.detailRow}>
            <span style={s.detailLabel}>Listing type:</span>
            <span style={s.detailValue}>{photo.mimeType}</span>
          </div>

          {photo.initialStreamWidth && photo.initialStreamHeight && (
            <>
              <div style={{ ...s.detailRow, marginTop: 8, borderTop: '1px solid #333', paddingTop: 8 }}>
                <span style={s.detailLabel}>Initial stream:</span>
                <span style={s.detailValue}>{photo.initialStreamWidth}x{photo.initialStreamHeight}</span>
              </div>
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Final stream:</span>
                <span style={s.detailValue}>{photo.finalStreamWidth}x{photo.finalStreamHeight}</span>
              </div>
              <div style={s.detailRow}>
                <span style={s.detailLabel}>Max capabilities:</span>
                <span style={s.detailValue}>{photo.capabilitiesWidthMax}x{photo.capabilitiesHeightMax}</span>
              </div>
            </>
          )}
        </div>

        <div style={s.actions}>
          {hasOriginal && (
            <>
              <button style={s.actionButton} onClick={handleOpenOriginal}>
                Open Original
              </button>
              <button style={s.actionButton} onClick={() => handleDownload('original')}>
                Download Original
              </button>
              <button style={{ ...s.actionButton, ...s.actionButtonPrimary }} onClick={() => handleShare('original')}>
                Share Original
              </button>
            </>
          )}
          <button style={s.actionButton} onClick={() => handleDownload('listing')}>
            Download Listing
          </button>
          <button style={{ ...s.actionButton, ...s.actionButtonPrimary }} onClick={() => handleShare('listing')}>
            Share Listing
          </button>
        </div>
        {!canShareFiles && (
          <div style={{ padding: '8px 16px', fontSize: 11, color: '#666', textAlign: 'center', borderTop: '1px solid #333' }}>
            Web Share API not available — use Download instead
          </div>
        )}
      </div>
    </div>
  )
}
