import { useEffect, useState } from 'react'
import { IndexedDbItemPacketStore } from '../adapters/itemPacket'
import { IndexedDbPhotoStore, StoredPhoto } from '../adapters/localPhotoStore'
import { attachOrderedPhotosToItem, getOrderedPhotosWithMissing, ItemWithPhotos, getItemReadiness, filterItems, sortItems, ItemFilter, ItemSort } from '../adapters/itemHelpers'

const itemPacketStore = new IndexedDbItemPacketStore()
const photoStore = new IndexedDbPhotoStore()

const s: Record<string, React.CSSProperties> = {
  screen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '16px',
    maxWidth: 480,
    margin: '0 auto',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  itemCard: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    display: 'flex',
    gap: 12,
  },
  itemCover: {
    width: 80,
    height: 80,
    borderRadius: 6,
    objectFit: 'cover',
    background: '#222',
  },
  itemCoverPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 6,
    background: '#222',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    fontSize: 24,
  },
  itemDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  itemNumber: {
    fontSize: 16,
    fontWeight: 600,
    color: '#eee',
  },
  itemStatus: {
    fontSize: 12,
    color: '#888',
  },
  itemMeta: {
    fontSize: 12,
    color: '#666',
  },
  empty: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
  detailScreen: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    padding: '16px',
    maxWidth: 480,
    margin: '0 auto',
  },
  backButton: {
    padding: '10px 16px',
    borderRadius: 6,
    border: '1px solid #333',
    background: 'transparent',
    color: '#eee',
    fontSize: 14,
    cursor: 'pointer',
    marginBottom: 16,
  },
  detailHeader: {
    fontSize: 24,
    fontWeight: 600,
    color: '#eee',
    marginBottom: 8,
  },
  detailMeta: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailSectionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  photoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  photoItem: {
    aspectRatio: 1,
    borderRadius: 6,
    overflow: 'hidden',
    background: '#222',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  photoLabel: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    background: 'rgba(0, 0, 0, 0.7)',
    color: '#eee',
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
  },
  missingPhoto: {
    aspectRatio: 1,
    borderRadius: 6,
    background: '#1a1a1a',
    border: '1px dashed #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    fontSize: 12,
  },
  readinessBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  readinessReady: {
    background: '#1a3a1a',
    color: '#4ade80',
    border: '1px solid #2d5a2d',
  },
  readinessNeedsInfo: {
    background: '#3a1a1a',
    color: '#f87171',
    border: '1px solid #5a2d2d',
  },
  checklist: {
    fontSize: 12,
    color: '#888',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  checklistItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  checklistCheck: {
    color: '#4ade80',
  },
  checklistCross: {
    color: '#f87171',
  },
  filterBar: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  filterButton: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #333',
    background: 'transparent',
    color: '#888',
    fontSize: 12,
    cursor: 'pointer',
  },
  filterButtonActive: {
    background: '#2a2a2a',
    color: '#eee',
    borderColor: '#666',
  },
  sortSelect: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid #333',
    background: '#1a1a1a',
    color: '#eee',
    fontSize: 12,
    cursor: 'pointer',
  },
  countDisplay: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
}

