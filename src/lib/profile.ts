import type { User } from '@supabase/supabase-js'

import { supabase } from './supabase'

export type Profile = {
  id: string
  email: string | null
  full_name: string | null
  username: string | null
  class_year: string | null
  bio: string | null
  avatar_url: string | null
  onboarding_completed: boolean | null
  updated_at: string | null
}

function getUserMetadata(user: User) {
  const metadata = user.user_metadata ?? {}
  const fullName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null
  const avatarUrl =
    typeof metadata.avatar_url === 'string'
      ? metadata.avatar_url
      : typeof metadata.picture === 'string'
        ? metadata.picture
        : null

  return { fullName, avatarUrl }
}

export async function getProfileById(userId: string) {
  return supabase.from('profiles').select('*').eq('id', userId).maybeSingle<Profile>()
}

export async function ensureProfile(user: User) {
  const existing = await getProfileById(user.id)

  if (existing.error) {
    return { data: null, error: existing.error }
  }

  if (existing.data) {
    return existing
  }

  const metadata = getUserMetadata(user)

  const created = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name: metadata.fullName,
        avatar_url: metadata.avatarUrl,
        onboarding_completed: false,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
      },
    )
    .select('*')
    .single<Profile>()

  return created
}

export async function isUsernameAvailable(username: string, userId: string) {
  const trimmed = username.trim()
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', trimmed)
    .neq('id', userId)
    .limit(1)

  if (error) {
    return { available: false, error }
  }

  return { available: (data?.length ?? 0) === 0, error: null }
}

export type CompleteOnboardingInput = {
  email: string | null
  full_name: string
  username: string
  class_year: string
  bio: string | null
  avatar_url: string | null
}

export async function completeOnboarding(userId: string, input: CompleteOnboardingInput) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: input.email,
        full_name: input.full_name,
        username: input.username,
        class_year: input.class_year,
        bio: input.bio,
        avatar_url: input.avatar_url,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('*')
    .single<Profile>()

  return { data, error }
}
