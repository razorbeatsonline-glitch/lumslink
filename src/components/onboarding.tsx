import { useRouter } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { ErrorBanner } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { completeOnboarding, isUsernameAvailable } from '@/lib/profile'

type Step = 0 | 1 | 2 | 3 | 4 | 5

const CLASS_YEAR_OPTIONS = ['Class of 28', 'Class of 29', 'Class of 30', 'Class of 31', 'Class of 32']

function Card({ children }: { children: React.ReactNode }) {
  return <div className="soft-card animate-fade-up w-full max-w-2xl p-6 sm:p-10">{children}</div>
}

export function OnboardingFlow() {
  const router = useRouter()
  const { user, profile, refreshProfile } = useAuth()

  const [step, setStep] = useState<Step>(0)
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [classYear, setClassYear] = useState(profile?.class_year ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available'>('idle')

  const trimmedUsername = useMemo(() => username.trim(), [username])

  async function checkUsername() {
    if (!user) return false

    if (!trimmedUsername) {
      setError('Please choose a username.')
      return false
    }

    setUsernameState('checking')
    const { available, error: availabilityError } = await isUsernameAvailable(trimmedUsername, user.id)

    if (availabilityError) {
      setError(availabilityError.message)
      setUsernameState('idle')
      return false
    }

    if (!available) {
      setError('That username is already taken. Try another one.')
      setUsernameState('idle')
      return false
    }

    setUsernameState('available')
    return true
  }

  async function next() {
    setError(null)

    if (step === 1 && !fullName.trim()) {
      setError('Please add your full name.')
      return
    }

    if (step === 2) {
      const ok = await checkUsername()
      if (!ok) return
    }

    if (step === 3 && !classYear) {
      setError('Please select your class year.')
      return
    }

    setStep((prev) => (prev < 5 ? ((prev + 1) as Step) : prev))
  }

  function back() {
    setError(null)
    setStep((prev) => (prev > 0 ? ((prev - 1) as Step) : prev))
  }

  async function finish() {
    if (!user) return

    setBusy(true)
    setError(null)

    const finalCheck = await checkUsername()
    if (!finalCheck) {
      setBusy(false)
      return
    }

    const avatarFromMetadata =
      typeof user.user_metadata?.avatar_url === 'string'
        ? user.user_metadata.avatar_url
        : typeof user.user_metadata?.picture === 'string'
          ? user.user_metadata.picture
          : null

    const { error: saveError } = await completeOnboarding(user.id, {
      email: user.email ?? null,
      full_name: fullName.trim(),
      username: trimmedUsername,
      class_year: classYear,
      bio: bio.trim() ? bio.trim() : null,
      avatar_url: profile?.avatar_url ?? avatarFromMetadata,
    })

    if (saveError) {
      setError(saveError.message)
      setBusy(false)
      return
    }

    await refreshProfile()
    await router.navigate({ to: '/feed' })
    setBusy(false)
  }

  return (
    <main className="page-bg relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-8">
      <div className="orb orb-left" />
      <div className="orb orb-right" />
      {step === 0 ? (
        <Card>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Welcome</p>
          <h1 className="text-3xl font-bold text-sky-950 sm:text-4xl">A social space that feels like your own corner 🌤️</h1>
          <p className="mt-4 text-sky-700">
            A tiny setup and everything is ready. It only takes a minute to personalize your profile and jump in.
          </p>
          <button
            type="button"
            onClick={() => {
              void next()
            }}
            className="mt-8 rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
          >
            Let&apos;s begin
          </button>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Step 1 of 4</p>
          <h2 className="mt-2 text-2xl font-bold text-sky-950">What should this profile call you?</h2>
          <p className="mt-2 text-sm text-sky-700">Don&apos;t worry, this is a secret 🤫</p>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="mt-5 w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-base text-sky-900 outline-none transition placeholder:text-sky-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="Full name"
          />
          <StepActions onBack={back} onNext={next} />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Step 2 of 4</p>
          <h2 className="mt-2 text-2xl font-bold text-sky-950">Choose a username</h2>
          <p className="mt-2 text-sm text-sky-700">This is how people discover your profile.</p>
          <input
            type="text"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value.toLowerCase().replace(/\s+/g, ''))
              setUsernameState('idle')
            }}
            className="mt-5 w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 text-base text-sky-900 outline-none transition placeholder:text-sky-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="username"
          />
          {usernameState === 'checking' ? <p className="mt-2 text-xs text-sky-600">Checking username availability...</p> : null}
          {usernameState === 'available' ? <p className="mt-2 text-xs text-emerald-700">Username looks great.</p> : null}
          <StepActions onBack={back} onNext={next} />
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Step 3 of 4</p>
          <h2 className="mt-2 text-2xl font-bold text-sky-950">Pick your class year</h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CLASS_YEAR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setClassYear(option)}
                className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                  classYear === option
                    ? 'border-sky-500 bg-sky-100 text-sky-900'
                    : 'border-sky-200 bg-white text-sky-700 hover:border-sky-300'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <StepActions onBack={back} onNext={next} />
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">Step 4 of 4</p>
          <h2 className="mt-2 text-2xl font-bold text-sky-950">Add a short bio (optional)</h2>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            rows={5}
            className="mt-5 w-full resize-none rounded-2xl border border-sky-200 bg-white px-4 py-3 text-base text-sky-900 outline-none transition placeholder:text-sky-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
            placeholder="A line or two about your vibe on campus"
          />
          <StepActions onBack={back} onNext={next} />
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-600">You&apos;re all set</p>
          <h2 className="mt-2 text-3xl font-bold text-sky-950">Profile complete. Let&apos;s get social ✨</h2>
          <p className="mt-3 text-sky-700">Everything has been saved. Tap below and jump straight into the app.</p>
          <button
            type="button"
            onClick={() => {
              void finish()
            }}
            disabled={busy}
            className="mt-8 rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Finishing...' : 'Enter the app'}
          </button>
          <button
            type="button"
            onClick={back}
            disabled={busy}
            className="ml-3 rounded-2xl border border-sky-200 bg-white px-6 py-3 text-sm font-semibold text-sky-700 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Back
          </button>
        </Card>
      ) : null}

      {error ? <div className="fixed bottom-6 left-1/2 z-20 w-[min(90vw,44rem)] -translate-x-1/2"><ErrorBanner message={error} /></div> : null}
    </main>
  )
}

function StepActions({ onBack, onNext }: { onBack: () => void; onNext: () => void | Promise<void> }) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="rounded-2xl border border-sky-200 bg-white px-5 py-3 text-sm font-semibold text-sky-700 transition hover:border-sky-300"
      >
        Back
      </button>
      <button
        type="button"
        onClick={() => {
          void onNext()
        }}
        className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        Continue
      </button>
    </div>
  )
}
