export type RemoteRetentionMode =
  | 'manual'
  | 'delete_24h_after_listed'
  | 'delete_3d_after_listed'
  | 'delete_7d_after_listed'
  | 'delete_7d_after_upload'
  | 'delete_7d_after_batch_complete'

const RETENTION_DAYS: Record<Exclude<RemoteRetentionMode, 'manual'>, number> = {
  delete_24h_after_listed: 1,
  delete_3d_after_listed: 3,
  delete_7d_after_listed: 7,
  delete_7d_after_upload: 7,
  delete_7d_after_batch_complete: 7,
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

export function getRetentionDays(mode?: RemoteRetentionMode | null): number | null {
  if (!mode || mode === 'manual') {
    return null
  }

  return RETENTION_DAYS[mode]
}

export function getRetentionModeLabel(mode?: RemoteRetentionMode | null): string {
  switch (mode) {
    case 'delete_24h_after_listed':
      return 'Delete 24h after listed'
    case 'delete_3d_after_listed':
      return 'Delete 3d after listed'
    case 'delete_7d_after_listed':
      return 'Delete 7d after listed'
    case 'delete_7d_after_upload':
      return 'Delete 7d after upload'
    case 'delete_7d_after_batch_complete':
      return 'Delete 7d after batch complete'
    case 'manual':
      return 'Manual'
    default:
      return 'Delete 7d after listed'
  }
}

export function calculateRetentionWindow(
  listedAt: string | null | undefined,
  mode?: RemoteRetentionMode | null,
): { eligibleAt: string | null; expiresAt: string | null } {
  const normalizedMode = mode || 'delete_7d_after_listed'
  if (!listedAt) {
    return { eligibleAt: null, expiresAt: null }
  }

  if (normalizedMode === 'manual') {
    return { eligibleAt: listedAt, expiresAt: null }
  }

  const days = getRetentionDays(normalizedMode)
  if (!days) {
    return { eligibleAt: listedAt, expiresAt: null }
  }

  const eligibleAt = listedAt
  const expiresAt = addDays(eligibleAt, days)
  return { eligibleAt, expiresAt }
}

export function isRetentionExpired(
  expiresAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!expiresAt) {
    return false
  }

  return new Date(expiresAt).getTime() <= now.getTime()
}
