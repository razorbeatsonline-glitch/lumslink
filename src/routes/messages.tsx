import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AppShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { AuthOnly } from '@/lib/route-guards'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/messages')({
  component: MessagesPage,
})

type ProfilePreview = {
  id: string
  username: string | null
  full_name: string | null
  class_year: string | null
  bio: string | null
  avatar_url: string | null
}

type FriendshipRow = {
  id: string
  user_one_id: string
  user_two_id: string
  created_at: string
}

type FriendItem = {
  friendshipId: string
  friendId: string
  profile: ProfilePreview | null
  createdAt: string
}

type ConversationRow = {
  id: string
  created_at: string
}

type ConversationMemberRow = {
  conversation_id: string
  user_id: string
}

type MessageRow = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

type ConversationContactItem = {
  friendshipId: string
  friendId: string
  profile: ProfilePreview | null
  friendshipCreatedAt: string
  conversationId: string | null
  conversationCreatedAt: string | null
  lastMessageContent: string | null
  lastMessageCreatedAt: string | null
}

type ActiveConversation = {
  id: string
  friendId: string
  friendProfile: ProfilePreview | null
  createdAt: string | null
}

type AppendMessageResult = {
  appended: boolean
  reason: 'appended' | 'duplicate' | 'conversation-mismatch'
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

function toTimeValue(value: string | null) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function sortConversationContacts(items: ConversationContactItem[]) {
  return [...items].sort((a, b) => {
    const aRecent = Math.max(toTimeValue(a.lastMessageCreatedAt), toTimeValue(a.conversationCreatedAt), toTimeValue(a.friendshipCreatedAt))
    const bRecent = Math.max(toTimeValue(b.lastMessageCreatedAt), toTimeValue(b.conversationCreatedAt), toTimeValue(b.friendshipCreatedAt))
    if (aRecent !== bRecent) return bRecent - aRecent
    return displayName(a.profile).localeCompare(displayName(b.profile))
  })
}

function formatConversationTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMessageTimestamp(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 45_000) return 'just now'

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)}m ago`
  }

  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) {
    return 'yesterday'
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function mergeMessagesById(previous: MessageRow[], incoming: MessageRow[]) {
  if (incoming.length === 0) return previous
  const byId = new Map<string, MessageRow>()
  for (const message of previous) {
    byId.set(message.id, message)
  }
  for (const message of incoming) {
    byId.set(message.id, message)
  }
  return Array.from(byId.values()).sort((a, b) => {
    const byTime = toTimeValue(a.created_at) - toTimeValue(b.created_at)
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
  })
}

function MessagesPage() {
  const { status, user } = useAuth()

  const [friends, setFriends] = useState<FriendItem[]>([])
  const [isFriendsLoading, setIsFriendsLoading] = useState(false)

  const [conversationContacts, setConversationContacts] = useState<ConversationContactItem[]>([])
  const [isConversationsLoading, setIsConversationsLoading] = useState(false)
  const [conversationsError, setConversationsError] = useState<string | null>(null)
  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null)
  const [activeConversationError, setActiveConversationError] = useState<string | null>(null)
  const [resolvingFriendId, setResolvingFriendId] = useState<string | null>(null)

  const [messages, setMessages] = useState<MessageRow[]>([])
  const [isMessagesLoading, setIsMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [sendMessageError, setSendMessageError] = useState<string | null>(null)
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false)
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(new Set())
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const composerFormRef = useRef<HTMLFormElement | null>(null)
  const activeConversationChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingStopTimerRef = useRef<number | null>(null)
  const remoteTypingHideTimerRef = useRef<number | null>(null)
  const lastTypingBroadcastAtRef = useRef(0)
  const hasBroadcastTypingRef = useRef(false)
  const shouldAutoScrollRef = useRef(true)
  const previousConversationIdRef = useRef<string | null>(null)
  const previousMessageCountRef = useRef(0)
  const activeConversationIdRef = useRef<string | null>(null)
  const pendingConversationByFriendRef = useRef<Map<string, Promise<ConversationRow>>>(new Map())

  const activeConversationDisplay = useMemo(() => {
    if (!activeConversation) return null
    const matching = conversationContacts.find((item) => item.friendId === activeConversation.friendId)
    return {
      ...activeConversation,
      friendProfile: matching?.profile ?? activeConversation.friendProfile,
    }
  }, [activeConversation, conversationContacts])

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = messagesScrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior })
  }, [])

  const isThreadNearBottom = useCallback((threshold = 112) => {
    const node = messagesScrollRef.current
    if (!node) return true
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight
    return remaining < threshold
  }, [])

  const appendMessageToThread = useCallback((newMessage: MessageRow, source: 'realtime' | 'send'): AppendMessageResult => {
    const scopedConversationId = activeConversationIdRef.current
    if (!scopedConversationId || newMessage.conversation_id !== scopedConversationId) {
      return { appended: false, reason: 'conversation-mismatch' }
    }

    let result: AppendMessageResult = { appended: false, reason: 'duplicate' }
    setMessages((previous) => {
      if (previous.some((message) => message.id === newMessage.id)) {
        console.debug('[messages] duplicate message ignored', {
          source,
          messageId: newMessage.id,
          conversationId: newMessage.conversation_id,
        })
        result = { appended: false, reason: 'duplicate' }
        return previous
      }

      result = { appended: true, reason: 'appended' }
      const next = [...previous, newMessage].sort((a, b) => {
        const byTime = toTimeValue(a.created_at) - toTimeValue(b.created_at)
        return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
      })
      console.debug('[messages] message appended to UI', {
        source,
        messageId: newMessage.id,
        conversationId: newMessage.conversation_id,
      })
      return next
    })

    if (!result.appended) return result

    setAnimatedMessageIds((previous) => {
      if (previous.has(newMessage.id)) return previous
      const next = new Set(previous)
      next.add(newMessage.id)
      return next
    })
    window.setTimeout(() => {
      setAnimatedMessageIds((previous) => {
        if (!previous.has(newMessage.id)) return previous
        const next = new Set(previous)
        next.delete(newMessage.id)
        return next
      })
    }, 170)
    return result
  }, [])

  const clearLocalTypingTimers = useCallback(() => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current)
      typingStopTimerRef.current = null
    }
  }, [])

  const clearRemoteTypingTimer = useCallback(() => {
    if (remoteTypingHideTimerRef.current) {
      window.clearTimeout(remoteTypingHideTimerRef.current)
      remoteTypingHideTimerRef.current = null
    }
  }, [])

  const broadcastTypingEvent = useCallback(
    async (isTyping: boolean) => {
      if (!activeConversation?.id || !user?.id) return
      const channel = activeConversationChannelRef.current
      if (!channel) return

      const response = await channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          conversationId: activeConversation.id,
          userId: user.id,
          isTyping,
          sentAt: new Date().toISOString(),
        },
      })

      if (response !== 'ok') {
        console.error('Supabase typing broadcast error:', response)
      }
    },
    [activeConversation?.id, user?.id],
  )

  const broadcastTypingStop = useCallback(() => {
    clearLocalTypingTimers()
    if (hasBroadcastTypingRef.current) {
      hasBroadcastTypingRef.current = false
      lastTypingBroadcastAtRef.current = 0
      void broadcastTypingEvent(false)
    }
  }, [broadcastTypingEvent, clearLocalTypingTimers])

  const loadFriends = useCallback(async () => {
    if (!user?.id) {
      setFriends([])
      return
    }

    setIsFriendsLoading(true)
    const { data: friendshipRows, error: friendshipsError } = await supabase
      .from('friendships')
      .select('id, user_one_id, user_two_id, created_at')
      .or(`user_one_id.eq.${user.id},user_two_id.eq.${user.id}`)
      .order('created_at', { ascending: false })

    if (friendshipsError) {
      console.error('Supabase friends fetch error:', friendshipsError)
      setFriends([])
      setIsFriendsLoading(false)
      return
    }

    const rows = (friendshipRows ?? []) as FriendshipRow[]
    if (rows.length === 0) {
      setFriends([])
      setIsFriendsLoading(false)
      return
    }

    const friendIds = Array.from(new Set(rows.map((row) => (row.user_one_id === user.id ? row.user_two_id : row.user_one_id)).filter(Boolean)))
    const { data: friendProfiles, error: friendProfilesError } = await supabase
      .from('profiles')
      .select('id, username, full_name, class_year, bio, avatar_url')
      .in('id', friendIds)

    if (friendProfilesError) {
      console.error('Supabase friend profiles fetch error:', friendProfilesError)
    }

    const profileMap = new Map<string, ProfilePreview>((friendProfiles ?? []).map((item) => [item.id, item as ProfilePreview]))
    setFriends(
      rows.map((row) => {
        const friendId = row.user_one_id === user.id ? row.user_two_id : row.user_one_id
        return {
          friendshipId: row.id,
          friendId,
          profile: profileMap.get(friendId) ?? null,
          createdAt: row.created_at,
        }
      }),
    )

    setIsFriendsLoading(false)
  }, [user?.id])

  const loadConversationsForFriends = useCallback(
    async (friendRows: FriendItem[]) => {
      if (!user?.id) {
        setConversationContacts([])
        return
      }

      setIsConversationsLoading(true)
      setConversationsError(null)
      if (friendRows.length === 0) {
        setConversationContacts([])
        setIsConversationsLoading(false)
        return
      }

      const friendIds = Array.from(new Set(friendRows.map((item) => item.friendId)))
      const friendIdSet = new Set(friendIds)
      const noConversationContacts = sortConversationContacts(
        friendRows.map((friend) => ({
          friendshipId: friend.friendshipId,
          friendId: friend.friendId,
          profile: friend.profile,
          friendshipCreatedAt: friend.createdAt,
          conversationId: null,
          conversationCreatedAt: null,
          lastMessageContent: null,
          lastMessageCreatedAt: null,
        })),
      )

      const { data: userMembershipRows, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id')
        .eq('user_id', user.id)

      if (membershipError) {
        console.error('Supabase conversation membership fetch error:', membershipError)
        setConversationContacts(noConversationContacts)
        setConversationsError('Unable to load conversations right now.')
        setIsConversationsLoading(false)
        return
      }

      const membershipRows = (userMembershipRows ?? []) as ConversationMemberRow[]
      const conversationIds = Array.from(new Set(membershipRows.map((item) => item.conversation_id)))
      if (conversationIds.length === 0) {
        setConversationContacts(noConversationContacts)
        setIsConversationsLoading(false)
        return
      }

      const [memberResult, conversationsResult, messageResult] = await Promise.all([
        supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', conversationIds),
        supabase.from('conversations').select('id, created_at').in('id', conversationIds),
        supabase.from('messages').select('id, conversation_id, sender_id, content, created_at').in('conversation_id', conversationIds).order('created_at', {
          ascending: false,
        }),
      ])

      if (memberResult.error || conversationsResult.error) {
        if (memberResult.error) console.error('Supabase conversation-members fetch error:', memberResult.error)
        if (conversationsResult.error) console.error('Supabase conversations fetch error:', conversationsResult.error)
      }
      if (messageResult.error) {
        console.error('Supabase conversation preview messages fetch error:', messageResult.error)
      }

      const membersByConversation = new Map<string, Set<string>>()
      for (const row of (memberResult.data ?? []) as ConversationMemberRow[]) {
        const existing = membersByConversation.get(row.conversation_id)
        if (existing) existing.add(row.user_id)
        else membersByConversation.set(row.conversation_id, new Set([row.user_id]))
      }

      const conversationMap = new Map<string, ConversationRow>()
      for (const row of (conversationsResult.data ?? []) as ConversationRow[]) {
        conversationMap.set(row.id, row)
      }

      const lastMessageByConversation = new Map<string, MessageRow>()
      for (const row of (messageResult.data ?? []) as MessageRow[]) {
        if (!lastMessageByConversation.has(row.conversation_id)) {
          lastMessageByConversation.set(row.conversation_id, row)
        }
      }

      const directByFriend = new Map<string, { conversationId: string; conversationCreatedAt: string | null; lastMessageContent: string | null; lastMessageCreatedAt: string | null }>()
      for (const [conversationId, members] of membersByConversation.entries()) {
        if (!members.has(user.id) || members.size !== 2) continue
        const friendId = Array.from(members).find((memberId) => memberId !== user.id)
        if (!friendId || !friendIdSet.has(friendId)) continue

        const latestMessage = lastMessageByConversation.get(conversationId)
        const summary = {
          conversationId,
          conversationCreatedAt: conversationMap.get(conversationId)?.created_at ?? null,
          lastMessageContent: latestMessage?.content ?? null,
          lastMessageCreatedAt: latestMessage?.created_at ?? null,
        }

        const existing = directByFriend.get(friendId)
        if (!existing) {
          directByFriend.set(friendId, summary)
          continue
        }

        const existingRecent = Math.max(toTimeValue(existing.lastMessageCreatedAt), toTimeValue(existing.conversationCreatedAt))
        const nextRecent = Math.max(toTimeValue(summary.lastMessageCreatedAt), toTimeValue(summary.conversationCreatedAt))
        if (nextRecent > existingRecent) {
          directByFriend.set(friendId, summary)
        }
      }

      const nextContacts = sortConversationContacts(
        friendRows.map((friend) => {
          const summary = directByFriend.get(friend.friendId)
          return {
            friendshipId: friend.friendshipId,
            friendId: friend.friendId,
            profile: friend.profile,
            friendshipCreatedAt: friend.createdAt,
            conversationId: summary?.conversationId ?? null,
            conversationCreatedAt: summary?.conversationCreatedAt ?? null,
            lastMessageContent: summary?.lastMessageContent ?? null,
            lastMessageCreatedAt: summary?.lastMessageCreatedAt ?? null,
          }
        }),
      )

      setConversationContacts(nextContacts)
      setActiveConversation((previous) => {
        if (!previous) return previous
        const matching = nextContacts.find((item) => item.friendId === previous.friendId)
        if (!matching) return previous
        return {
          ...previous,
          friendProfile: matching.profile ?? previous.friendProfile,
        }
      })
      setIsConversationsLoading(false)
    },
    [user?.id],
  )

  const ensureDirectConversation = useCallback(
    async (friendId: string): Promise<ConversationRow> => {
      if (!user?.id) {
        throw new Error('Not authenticated.')
      }

      const existingPending = pendingConversationByFriendRef.current.get(friendId)
      if (existingPending) {
        return existingPending
      }

      const run = async () => {
        const findExistingDirectConversation = async (): Promise<ConversationRow | null> => {
          const { data: currentUserMembershipRows, error: currentUserMembershipError } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', user.id)

          if (currentUserMembershipError) {
            console.error('Supabase error while fetching current user memberships:', currentUserMembershipError)
            throw new Error('Unable to fetch current user conversations.')
          }

          const currentConversationIds = Array.from(new Set((currentUserMembershipRows ?? []).map((row) => row.conversation_id)))
          if (currentConversationIds.length === 0) {
            return null
          }

          const { data: friendMembershipRows, error: friendMembershipError } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('user_id', friendId)
            .in('conversation_id', currentConversationIds)

          if (friendMembershipError) {
            console.error('Supabase error while fetching selected friend memberships:', friendMembershipError)
            throw new Error('Unable to fetch selected friend conversations.')
          }

          const sharedConversationIds = Array.from(new Set((friendMembershipRows ?? []).map((row) => row.conversation_id)))
          if (sharedConversationIds.length === 0) {
            return null
          }

          const { data: sharedMemberRows, error: sharedMemberError } = await supabase
            .from('conversation_members')
            .select('conversation_id, user_id')
            .in('conversation_id', sharedConversationIds)

          if (sharedMemberError) {
            console.error('Supabase error while validating shared conversation members:', sharedMemberError)
            throw new Error('Unable to validate existing conversation members.')
          }

          const membersByConversation = new Map<string, Set<string>>()
          for (const row of (sharedMemberRows ?? []) as ConversationMemberRow[]) {
            const existingMembers = membersByConversation.get(row.conversation_id)
            if (existingMembers) existingMembers.add(row.user_id)
            else membersByConversation.set(row.conversation_id, new Set([row.user_id]))
          }

          const directConversationIds = Array.from(membersByConversation.entries())
            .filter(([, members]) => members.size === 2 && members.has(user.id) && members.has(friendId))
            .map(([conversationId]) => conversationId)

          if (directConversationIds.length === 0) {
            return null
          }

          const { data: directConversations, error: directConversationsError } = await supabase
            .from('conversations')
            .select('id, created_at')
            .in('id', directConversationIds)
            .order('created_at', { ascending: false })

          if (directConversationsError) {
            console.error('Supabase existing conversation fetch error:', directConversationsError)
            throw new Error('Unable to fetch existing direct conversation.')
          }

          const convo = ((directConversations ?? [])[0] as ConversationRow | undefined) ?? null
          if (convo) {
            console.log('FOUND CONVO:', convo)
          }
          return convo
        }

        const existingConversation = await findExistingDirectConversation()
        if (existingConversation) {
          return existingConversation
        }

        const { data: insertedConversation, error: conversationInsertError } = await supabase
          .from('conversations')
          .insert([{}])
          .select('id, created_at')
          .single<ConversationRow>()

        if (conversationInsertError || !insertedConversation) {
          console.error('Supabase error while inserting conversation:', conversationInsertError)
          throw new Error('Unable to create conversation right now.')
        }

        const { error: memberInsertError } = await supabase.from('conversation_members').insert([
          { conversation_id: insertedConversation.id, user_id: user.id },
          { conversation_id: insertedConversation.id, user_id: friendId },
        ])

        if (memberInsertError) {
          console.error('Supabase error while inserting conversation memberships:', memberInsertError)
          const fallbackConversation = await findExistingDirectConversation()
          if (fallbackConversation) {
            return fallbackConversation
          }
          throw new Error('Unable to create conversation members right now.')
        }

        console.log('CREATED CONVO:', insertedConversation)
        return insertedConversation
      }

      const pending = run().finally(() => {
        pendingConversationByFriendRef.current.delete(friendId)
      })
      pendingConversationByFriendRef.current.set(friendId, pending)
      return pending
    },
    [user?.id],
  )

  const handleOpenConversation = useCallback(
    async (contact: ConversationContactItem) => {
      if (!user?.id) return
      console.log('OPENING CONVO WITH:', contact.friendId)
      setResolvingFriendId(contact.friendId)
      setActiveConversationError(null)
      setSendMessageError(null)

      try {
        const resolvedConversation = await ensureDirectConversation(contact.friendId)
        const nextActiveConversation: ActiveConversation = {
          id: resolvedConversation.id,
          friendId: contact.friendId,
          friendProfile: contact.profile,
          createdAt: resolvedConversation.created_at,
        }
        console.debug('ACTIVE CONVO ID:', nextActiveConversation.id)
        setActiveConversation(nextActiveConversation)
        setConversationContacts((previous) =>
          sortConversationContacts(
            previous.map((item) => {
              if (item.friendId !== contact.friendId) return item
              return {
                ...item,
                conversationId: resolvedConversation.id,
                conversationCreatedAt: item.conversationCreatedAt ?? resolvedConversation.created_at,
              }
            }),
          ),
        )
      } catch (error) {
        console.error('Conversation resolve error:', error)
        setActiveConversationError('Unable to open this conversation right now.')
      } finally {
        setResolvingFriendId(null)
      }
    },
    [ensureDirectConversation, user?.id],
  )

  const handleSendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!user?.id || !activeConversation?.id) return
    const content = messageInput.trim()
    if (!content) return

    broadcastTypingStop()
    setIsSendingMessage(true)
    setSendMessageError(null)
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: activeConversation.id,
        sender_id: user.id,
        content,
      })
      .select('id, conversation_id, sender_id, content, created_at')
      .single<MessageRow>()

    if (error || !data) {
      console.error('Supabase message insert error:', error)
      setSendMessageError('Unable to send message right now.')
      setIsSendingMessage(false)
      return
    }

    appendMessageToThread(data, 'send')
    setMessageInput('')
    shouldAutoScrollRef.current = true
    scrollToLatestMessage('smooth')
    setConversationContacts((previous) =>
      sortConversationContacts(
        previous.map((item) => {
          if (item.friendId !== activeConversation.friendId) return item
          return {
            ...item,
            conversationId: activeConversation.id,
            conversationCreatedAt: item.conversationCreatedAt ?? activeConversation.createdAt,
            lastMessageContent: data.content,
            lastMessageCreatedAt: data.created_at,
          }
        }),
      ),
    )
    setIsSendingMessage(false)
  }

  const handleComposerInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value
    setMessageInput(nextValue)
    if (!activeConversation?.id || !user?.id) return

    const trimmedValue = nextValue.trim()
    if (!trimmedValue) {
      broadcastTypingStop()
      return
    }

    const now = Date.now()
    if (!hasBroadcastTypingRef.current || now - lastTypingBroadcastAtRef.current > 1200) {
      hasBroadcastTypingRef.current = true
      lastTypingBroadcastAtRef.current = now
      void broadcastTypingEvent(true)
    }

    clearLocalTypingTimers()
    typingStopTimerRef.current = window.setTimeout(() => {
      broadcastTypingStop()
    }, 1500)
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (isSendingMessage || !messageInput.trim()) return
    composerFormRef.current?.requestSubmit()
  }

  useEffect(() => {
    activeConversationIdRef.current = activeConversation?.id ?? null
  }, [activeConversation?.id])

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return
    void loadFriends()
  }, [loadFriends, status, user?.id])

  useEffect(() => {
    if (status !== 'authenticated' || !user?.id) return
    void loadConversationsForFriends(friends)
  }, [friends, loadConversationsForFriends, status, user?.id])

  useEffect(() => {
    if (!activeConversation?.id || !user?.id) {
      setMessages([])
      setMessagesError(null)
      setMessageInput('')
      setAnimatedMessageIds(new Set())
      setIsOtherUserTyping(false)
      broadcastTypingStop()
      clearRemoteTypingTimer()
      return
    }

    let ignore = false
    const loadMessages = async () => {
      setIsMessagesLoading(true)
      setMessagesError(null)
      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .eq('conversation_id', activeConversation.id)
        .order('created_at', { ascending: true })

      if (ignore) return
      if (error) {
        console.error('Supabase error while loading messages:', error)
        setMessages([])
        setAnimatedMessageIds(new Set())
        setMessagesError('Unable to load messages right now.')
        setIsMessagesLoading(false)
        return
      }

      setMessages((previous) => mergeMessagesById(previous, (data ?? []) as MessageRow[]))
      setAnimatedMessageIds(new Set())
      setIsMessagesLoading(false)
    }

    void loadMessages()
    return () => {
      ignore = true
    }
  }, [activeConversation?.id, broadcastTypingStop, clearRemoteTypingTimer, user?.id])

  useEffect(() => {
    if (!activeConversation?.id) {
      previousConversationIdRef.current = null
      previousMessageCountRef.current = 0
      return
    }

    const hasConversationChanged = previousConversationIdRef.current !== activeConversation.id
    const hasNewMessages = messages.length > previousMessageCountRef.current
    if (hasConversationChanged) {
      shouldAutoScrollRef.current = true
      scrollToLatestMessage('auto')
    } else if (hasNewMessages && shouldAutoScrollRef.current) {
      scrollToLatestMessage('smooth')
    }

    previousConversationIdRef.current = activeConversation.id
    previousMessageCountRef.current = messages.length
  }, [activeConversation?.id, messages.length, scrollToLatestMessage])

  useEffect(() => {
    if (!activeConversation?.id || !user?.id) return

    setIsOtherUserTyping(false)
    clearRemoteTypingTimer()
    console.debug('[messages] activeConversation.id', activeConversation.id)
    if (activeConversationChannelRef.current) {
      console.debug('[messages] realtime subscription cleanup', {
        conversationId: activeConversation.id,
        reason: 'before-new-subscribe',
      })
      void supabase.removeChannel(activeConversationChannelRef.current)
      activeConversationChannelRef.current = null
    }
    const channel = supabase.channel(`dm-conversation-${activeConversation.id}`)
    activeConversationChannelRef.current = channel

    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeConversation.id}` }, (payload) => {
        const newMessage = payload.new as MessageRow
        console.debug('[messages] incoming INSERT payload', payload)
        if (newMessage.conversation_id !== activeConversation.id) {
          console.debug('[messages] insert ignored (conversation mismatch)', {
            messageId: newMessage.id,
            payloadConversationId: newMessage.conversation_id,
            activeConversationId: activeConversation.id,
          })
          return
        }

        const shouldScrollAfterAppend = newMessage.sender_id === user.id || isThreadNearBottom()
        const appendResult = appendMessageToThread(newMessage, 'realtime')
        if (appendResult.appended) {
          console.debug('[messages] payload appended', {
            messageId: newMessage.id,
            conversationId: newMessage.conversation_id,
          })
        } else {
          console.debug('[messages] payload ignored as duplicate', {
            messageId: newMessage.id,
            conversationId: newMessage.conversation_id,
            reason: appendResult.reason,
          })
        }

        if (appendResult.appended && shouldScrollAfterAppend) {
          shouldAutoScrollRef.current = true
          scrollToLatestMessage('smooth')
        }

        if (newMessage.sender_id === activeConversation.friendId) {
          setIsOtherUserTyping(false)
          clearRemoteTypingTimer()
        }

        setConversationContacts((previous) =>
          sortConversationContacts(
            previous.map((item) => {
              if (item.friendId !== activeConversation.friendId) return item
              return {
                ...item,
                conversationId: activeConversation.id,
                conversationCreatedAt: item.conversationCreatedAt ?? activeConversation.createdAt,
                lastMessageContent: newMessage.content,
                lastMessageCreatedAt: newMessage.created_at,
              }
            }),
          ),
        )
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const typingPayload = payload as { conversationId?: string; userId?: string; isTyping?: boolean }
        if (!typingPayload) return
        if (typingPayload.conversationId !== activeConversation.id) return
        if (!typingPayload.userId || typingPayload.userId === user.id) return
        if (typingPayload.userId !== activeConversation.friendId) return

        if (!typingPayload.isTyping) {
          setIsOtherUserTyping(false)
          clearRemoteTypingTimer()
          return
        }

        setIsOtherUserTyping(true)
        clearRemoteTypingTimer()
        remoteTypingHideTimerRef.current = window.setTimeout(() => {
          setIsOtherUserTyping(false)
        }, 2200)
      })
      .subscribe((statusValue) => {
        if (statusValue === 'SUBSCRIBED') {
          console.debug('[messages] realtime subscription attached', {
            activeConversationId: activeConversation.id,
          })
        }
        if (statusValue === 'CHANNEL_ERROR') {
          console.error('Supabase realtime channel error for active conversation:', activeConversation.id)
        }
      })

    return () => {
      clearRemoteTypingTimer()
      clearLocalTypingTimers()
      hasBroadcastTypingRef.current = false
      lastTypingBroadcastAtRef.current = 0
      setIsOtherUserTyping(false)
      activeConversationChannelRef.current = null
      console.debug('[messages] realtime subscription cleanup', {
        conversationId: activeConversation.id,
        reason: 'effect-cleanup',
      })
      void supabase.removeChannel(channel)
    }
  }, [
    activeConversation?.createdAt,
    activeConversation?.friendId,
    activeConversation?.id,
    appendMessageToThread,
    clearLocalTypingTimers,
    clearRemoteTypingTimer,
    isThreadNearBottom,
    scrollToLatestMessage,
    user?.id,
  ])

  useEffect(() => {
    return () => {
      clearLocalTypingTimers()
      clearRemoteTypingTimer()
    }
  }, [clearLocalTypingTimers, clearRemoteTypingTimer])

  const handleThreadScroll = () => {
    shouldAutoScrollRef.current = isThreadNearBottom(112)
  }

  if (status === 'loading') {
    return <FullscreenLoader message="Loading messages..." />
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

  const hasAcceptedFriends = friends.length > 0
  const isMobileChatOpen = Boolean(activeConversationDisplay)

  return (
    <AuthOnly>
      <AppShell title="Messages" mobileImmersive={isMobileChatOpen}>
        <section className={`soft-card animate-fade-up friend-panel messages-panel p-4 sm:p-6 ${isMobileChatOpen ? 'messages-panel-chat-open' : ''}`}>
          <div className="messages-intro">
            <p className="friend-kicker">Messages</p>
            <h2 className="mt-2 text-2xl font-bold text-sky-950">Direct messages</h2>
            <p className="mt-2 text-sm text-sky-700">Accepted friends appear here automatically and can be messaged right away.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link to="/requests" className="friend-secondary-button">
                Requests & Add Friends
              </Link>
            </div>
          </div>

          <div className={`messages-layout mt-4 sm:mt-5 ${isMobileChatOpen ? 'messages-layout-chat-open' : ''}`}>
            <div className="message-panel message-list-pane">
              <div className="message-panel-header">
                <h3 className="message-panel-title">Friends & conversations</h3>
                <p className="message-panel-subtitle">Accepted friends only</p>
              </div>
              {conversationsError ? <p className="friend-inline-error mt-2">{conversationsError}</p> : null}
              {activeConversationError ? <p className="friend-inline-error mt-2">{activeConversationError}</p> : null}

              <div className="message-contact-list mt-3">
                {(isFriendsLoading || isConversationsLoading) && (
                  <>
                    <div className="friend-request-skeleton shimmer" />
                    <div className="friend-request-skeleton shimmer" />
                  </>
                )}

                {!isFriendsLoading && !isConversationsLoading && !hasAcceptedFriends ? (
                  <div className="friend-empty-state">
                    <p className="text-sm font-semibold text-sky-900">No accepted friends yet</p>
                    <p className="mt-1 text-xs text-sky-700">Use Add Friends to connect, then they appear here automatically.</p>
                  </div>
                ) : null}

                {!isFriendsLoading && !isConversationsLoading
                  ? conversationContacts.map((contact) => {
                      const isSelected = activeConversation?.friendId === contact.friendId
                      const isResolving = resolvingFriendId === contact.friendId
                      const previewText = contact.lastMessageContent?.trim() || 'No messages yet'
                      const previewTime = formatConversationTime(contact.lastMessageCreatedAt ?? contact.conversationCreatedAt)

                      return (
                        <button
                          key={contact.friendshipId}
                          type="button"
                          onClick={() => {
                            void handleOpenConversation(contact)
                          }}
                          className={`message-contact-button ${isSelected ? 'message-contact-button-active' : ''}`}
                          disabled={isResolving}
                        >
                          <div className="message-contact-inner">
                            {renderAvatar(contact.profile, 'h-10 w-10')}
                            <div className="message-contact-copy">
                              <div className="message-contact-row">
                                <p className="message-contact-name">{displayName(contact.profile)}</p>
                                {previewTime ? <span className="message-contact-time">{previewTime}</span> : null}
                              </div>
                              <p className="message-contact-handle">{displayHandle(contact.profile)}</p>
                              <p className="message-contact-preview">{isResolving ? 'Opening conversation...' : previewText}</p>
                            </div>
                          </div>
                        </button>
                      )
                    })
                  : null}
              </div>
            </div>

            <div className={`message-chat-card message-chat-pane ${isMobileChatOpen ? 'message-chat-pane-active' : ''}`}>
              {!hasAcceptedFriends ? (
                <div className="message-empty-wrap">
                  <p className="message-empty-title">No chat access yet</p>
                  <p className="message-empty-copy">Accepted friends will appear here once requests are approved.</p>
                </div>
              ) : null}

              {hasAcceptedFriends && !activeConversationDisplay ? (
                <div className="message-empty-wrap">
                  <p className="message-empty-title">Select a friend to start chatting</p>
                  <p className="message-empty-copy">Pick a contact to open or create your direct conversation.</p>
                </div>
              ) : null}

              {hasAcceptedFriends && activeConversationDisplay ? (
                <>
                  <header className="message-chat-header">
                    <button
                      type="button"
                      className="message-mobile-back"
                      onClick={() => {
                        setActiveConversation(null)
                      }}
                    >
                      Back
                    </button>
                    <div className="flex items-center gap-3">
                      {renderAvatar(activeConversationDisplay.friendProfile, 'h-11 w-11')}
                      <div>
                        <p className="message-chat-name">{displayName(activeConversationDisplay.friendProfile)}</p>
                        <p className="message-chat-handle">{displayHandle(activeConversationDisplay.friendProfile)}</p>
                      </div>
                    </div>
                  </header>

                  <div ref={messagesScrollRef} className="message-thread" onScroll={handleThreadScroll}>
                    {isMessagesLoading ? (
                      <div className="space-y-3 message-state-enter">
                        <div className="message-bubble-skeleton shimmer" />
                        <div className="message-bubble-skeleton shimmer message-bubble-skeleton-self" />
                        <div className="message-bubble-skeleton shimmer" />
                      </div>
                    ) : null}

                    {!isMessagesLoading && messagesError ? (
                      <div className="message-empty-wrap">
                        <p className="message-empty-title">Messages unavailable</p>
                        <p className="message-empty-copy">{messagesError}</p>
                      </div>
                    ) : null}

                    {!isMessagesLoading && !messagesError && messages.length === 0 ? (
                      <div className="message-empty-wrap message-state-enter">
                        <p className="message-empty-title">No messages yet</p>
                        <p className="message-empty-copy">Start the conversation with a quick hello.</p>
                      </div>
                    ) : null}

                    {!isMessagesLoading && !messagesError && messages.length > 0
                      ? messages.map((message) => {
                          const isOwnMessage = message.sender_id === user?.id
                          const isAnimated = animatedMessageIds.has(message.id)
                          return (
                            <div key={message.id} className={`message-row ${isOwnMessage ? 'message-row-self' : ''} ${isAnimated ? 'message-row-enter' : ''}`}>
                              <article className={`message-bubble ${isOwnMessage ? 'message-bubble-self' : ''}`}>
                                <p className="message-bubble-content">{message.content}</p>
                                <time className={`message-bubble-time ${isOwnMessage ? 'message-bubble-time-self' : ''}`} dateTime={message.created_at}>
                                  {formatMessageTimestamp(message.created_at)}
                                </time>
                              </article>
                            </div>
                          )
                        })
                      : null}

                    {!isMessagesLoading && !messagesError && messages.length > 0 && isOtherUserTyping ? (
                      <div className="message-row message-row-enter">
                        <article className="message-bubble message-typing-bubble" aria-live="polite" aria-label="Other user is typing">
                          <div className="typing-dots" aria-hidden>
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                          </div>
                        </article>
                      </div>
                    ) : null}
                  </div>

                  <form ref={composerFormRef} onSubmit={handleSendMessage} className="message-composer">
                    <div className="message-composer-shell">
                      <textarea
                        value={messageInput}
                        onChange={handleComposerInputChange}
                        onKeyDown={handleComposerKeyDown}
                        placeholder="Type a message"
                        className="composer-textarea message-composer-textarea"
                        maxLength={1200}
                        rows={2}
                      />
                      <button type="submit" disabled={isSendingMessage || !messageInput.trim()} className="message-send-button">
                        <span className="message-send-label">{isSendingMessage ? 'Sending' : 'Send'}</span>
                      </button>
                    </div>
                  </form>

                  {isSendingMessage ? <p className="message-sending-note">Sending message...</p> : null}

                  {sendMessageError ? <p className="friend-inline-error mt-2">{sendMessageError}</p> : null}
                </>
              ) : null}
            </div>
          </div>
        </section>
      </AppShell>
    </AuthOnly>
  )
}
