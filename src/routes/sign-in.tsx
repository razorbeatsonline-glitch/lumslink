import { createFileRoute } from '@tanstack/react-router'

import { AuthForm } from '@/components/auth-forms'
import { AuthPageShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { PublicOnly } from '@/lib/route-guards'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <FullscreenLoader message="Checking your session..." />
  }

  return (
    <PublicOnly>
      <AuthPageShell title="Welcome back" subtitle="Sign in to continue your LumsLink session.">
        <AuthForm mode="signin" />
      </AuthPageShell>
    </PublicOnly>
  )
}
