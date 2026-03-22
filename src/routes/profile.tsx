import { createFileRoute } from '@tanstack/react-router'

import { ProfileCard } from '@/components/profile-card'
import { AppShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { AuthOnly } from '@/lib/route-guards'

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <FullscreenLoader message="Loading profile..." />
  }

  return (
    <AuthOnly>
      <AppShell title="Profile">
        <ProfileCard />
      </AppShell>
    </AuthOnly>
  )
}
