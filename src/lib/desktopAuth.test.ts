import { beforeEach, describe, expect, it } from 'vitest'
import { getDesktopAccountSummary, getLastMethodLabel, loadDesktopAuthPreferences, saveDesktopAuthPreferences } from './desktopAuth'

describe('desktopAuth', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('stores and restores last-used email and method', () => {
    saveDesktopAuthPreferences({ lastEmail: 'the.esoteric.eel@gmail.com', lastMethod: 'google' })

    expect(loadDesktopAuthPreferences()).toEqual({
      lastEmail: 'the.esoteric.eel@gmail.com',
      lastMethod: 'google',
    })
  })

  it('derives linked provider labels from a Supabase session', () => {
    const summary = getDesktopAccountSummary({
      user: {
        id: 'user-123',
        email: 'the.esoteric.eel@gmail.com',
        app_metadata: {
          provider: 'google',
          providers: ['email', 'google'],
        },
        identities: [{ provider: 'email' }, { provider: 'google' }],
      },
    } as never)

    expect(summary).toEqual({
      email: 'the.esoteric.eel@gmail.com',
      userId: 'user-123',
      currentMethodLabel: 'Google',
      linkedProviderLabels: ['Google', 'Email/password'],
    })
  })

  it('formats last-used method labels', () => {
    expect(getLastMethodLabel('password')).toBe('Password')
    expect(getLastMethodLabel('google')).toBe('Google')
    expect(getLastMethodLabel(null)).toBeNull()
  })
})
