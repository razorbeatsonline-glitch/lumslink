import { Navigate } from '@tanstack/react-router'

import { useAuth } from '@/lib/auth-context'
import type { Profile } from '@/lib/profile'

function hasLegacyOnboardingData(profile: Profile) {
  const username = profile.username?.trim()
  const classYear = profile.class_year?.trim()

  return Boolean(username && classYear)
}

function shouldRequireOnboarding(profile: Profile | null) {
  if (!profile) {
    return true
  }

  if (profile.onboarding_completed === true) {
    return false
  }

  if (profile.onboarding_completed === false) {
    return true
  }

  return !hasLegacyOnboardingData(profile)
}

export function AuthRedirect() {
  const { status, profile } = useAuth()
  const requiresOnboarding = shouldRequireOnboarding(profile)

  if (status === 'loading') {
    return null
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/sign-in" />
  }

  if (requiresOnboarding) {
    return <Navigate to="/onboarding" />
  }

  return <Navigate to="/feed" />
}

export function AuthOnly({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth()
  const requiresOnboarding = shouldRequireOnboarding(profile)

  if (status === 'loading') {
    return null
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/sign-in" />
  }

  if (requiresOnboarding) {
    return <Navigate to="/onboarding" />
  }

  return children
}

export function OnboardingOnly({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth()
  const requiresOnboarding = shouldRequireOnboarding(profile)

  if (status === 'loading') {
    return null
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/sign-in" />
  }

  if (!requiresOnboarding) {
    return <Navigate to="/feed" />
  }

  return children
}

export function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status, profile } = useAuth()
  const requiresOnboarding = shouldRequireOnboarding(profile)

  if (status === 'loading') {
    return null
  }

  if (status === 'authenticated') {
    return <Navigate to={requiresOnboarding ? '/onboarding' : '/feed'} />
  }

  return children
}
