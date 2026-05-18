/**
 * Pure helper functions for item packet and photo operations.
 * These are stateless functions for attaching photos to items and extracting cover photos.
 */

import { ItemPacket } from './itemPacket'
import { StoredPhoto } from './localPhotoStore'

export interface ItemWithPhotos extends ItemPacket {
  photos: StoredPhoto[]
  coverPhoto: StoredPhoto | null
}

/**
 * Attaches photos to an item in the order specified by item.photoIds.
 * Missing photo IDs are represented as null in the photos array.
 * First photo in photoIds becomes the cover photo.
 */
export function attachOrderedPhotosToItem(
  item: ItemPacket,
  allPhotos: StoredPhoto[],
): ItemWithPhotos {
  // Map photoIds to photos, preserving order and representing missing photos as null
  const orderedPhotos: (StoredPhoto | null)[] = item.photoIds.map((photoId) => {
    return allPhotos.find((p) => p.id === photoId) || null
  })

  // Filter out nulls for the photos array (only for non-null photos)
  const photos: StoredPhoto[] = orderedPhotos.filter((p): p is StoredPhoto => p !== null)

  // Cover photo is the first non-null photo, or null if all are missing
  const coverPhoto = photos[0] || null

  return {
    ...item,
    photos,
    coverPhoto,
  }
}

/**
 * Gets the cover photo for an item (first photo in photoIds).
 * Returns null if no photos are found.
 */
export function getItemCoverPhoto(
  item: ItemPacket,
  allPhotos: StoredPhoto[],
): StoredPhoto | null {
  if (item.photoIds.length === 0) return null

  const firstPhotoId = item.photoIds[0]
  return allPhotos.find((p) => p.id === firstPhotoId) || null
}

/**
 * Gets ordered photos for an item with null placeholders for missing photos.
 * Useful for displaying "Missing photo" placeholders in UI.
 */
export function getOrderedPhotosWithMissing(
  item: ItemPacket,
  allPhotos: StoredPhoto[],
): (StoredPhoto | null)[] {
  return item.photoIds.map((photoId) => {
    return allPhotos.find((p) => p.id === photoId) || null
  })
}

/**
 * Item readiness information for display.
 */
export interface ItemReadiness {
  hasSku: boolean
  hasWeight: boolean
  photoCount: number
  hasPhotos: boolean
  isComplete: boolean
  missingPhotoCount: number
  readyForHandoff: boolean
}

/**
 * Derives readiness information from an item.
 * readyForHandoff is defined as: complete item + SKU present + weight present + at least 1 photo + no missing photos
 */
export function getItemReadiness(
  item: ItemPacket,
  allPhotos: StoredPhoto[],
): ItemReadiness {
  const hasSku = !!item.sku && item.sku.trim().length > 0
  const hasWeight = !!item.weight && item.weight.trim().length > 0
  const photoCount = item.photoIds.length
  const hasPhotos = photoCount > 0
  const isComplete = item.status === 'complete'

  // Count missing photos
  const orderedPhotos = getOrderedPhotosWithMissing(item, allPhotos)
  const missingPhotoCount = orderedPhotos.filter((p) => p === null).length

  // Ready for handoff: complete + SKU + weight + at least 1 photo + no missing photos
  const readyForHandoff = isComplete && hasSku && hasWeight && hasPhotos && missingPhotoCount === 0

  return {
    hasSku,
    hasWeight,
    photoCount,
    hasPhotos,
    isComplete,
    missingPhotoCount,
    readyForHandoff,
  }
}

/**
 * Filter options for item list.
 */
export type ItemFilter = 'all' | 'ready' | 'needs-info' | 'draft' | 'complete'

/**
 * Sort options for item list.
 */
export type ItemSort = 'newest-first' | 'oldest-first' | 'item-number-asc' | 'item-number-desc'

/**
 * Filters items based on the specified filter option.
 */
export function filterItems<T extends ItemPacket>(
  items: T[],
  filter: ItemFilter,
  allPhotos: StoredPhoto[],
): T[] {
  switch (filter) {
    case 'all':
      return items
    case 'ready':
      return items.filter((item) => getItemReadiness(item, allPhotos).readyForHandoff)
    case 'needs-info':
      return items.filter((item) => !getItemReadiness(item, allPhotos).readyForHandoff)
    case 'draft':
      return items.filter((item) => item.status === 'draft')
    case 'complete':
      return items.filter((item) => item.status === 'complete')
    default:
      return items
  }
}

/**
 * Sorts items based on the specified sort option.
 */
export function sortItems<T extends ItemPacket>(items: T[], sort: ItemSort): T[] {
  const sorted = [...items]
  switch (sort) {
    case 'newest-first':
      // Sort by createdAt descending (newest first)
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    case 'oldest-first':
      // Sort by createdAt ascending (oldest first)
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    case 'item-number-asc':
      // Sort by itemNumber ascending
      return sorted.sort((a, b) => a.itemNumber - b.itemNumber)
    case 'item-number-desc':
      // Sort by itemNumber descending
      return sorted.sort((a, b) => b.itemNumber - a.itemNumber)
    default:
      return sorted
  }
}
