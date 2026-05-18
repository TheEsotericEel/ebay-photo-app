import { useEffect, useState } from 'react'
import { StoredPhoto } from '../adapters/localPhotoStore'

interface Props {
  photos: StoredPhoto[]
  onPhotoClick?: (photo: StoredPhoto) => void
}

const s: Record<string, React.CSSProperties> = {
  section: { marginTop: 12 },
  header: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 6,
    display: 'flex',
    justifyContent: 'space-between',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: 4,
  },
  thumbContainer: {
    cursor: 'pointer',
  },
  thumb: {
    width: '100%',
    aspectRatio: '1',
    objectFit: 'cover',
    borderRadius: 4,
    background: '#222',
    transition: 'opacity 0.2s',
  },
  thumbHover: {
    opacity: 0.8,
  },
  meta: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}

function PhotoThumb({ photo, onClick }: { photo: StoredPhoto; onClick?: (photo: StoredPhoto) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // Prefer thumbnail if available, otherwise use main blob
    const blobToUse = photo.thumbnailBlob || photo.blob
    const objectUrl = URL.createObjectURL(blobToUse)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo.thumbnailBlob, photo.blob])

  const handleClick = () => {
    if (onClick) onClick(photo)
  }

  // Show original dimensions if available, otherwise output dimensions
  const dims = photo.originalWidth && photo.originalHeight 
    ? `${photo.originalWidth}x${photo.originalHeight}` 
    : photo.outputWidth && photo.outputHeight 
      ? `${photo.outputWidth}x${photo.outputHeight}` 
      : ''

  const method = photo.captureMethod || ''

  return (
    <div style={s.thumbContainer} onClick={handleClick} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
      {url ? (
        <img 
          src={url} 
          alt={`Captured ${photo.capturedAt}`} 
          style={{ ...s.thumb, ...(isHovered ? s.thumbHover : {}) }} 
        />
      ) : (
        <div style={s.thumb} />
      )}
      <div style={s.meta}>{dims ? `${dims} • ` : ''}{method ? `${method} • ` : ''}{formatBytes(photo.size)}</div>
    </div>
  )
}

export function PhotoList({ photos, onPhotoClick }: Props) {
  if (photos.length === 0) {
    return (
      <div style={{ ...s.section, color: '#555', fontSize: 12 }}>
        No captured photos yet.
      </div>
    )
  }

  return (
    <div style={s.section}>
      <div style={s.header}>
        <span>Captured photos</span>
        <span>{photos.length} stored locally</span>
      </div>
      <div style={s.grid}>
        {photos.map((p) => (
          <PhotoThumb key={p.id} photo={p} onClick={onPhotoClick} />
        ))}
      </div>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
