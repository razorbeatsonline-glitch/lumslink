import { useCallback, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { createNotification } from '@/lib/notifications'
import { AuthOnly } from '@/lib/route-guards'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/add-friends')({
  component: AddFriendsPage,
})

type ProfilePreview = {
  id: string
  username: string | null
  full_name: string | null
  class_year: string | null
  bio: string | null
  avatar_url: string | null
}

type RelationshipState =
  | { kind: 'self' }
  | { kind: 'friends' }
  | { kind: 'outgoing' }
  | { kind: 'incoming'; requestId: string }
  | { kind: 'none' }

function normalizeUsername(value: string) {
  return value.trim().toLowerCase()
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

function AddFriendsPage() {
  const { status, user, profile } = useAuth()

  const [usernameInput, setUsernameInput] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchedProfile, setSearchedProfile] = useState<ProfilePreview | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [relationshipState, setRelationshipState] = useState<RelationshipState>({ kind: 'none' })

  const [isSendPending, setIsSendPending] = useState(false)
  const [searchActionError, setSearchActionError] = useState<string | null>(null)

  const resolveRelationshipState = useCallback(
    async (targetUserId: string): Promise<RelationshipState> => {
      if (!user?.id) return { kind: 'none' }
      if (targetUserId === user.id) return { kind: 'self' }

      const [friendshipResult, outgoingResult, incomingResult] = await Promise.all([
        supabase
          .from('friendships')
          .select('id')
          .or(`and(user_one_id.eq.${user.id},user_two_id.eq.${targetUserId}),and(user_one_id.eq.${targetUserId},user_two_id.eq.${user.id})`)
          .limit(1),
        supabase.from('friend_requests').select('id').eq('sender_id', user.id).eq('receiver_id', targetUserId).eq('status', 'pending').maybeSingle(),
        supabase.from('friend_requests').select('id').eq('sender_id', targetUserId).eq('receiver_id', user.id).eq('status', 'pending').maybeSingle(),
      ])

      if (friendshipResult.error) {
        console.error('Supabase friendship-state fetch error:', friendshipResult.error)
        return { kind: 'none' }
      }
      if ((friendshipResult.data?.length ?? 0) > 0) return { kind: 'friends' }

      if (incomingResult.error) {
        console.error('Supabase incoming-state fetch error:', incomingResult.error)
      } else if (incomingResult.data?.id) {
        return { kind: 'incoming', requestId: incomingResult.data.id }
      }

      if (outgoingResult.error) {
        console.error('Supabase outgoing-state fetch error:', outgoingResult.error)
      } else if (outgoingResult.data?.id) {
        return { kind: 'outgoing' }
      }

      return { kind: 'none' }
    },
    [user?.id],
  )

  const refreshSearchRelationship = useCallback(async () => {
    if (!searchedProfile) return
    const nextState = await resolveRelationshipState(searchedProfile.id)
    setRelationshipState(nextState)
  }, [resolveRelationshipState, searchedProfile])

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user?.id) return

    const normalized = normalizeUsername(usernameInput)
    if (!normalized) {
      setSearchError('Enter a username to search.')
      setHasSearched(false)
      setSearchedProfile(null)
      setRelationshipState({ kind: 'none' })
      return
    }

    setIsSearching(true)
    setHasSearched(true)
    setSearchError(null)
    setSearchActionError(null)
    setSearchedProfile(null)
    setRelationshipState({ kind: 'none' })

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, class_year, bio, avatar_url')
      .eq('username', normalized)
      .limit(1)
      .maybeSingle<ProfilePreview>()

    if (error) {
      console.error('Supabase username search error:', error)
      setSearchError('Unable to complete search right now. Please try again.')
      setIsSearching(false)
      return
    }

    if (!data) {
      setSearchedProfile(null)
      setRelationshipState({ kind: 'none' })
      setIsSearching(false)
      return
    }

    setSearchedProfile(data)
    const nextRelationshipState = await resolveRelationshipState(data.id)
    setRelationshipState(nextRelationshipState)
    setIsSearching(false)
  }

  const handleSendRequest = async () => {
    if (!user?.id || !searchedProfile || relationshipState.kind !== 'none') return
    setIsSendPending(true)
    setSearchActionError(null)
    setRelationshipState({ kind: 'outgoing' })

    const { data: insertedRequest, error } = await supabase
      .from('friend_requests')
      .insert({
        sender_id: user.id,
        receiver_id: searchedProfile.id,
        status: 'pending',
      })
      .select('id')
      .single<{ id: string }>()

    if (error) {
      console.error('Supabase friend request insert error:', error)
      const refreshedState = await resolveRelationshipState(searchedProfile.id)
      setRelationshipState(refreshedState)
      setSearchActionError(
        error.code === '23505' ? 'A request already exists for this user.' : 'Unable to send friend request right now. Please try again.',
      )
      setIsSendPending(false)
      return
    }

    const actorHandle = profile?.username?.trim() ? `@${profile.username.trim()}` : '@someone'
    const notificationResult = await createNotification({
      userId: searchedProfile.id,
      actorId: user.id,
      type: 'friend_request_received',
      friendRequestId: insertedRequest?.id ?? null,
      message: `${actorHandle} sent you a friend request.`,
      dedupeByContext: true,
    })
    if (notificationResult.error) {
      console.error('Friend-request notification creation failed:', notificationResult.error)
    }

    setIsSendPending(false)
    await refreshSearchRelationship()
  }

  if (status === 'loading') {
    return <FullscreenLoader message="Loading add friends..." />
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
      <AppShell title="Add Friends">
        <section className="soft-card animate-fade-up friend-panel p-4 sm:p-6">
          <p className="friend-kicker">Add Friend</p>
          <h2 className="mt-2 text-xl font-bold text-sky-950 sm:text-2xl">Find someone by exact username</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-sky-700 sm:text-base">
            Search by exact username and send requests. Accepted friends automatically appear in Messages.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link to="/messages" className="friend-secondary-button">
              Back to Messages
            </Link>
            <Link to="/requests" className="friend-secondary-button">
              View Requests
            </Link>
          </div>

          <form onSubmit={handleSearch} className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row">
            <input
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="username"
              autoComplete="off"
              spellCheck={false}
              className="friend-input"
              aria-label="Search by username"
            />
            <button type="submit" disabled={isSearching} className="friend-primary-button sm:min-w-36">
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {searchError ? <p className="friend-inline-error mt-3">{searchError}</p> : null}
          {searchActionError ? <p className="friend-inline-error mt-2">{searchActionError}</p> : null}

          <div className="mt-4 sm:mt-5">
            {isSearching ? <div className="friend-search-loading shimmer" /> : null}
            {!isSearching && hasSearched && !searchedProfile && !searchError ? (
              <div className="friend-empty-state">
                <p className="text-sm font-semibold text-sky-900">No user found</p>
                <p className="mt-1 text-xs text-sky-700">Check spelling and try the exact username again.</p>
              </div>
            ) : null}

            {!isSearching && searchedProfile ? (
              <article className="friend-result-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {renderAvatar(searchedProfile)}
                    <div>
                      <p className="text-base font-bold text-sky-950">{displayName(searchedProfile)}</p>
                      <p className="text-sm font-semibold text-sky-700">{displayHandle(searchedProfile)}</p>
                      {searchedProfile.class_year ? <p className="mt-1 text-xs text-sky-600">Class of {searchedProfile.class_year}</p> : null}
                    </div>
                  </div>

                  <div className="friend-state-wrap">
                    {relationshipState.kind === 'self' ? <span className="friend-state-pill">This is you</span> : null}
                    {relationshipState.kind === 'friends' ? <span className="friend-state-pill">Friends</span> : null}
                    {relationshipState.kind === 'outgoing' ? <span className="friend-state-pill">Request Sent</span> : null}

                    {relationshipState.kind === 'none' ? (
                      <button type="button" onClick={handleSendRequest} disabled={isSendPending} className="friend-primary-button">
                        {isSendPending ? 'Sending...' : 'Add Friend'}
                      </button>
                    ) : null}

                    {relationshipState.kind === 'incoming' ? (
                      <Link to="/requests" className="friend-secondary-button">
                        View Request
                      </Link>
                    ) : null}
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-sky-700">{searchedProfile.bio?.trim() || 'No bio added yet.'}</p>
              </article>
            ) : null}
          </div>
        </section>
      </AppShell>
    </AuthOnly>
  )
}
