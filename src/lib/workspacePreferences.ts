export type DesktopMode = 'capture' | 'queue' | 'tools'

const WORKSPACE_DESKTOP_MODE_KEY = 'workspaceDesktopMode'
const WORKSPACE_STORE_ID_KEY = 'workspaceStoreId'
const WORKSPACE_BATCH_ID_KEY = 'workspaceBatchId'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export interface WorkspacePreferenceState {
  desktopMode: DesktopMode | null
  selectedStoreId: string | null
  selectedBatchId: string | null
}

export function loadWorkspacePreferences(): WorkspacePreferenceState {
  if (!canUseStorage()) {
    return {
      desktopMode: null,
      selectedStoreId: null,
      selectedBatchId: null,
    }
  }

  const desktopMode = window.localStorage.getItem(WORKSPACE_DESKTOP_MODE_KEY)
  const selectedStoreId = window.localStorage.getItem(WORKSPACE_STORE_ID_KEY)
  const selectedBatchId = window.localStorage.getItem(WORKSPACE_BATCH_ID_KEY)

  return {
    desktopMode: desktopMode === 'capture' || desktopMode === 'queue' || desktopMode === 'tools' ? desktopMode : null,
    selectedStoreId,
    selectedBatchId,
  }
}

export function saveWorkspacePreferences(next: Partial<WorkspacePreferenceState>): void {
  if (!canUseStorage()) {
    return
  }

  if (next.desktopMode !== undefined) {
    if (next.desktopMode) {
      window.localStorage.setItem(WORKSPACE_DESKTOP_MODE_KEY, next.desktopMode)
    } else {
      window.localStorage.removeItem(WORKSPACE_DESKTOP_MODE_KEY)
    }
  }

  if (next.selectedStoreId !== undefined) {
    if (next.selectedStoreId) {
      window.localStorage.setItem(WORKSPACE_STORE_ID_KEY, next.selectedStoreId)
    } else {
      window.localStorage.removeItem(WORKSPACE_STORE_ID_KEY)
    }
  }

  if (next.selectedBatchId !== undefined) {
    if (next.selectedBatchId) {
      window.localStorage.setItem(WORKSPACE_BATCH_ID_KEY, next.selectedBatchId)
    } else {
      window.localStorage.removeItem(WORKSPACE_BATCH_ID_KEY)
    }
  }
}
