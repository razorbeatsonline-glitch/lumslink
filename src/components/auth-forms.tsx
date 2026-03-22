import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { ErrorBanner } from '@/components/ui-shell'
import { supabase } from '@/lib/supabase'

type AuthMode = 'signin' | 'signup'

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isSignIn = mode === 'signin'

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)

    if (!email || !password) {
      setError('Please enter email and password.')
      setBusy(false)
      return
    }

    if (isSignIn) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
      } else {
        await router.navigate({ to: '/' })
      }

      setBusy(false)
      return
    }

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signUpError) {
      setError(signUpError.message)
    } else {
      setMessage('Account created. If email confirmation is enabled, check your inbox before signing in.')
      await router.navigate({ to: '/' })
    }

    setBusy(false)
  }

  async function handleGoogleAuth() {
    setBusy(true)
    setError(null)

    const redirectTo = `${window.location.origin}/`
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })

    if (oauthError) {
      setError(oauthError.message)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBanner message={error} /> : null}
      {message ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p> : null}

      <button
        type="button"
        onClick={() => {
          void handleGoogleAuth()
        }}
        disabled={busy}
        className="flex w-full items-center justify-center rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-800 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Continue with Google
      </button>

      <div className="flex items-center gap-3 text-xs text-sky-500">
        <span className="h-px flex-1 bg-sky-200" />
        <span>or use email</span>
        <span className="h-px flex-1 bg-sky-200" />
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-sky-900">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-sky-900 outline-none transition placeholder:text-sky-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="you@lums.edu.pk"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-semibold text-sky-900">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-sky-900 outline-none transition placeholder:text-sky-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="At least 8 characters"
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Please wait...' : isSignIn ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="text-sm text-sky-700">
        {isSignIn ? 'New here?' : 'Already have an account?'}{' '}
        <Link to={isSignIn ? '/sign-up' : '/sign-in'} className="font-semibold text-sky-900 underline decoration-sky-300 underline-offset-4">
          {isSignIn ? 'Create one' : 'Sign in'}
        </Link>
      </p>
    </div>
  )
}
