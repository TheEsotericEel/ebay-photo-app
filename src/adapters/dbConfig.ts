/**
 * Shared IndexedDB configuration for all adapters.
 * Ensures consistent DB name and version across the application.
 */

export const DB_NAME = 'ebay-photo-spike'
export const DB_VERSION = 3

export const STORE_STORE_NAME = 'stores'
export const BATCH_STORE_NAME = 'batches'
export const PHOTO_STORE_NAME = 'pending-photos'
export const ITEM_STORE_NAME = 'item-packets'
