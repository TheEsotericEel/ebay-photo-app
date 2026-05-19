import { beforeEach, describe, expect, it } from 'vitest'
import { loadWorkspacePreferences, saveWorkspacePreferences } from './workspacePreferences'

describe('workspacePreferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to no saved workspace preferences', () => {
    expect(loadWorkspacePreferences()).toEqual({
      desktopMode: null,
      selectedStoreId: null,
      selectedBatchId: null,
    })
  })

  it('persists desktop mode and workspace selection', () => {
    saveWorkspacePreferences({
      desktopMode: 'queue',
      selectedStoreId: 'store-1',
      selectedBatchId: 'batch-1',
    })

    expect(loadWorkspacePreferences()).toEqual({
      desktopMode: 'queue',
      selectedStoreId: 'store-1',
      selectedBatchId: 'batch-1',
    })
  })
})
