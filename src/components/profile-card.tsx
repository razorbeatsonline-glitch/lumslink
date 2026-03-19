import { useState } from 'react'

import { ErrorBanner } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

export function ProfileCard() {
  const { user, profile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function resetPassword() {
    if (!user?.email) {
      setError('No account email found for password reset.')
      return
    }

    setBusy(true)
    setNotice(null)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/sign-in`,
    })

    if (resetError) {
      setError(resetError.message)
    } else {
      setNotice('Password reset email sent. Check your inbox for next steps.')
    }

    setBusy(false)
  }

  const initials = (profile?.full_name ?? user?.email ?? 'L')
    .split(' ')
    .map((part) => part.trim().charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <section className="soft-card animate-fade-up overflow-hidden p-4 sm:p-8">
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {notice ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="Profile avatar" className="h-16 w-16 rounded-2xl object-cover shadow-sm sm:h-20 sm:w-20" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-100 text-xl font-bold text-sky-800 sm:h-20 sm:w-20 sm:text-2xl">{initials}</div>
        )}

        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-sky-950 sm:text-2xl">@{profile?.username ?? 'username'}</h2>
          <p className="text-sm text-sky-700">{profile?.email ?? user?.email ?? 'No email found'}</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-2.5 sm:mt-7 sm:grid-cols-2 sm:gap-3">
        <InfoRow label="Full name" value={profile?.full_name} />
        <InfoRow label="Class year" value={profile?.class_year} />
        <InfoRow label="Email" value={profile?.email ?? user?.email ?? null} />
        <InfoRow label="Onboarding" value={profile?.onboarding_completed ? 'Completed' : 'Not completed'} />
      </dl>

      <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4">
        <p className="mb-1 text-sm font-semibold text-sky-900">Bio</p>
        <p className="text-sm leading-relaxed text-sky-700">{profile?.bio || 'No bio added yet.'}</p>
      </div>

      <button
        type="button"
        onClick={() => {
          void resetPassword()
        }}
        disabled={busy}
        className="mt-6 rounded-2xl border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-sky-800 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Sending...' : 'Reset password'}
      </button>
    </section>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-white px-3.5 py-3 sm:px-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-sky-900">{value || 'Not set'}</dd>
    </div>
  )
}
