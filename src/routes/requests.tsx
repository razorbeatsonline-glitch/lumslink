import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { AuthOnly } from '@/lib/route-guards'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/requests')({
  component: RequestsPage,
})

type ProfilePreview = {
  id: string
  username: string | null
  full_name: string | null
  class_year: string | null
  bio: string | null
  avatar_url: string | null
}

type FriendRequestRow = {
  id: string
  sender_id: string
  receiver_id: string
  status: string
  created_at: string
}

type IncomingRequestItem = {
  requestId: string
  senderId: string
  senderProfile: ProfilePreview | null
  createdAt: string
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

function sortIds(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

function getNotificationDismissedStorageKey(userId: string) {
  return `lumslink:friend-request-dismissed:${userId}`
}

function RequestsPage() {
  const { status, user } = useAuth()

  const [incomingRequests, setIncomingRequests] = useState<IncomingRequestItem[]>([])
  const [isIncomingLoading, setIsIncomingLoading] = useState(false)
  const [requestActionError, setRequestActionError] = useState<string | null>(null)
  const [pendingRequestActionById, setPendingRequestActionById] = useState<Record<string, boolean>>({})
  const [notificationRequests, setNotificationRequests] = useState<IncomingRequestItem[]>([])
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([])
  const surfacedNotificationIdsRef = useRef<Set<string>>(new Set())

  const loadIncomingRequests = useCallback(async () => {
    if (!user?.id) {
      setIncomingRequests([])
      return
    }

    setIsIncomingLoading(true)
    setRequestActionError(null)
    const { data: requestRows, error: requestError } = await supabase
      .from('friend_requests')
      .select('id, sender_id, receiver_id, status, created_at')
      .eq('receiver_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (requestError) {
      console.error('Supabase incoming requests fetch error:', requestError)
      setRequestActionError('Unable to load incoming requests right now.')
      setIncomingRequests([])
      setIsIncomingLoading(false)
      return
    }

    const incomingRows = (requestRows ?? []) as FriendRequestRow[]
    if (incomingRows.length === 0) {
      setIncomingRequests([])
      setIsIncomingLoading(false)
      return
    }

    const senderIds = Array.from(new Set(incomingRows.map((row) => row.sender_id)))
    const { data: senderProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, class_year, bio, avatar_url')
      .in('id', senderIds)

    if (profileError) {
      console.error('Supabase incoming-request profiles fetch error:', profileError)
    }

    const profileMap = new Map<string, ProfilePreview>((senderProfiles ?? []).map((item) => [item.id, item as ProfilePreview]))
    setIncomingRequests(
      incomingRows.map((row) => ({
        requestId: row.id,
        senderId: row.sender_id,
        senderProfile: profileMap.get(row.sender_id) ?? null,
        createdAt: row.created_at,
      })),
    )
    setIsIncomingLoading(false)
  }, [user?.id])

  const dismissNotification = useCallback(
    (requestId: string) => {
      setNotificationRequests((prev) => prev.filter((item) => item.requestId !== requestId))
      setDismissedNotificationIds((prev) => {
        if (prev.includes(requestId)) return prev
        const next = [...prev, requestId]
        if (user?.id && typeof window !== 'undefined') {
          window.sessionStorage.setItem(getNotificationDismissedStorageKey(user.id), JSON.stringify(next))
        }
        return next
      })
    },
    [user?.id],
  )

  const broadcastPendingCountUpdate = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('lumslink:friend-requests-updated'))
    }
  }

  const handleAcceptRequest = async (request: IncomingRequestItem) => {
    if (!user?.id) return
    setRequestActionError(null)
    setPendingRequestActionById((prev) => ({ ...prev, [request.requestId]: true }))

    const previousIncoming = incomingRequests
    setIncomingRequests((prev) => prev.filter((item) => item.requestId !== request.requestId))
    setNotificationRequests((prev) => prev.filter((item) => item.requestId !== request.requestId))

    const { error: updateError } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', request.requestId)
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    if (updateError) {
      console.error('Supabase friend request accept update error:', updateError)
      setRequestActionError('Unable to accept friend request right now.')
      setIncomingRequests(previousIncoming)
      setPendingRequestActionById((prev) => ({ ...prev, [request.requestId]: false }))
      return
    }

    const [userOneId, userTwoId] = sortIds(user.id, request.senderId)
    const { error: friendshipInsertError } = await supabase.from('friendships').insert({
      user_one_id: userOneId,
      user_two_id: userTwoId,
    })

    if (friendshipInsertError && friendshipInsertError.code !== '23505') {
      console.error('Supabase friendship insert error:', friendshipInsertError)
      setRequestActionError('Request was accepted, but friendship sync failed. Please refresh.')
    }

    setPendingRequestActionById((prev) => ({ ...prev, [request.requestId]: false }))
    broadcastPendingCountUpdate()
    await loadIncomingRequests()
  }

  const handleDeclineRequest = async (request: IncomingRequestItem) => {
    if (!user?.id) return
    setRequestActionError(null)
    setPendingRequestActionById((prev) => ({ ...prev, [request.requestId]: true }))

    const previousIncoming = incomingRequests
    setIncomingRequests((prev) => prev.filter((item) => item.requestId !== request.requestId))
    setNotificationRequests((prev) => prev.filter((item) => item.requestId !== request.requestId))

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'declined' })
      .eq('id', request.requestId)
      .eq('receiver_id', user.id)
      .eq('status', 'pending')

    if (error) {
      console.error('Supabase friend request decline error:', error)
      setRequestActionError('Unable to decline request right now.')
      setIncomingRequests(previousIncoming)
    }

    setPendingRequestActionById((prev) => ({ ...prev, [request.requestId]: false }))
    broadcastPendingCountUpdate()
    await loadIncomingRequests()
  }

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return
    void loadIncomingRequests()
  }, [loadIncomingRequests, status, user?.id])

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') {
      setDismissedNotificationIds([])
      return
    }
    const raw = window.sessionStorage.getItem(getNotificationDismissedStorageKey(user.id))
    if (!raw) {
      setDismissedNotificationIds([])
      return
    }
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setDismissedNotificationIds(parsed.filter((item): item is string => typeof item === 'string'))
      } else {
        setDismissedNotificationIds([])
      }
    } catch {
      setDismissedNotificationIds([])
    }
  }, [user?.id])

  useEffect(() => {
    surfacedNotificationIdsRef.current = new Set()
    setNotificationRequests([])
  }, [user?.id])

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return
    const interval = window.setInterval(() => {
      void loadIncomingRequests()
    }, 20000)
    return () => window.clearInterval(interval)
  }, [loadIncomingRequests, status, user?.id])

  useEffect(() => {
    setNotificationRequests((previous) => {
      const pendingById = new Map(incomingRequests.map((request) => [request.requestId, request]))
      const merged = previous
        .filter((item) => pendingById.has(item.requestId) && !dismissedNotificationIds.includes(item.requestId))
        .map((item) => pendingById.get(item.requestId) ?? item)

      const existingIds = new Set(merged.map((item) => item.requestId))
      for (const request of incomingRequests) {
        if (dismissedNotificationIds.includes(request.requestId)) continue
        if (existingIds.has(request.requestId)) continue
        if (surfacedNotificationIdsRef.current.has(request.requestId)) continue
        surfacedNotificationIdsRef.current.add(request.requestId)
        merged.unshift(request)
      }

      return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    })
  }, [dismissedNotificationIds, incomingRequests])

  const visibleNotifications = useMemo(() => notificationRequests.slice(0, 3), [notificationRequests])

  if (status === 'loading') {
    return <FullscreenLoader message="Loading requests..." />
  }

  const renderAvatar = (profileData: ProfilePreview | null, sizeClass = 'h-14 w-14') => {
    if (profileData?.avatar_url) {
      return (
        <span className={`friend-avatar ${sizeClass}`}>
          <img src={profileData.avatar_url} alt={displayName(profileData)} className="h-full w-full rounded-full object-cover" />
        </span>
      )
    }
    return <span className={`friend-avatar friend-avatar-fallback ${sizeClass}`}>{getInitials(profileData) || 'U'}</span>
  }

  return (
    <AuthOnly>
      <AppShell title="Friend Requests">
        <div className="friend-notification-stack">
          {visibleNotifications.map((item) => {
            const isPending = pendingRequestActionById[item.requestId]
            return (
              <article key={item.requestId} className="friend-notification-card">
                <div className="flex items-start gap-3">
                  {renderAvatar(item.senderProfile, 'h-11 w-11')}
                  <div className="min-w-0 flex-1">
                    <p className="friend-notification-title">{displayHandle(item.senderProfile)} sent you a friend request</p>
                    <p className="friend-notification-subtitle">{displayName(item.senderProfile)}</p>
                  </div>
                  <button type="button" onClick={() => dismissNotification(item.requestId)} className="friend-notification-close" aria-label="Dismiss notification">
                    x
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void handleAcceptRequest(item)
                    }}
                    disabled={isPending}
                    className="friend-primary-button"
                  >
                    {isPending ? 'Working...' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeclineRequest(item)
                    }}
                    disabled={isPending}
                    className="friend-secondary-button"
                  >
                    Decline
                  </button>
                </div>
              </article>
            )
          })}
        </div>

        <section className="soft-card animate-fade-up friend-panel p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <p className="friend-kicker">Requests</p>
            {incomingRequests.length > 0 ? <span className="friend-request-count-badge">{incomingRequests.length}</span> : null}
          </div>
          <h2 className="mt-2 text-2xl font-bold text-sky-950 sm:text-3xl">Incoming friend requests</h2>
          <p className="mt-2 text-sm text-sky-700">Accept requests to make friends instantly available in your Messages list.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link to="/add-friends" className="friend-primary-button">
              Add Friends
            </Link>
            <Link to="/messages" className="friend-secondary-button">
              Open Messages
            </Link>
          </div>
          {requestActionError ? <p className="friend-inline-error mt-3">{requestActionError}</p> : null}

          <div className="mt-4 grid gap-3 sm:mt-5">
            {isIncomingLoading ? (
              <>
                <div className="friend-request-skeleton shimmer" />
                <div className="friend-request-skeleton shimmer" />
              </>
            ) : null}

            {!isIncomingLoading && incomingRequests.length === 0 ? (
              <div className="friend-empty-state">
                <p className="text-sm font-semibold text-sky-900">No pending requests</p>
                <p className="mt-1 text-xs text-sky-700">New friend requests will appear here.</p>
              </div>
            ) : null}

            {!isIncomingLoading
              ? incomingRequests.map((item) => {
                  const isPending = pendingRequestActionById[item.requestId]
                  return (
                    <article key={item.requestId} className="friend-request-card request-card-mobile">
                      <div className="flex items-start gap-3">
                        {renderAvatar(item.senderProfile, 'h-12 w-12')}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-sky-950">{displayName(item.senderProfile)}</p>
                          <p className="text-xs font-semibold text-sky-700">{displayHandle(item.senderProfile)}</p>
                          {item.senderProfile?.class_year ? <p className="mt-1 text-xs text-sky-600">Class of {item.senderProfile.class_year}</p> : null}
                        </div>
                      </div>

                      <div className="request-card-actions mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            void handleAcceptRequest(item)
                          }}
                          disabled={isPending}
                          className="friend-primary-button"
                        >
                          {isPending ? 'Working...' : 'Accept'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeclineRequest(item)
                          }}
                          disabled={isPending}
                          className="friend-secondary-button"
                        >
                          Decline
                        </button>
                      </div>
                    </article>
                  )
                })
              : null}
          </div>
        </section>
      </AppShell>
    </AuthOnly>
  )
}
