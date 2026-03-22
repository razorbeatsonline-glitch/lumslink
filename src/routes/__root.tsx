import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { AuthProvider } from '@/lib/auth-context'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'LumsLink | Social for LUMS',
      },
      {
        name: 'description',
        content: 'LumsLink is a social platform for LUMS students with thoughtful onboarding and profile-first identity setup.',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Scripts />
      </body>
    </html>
  )
}
