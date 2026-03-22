import { useCallback, useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'

import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'

type NavIconName = 'feed' | 'messages' | 'requests' | 'notifications' | 'profile'

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  const stroke = active ? '#0f5f95' : '#4c7fa6'
  const fill = active ? 'rgba(49, 157, 233, 0.22)' : 'none'

  if (name === 'feed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mobile-nav-icon" style={{ color: stroke }}>
        <path d="M3 10.3 12 3l9 7.3V20a1 1 0 0 1-1 1h-5.5v-5.5h-5V21H4a1 1 0 0 1-1-1v-9.7Z" fill={fill} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'messages') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mobile-nav-icon" style={{ color: stroke }}>
        <path d="M5 4h14a2 2 0 0 1 2 2v9.3a2 2 0 0 1-2 2H9l-5 4.2V6a2 2 0 0 1 2-2Z" fill={fill} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      </svg>
    )
  }

  if (name === 'requests') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mobile-nav-icon" style={{ color: stroke }}>
        <path d="M12 4.1c3.58 0 6.1 2.1 6.1 5.2 0 3.13-2.52 5.24-6.1 5.24-3.6 0-6.1-2.1-6.1-5.23 0-3.1 2.5-5.2 6.1-5.2Z" fill={fill} stroke="currentColor" strokeWidth="1.7" />
        <path d="M4 20c1.4-2.3 4.5-3.7 8-3.7s6.6 1.4 8 3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'notifications') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="mobile-nav-icon" style={{ color: stroke }}>
        <path
          d="M12 3.3c-2.9 0-5.2 2.35-5.2 5.24v2.38c0 1.15-.42 2.26-1.2 3.13l-.88 1.02c-.36.42-.06 1.08.5 1.08h13.6c.56 0 .86-.66.5-1.08l-.88-1.02a4.73 4.73 0 0 1-1.2-3.13V8.54c0-2.9-2.32-5.24-5.24-5.24Z"
          fill={fill}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M9.2 18.3c.46 1.38 1.42 2.05 2.8 2.05 1.38 0 2.34-.67 2.8-2.05" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="mobile-nav-icon" style={{ color: stroke }}>
      <circle cx="12" cy="8.4" r="3.8" fill={fill} stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 20c1-2.95 3.8-5 7-5s6 2.05 7 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function NavItem({
  to,
  label,
  icon,
  badgeCount = 0,
}: {
  to: '/feed' | '/messages' | '/requests' | '/notifications' | '/profile'
  label: string
  icon: NavIconName
  badgeCount?: number
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const active =
    to === '/messages'
      ? pathname === '/messages'
      : to === '/requests'
        ? pathname === '/requests' || pathname === '/add-friends'
        : to === '/notifications'
          ? pathname === '/notifications'
        : pathname === to

  return (
    <Link to={to} className={`mobile-nav-item ${active ? 'mobile-nav-item-active' : ''}`} activeProps={{ className: 'mobile-nav-item mobile-nav-item-active' }}>
      <span className="mobile-nav-icon-wrap">
        <NavIcon name={icon} active={active} />
        {badgeCount > 0 ? <span className="mobile-nav-badge">{badgeCount > 99 ? '99+' : badgeCount}</span> : null}
      </span>
      <span className="mobile-nav-label">{label}</span>
    </Link>
  )
}

export function FullscreenLoader({ message = 'Loading your space...' }: { message?: string }) {
  return (
    <main className="page-bg flex min-h-screen items-center justify-center px-6">
      <div className="soft-card animate-fade-up w-full max-w-md p-8 text-center">
        <div className="pulse-dot mx-auto mb-4" />
        <p className="text-sm font-semibold tracking-wide text-sky-700">{message}</p>
      </div>
    </main>
  )
}

export function AuthPageShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="page-bg relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="orb orb-left" />
      <div className="orb orb-right" />
      <div className="soft-card animate-fade-up z-10 w-full max-w-xl p-7 sm:p-9">
        <p className="mb-2 inline-flex rounded-full border border-sky-200/80 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
          LumsLink
        </p>
        <h1 className="text-3xl font-bold text-sky-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-sky-700 sm:text-base">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </div>
    </main>
  )
}

