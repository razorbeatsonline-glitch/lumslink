import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, TouchEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { AppShell, FullscreenLoader } from '@/components/ui-shell'
import { useAuth } from '@/lib/auth-context'
import { AuthOnly } from '@/lib/route-guards'
import { supabase } from '@/lib/supabase'

export const Route = createFileRoute('/feed')({
  component: FeedPage,
})

type PostRow = {
  id: string
  user_id: string
  content: string | null
  media_url: string | null
  media_type: 'image' | 'video' | null
  created_at: string
}

type ProfilePreview = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

type FeedPost = PostRow & {
  profile: ProfilePreview | null
}

type LikeRow = {
  post_id: string
  user_id: string
}

type CommentRow = {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
}

type FeedComment = CommentRow & {
  profile: ProfilePreview | null
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
const MAX_IMAGE_SIZE = 10 * 1024 * 1024
const MAX_VIDEO_SIZE = 50 * 1024 * 1024

function formatPostDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Just now'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? '')
    .join('')
}

function getPostMediaStoragePath(mediaUrl: string | null) {
  if (!mediaUrl) return null

  try {
    const url = new URL(mediaUrl)
    const marker = '/post-media/'
    const start = url.pathname.indexOf(marker)

    if (start === -1) return null
    return decodeURIComponent(url.pathname.slice(start + marker.length))
  } catch {
    return null
  }
}

function HeartIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 21.35 10.55 20C5.4 15.23 2 12.08 2 8.24 2 5.1 4.42 2.7 7.5 2.7c1.74 0 3.41.82 4.5 2.12 1.09-1.3 2.76-2.12 4.5-2.12 3.08 0 5.5 2.4 5.5 5.54 0 3.84-3.4 6.99-8.55 11.77L12 21.35Z"
        fill="currentColor"
      />
    </svg>
  )
}

function CommentIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        d="M12 3c5.08 0 9 3.55 9 8.08 0 4.52-3.92 8.09-9 8.09-1.24 0-2.41-.22-3.46-.61L4.2 21l.72-3.82C3.12 15.7 2 13.52 2 11.08 2 6.55 5.92 3 11 3h1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FeedPage() {
  const { status, user, profile } = useAuth()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isFeedLoading, setIsFeedLoading] = useState(true)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [postMenuId, setPostMenuId] = useState<string | null>(null)
  const [confirmDeletePost, setConfirmDeletePost] = useState<FeedPost | null>(null)
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null)
  const [deleteErrorById, setDeleteErrorById] = useState<Record<string, string>>({})

  const [likesCountByPost, setLikesCountByPost] = useState<Record<string, number>>({})
  const [likedByPost, setLikedByPost] = useState<Record<string, boolean>>({})
  const [likeAnimationTickByPost, setLikeAnimationTickByPost] = useState<Record<string, number>>({})
  const [commentsCountByPost, setCommentsCountByPost] = useState<Record<string, number>>({})
  const [isLikePendingByPost, setIsLikePendingByPost] = useState<Record<string, boolean>>({})
  const [interactionErrorByPost, setInteractionErrorByPost] = useState<Record<string, string>>({})

  const [activeCommentsPostId, setActiveCommentsPostId] = useState<string | null>(null)
  const [commentsByPost, setCommentsByPost] = useState<Record<string, FeedComment[]>>({})
  const [isCommentsLoadingByPost, setIsCommentsLoadingByPost] = useState<Record<string, boolean>>({})
  const [commentDraftByPost, setCommentDraftByPost] = useState<Record<string, string>>({})
  const [isCommentPostingByPost, setIsCommentPostingByPost] = useState<Record<string, boolean>>({})
  const [commentErrorByPost, setCommentErrorByPost] = useState<Record<string, string>>({})
  const [isCommentDeletePendingById, setIsCommentDeletePendingById] = useState<Record<string, boolean>>({})
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null)
  const tapTrackerRef = useRef<Record<string, { timestamp: number; x: number; y: number }>>({})

  const hydratePostInteractions = useCallback(async (postIds: string[], currentUserId: string) => {
    const likeCounts: Record<string, number> = {}
    const likedState: Record<string, boolean> = {}
    const commentCounts: Record<string, number> = {}

    for (const postId of postIds) {
      likeCounts[postId] = 0
      likedState[postId] = false
      commentCounts[postId] = 0
    }

    const [likesResponse, commentsResponse] = await Promise.all([
      supabase.from('likes').select('post_id, user_id').in('post_id', postIds),
      supabase.from('comments').select('id, post_id').in('post_id', postIds),
    ])

    const { data: likeRows, error: likesError } = likesResponse
    if (likesError) {
      console.error('Supabase likes fetch error:', likesError)
    } else {
      for (const row of (likeRows ?? []) as LikeRow[]) {
        likeCounts[row.post_id] = (likeCounts[row.post_id] ?? 0) + 1
        if (row.user_id === currentUserId) {
          likedState[row.post_id] = true
        }
      }
    }

    const { data: commentRows, error: commentsError } = commentsResponse
    if (commentsError) {
      console.error('Supabase comments-count fetch error:', commentsError)
    } else {
      for (const row of (commentRows ?? []) as Pick<CommentRow, 'post_id'>[]) {
        commentCounts[row.post_id] = (commentCounts[row.post_id] ?? 0) + 1
      }
    }

    setLikesCountByPost((prev) => ({ ...prev, ...likeCounts }))
    setLikedByPost((prev) => ({ ...prev, ...likedState }))
    setCommentsCountByPost((prev) => ({ ...prev, ...commentCounts }))
  }, [])

  const loadFeed = useCallback(async () => {
    if (!user?.id) {
      setPosts([])
      setIsFeedLoading(false)
      return
    }

    setIsFeedLoading(true)
    setFeedError(null)

    const { data: postRows, error: postError } = await supabase
      .from('posts')
      .select('id, user_id, content, media_url, media_type, created_at')
      .order('created_at', { ascending: false })

    if (postError) {
      setFeedError('Unable to load posts right now. Please refresh and try again.')
      setIsFeedLoading(false)
      return
    }

    const postsData = (postRows ?? []) as PostRow[]

    if (postsData.length === 0) {
      setPosts([])
      setLikesCountByPost({})
      setLikedByPost({})
      setCommentsCountByPost({})
      setIsFeedLoading(false)
      return
    }

    const userIds = Array.from(new Set(postsData.map((item) => item.user_id)))
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', userIds)

    if (profileError) {
      setFeedError('Posts loaded, but profile details were unavailable. Please try again.')
      setIsFeedLoading(false)
      return
    }

    const profileMap = new Map<string, ProfilePreview>((profileRows ?? []).map((item) => [item.id, item as ProfilePreview]))

    const nextPosts = postsData.map((item) => ({ ...item, profile: profileMap.get(item.user_id) ?? null }))
    setPosts(nextPosts)

    await hydratePostInteractions(
      nextPosts.map((item) => item.id),
      user.id,
    )

    setIsFeedLoading(false)
  }, [hydratePostInteractions, user?.id])

  useEffect(() => {
    if (status !== 'authenticated') return
    void loadFeed()
  }, [loadFeed, status])

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl)
      }
    }
  }, [selectedPreviewUrl])

  const currentDisplayName = useMemo(() => {
    if (profile?.full_name?.trim()) return profile.full_name.trim()
    if (profile?.username?.trim()) return profile.username.trim()
    if (user?.email) return user.email.split('@')[0]
    return 'You'
  }, [profile?.full_name, profile?.username, user?.email])

  const activeCommentsPost = useMemo(() => {
    if (!activeCommentsPostId) return null
    return posts.find((item) => item.id === activeCommentsPostId) ?? null
  }, [activeCommentsPostId, posts])

  const handleFileChange = (file: File | null) => {
    setComposerError(null)

    if (!file) {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl)
      }
      setSelectedFile(null)
      setSelectedPreviewUrl(null)
      return
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      setComposerError('Only JPG, PNG, WEBP, MP4, WEBM, or MOV files are supported.')
      return
    }

    if (file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE) {
      setComposerError('Images must be 10MB or smaller.')
      return
    }

    if (file.type.startsWith('video/') && file.size > MAX_VIDEO_SIZE) {
      setComposerError('Videos must be 50MB or smaller.')
      return
    }

    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl)
    }

    setSelectedFile(file)
    setSelectedPreviewUrl(URL.createObjectURL(file))
  }

  const clearSelectedMedia = () => {
    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl)
    }
    setSelectedFile(null)
    setSelectedPreviewUrl(null)
    setComposerError(null)
  }

  const loadCommentsForPost = useCallback(async (postId: string) => {
    setIsCommentsLoadingByPost((prev) => ({ ...prev, [postId]: true }))
    setCommentErrorByPost((prev) => ({ ...prev, [postId]: '' }))

    const { data: commentRows, error: commentsError } = await supabase
      .from('comments')
      .select('id, post_id, user_id, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (commentsError) {
      console.error('Supabase comments fetch error:', commentsError)
      setCommentErrorByPost((prev) => ({
        ...prev,
        [postId]: 'Comments could not be loaded right now. Please try again.',
      }))
      setIsCommentsLoadingByPost((prev) => ({ ...prev, [postId]: false }))
      return
    }

    const rows = (commentRows ?? []) as CommentRow[]

    if (rows.length === 0) {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [] }))
      setCommentsCountByPost((prev) => ({ ...prev, [postId]: 0 }))
      setIsCommentsLoadingByPost((prev) => ({ ...prev, [postId]: false }))
      return
    }

    const commenterIds = Array.from(new Set(rows.map((row) => row.user_id)))
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', commenterIds)

    if (profileError) {
      console.error('Supabase comment-profiles fetch error:', profileError)
    }

    const profileMap = new Map<string, ProfilePreview>((profileRows ?? []).map((item) => [item.id, item as ProfilePreview]))

    const hydratedComments: FeedComment[] = rows.map((row) => ({
      ...row,
      profile: profileMap.get(row.user_id) ?? null,
    }))

    setCommentsByPost((prev) => ({ ...prev, [postId]: hydratedComments }))
    setCommentsCountByPost((prev) => ({ ...prev, [postId]: hydratedComments.length }))
    setIsCommentsLoadingByPost((prev) => ({ ...prev, [postId]: false }))
  }, [])

  const openComments = (postId: string) => {
    setActiveCommentsPostId(postId)
    setConfirmDeleteCommentId(null)

    if (!commentsByPost[postId]) {
      void loadCommentsForPost(postId)
    }
  }

  const closeComments = () => {
    setActiveCommentsPostId(null)
    setConfirmDeleteCommentId(null)
  }

  const triggerLikeAnimation = (postId: string) => {
    setLikeAnimationTickByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? 0) + 1,
    }))
  }

  const likePost = async (postId: string) => {
    if (!user?.id || isLikePendingByPost[postId]) return
    const currentlyLiked = likedByPost[postId] ?? false
    if (currentlyLiked) return

    const currentCount = likesCountByPost[postId] ?? 0
    const nextCount = currentCount + 1

    setInteractionErrorByPost((prev) => ({ ...prev, [postId]: '' }))
    setIsLikePendingByPost((prev) => ({ ...prev, [postId]: true }))
    setLikedByPost((prev) => ({ ...prev, [postId]: true }))
    setLikesCountByPost((prev) => ({ ...prev, [postId]: nextCount }))
    triggerLikeAnimation(postId)

    const { error: likeError } = await supabase.from('likes').insert({ post_id: postId, user_id: user.id })

    if (likeError) {
      console.error('Supabase like error:', likeError)
      setLikedByPost((prev) => ({ ...prev, [postId]: currentlyLiked }))
      setLikesCountByPost((prev) => ({ ...prev, [postId]: currentCount }))
      setInteractionErrorByPost((prev) => ({
        ...prev,
        [postId]: 'Unable to like this post right now. Please try again.',
      }))
    }

    setIsLikePendingByPost((prev) => ({ ...prev, [postId]: false }))
  }

  const toggleLike = async (postId: string) => {
    if (!user?.id || isLikePendingByPost[postId]) return

    const currentlyLiked = likedByPost[postId] ?? false

    if (!currentlyLiked) {
      await likePost(postId)
      return
    }

    const currentCount = likesCountByPost[postId] ?? 0
    const nextCount = currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1

    setInteractionErrorByPost((prev) => ({ ...prev, [postId]: '' }))
    setIsLikePendingByPost((prev) => ({ ...prev, [postId]: true }))
    setLikedByPost((prev) => ({ ...prev, [postId]: !currentlyLiked }))
    setLikesCountByPost((prev) => ({ ...prev, [postId]: nextCount }))

    if (currentlyLiked) {
      const { error: unlikeError } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', user.id)

      if (unlikeError) {
        console.error('Supabase unlike error:', unlikeError)
        setLikedByPost((prev) => ({ ...prev, [postId]: currentlyLiked }))
        setLikesCountByPost((prev) => ({ ...prev, [postId]: currentCount }))
        setInteractionErrorByPost((prev) => ({
          ...prev,
          [postId]: 'Unable to remove your like right now. Please try again.',
        }))
      }

      setIsLikePendingByPost((prev) => ({ ...prev, [postId]: false }))
      return
    }
  }

  const handleDoubleTapLike = async (postId: string) => {
    const currentlyLiked = likedByPost[postId] ?? false
    if (currentlyLiked || isLikePendingByPost[postId]) return
    await likePost(postId)
  }

  const shouldSkipDoubleTapTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    return target.closest('[data-no-double-like="true"]') !== null
  }

  const handleSurfaceDoubleClick = (event: MouseEvent<HTMLElement>, postId: string) => {
    if (shouldSkipDoubleTapTarget(event.target)) return
    void handleDoubleTapLike(postId)
  }

  const handleSurfaceTouchEnd = (event: TouchEvent<HTMLElement>, postId: string) => {
    const touch = event.changedTouches[0]
    if (!touch || shouldSkipDoubleTapTarget(event.target)) return

    const now = Date.now()
    const previousTap = tapTrackerRef.current[postId]
    const maxDelay = 300
    const maxDistance = 24

    if (previousTap) {
      const elapsed = now - previousTap.timestamp
      const distance = Math.hypot(touch.clientX - previousTap.x, touch.clientY - previousTap.y)

      if (elapsed <= maxDelay && distance <= maxDistance) {
        delete tapTrackerRef.current[postId]
        void handleDoubleTapLike(postId)
        return
      }
    }

    tapTrackerRef.current[postId] = {
      timestamp: now,
      x: touch.clientX,
      y: touch.clientY,
    }
  }

  const submitPost = async () => {
    if (!user?.id || isPosting) return

    setComposerError(null)
    const trimmedContent = content.trim()

    if (!trimmedContent && !selectedFile) {
      setComposerError('Write something or attach media before posting.')
      return
    }

    setIsPosting(true)

    let mediaUrl: string | null = null
    let mediaType: 'image' | 'video' | null = null

    if (selectedFile) {
      const timestamp = Date.now()
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const storagePath = `${user.id}/${timestamp}-${safeName}`

      const { error: uploadError } = await supabase.storage.from('post-media').upload(storagePath, selectedFile, {
        upsert: false,
        contentType: selectedFile.type,
      })

      if (uploadError) {
        setComposerError('Media upload failed. Please try a different file or retry.')
        setIsPosting(false)
        return
      }

      const { data: publicData } = supabase.storage.from('post-media').getPublicUrl(storagePath)
      mediaUrl = publicData.publicUrl
      mediaType = selectedFile.type.startsWith('image/') ? 'image' : 'video'
    }

    const { data: inserted, error: insertError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        content: trimmedContent ? trimmedContent : null,
        media_url: mediaUrl,
        media_type: mediaType,
      })
      .select('id, user_id, content, media_url, media_type, created_at')
      .single<PostRow>()

    if (insertError || !inserted) {
      setComposerError('Post could not be published. Please try again.')
      setIsPosting(false)
      return
    }

    const postForFeed: FeedPost = {
      ...inserted,
      profile: {
        id: user.id,
        username: profile?.username ?? null,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
    }

    setPosts((prev) => [postForFeed, ...prev])
    setLikesCountByPost((prev) => ({ ...prev, [inserted.id]: 0 }))
    setLikedByPost((prev) => ({ ...prev, [inserted.id]: false }))
    setCommentsCountByPost((prev) => ({ ...prev, [inserted.id]: 0 }))
    setContent('')
    clearSelectedMedia()
    setIsPosting(false)
  }

  const submitComment = async (postId: string) => {
    if (!user?.id || isCommentPostingByPost[postId]) return

    const draft = commentDraftByPost[postId] ?? ''
    const trimmedContent = draft.trim()

    if (!trimmedContent) {
      setCommentErrorByPost((prev) => ({ ...prev, [postId]: 'Write a comment before posting.' }))
      return
    }

    setCommentErrorByPost((prev) => ({ ...prev, [postId]: '' }))
    setIsCommentPostingByPost((prev) => ({ ...prev, [postId]: true }))

    const { data: insertedComment, error: insertError } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        content: trimmedContent,
      })
      .select('id, post_id, user_id, content, created_at')
      .single<CommentRow>()

    if (insertError || !insertedComment) {
      console.error('Supabase comment insert error:', insertError)
      setCommentErrorByPost((prev) => ({
        ...prev,
        [postId]: 'Comment could not be posted right now. Please try again.',
      }))
      setIsCommentPostingByPost((prev) => ({ ...prev, [postId]: false }))
      return
    }

    const commentProfile: ProfilePreview | null = user.id
      ? {
          id: user.id,
          username: profile?.username ?? null,
          full_name: profile?.full_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
        }
      : null

    const nextComment: FeedComment = {
      ...insertedComment,
      profile: commentProfile,
    }

    setCommentsByPost((prev) => {
      const existing = prev[postId] ?? []
      return {
        ...prev,
        [postId]: [...existing, nextComment],
      }
    })

    setCommentsCountByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? 0) + 1,
    }))

    setCommentDraftByPost((prev) => ({ ...prev, [postId]: '' }))
    setIsCommentPostingByPost((prev) => ({ ...prev, [postId]: false }))
  }

  const requestDeletePost = (post: FeedPost) => {
    setPostMenuId(null)
    setConfirmDeletePost(post)
  }

  const deleteComment = async (postId: string, commentId: string) => {
    if (!user?.id || isCommentDeletePendingById[commentId]) return

    setCommentErrorByPost((prev) => ({ ...prev, [postId]: '' }))
    setIsCommentDeletePendingById((prev) => ({ ...prev, [commentId]: true }))

    const { error: deleteCommentError } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .eq('user_id', user.id)

    if (deleteCommentError) {
      console.error('Supabase comment delete error:', deleteCommentError)
      setCommentErrorByPost((prev) => ({
        ...prev,
        [postId]: 'Unable to delete this comment right now. Please try again.',
      }))
      setIsCommentDeletePendingById((prev) => ({ ...prev, [commentId]: false }))
      return
    }

    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).filter((item) => item.id !== commentId),
    }))

    setCommentsCountByPost((prev) => ({
      ...prev,
      [postId]: Math.max(0, (prev[postId] ?? 0) - 1),
    }))

    setIsCommentDeletePendingById((prev) => ({ ...prev, [commentId]: false }))
    setConfirmDeleteCommentId(null)
  }

  const handleDeletePost = async () => {
    if (!confirmDeletePost || !user?.id || deletingPostId) return

    const postId = confirmDeletePost.id
    setDeleteErrorById((prev) => {
      if (!prev[postId]) return prev
      return { ...prev, [postId]: '' }
    })
    setDeletingPostId(postId)

    const mediaPath = getPostMediaStoragePath(confirmDeletePost.media_url)
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', postId).eq('user_id', user.id)

    if (deleteError) {
      console.error('Supabase post delete error:', deleteError)
      setDeleteErrorById((prev) => ({
        ...prev,
        [postId]: 'Unable to delete this post right now. Please try again.',
      }))
      setDeletingPostId(null)
      setConfirmDeletePost(null)
      return
    }

    setPosts((prev) => prev.filter((item) => item.id !== postId))
    setLikesCountByPost((prev) => {
      const next = { ...prev }
      delete next[postId]
      return next
    })
    setLikedByPost((prev) => {
      const next = { ...prev }
      delete next[postId]
      return next
    })
    setCommentsCountByPost((prev) => {
      const next = { ...prev }
      delete next[postId]
      return next
    })
    setCommentsByPost((prev) => {
      const next = { ...prev }
      delete next[postId]
      return next
    })

    if (activeCommentsPostId === postId) {
      closeComments()
    }

    setDeletingPostId(null)
    setConfirmDeletePost(null)

    if (!mediaPath) return

    const { error: storageCleanupError } = await supabase.storage.from('post-media').remove([mediaPath])
    if (storageCleanupError) {
      console.error('Supabase post-media cleanup error:', storageCleanupError)
    }
  }

  const canSubmit = (!isPosting && content.trim().length > 0) || (!isPosting && !!selectedFile)

  if (status === 'loading') {
    return <FullscreenLoader message="Loading feed..." />
  }

  return (
    <AuthOnly>
      <AppShell title="Feed">
        <section className="mx-auto flex w-full max-w-2xl flex-col gap-3.5 sm:gap-5">
          <article className="soft-card feed-card animate-fade-up p-3.5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="avatar-ring">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={currentDisplayName} className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{getInitials(currentDisplayName) || 'Y'}</span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-sky-900">{currentDisplayName}</p>
                <p className="text-xs text-sky-600">Share an update with the community</p>
              </div>
            </div>

            <label htmlFor="post-content" className="sr-only">
              Post content
            </label>
            <textarea
              id="post-content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                if (composerError) setComposerError(null)
              }}
              rows={4}
              placeholder="What are you building, learning, or celebrating today?"
              className="composer-textarea"
              disabled={isPosting}
            />

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={`upload-trigger ${isPosting ? 'opacity-60' : ''}`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                  onChange={(event) => {
                    handleFileChange(event.target.files?.[0] ?? null)
                    event.currentTarget.value = ''
                  }}
                  disabled={isPosting}
                  className="sr-only"
                />
                Add Image or Video
              </label>

              {selectedFile ? (
                <button type="button" onClick={clearSelectedMedia} className="upload-clear" disabled={isPosting}>
                  Remove Media
                </button>
              ) : null}

              <button type="button" onClick={() => void submitPost()} className="post-submit ml-auto" disabled={!canSubmit}>
                {isPosting ? 'Publishing...' : 'Publish Post'}
              </button>
            </div>

            {selectedFile && selectedPreviewUrl ? (
              <div className="media-preview animate-fade-up mt-4">
                {selectedFile.type.startsWith('image/') ? (
                  <div className="post-media-frame">
                    <img src={selectedPreviewUrl} alt="Selected media preview" className="post-media-element" />
                  </div>
                ) : (
                  <div className="post-media-frame">
                    <video src={selectedPreviewUrl} controls className="post-media-element" />
                  </div>
                )}
              </div>
            ) : null}

            {composerError ? <p className="mt-3 text-sm font-medium text-rose-700">{composerError}</p> : null}
          </article>

          {isFeedLoading ? (
            <div className="space-y-4">
              <div className="soft-card feed-card shimmer h-44 animate-fade-up p-5" />
              <div className="soft-card feed-card shimmer h-52 animate-fade-up p-5" style={{ animationDelay: '90ms' }} />
            </div>
          ) : null}

          {!isFeedLoading && feedError ? (
            <div className="soft-card feed-card animate-fade-up p-6">
              <p className="text-base font-semibold text-rose-700">{feedError}</p>
              <button type="button" onClick={() => void loadFeed()} className="upload-clear mt-4">
                Retry
              </button>
            </div>
          ) : null}

          {!isFeedLoading && !feedError && posts.length === 0 ? (
            <div className="soft-card feed-card animate-fade-up p-8 text-center">
              <h2 className="text-2xl font-bold text-sky-950">No posts yet</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-sky-700 sm:text-base">
                Start the conversation by sharing your first update, photo, or short video with the community.
              </p>
            </div>
          ) : null}

          {!isFeedLoading && !feedError && posts.length > 0 ? (
            <div className="space-y-4">
              {posts.map((post, index) => {
                const displayName = post.profile?.full_name?.trim() || post.profile?.username?.trim() || 'Community Member'
                const handle = post.profile?.username?.trim() ? `@${post.profile.username?.trim()}` : null
                const isOwner = post.user_id === user?.id
                const isLiked = likedByPost[post.id] ?? false
                const likesCount = likesCountByPost[post.id] ?? 0
                const commentsCount = commentsCountByPost[post.id] ?? 0
                const isLikePending = isLikePendingByPost[post.id] ?? false
                const likeAnimationTick = likeAnimationTickByPost[post.id] ?? 0

                return (
                  <article
                    key={post.id}
                    className="soft-card feed-card post-card animate-fade-up p-3.5 sm:p-5"
                    style={{ animationDelay: `${Math.min(index * 40, 240)}ms` }}
                  >
                    <header className="post-card-header">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="avatar-ring">
                          {post.profile?.avatar_url ? (
                            <img src={post.profile.avatar_url} alt={displayName} className="h-full w-full rounded-full object-cover" />
                          ) : (
                            <span>{getInitials(displayName) || 'U'}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-sky-900">{displayName}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-600">
                            {handle ? <span>{handle}</span> : null}
                            <span>{formatPostDate(post.created_at)}</span>
                          </div>
                        </div>
                      </div>

                      {isOwner ? (
                        <div className="post-actions-menu-wrap">
                          <button
                            type="button"
                            className="post-actions-trigger"
                            aria-haspopup="menu"
                            aria-expanded={postMenuId === post.id}
                            onClick={() => setPostMenuId((current) => (current === post.id ? null : post.id))}
                            disabled={deletingPostId === post.id}
                          >
                            Actions
                          </button>

                          {postMenuId === post.id ? (
                            <div role="menu" className="post-actions-menu">
                              <button
                                type="button"
                                role="menuitem"
                                className="post-actions-menu-item post-actions-menu-item-danger"
                                onClick={() => requestDeletePost(post)}
                                disabled={deletingPostId === post.id}
                              >
                                Delete post
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </header>

                    {post.content || (post.media_type === 'image' && post.media_url) ? (
                      <div
                        className="post-like-surface"
                        onDoubleClick={(event) => handleSurfaceDoubleClick(event, post.id)}
                        onTouchEnd={(event) => handleSurfaceTouchEnd(event, post.id)}
                      >
                        {post.content ? <p className="post-card-content">{post.content}</p> : null}

                        {post.media_type === 'image' && post.media_url ? (
                          <div className="post-media-frame">
                            <img src={post.media_url} alt="Post media" className="post-media-element" loading="lazy" />
                          </div>
                        ) : null}

                        {likeAnimationTick > 0 ? (
                          <div key={`${post.id}-${likeAnimationTick}`} className="like-burst-layer" aria-hidden="true">
                            <span className="like-burst-ripple" />
                            <span className="like-burst-heart-wrap">
                              <HeartIcon className="like-burst-heart" />
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {post.media_type === 'video' && post.media_url ? (
                      <div className="post-media-frame" data-no-double-like="true">
                        <video src={post.media_url} controls className="post-media-element" preload="metadata" data-no-double-like="true" />
                      </div>
                    ) : null}

                    <footer className="post-card-footer">
                      <div className="post-action-lane post-action-lane-main">
                        <button
                          type="button"
                          className={`post-action-button post-like-button ${isLiked ? 'post-action-button-active' : ''}`}
                          onClick={() => void toggleLike(post.id)}
                          disabled={isLikePending}
                          data-no-double-like="true"
                          aria-pressed={isLiked}
                        >
                          <span key={`${post.id}-${likeAnimationTick}`} className="post-action-icon-wrap" aria-hidden="true">
                            <HeartIcon
                              className={`post-action-icon ${isLiked ? 'post-action-icon-liked' : ''} ${
                                isLiked && likeAnimationTick > 0 ? 'post-action-icon-liked-animate' : ''
                              }`}
                            />
                          </span>
                          <span className="post-action-label">
                            {isLikePending ? (isLiked ? 'Updating...' : 'Saving...') : isLiked ? 'Liked' : 'Like'}
                          </span>
                          <span className="post-action-count">{likesCount}</span>
                        </button>

                        <button
                          type="button"
                          className="post-action-button post-comment-button"
                          onClick={() => openComments(post.id)}
                          data-no-double-like="true"
                        >
                          <span className="post-action-icon-wrap" aria-hidden="true">
                            <CommentIcon className="post-action-icon" />
                          </span>
                          <span className="post-action-label">Comments</span>
                          <span className="post-action-count">{commentsCount}</span>
                        </button>
                      </div>

                      {deleteErrorById[post.id] || interactionErrorByPost[post.id] ? (
                        <div className="post-action-feedback">
                          {deleteErrorById[post.id] ? <p className="post-inline-error">{deleteErrorById[post.id]}</p> : null}
                          {interactionErrorByPost[post.id] ? <p className="post-inline-error">{interactionErrorByPost[post.id]}</p> : null}
                        </div>
                      ) : null}
                    </footer>
                  </article>
                )
              })}
            </div>
          ) : null}
        </section>

        {confirmDeletePost ? (
          <div className="dialog-overlay" role="presentation">
            <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="delete-post-title">
              <h3 id="delete-post-title" className="text-lg font-bold text-sky-950">
                Delete this post?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-sky-700">
                This action permanently removes the post from the feed. It cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="upload-clear"
                  onClick={() => {
                    if (deletingPostId) return
                    setConfirmDeletePost(null)
                  }}
                  disabled={!!deletingPostId}
                >
                  Cancel
                </button>
                <button type="button" className="dialog-delete-button" onClick={() => void handleDeletePost()} disabled={!!deletingPostId}>
                  {deletingPostId === confirmDeletePost.id ? 'Deleting...' : 'Delete post'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {activeCommentsPost ? (
          <div className="dialog-overlay comments-sheet-overlay" role="presentation" onClick={closeComments}>
            <div
              className="comments-sheet-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="comments-title"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="comments-sheet-header">
                <div>
                  <h3 id="comments-title" className="comments-sheet-title">
                    Comments
                  </h3>
                  <p className="comments-sheet-subtitle">
                    {activeCommentsPost.profile?.full_name?.trim() || activeCommentsPost.profile?.username?.trim() || 'Community Member'}
                  </p>
                </div>
                <button type="button" className="upload-clear" onClick={closeComments}>
                  Close
                </button>
              </header>

              <div className="comments-sheet-body">
                {isCommentsLoadingByPost[activeCommentsPost.id] ? (
                  <div className="space-y-3">
                    <div className="comments-shimmer-row shimmer" />
                    <div className="comments-shimmer-row shimmer" />
                  </div>
                ) : null}

                {!isCommentsLoadingByPost[activeCommentsPost.id] && (commentsByPost[activeCommentsPost.id] ?? []).length === 0 ? (
                  <div className="comments-empty-state">
                    <p className="text-sm font-semibold text-sky-900">No comments yet</p>
                    <p className="mt-1 text-xs text-sky-600">Start the conversation with the first comment.</p>
                  </div>
                ) : null}

                {!isCommentsLoadingByPost[activeCommentsPost.id]
                  ? (commentsByPost[activeCommentsPost.id] ?? []).map((comment) => {
                      const commentName =
                        comment.profile?.full_name?.trim() || comment.profile?.username?.trim() || 'Community Member'
                      const commentHandle = comment.profile?.username?.trim() ? `@${comment.profile.username?.trim()}` : null
                      const isCommentOwner = comment.user_id === user?.id
                      const isDeletingComment = isCommentDeletePendingById[comment.id] ?? false
                      const isConfirmingDelete = confirmDeleteCommentId === comment.id

                      return (
                        <article key={comment.id} className="comment-card animate-fade-up">
                          <div className="flex items-start gap-3">
                            <div className="avatar-ring comment-avatar-ring">
                              {comment.profile?.avatar_url ? (
                                <img src={comment.profile.avatar_url} alt={commentName} className="h-full w-full rounded-full object-cover" />
                              ) : (
                                <span>{getInitials(commentName) || 'U'}</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-xs font-bold text-sky-900">{commentName}</p>
                                {commentHandle ? <span className="text-xs text-sky-600">{commentHandle}</span> : null}
                                <span className="text-xs text-sky-500">{formatPostDate(comment.created_at)}</span>
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-sky-800">{comment.content}</p>

                              {isCommentOwner ? (
                                <div className="mt-2 flex items-center gap-2">
                                  {!isConfirmingDelete ? (
                                    <button
                                      type="button"
                                      className="comment-delete-button"
                                      onClick={() => setConfirmDeleteCommentId(comment.id)}
                                      disabled={isDeletingComment}
                                    >
                                      Delete
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        type="button"
                                        className="comment-delete-button comment-delete-button-danger"
                                        onClick={() => void deleteComment(activeCommentsPost.id, comment.id)}
                                        disabled={isDeletingComment}
                                      >
                                        {isDeletingComment ? 'Deleting...' : 'Confirm delete'}
                                      </button>
                                      <button
                                        type="button"
                                        className="comment-delete-button"
                                        onClick={() => setConfirmDeleteCommentId(null)}
                                        disabled={isDeletingComment}
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      )
                    })
                  : null}
              </div>

              {commentErrorByPost[activeCommentsPost.id] ? (
                <p className="post-inline-error mt-1">{commentErrorByPost[activeCommentsPost.id]}</p>
              ) : null}

              <div className="comments-composer">
                <label htmlFor="comment-input" className="sr-only">
                  Add comment
                </label>
                <textarea
                  id="comment-input"
                  rows={2}
                  className="composer-textarea comment-textarea"
                  placeholder="Write a thoughtful comment..."
                  value={commentDraftByPost[activeCommentsPost.id] ?? ''}
                  onChange={(event) =>
                    setCommentDraftByPost((prev) => ({
                      ...prev,
                      [activeCommentsPost.id]: event.target.value,
                    }))
                  }
                  disabled={isCommentPostingByPost[activeCommentsPost.id] ?? false}
                />

                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-xs text-sky-600">Comments are visible to everyone who can view this post.</p>
                  <button
                    type="button"
                    className="post-submit"
                    onClick={() => void submitComment(activeCommentsPost.id)}
                    disabled={isCommentPostingByPost[activeCommentsPost.id] ?? false}
                  >
                    {isCommentPostingByPost[activeCommentsPost.id] ? 'Posting...' : 'Post comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </AuthOnly>
  )
}
