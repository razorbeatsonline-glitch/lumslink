import { createFileRoute } from '@tanstack/react-router'

import { FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { AuthRedirect } from '@/lib/route-guards'

export const Route = createFileRoute('/')({
  component: IndexRoute,
})

function IndexRoute() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <FullscreenLoader message="Preparing your account..." />
  }

  return <AuthRedirect />
}
