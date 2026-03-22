import { supabase } from '@/lib/supabase'

export type NotificationType =
  | 'post_liked'
  | 'post_commented'
  | 'comment_replied'
  | 'mentioned_in_comment'
  | 'friend_request_received'

export type CreateNotificationInput = {
  userId: string
  actorId: string
  type: NotificationType
  postId?: string | null
  commentId?: string | null
  friendRequestId?: string | null
  message: string
  dedupeByContext?: boolean
}

function applyNullableEquality<T>(
  query: T,
  column: 'post_id' | 'comment_id' | 'friend_request_id',
  value: string | null | undefined,
): T {
  if (value) {
    // @ts-expect-error Supabase query builder typing differs by stage.
    return query.eq(column, value)
  }

  // @ts-expect-error Supabase query builder typing differs by stage.
  return query.is(column, null)
}

export async function createNotification(input: CreateNotificationInput) {
  const {
    userId,
    actorId,
    type,
    postId = null,
    commentId = null,
    friendRequestId = null,
    message,
    dedupeByContext = false,
  } = input

  if (!userId || !actorId) {
    return { created: false }
  }

  if (dedupeByContext) {
    let existingQuery = supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('actor_id', actorId)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)

    existingQuery = applyNullableEquality(existingQuery, 'post_id', postId)
    existingQuery = applyNullableEquality(existingQuery, 'comment_id', commentId)
    existingQuery = applyNullableEquality(existingQuery, 'friend_request_id', friendRequestId)

    const { data: existingRows, error: dedupeError } = await existingQuery

    if (dedupeError) {
      console.error('Supabase notification dedupe check error:', dedupeError)
    } else if ((existingRows?.length ?? 0) > 0) {
      return { created: false }
    }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    actor_id: actorId,
    type,
    post_id: postId,
    comment_id: commentId,
    friend_request_id: friendRequestId,
    message,
    is_read: false,
  })

  if (error) {
    console.error('Supabase notification insert error:', error)
    return { created: false, error }
  }

  return { created: true }
}
