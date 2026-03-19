import { createFileRoute } from '@tanstack/react-router'

import { OnboardingFlow } from '@/components/onboarding'
import { FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { OnboardingOnly } from '@/lib/route-guards'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  const { status } = useAuth()

  if (status === 'loading') {
    return <FullscreenLoader message="Loading onboarding..." />
  }

  return (
    <OnboardingOnly>
      <OnboardingFlow />
    </OnboardingOnly>
  )
}
