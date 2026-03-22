import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { ensureProfile, type Profile } from './profile'
import { supabase } from './supabase'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

type AuthContextValue = {
  status: AuthStatus
  session: Session | null
  user: User | null
  profile: Profile | null
  error: string | null
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchUserProfile(user: User | null) {
  if (!user) {
    return { profile: null as Profile | null, error: null as string | null }
  }

  const { data, error } = await ensureProfile(user)

  if (error) {
    return { profile: null, error: error.message }
  }

  return { profile: data, error: null }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshProfile = useCallback(async () => {
    if (!user) return

    const next = await fetchUserProfile(user)
    setProfile(next.profile)
    setError(next.error)
  }, [user])

  useEffect(() => {
    let isMounted = true

    async function syncAuthState(nextSession: Session | null, { setLoading }: { setLoading: boolean }) {
      if (!isMounted) return

      setSession(nextSession)
      const nextUser = nextSession?.user ?? null
      setUser(nextUser)

      if (!nextUser) {
        setProfile(null)
        setError(null)
        setStatus('unauthenticated')
        return
      }

      if (setLoading) {
        setStatus('loading')
      }

      try {
        const profileResult = await fetchUserProfile(nextUser)
        if (!isMounted) return

        setProfile(profileResult.profile)
        setError(profileResult.error)
      } catch (err: unknown) {
        if (!isMounted) return
        setProfile(null)
        setError(err instanceof Error ? err.message : 'Failed to load your profile.')
      }

      if (!isMounted) return
      setStatus('authenticated')
    }

    async function initialize() {
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (!isMounted) return

      if (sessionError) {
        setError(sessionError.message)
      }

      await syncAuthState(data.session, { setLoading: false })
    }

    initialize().catch((err: unknown) => {
      if (!isMounted) return
      setError(err instanceof Error ? err.message : 'Failed to initialize authentication.')
      setStatus('unauthenticated')
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Avoid awaiting Supabase queries directly inside auth state callbacks.
      // Supabase can dead-lock when additional client calls are awaited here.
      setTimeout(() => {
        void syncAuthState(nextSession, { setLoading: true })
      }, 0)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user,
      profile,
      error,
      refreshProfile,
      signOut,
    }),
    [error, profile, refreshProfile, session, signOut, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.')
  }

  return context
}
