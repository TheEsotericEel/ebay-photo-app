const OAUTH_CALLBACK_HASH_KEYS = new Set([
  'access_token',
  'refresh_token',
  'provider_token',
  'expires_at',
  'expires_in',
  'token_type',
])

export interface OAuthCallbackLocationLike {
  hash: string
  pathname: string
  search: string
}

export function stripSupabaseOAuthCallbackHash(url: OAuthCallbackLocationLike): string | null {
  const { hash, pathname, search } = url
  if (!hash || hash === '#') {
    return null
  }

  const fragment = hash.slice(1)
  if (!fragment || fragment.startsWith('/')) {
    return null
  }

  const params = new URLSearchParams(fragment)
  const knownKeys = [...params.keys()].filter((key) => OAUTH_CALLBACK_HASH_KEYS.has(key))
  if (knownKeys.length === 0) {
    return null
  }

  knownKeys.forEach((key) => params.delete(key))

  const nextHash = params.toString()
  return `${pathname}${search}${nextHash ? `#${nextHash}` : ''}`
}
