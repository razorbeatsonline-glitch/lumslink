import { supabase } from './supabase'

const AVATAR_BUCKET = 'avatars'
const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const AVATAR_MAX_FILE_SIZE = 5 * 1024 * 1024

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function getAvatarAcceptAttribute() {
  return AVATAR_ALLOWED_MIME_TYPES.join(',')
}

export function validateAvatarFile(file: File) {
  if (!AVATAR_ALLOWED_MIME_TYPES.includes(file.type as (typeof AVATAR_ALLOWED_MIME_TYPES)[number])) {
    return 'Only JPG, PNG, or WEBP images are supported.'
  }

  if (file.size > AVATAR_MAX_FILE_SIZE) {
    return 'Image must be 5MB or smaller.'
  }

  return null
}

function getFileExtension(file: File) {
  const fromMime = MIME_TO_EXTENSION[file.type]
  if (fromMime) return fromMime

  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && ['jpg', 'jpeg', 'png', 'webp'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }

  return 'jpg'
}

export async function uploadAvatarForUser(userId: string, file: File) {
  const validationError = validateAvatarFile(file)
  if (validationError) {
    return { avatarUrl: null, errorMessage: validationError }
  }

  const extension = getFileExtension(file)
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    console.error('Supabase avatar upload error:', uploadError)
    return { avatarUrl: null, errorMessage: 'Unable to upload your profile photo. Please try again.' }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)

  if (!publicUrl) {
    console.error('Supabase avatar public URL error:', { userId, filePath })
    return { avatarUrl: null, errorMessage: 'Avatar upload completed but URL generation failed. Please try again.' }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (updateError) {
    console.error('Supabase profile avatar update error:', updateError)
    return { avatarUrl: null, errorMessage: 'Avatar uploaded, but profile update failed. Please try again.' }
  }

  return { avatarUrl: publicUrl, errorMessage: null }
}
