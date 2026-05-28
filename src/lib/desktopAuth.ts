import type { Session } from '@supabase/supabase-js'

export type DesktopAuthMethod = 'password' | 'google'

const LAST_EMAIL_KEY = 'desktopAuthLastEmail'
const LAST_METHOD_KEY = 'desktopAuthLastMethod'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function formatProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) {
    return null
  }

  switch (provider.toLowerCase()) {
    case 'email':
    case 'emailpassword':
    case 'password':
      return 'Email/password'
    case 'google':
      return 'Google'
    default:
      return provider
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
  }
}

function normalizeMethod(method: string | null): DesktopAuthMethod | null {
  if (method === 'password' || method === 'google') {
    return method
  }
  return null
}

export interface DesktopAuthPreferences {
  lastEmail: string | null
  lastMethod: DesktopAuthMethod | null
}

export interface DesktopAccountSummary {
  email: string | null
  userId: string | null
  currentMethodLabel: string | null
  linkedProviderLabels: string[]
}

export function loadDesktopAuthPreferences(): DesktopAuthPreferences {
  if (!canUseStorage()) {
    return {
      lastEmail: null,
      lastMethod: null,
    }
  }

  const lastEmail = window.localStorage.getItem(LAST_EMAIL_KEY)?.trim() || null
  const lastMethod = normalizeMethod(window.localStorage.getItem(LAST_METHOD_KEY))

  return {
    lastEmail,
    lastMethod,
  }
}

export function saveDesktopAuthPreferences(next: Partial<DesktopAuthPreferences>): void {
  if (!canUseStorage()) {
    return
  }

  if (next.lastEmail !== undefined) {
    if (next.lastEmail?.trim()) {
      window.localStorage.setItem(LAST_EMAIL_KEY, next.lastEmail.trim())
    } else {
      window.localStorage.removeItem(LAST_EMAIL_KEY)
    }
  }

  if (next.lastMethod !== undefined) {
    if (next.lastMethod) {
      window.localStorage.setItem(LAST_METHOD_KEY, next.lastMethod)
    } else {
      window.localStorage.removeItem(LAST_METHOD_KEY)
    }
  }
}

export function getDesktopAccountSummary(session: Session | null): DesktopAccountSummary {
  if (!session?.user) {
    return {
      email: null,
      userId: null,
      currentMethodLabel: null,
      linkedProviderLabels: [],
    }
  }

  const providers = new Set<string>()
  const currentProvider = typeof session.user.app_metadata?.provider === 'string'
    ? session.user.app_metadata.provider
    : null

  if (currentProvider) {
    providers.add(currentProvider)
  }

  const linkedProviders = session.user.app_metadata?.providers
  if (Array.isArray(linkedProviders)) {
    linkedProviders.forEach((provider) => {
      if (typeof provider === 'string' && provider.trim()) {
        providers.add(provider.trim())
      }
    })
  }

  const identities = session.user.identities
  if (Array.isArray(identities)) {
    identities.forEach((identity) => {
      if (identity?.provider) {
        providers.add(identity.provider)
      }
    })
  }

  return {
    email: session.user.email?.trim() || null,
    userId: session.user.id || null,
    currentMethodLabel: formatProviderLabel(currentProvider),
    linkedProviderLabels: [...providers].map((provider) => formatProviderLabel(provider)).filter((label): label is string => Boolean(label)),
  }
}

export function getLastMethodLabel(method: DesktopAuthMethod | null): string | null {
  switch (method) {
    case 'password':
      return 'Password'
    case 'google':
      return 'Google'
    default:
      return null
  }
}
