import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfig } from './supabase'

export interface SupabaseSessionState {
  session: Session | null
  loading: boolean
  error: string | null
  sendOtp: (email: string) => Promise<void>
  verifyOtp: (email: string, code: string) => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
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

  const sendOtp = useCallback(async (email: string) => {
    if (!supabase) {
      throw new Error('Supabase client is not configured')
    }

    const trimmed = email.trim()
    if (!trimmed) {
      throw new Error('Email address is required')
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
      },
    })

    if (otpError) {
      throw otpError
    }
  }, [])

  const verifyOtp = useCallback(async (email: string, code: string) => {
    if (!supabase) {
      throw new Error('Supabase client is not configured')
    }

    const trimmedEmail = email.trim()
    const trimmedCode = code.trim()
    if (!trimmedEmail) {
      throw new Error('Email address is required')
    }
    if (!trimmedCode) {
      throw new Error('OTP code is required')
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedCode,
      type: 'email',
    })
    if (verifyError) {
      throw verifyError
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

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      throw new Error('Supabase client is not configured')
    }

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()
    if (!trimmedEmail) {
      throw new Error('Email address is required')
    }
    if (!trimmedPassword) {
      throw new Error('Password is required')
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword,
    })
    if (signInError) {
      throw signInError
    }
  }, [])

  return {
    session,
    loading,
    error,
    sendOtp,
    verifyOtp,
    signInWithPassword,
    signOut,
    configured: supabaseConfig.ready,
  }
}
