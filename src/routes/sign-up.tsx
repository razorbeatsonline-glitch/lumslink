import { createFileRoute } from '@tanstack/react-router'

import { AuthForm } from '@/components/auth-forms'
import { AuthPageShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { PublicOnly } from '@/lib/route-guards'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <FullscreenLoader message="Checking your session..." />
  }

  return (
    <PublicOnly>
      <AuthPageShell title="Create your account" subtitle="Start with email/password or continue with Google.">
        <AuthForm mode="signup" />
      </AuthPageShell>
    </PublicOnly>
  )
}