export function ItemReview() {
  const [itemsWithPhotos, setItemsWithPhotos] = useState<ItemWithPhotos[]>([])
  const [allPhotos, setAllPhotos] = useState<StoredPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<ItemWithPhotos | null>(null)
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [sort, setSort] = useState<ItemSort>('newest-first')

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        
        // Load all items
        const items = await itemPacketStore.getAllItems()
        
        // Load all photos
        const allPhotos = await photoStore.getAll()
        setAllPhotos(allPhotos)
        
        // Attach photos to items using helper
        const itemsWithPhotosData: ItemWithPhotos[] = items.map((item) => 
          attachOrderedPhotosToItem(item, allPhotos)
        )
        
        // Sort: complete items first, then by itemNumber descending (newest first)
        itemsWithPhotosData.sort((a, b) => {
          if (a.status === b.status) {
            return b.itemNumber - a.itemNumber
          }
          return a.status === 'complete' ? -1 : 1
        })
        
        setItemsWithPhotos(itemsWithPhotosData)
      } catch (err) {
        console.error('Failed to load item review data:', err)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Apply filter and sort
  const filteredItems = filterItems(itemsWithPhotos, filter, allPhotos)
  const sortedItems = sortItems(filteredItems, sort)

  if (loading) {
    return (
      <div style={s.screen}>
        <div style={s.empty}>Loading items…</div>
      </div>
    )
  }

  if (selectedItem) {
    return <ItemDetail item={selectedItem} onBack={() => setSelectedItem(null)} />
  }

  return (
    <div style={s.screen}>
      <div style={s.filterBar}>
        {(['all', 'ready', 'needs-info', 'draft', 'complete'] as ItemFilter[]).map((filterOption) => (
          <button
            key={filterOption}
            onClick={() => setFilter(filterOption)}
            style={{
              ...s.filterButton,
              ...(filter === filterOption ? s.filterButtonActive : {}),
            }}
          >
            {filterOption === 'needs-info' ? 'Needs info' : filterOption.charAt(0).toUpperCase() + filterOption.slice(1)}
          </button>
        ))}
      </div>

      <div style={s.filterBar}>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as ItemSort)}
          style={s.sortSelect}
        >
          <option value="newest-first">Newest first</option>
          <option value="oldest-first">Oldest first</option>
          <option value="item-number-asc">Item number ↑</option>
          <option value="item-number-desc">Item number ↓</option>
        </select>
      </div>

      <div style={s.countDisplay}>
        Showing {sortedItems.length} of {itemsWithPhotos.length} items
      </div>

      {sortedItems.length === 0 ? (
        <div style={s.empty}>No items match this filter.</div>
      ) : (
        sortedItems.map((item) => (
          <ItemCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
        ))
      )}
    </div>
  )
}

