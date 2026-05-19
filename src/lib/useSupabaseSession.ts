import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfig } from './supabase'

export interface SupabaseSessionState {
  session: Session | null
  loading: boolean
  error: string | null
  sendMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  configured: boolean
}

export function useSupabaseSession(): SupabaseSessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabaseConfig.ready))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return
      if (sessionError) {
        setError(sessionError.message)
      }
      setSession(data.session)
      setLoading(false)
    }).catch((err: unknown) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return
      setSession(nextSession)
      setError(null)
      setLoading(false)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase client is not configured')
    }

    const trimmed = email.trim()
    if (!trimmed) {
      throw new Error('Email address is required')
    }

    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}`
      : undefined

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    })

    if (otpError) {
      throw otpError
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) {
      return
    }

    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      throw signOutError
    }
  }, [])

  return {
    session,
    loading,
    error,
    sendMagicLink,
    signOut,
    configured: supabaseConfig.ready,
  }
}