export function AppShell({
  title,
  children,
  mobileImmersive = false,
}: {
  title: string
  children: React.ReactNode
  mobileImmersive?: boolean
}) {
  const { signOut, user } = useAuth()
  const [pendingIncomingCount, setPendingIncomingCount] = useState(0)
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0)

  const loadPendingIncomingCount = useCallback(async () => {
    if (!user?.id) {
      setPendingIncomingCount(0)
      return
    }

    const { count, error } = await supabase
      .from('friend_requests')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    if (error) {
      console.error('Supabase pending friend request count fetch error:', error)
      return
    }

    setPendingIncomingCount(count ?? 0)
  }, [user?.id])

  const loadUnreadNotificationsCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadNotificationsCount(0)
      return
    }

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) {
      console.error('Supabase unread notification count fetch error:', error)
      return
    }

    setUnreadNotificationsCount(count ?? 0)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      setPendingIncomingCount(0)
      setUnreadNotificationsCount(0)
      return
    }

    void Promise.all([loadPendingIncomingCount(), loadUnreadNotificationsCount()])

    const interval = window.setInterval(() => {
      void Promise.all([loadPendingIncomingCount(), loadUnreadNotificationsCount()])
    }, 25000)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadPendingIncomingCount, loadUnreadNotificationsCount, user?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const refreshBadge = () => {
      void loadPendingIncomingCount()
    }
    window.addEventListener('lumslink:friend-requests-updated', refreshBadge)
    return () => {
      window.removeEventListener('lumslink:friend-requests-updated', refreshBadge)
    }
  }, [loadPendingIncomingCount])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const refreshBadge = () => {
      void loadUnreadNotificationsCount()
    }
    window.addEventListener('lumslink:notifications-updated', refreshBadge)
    return () => {
      window.removeEventListener('lumslink:notifications-updated', refreshBadge)
    }
  }, [loadUnreadNotificationsCount])

  return (
    <main className={`page-bg min-h-dvh px-2.5 pb-24 pt-2.5 sm:min-h-screen sm:px-6 sm:pb-8 sm:pt-7 lg:px-8 ${mobileImmersive ? 'app-shell-mobile-immersive' : ''}`}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:gap-5">
        <header className={`soft-card animate-fade-up app-topbar px-3.5 py-2.5 sm:px-5 sm:py-4 ${mobileImmersive ? 'app-shell-mobile-topbar-hidden' : ''}`}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.17em] text-sky-600 sm:text-xs">LumsLink</p>
              <h1 className="truncate text-base font-semibold text-sky-950 sm:text-xl">{title}</h1>
            </div>
            <button
              type="button"
              onClick={() => {
                void signOut()
              }}
              className="rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 transition hover:border-sky-300 hover:text-sky-900 sm:px-4 sm:text-sm"
            >
              Sign out
            </button>
          </div>

          <nav className="mt-2 hidden items-center gap-2 sm:flex">
            <NavItem to="/feed" label="Feed" icon="feed" />
            <NavItem to="/messages" label="Messages" icon="messages" />
            <NavItem to="/requests" label="Requests" icon="requests" badgeCount={pendingIncomingCount} />
            <NavItem to="/notifications" label="Alerts" icon="notifications" badgeCount={unreadNotificationsCount} />
            <NavItem to="/profile" label="Profile" icon="profile" />
          </nav>
        </header>

        {children}
      </div>

      {!mobileImmersive ? (
        <nav className="mobile-bottom-nav sm:hidden" aria-label="Primary">
          <NavItem to="/feed" label="Feed" icon="feed" />
          <NavItem to="/messages" label="Messages" icon="messages" />
          <NavItem to="/requests" label="Requests" icon="requests" badgeCount={pendingIncomingCount} />
          <NavItem to="/notifications" label="Alerts" icon="notifications" badgeCount={unreadNotificationsCount} />
          <NavItem to="/profile" label="Profile" icon="profile" />
        </nav>
      ) : null}
    </main>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{message}</div>
}
