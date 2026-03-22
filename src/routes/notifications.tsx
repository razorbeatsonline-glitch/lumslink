import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { AuthOnly } from '@/lib/route-guards'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/notifications')({
  component: NotificationsPage,
})

type NotificationRow = {
  id: string
  user_id: string
  actor_id: string
  type: 'post_liked' | 'post_commented' | 'comment_replied' | 'mentioned_in_comment' | 'friend_request_received'
  post_id: string | null
  comment_id: string | null
  friend_request_id: string | null
  message: string | null
  is_read: boolean
  created_at: string
}

type ProfilePreview = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

type NotificationItem = NotificationRow & {
  actorProfile: ProfilePreview | null
}

function getRelativeTime(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'just now'

  const diffMs = Date.now() - parsed.getTime()
  if (diffMs < 45_000) return 'just now'

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) return `${Math.max(diffMinutes, 1)}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return parsed.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function displayName(profile: ProfilePreview | null) {
  if (!profile) return 'Community Member'
  return profile.full_name?.trim() || profile.username?.trim() || 'Community Member'
}

function displayHandle(profile: ProfilePreview | null) {
  return profile?.username?.trim() ? `@${profile.username.trim()}` : '@unknown'
}

function getInitials(profile: ProfilePreview | null) {
  const source = displayName(profile)
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function fallbackMessage(item: NotificationItem) {
  const actor = displayHandle(item.actorProfile)

  if (item.type === 'post_liked') return `${actor} liked your post.`
  if (item.type === 'post_commented') return `${actor} commented on your post.`
  if (item.type === 'comment_replied') return `${actor} replied to your comment.`
  if (item.type === 'mentioned_in_comment') return `${actor} mentioned you in a comment.`
  return `${actor} sent you a friend request.`
}

function NotificationsPage() {
  const { status, user } = useAuth()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [markingRead, setMarkingRead] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!user?.id) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const { data: notificationRows, error: notificationError } = await supabase
      .from('notifications')
      .select('id, user_id, actor_id, type, post_id, comment_id, friend_request_id, message, is_read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(80)

    if (notificationError) {
      console.error('Supabase notifications fetch error:', notificationError)
      setError('Unable to load notifications right now. Please try again.')
      setItems([])
      setLoading(false)
      return
    }

    const rows = (notificationRows ?? []) as NotificationRow[]
    const actorIds = Array.from(new Set(rows.map((row) => row.actor_id)))

    if (actorIds.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    const { data: actorProfiles, error: actorProfileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', actorIds)

    if (actorProfileError) {
      console.error('Supabase actor profile fetch error:', actorProfileError)
    }

    const actorProfileMap = new Map<string, ProfilePreview>((actorProfiles ?? []).map((row) => [row.id, row as ProfilePreview]))

    const hydratedItems: NotificationItem[] = rows.map((row) => ({
      ...row,
      actorProfile: actorProfileMap.get(row.actor_id) ?? null,
    }))

    setItems(hydratedItems)
    setLoading(false)

    const unreadIds = hydratedItems.filter((item) => !item.is_read).map((item) => item.id)
    if (unreadIds.length === 0) return

    setItems((previous) => previous.map((item) => ({ ...item, is_read: true })))

    const { error: markReadError } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds).eq('user_id', user.id)

    if (markReadError) {
      console.error('Supabase notifications mark-read error:', markReadError)
      return
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('lumslink:notifications-updated'))
    }
  }, [user?.id])

  const markAllAsRead = async () => {
    if (!user?.id || markingRead) return

    const unreadIds = items.filter((item) => !item.is_read).map((item) => item.id)
    if (unreadIds.length === 0) return

    setMarkingRead(true)
    setItems((previous) => previous.map((item) => ({ ...item, is_read: true })))

    const { error: markReadError } = await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds).eq('user_id', user.id)

    if (markReadError) {
      console.error('Supabase notifications mark-all-read error:', markReadError)
      setMarkingRead(false)
      return
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('lumslink:notifications-updated'))
    }

    setMarkingRead(false)
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    void loadNotifications()
  }, [loadNotifications, status])

  useEffect(() => {
    if (status !== 'authenticated') return
    const interval = window.setInterval(() => {
      void loadNotifications()
    }, 25000)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadNotifications, status])

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items])

  if (status === 'loading') {
    return <FullscreenLoader message="Loading notifications..." />
  }

  return (
    <AuthOnly>
      <AppShell title="Notifications">
        <section className="soft-card animate-fade-up notification-panel p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="friend-kicker">Notifications</p>
            {unreadCount > 0 ? <span className="friend-request-count-badge">{unreadCount}</span> : null}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <h2 className="text-2xl font-bold text-sky-950 sm:text-3xl">Your updates</h2>
            <button type="button" className="friend-secondary-button" onClick={() => void markAllAsRead()} disabled={markingRead || unreadCount === 0}>
              {markingRead ? 'Marking...' : 'Mark all read'}
            </button>
          </div>

          <p className="mt-2 text-sm text-sky-700">See likes, comments, replies, mentions, and incoming friend requests.</p>

          {loading ? (
            <div className="mt-4 grid gap-3 sm:mt-5">
              <div className="friend-request-skeleton shimmer" />
              <div className="friend-request-skeleton shimmer" />
              <div className="friend-request-skeleton shimmer" />
            </div>
          ) : null}

          {!loading && error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-sm font-semibold text-rose-700">{error}</p>
              <button type="button" className="friend-secondary-button mt-3" onClick={() => void loadNotifications()}>
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !error && items.length === 0 ? (
            <div className="notification-empty-state mt-4 sm:mt-5">
              <p className="text-sm font-semibold text-sky-900">No notifications yet</p>
              <p className="mt-1 text-xs text-sky-700">When people interact with your posts or profile, updates will appear here.</p>
              <Link to="/feed" className="friend-primary-button mt-3 inline-flex">
                Open Feed
              </Link>
            </div>
          ) : null}

          {!loading && !error && items.length > 0 ? (
            <div className="mt-4 grid gap-2.5 sm:mt-5">
              {items.map((item) => (
                <article key={item.id} className={`notification-card ${item.is_read ? '' : 'notification-card-unread'}`}>
                  <div className="flex items-start gap-3">
                    {item.actorProfile?.avatar_url ? (
                      <span className="friend-avatar h-11 w-11">
                        <img src={item.actorProfile.avatar_url} alt={displayName(item.actorProfile)} className="h-full w-full rounded-full object-cover" />
                      </span>
                    ) : (
                      <span className="friend-avatar friend-avatar-fallback h-11 w-11">{getInitials(item.actorProfile) || 'U'}</span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <p className="truncate text-sm font-bold text-sky-950">{displayName(item.actorProfile)}</p>
                        <span className="text-xs font-semibold text-sky-700">{displayHandle(item.actorProfile)}</span>
                        <span className="text-xs text-sky-500">{getRelativeTime(item.created_at)}</span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-sky-800">{item.message?.trim() || fallbackMessage(item)}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </AppShell>
    </AuthOnly>
  )
}
