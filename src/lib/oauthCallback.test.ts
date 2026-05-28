import { describe, expect, it } from 'vitest'
import { stripSupabaseOAuthCallbackHash } from './oauthCallback'

describe('stripSupabaseOAuthCallbackHash', () => {
  it('removes Supabase OAuth tokens from the URL hash', () => {
    const url = new URL('http://127.0.0.1:4173/#access_token=abc&refresh_token=def&provider_token=ghi&expires_at=123&expires_in=3600&token_type=bearer')

    const cleaned = stripSupabaseOAuthCallbackHash(url)

    expect(cleaned).toBe('/')
  })

  it('preserves non-auth hash params while stripping auth tokens', () => {
    const url = new URL('http://127.0.0.1:4173/?store=abc#foo=bar&access_token=abc&refresh_token=def')

    const cleaned = stripSupabaseOAuthCallbackHash(url)

    expect(cleaned).toBe('/?store=abc#foo=bar')
  })

  it('leaves hash-routing fragments untouched', () => {
    const url = new URL('http://127.0.0.1:4173/#/store/abc?access_token=abc&refresh_token=def')

    const cleaned = stripSupabaseOAuthCallbackHash(url)

    expect(cleaned).toBeNull()
  })

  it('returns null when no known auth callback keys are present', () => {
    const url = new URL('http://127.0.0.1:4173/#foo=bar')

    const cleaned = stripSupabaseOAuthCallbackHash(url)

    expect(cleaned).toBeNull()
  })
})
