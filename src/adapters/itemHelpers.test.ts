import { describe, it, expect } from 'vitest'
import { ItemPacket } from './itemPacket'
import { StoredPhoto } from './localPhotoStore'
import { attachOrderedPhotosToItem, getItemCoverPhoto, getOrderedPhotosWithMissing, getItemReadiness, filterItems, sortItems } from './itemHelpers'

describe('itemHelpers', () => {
  const mockPhotos: StoredPhoto[] = [
    {
      id: 'photo-001',
      blob: new Blob(['test1'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      size: 100,
      capturedAt: '2026-05-17T00:00:00.000Z',
      savedAt: '2026-05-17T00:00:00.000Z',
    },
    {
      id: 'photo-002',
      blob: new Blob(['test2'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      size: 200,
      capturedAt: '2026-05-17T00:00:00.000Z',
      savedAt: '2026-05-17T00:00:00.000Z',
    },
    {
      id: 'photo-003',
      blob: new Blob(['test3'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      size: 300,
      capturedAt: '2026-05-17T00:00:00.000Z',
      savedAt: '2026-05-17T00:00:00.000Z',
    },
  ]

  const mockItem: ItemPacket = {
    id: 'item-001',
    storeId: 'default-store',
    batchId: 'default-batch',
    itemNumber: 1,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    status: 'draft',
    photoIds: ['photo-001', 'photo-002', 'photo-003'],
  }

  it('attachOrderedPhotosToItem preserves photo order', () => {
    const result = attachOrderedPhotosToItem(mockItem, mockPhotos)
    
    expect(result.photos).toHaveLength(3)
    expect(result.photos[0].id).toBe('photo-001')
    expect(result.photos[1].id).toBe('photo-002')
    expect(result.photos[2].id).toBe('photo-003')
  })

  it('attachOrderedPhotosToItem sets first photo as cover', () => {
    const result = attachOrderedPhotosToItem(mockItem, mockPhotos)
    
    expect(result.coverPhoto).not.toBeNull()
    expect(result.coverPhoto?.id).toBe('photo-001')
  })

  it('attachOrderedPhotosToItem handles missing photos', () => {
    const itemWithMissing: ItemPacket = {
      ...mockItem,
      photoIds: ['photo-001', 'photo-missing', 'photo-003'],
    }
    
    const result = attachOrderedPhotosToItem(itemWithMissing, mockPhotos)
    
    // Should only include found photos
    expect(result.photos).toHaveLength(2)
    expect(result.photos[0].id).toBe('photo-001')
    expect(result.photos[1].id).toBe('photo-003')
    // Cover should still be first found photo
    expect(result.coverPhoto?.id).toBe('photo-001')
  })

  it('attachOrderedPhotosToItem handles empty photoIds', () => {
    const emptyItem: ItemPacket = {
      ...mockItem,
      photoIds: [],
    }
    
    const result = attachOrderedPhotosToItem(emptyItem, mockPhotos)
    
    expect(result.photos).toHaveLength(0)
    expect(result.coverPhoto).toBeNull()
  })

  it('getItemCoverPhoto returns first photo', () => {
    const result = getItemCoverPhoto(mockItem, mockPhotos)
    
    expect(result).not.toBeNull()
    expect(result?.id).toBe('photo-001')
  })

  it('getItemCoverPhoto returns null for empty photoIds', () => {
    const emptyItem: ItemPacket = {
      ...mockItem,
      photoIds: [],
    }
    
    const result = getItemCoverPhoto(emptyItem, mockPhotos)
    
    expect(result).toBeNull()
  })

  it('getItemCoverPhoto returns null when photo not found', () => {
    const itemWithMissing: ItemPacket = {
      ...mockItem,
      photoIds: ['photo-missing'],
    }
    
    const result = getItemCoverPhoto(itemWithMissing, mockPhotos)
    
    expect(result).toBeNull()
  })

  it('getOrderedPhotosWithMissing preserves order with null placeholders', () => {
    const itemWithMissing: ItemPacket = {
      ...mockItem,
      photoIds: ['photo-001', 'photo-missing', 'photo-003'],
    }
    
    const result = getOrderedPhotosWithMissing(itemWithMissing, mockPhotos)
    
    expect(result).toHaveLength(3)
    expect(result[0]?.id).toBe('photo-001')
    expect(result[1]).toBeNull() // Missing photo
    expect(result[2]?.id).toBe('photo-003')
  })

  it('getOrderedPhotosWithMissing returns empty array for empty photoIds', () => {
    const emptyItem: ItemPacket = {
      ...mockItem,
      photoIds: [],
    }
    
    const result = getOrderedPhotosWithMissing(emptyItem, mockPhotos)
    
    expect(result).toHaveLength(0)
  })

  describe('getItemReadiness', () => {
    it('calculates readiness for complete item with all required fields', () => {
      const completeItem: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: 'ABC-123',
        weight: '1.5kg',
        dimensions: '12 x 8 x 6 in',
      }
      
      const result = getItemReadiness(completeItem, mockPhotos)
      
      expect(result.hasSku).toBe(true)
      expect(result.hasWeight).toBe(true)
      expect(result.hasDimensions).toBe(true)
      expect(result.photoCount).toBe(3)
      expect(result.hasPhotos).toBe(true)
      expect(result.isComplete).toBe(true)
      expect(result.missingPhotoCount).toBe(0)
      expect(result.readyForHandoff).toBe(true)
    })

    it('calculates readiness for draft item', () => {
      const result = getItemReadiness(mockItem, mockPhotos)
      
      expect(result.hasSku).toBe(false)
      expect(result.hasWeight).toBe(false)
      expect(result.photoCount).toBe(3)
      expect(result.hasPhotos).toBe(true)
      expect(result.isComplete).toBe(false)
      expect(result.missingPhotoCount).toBe(0)
      expect(result.readyForHandoff).toBe(false)
    })

    it('calculates readiness for item with missing SKU', () => {
      const itemWithoutSku: ItemPacket = {
        ...mockItem,
        status: 'complete',
        weight: '1.5kg',
      }
      
      const result = getItemReadiness(itemWithoutSku, mockPhotos)
      
      expect(result.hasSku).toBe(false)
      expect(result.hasWeight).toBe(true)
      expect(result.readyForHandoff).toBe(false)
    })

    it('calculates readiness for item with missing weight', () => {
      const itemWithoutWeight: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: 'ABC-123',
      }
      
      const result = getItemReadiness(itemWithoutWeight, mockPhotos)
      
      expect(result.hasSku).toBe(true)
      expect(result.hasWeight).toBe(false)
      expect(result.readyForHandoff).toBe(false)
    })

    it('calculates readiness for item with missing dimensions', () => {
      const itemWithoutDimensions: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: 'ABC-123',
        weight: '1.5kg',
      }

      const result = getItemReadiness(itemWithoutDimensions, mockPhotos)

      expect(result.hasSku).toBe(true)
      expect(result.hasWeight).toBe(true)
      expect(result.hasDimensions).toBe(false)
      expect(result.readyForHandoff).toBe(false)
    })

    it('calculates readiness for item with no photos', () => {
      const itemWithoutPhotos: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: 'ABC-123',
        weight: '1.5kg',
        dimensions: '12 x 8 x 6 in',
        photoIds: [],
      }
      
      const result = getItemReadiness(itemWithoutPhotos, mockPhotos)
      
      expect(result.photoCount).toBe(0)
      expect(result.hasPhotos).toBe(false)
      expect(result.readyForHandoff).toBe(false)
    })

    it('calculates readiness for item with missing photos', () => {
      const itemWithMissing: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: 'ABC-123',
        weight: '1.5kg',
        dimensions: '12 x 8 x 6 in',
        photoIds: ['photo-001', 'photo-missing', 'photo-003'],
      }
      
      const result = getItemReadiness(itemWithMissing, mockPhotos)
      
      expect(result.photoCount).toBe(3)
      expect(result.missingPhotoCount).toBe(1)
      expect(result.readyForHandoff).toBe(false)
    })

    it('treats empty string SKU as missing', () => {
      const itemWithEmptySku: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: '',
        weight: '1.5kg',
        dimensions: '12 x 8 x 6 in',
      }
      
      const result = getItemReadiness(itemWithEmptySku, mockPhotos)
      
      expect(result.hasSku).toBe(false)
      expect(result.readyForHandoff).toBe(false)
    })

    it('treats whitespace-only SKU as missing', () => {
      const itemWithWhitespaceSku: ItemPacket = {
        ...mockItem,
        status: 'complete',
        sku: '   ',
        weight: '1.5kg',
        dimensions: '12 x 8 x 6 in',
      }
      
      const result = getItemReadiness(itemWithWhitespaceSku, mockPhotos)
      
      expect(result.hasSku).toBe(false)
      expect(result.readyForHandoff).toBe(false)
    })
  })

  describe('filterItems', () => {
    const mockItems: ItemPacket[] = [
      {
        ...mockItem,
        id: 'item-001',
        status: 'complete',
        sku: 'ABC-123',
        weight: '1.5kg',
        dimensions: '12 x 8 x 6 in',
        createdAt: '2026-05-17T00:00:00.000Z',
      },
      {
        ...mockItem,
        id: 'item-002',
        status: 'draft',
        sku: 'DEF-456',
        weight: '2.0kg',
        dimensions: '10 x 7 x 4 in',
        createdAt: '2026-05-17T01:00:00.000Z',
      },
      {
        ...mockItem,
        id: 'item-003',
        status: 'complete',
        sku: '',
        weight: '1.0kg',
        dimensions: '9 x 6 x 4 in',
        createdAt: '2026-05-17T02:00:00.000Z',
      },
    ]

    it('returns all items when filter is all', () => {
      const result = filterItems(mockItems, 'all', mockPhotos)
      expect(result).toHaveLength(3)
    })

    it('filters ready items', () => {
      const result = filterItems(mockItems, 'ready', mockPhotos)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('item-001')
    })

    it('filters needs-info items', () => {
      const result = filterItems(mockItems, 'needs-info', mockPhotos)
      expect(result).toHaveLength(2)
      expect(result.map((i) => i.id)).toContain('item-002')
      expect(result.map((i) => i.id)).toContain('item-003')
    })

    it('filters draft items', () => {
      const result = filterItems(mockItems, 'draft', mockPhotos)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('item-002')
    })

    it('filters complete items', () => {
      const result = filterItems(mockItems, 'complete', mockPhotos)
      expect(result).toHaveLength(2)
      expect(result.map((i) => i.id)).toContain('item-001')
      expect(result.map((i) => i.id)).toContain('item-003')
    })
  })

  describe('sortItems', () => {
    const mockItems: ItemPacket[] = [
      {
        ...mockItem,
        id: 'item-001',
        itemNumber: 3,
        createdAt: '2026-05-17T00:00:00.000Z',
      },
      {
        ...mockItem,
        id: 'item-002',
        itemNumber: 1,
        createdAt: '2026-05-17T02:00:00.000Z',
      },
      {
        ...mockItem,
        id: 'item-003',
        itemNumber: 2,
        createdAt: '2026-05-17T01:00:00.000Z',
      },
    ]

    it('sorts by newest first (createdAt descending)', () => {
      const result = sortItems(mockItems, 'newest-first')
      expect(result[0].id).toBe('item-002')
      expect(result[1].id).toBe('item-003')
      expect(result[2].id).toBe('item-001')
    })

    it('sorts by oldest first (createdAt ascending)', () => {
      const result = sortItems(mockItems, 'oldest-first')
      expect(result[0].id).toBe('item-001')
      expect(result[1].id).toBe('item-003')
      expect(result[2].id).toBe('item-002')
    })

    it('sorts by item number ascending', () => {
      const result = sortItems(mockItems, 'item-number-asc')
      expect(result[0].itemNumber).toBe(1)
      expect(result[1].itemNumber).toBe(2)
      expect(result[2].itemNumber).toBe(3)
    })

    it('sorts by item number descending', () => {
      const result = sortItems(mockItems, 'item-number-desc')
      expect(result[0].itemNumber).toBe(3)
      expect(result[1].itemNumber).toBe(2)
      expect(result[2].itemNumber).toBe(1)
    })
  })
})
