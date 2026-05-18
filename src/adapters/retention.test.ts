import { describe, expect, it } from 'vitest'
import { calculateRetentionWindow, getRetentionDays, getRetentionModeLabel } from './retention'

describe('retention', () => {
  it('returns the expected retention day counts', () => {
    expect(getRetentionDays('manual')).toBeNull()
    expect(getRetentionDays('delete_24h_after_listed')).toBe(1)
    expect(getRetentionDays('delete_3d_after_listed')).toBe(3)
    expect(getRetentionDays('delete_7d_after_listed')).toBe(7)
  })

  it('calculates a retention window from the listed date', () => {
    const window = calculateRetentionWindow('2026-05-18T00:00:00.000Z', 'delete_3d_after_listed')
    expect(window.eligibleAt).toBe('2026-05-18T00:00:00.000Z')
    expect(window.expiresAt).toBe('2026-05-21T00:00:00.000Z')
  })

  it('labels retention modes clearly', () => {
    expect(getRetentionModeLabel('delete_7d_after_listed')).toBe('Delete 7d after listed')
    expect(getRetentionModeLabel('manual')).toBe('Manual')
  })
})
