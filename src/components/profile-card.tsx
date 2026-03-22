import { useEffect, useMemo, useState } from 'react'

import { ErrorBanner } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { getAvatarAcceptAttribute, uploadAvatarForUser, validateAvatarFile } from '@/lib/avatar-upload'
import { supabase } from '@/lib/supabase'

export function ProfileCard() {
  const { user, profile, refreshProfile } = useAuth()
  const [busy, setBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null)
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
  const avatarPreview = useMemo(() => avatarPreviewUrl ?? profile?.avatar_url ?? null, [avatarPreviewUrl, profile?.avatar_url])

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
    }
  }, [avatarPreviewUrl])

  function handleAvatarFile(file: File | null) {
    setError(null)
    setNotice(null)

    if (!file) {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl)
      }
      setAvatarPreviewUrl(null)
      setAvatarFile(null)
      return
    }

    const validationError = validateAvatarFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
    }

    setAvatarFile(file)
    setAvatarPreviewUrl(URL.createObjectURL(file))
  }

  async function saveAvatar() {
    if (!user?.id || !avatarFile) return

    setAvatarBusy(true)
    setError(null)
    setNotice(null)

    const result = await uploadAvatarForUser(user.id, avatarFile)
    if (result.errorMessage) {
      setError(result.errorMessage)
      setAvatarBusy(false)
      return
    }

    await refreshProfile()
    setAvatarFile(null)
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl)
      setAvatarPreviewUrl(null)
    }
    setNotice('Profile picture updated.')
    setAvatarBusy(false)
  }

  return (
    <section className="soft-card animate-fade-up overflow-hidden p-4 sm:p-8">
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}
      {notice ? <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        {avatarPreview ? (
          <img src={avatarPreview} alt="Profile avatar" className="h-16 w-16 rounded-2xl object-cover shadow-sm sm:h-20 sm:w-20" />
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
      </dl>

      <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4">
        <p className="mb-1 text-sm font-semibold text-sky-900">Bio</p>
        <p className="text-sm leading-relaxed text-sky-700">{profile?.bio || 'No bio added yet.'}</p>
      </div>

      <div className="mt-5 rounded-3xl border border-sky-100 bg-white/90 p-4 sm:p-5">
        <p className="text-sm font-semibold text-sky-900">Profile picture</p>
        <p className="mt-1 text-xs text-sky-600">Upload a photo so people recognize you across the app.</p>

        <label className="mt-4 block cursor-pointer rounded-3xl border border-dashed border-sky-300 bg-sky-50/70 p-4 transition hover:border-sky-400 hover:bg-sky-50">
          <input
            type="file"
            accept={getAvatarAcceptAttribute()}
            onChange={(event) => {
              handleAvatarFile(event.target.files?.[0] ?? null)
              event.currentTarget.value = ''
            }}
            className="sr-only"
            disabled={avatarBusy}
          />
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-full border border-sky-200 bg-white shadow-sm">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-sky-500">Photo</div>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-sky-900">{avatarFile || !profile?.avatar_url ? 'Tap to upload' : 'Tap to replace'}</p>
              <p className="text-xs text-sky-600">JPG, PNG, or WEBP up to 5MB</p>
            </div>
          </div>
        </label>

        {avatarFile ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void saveAvatar()
              }}
              disabled={avatarBusy}
              className="rounded-2xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {avatarBusy ? 'Saving...' : 'Save photo'}
            </button>
            <button
              type="button"
              onClick={() => handleAvatarFile(null)}
              disabled={avatarBusy}
              className="rounded-2xl border border-sky-200 bg-white px-4 py-2.5 text-xs font-semibold text-sky-700 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        ) : null}
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