function ItemCard({ item, onClick }: { item: ItemWithPhotos; onClick: () => void }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [readiness, setReadiness] = useState(getItemReadiness(item, item.photos))

  useEffect(() => {
    if (item.coverPhoto) {
      const blob = item.coverPhoto.thumbnailBlob || item.coverPhoto.blob
      const url = URL.createObjectURL(blob)
      setCoverUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [item.coverPhoto])

  useEffect(() => {
    setReadiness(getItemReadiness(item, item.photos))
  }, [item, item.photos])

  return (
    <div style={{ ...s.itemCard, cursor: 'pointer' }} onClick={onClick}>
      {coverUrl ? (
        <img src={coverUrl} alt={`Item ${item.itemNumber}`} style={s.itemCover} />
      ) : (
        <div style={s.itemCoverPlaceholder}>📷</div>
      )}
      <div style={s.itemDetails}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={s.itemNumber}>Item {item.itemNumber}</div>
          <div style={{ ...s.readinessBadge, ...(readiness.readyForHandoff ? s.readinessReady : s.readinessNeedsInfo) }}>
            {readiness.readyForHandoff ? 'Ready' : 'Needs info'}
          </div>
        </div>
        <div style={s.itemStatus}>
          {item.status === 'draft' ? 'Draft' : 'Complete'} • {item.photos.length} photo{item.photos.length !== 1 ? 's' : ''}
        </div>
        <div style={s.checklist}>
          <div style={s.checklistItem}>
            <span style={readiness.hasSku ? s.checklistCheck : s.checklistCross}>{readiness.hasSku ? '✓' : '✗'}</span>
            <span>SKU</span>
          </div>
          <div style={s.checklistItem}>
            <span style={readiness.hasWeight ? s.checklistCheck : s.checklistCross}>{readiness.hasWeight ? '✓' : '✗'}</span>
            <span>Weight</span>
          </div>
          {readiness.missingPhotoCount > 0 && (
            <div style={s.checklistItem}>
              <span style={s.checklistCross}>✗</span>
              <span>{readiness.missingPhotoCount} missing photo{readiness.missingPhotoCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ItemDetail({ item, onBack }: { item: ItemWithPhotos; onBack: () => void }) {
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())
  const [orderedPhotosWithMissing, setOrderedPhotosWithMissing] = useState<(StoredPhoto | null)[]>([])
  const [readiness, setReadiness] = useState(getItemReadiness(item, item.photos))

  useEffect(() => {
    // Load all photos to get ordered list with missing photos
    async function loadPhotos() {
      const allPhotos = await photoStore.getAll()
      const ordered = getOrderedPhotosWithMissing(item, allPhotos)
      setOrderedPhotosWithMissing(ordered)

      // Create blob URLs for photos
      const urlMap = new Map<string, string>()
      ordered.forEach((photo) => {
        if (photo) {
          const blob = photo.thumbnailBlob || photo.blob
          const url = URL.createObjectURL(blob)
          urlMap.set(photo.id, url)
        }
      })
      setPhotoUrls(urlMap)

      // Update readiness with full photo list
      setReadiness(getItemReadiness(item, allPhotos))

      // Cleanup function
      return () => {
        urlMap.forEach((url) => URL.revokeObjectURL(url))
      }
    }

    loadPhotos()
  }, [item])

  return (
    <div style={s.detailScreen}>
      <button onClick={onBack} style={s.backButton}>
        ← Back to Items
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={s.detailHeader}>Item {item.itemNumber}</div>
        <div style={{ ...s.readinessBadge, ...(readiness.readyForHandoff ? s.readinessReady : s.readinessNeedsInfo) }}>
          {readiness.readyForHandoff ? 'Ready' : 'Needs info'}
        </div>
      </div>
      <div style={s.detailMeta}>
        {item.status === 'draft' ? 'Draft' : 'Complete'} • {item.photoIds.length} photo{item.photoIds.length !== 1 ? 's' : ''}
      </div>

      <div style={s.detailSection}>
        <div style={s.detailSectionLabel}>Readiness Checklist</div>
        <div style={s.checklist}>
          <div style={s.checklistItem}>
            <span style={readiness.isComplete ? s.checklistCheck : s.checklistCross}>{readiness.isComplete ? '✓' : '✗'}</span>
            <span>Status: {item.status === 'complete' ? 'Complete' : 'Draft'}</span>
          </div>
          <div style={s.checklistItem}>
            <span style={readiness.hasSku ? s.checklistCheck : s.checklistCross}>{readiness.hasSku ? '✓' : '✗'}</span>
            <span>SKU: {item.sku || 'Not set'}</span>
          </div>
          <div style={s.checklistItem}>
            <span style={readiness.hasWeight ? s.checklistCheck : s.checklistCross}>{readiness.hasWeight ? '✓' : '✗'}</span>
            <span>Weight: {item.weight || 'Not set'}</span>
          </div>
          <div style={s.checklistItem}>
            <span style={readiness.hasPhotos ? s.checklistCheck : s.checklistCross}>{readiness.hasPhotos ? '✓' : '✗'}</span>
            <span>Photos: {readiness.photoCount}</span>
          </div>
          {readiness.missingPhotoCount > 0 && (
            <div style={s.checklistItem}>
              <span style={s.checklistCross}>✗</span>
              <span>Missing photos: {readiness.missingPhotoCount}</span>
            </div>
          )}
        </div>
      </div>

      {item.note && (
        <div style={s.detailSection}>
          <div style={s.detailSectionLabel}>Note</div>
          <div style={{ color: '#eee' }}>{item.note}</div>
        </div>
      )}

      <div style={s.detailSection}>
        <div style={s.detailSectionLabel}>Photos ({orderedPhotosWithMissing.length})</div>
        <div style={s.photoGrid}>
          {orderedPhotosWithMissing.map((photo, index) => {
            if (!photo) {
              return (
                <div key={`missing-${index}`} style={s.missingPhoto}>
                  Missing photo
                </div>
              )
            }

            const url = photoUrls.get(photo.id)
            if (!url) return null

            return (
              <div key={photo.id} style={s.photoItem}>
                <img src={url} alt={`Photo ${index + 1}`} style={s.photoImage} />
                <div style={s.photoLabel}>Photo {index + 1}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
