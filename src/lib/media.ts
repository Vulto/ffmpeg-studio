const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

const ACCEPTED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export type MediaKind = 'image' | 'video'

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
}

export function getMimeFromFileName(fileName: string): string | null {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
  return EXT_TO_MIME[ext] ?? null
}

export function getMediaKindFromFileName(fileName: string): MediaKind | null {
  const mime = getMimeFromFileName(fileName)
  return mime ? getMediaKind(mime) : null
}

export function getMediaKind(mimeType: string): MediaKind | null {
  if (!mimeType) return null
  if (ACCEPTED_IMAGE_TYPES.has(mimeType)) return 'image'
  if (ACCEPTED_VIDEO_TYPES.has(mimeType)) return 'video'
  return null
}

/** Resolve media kind from MIME type, falling back to file extension. */
export function getFileMediaKind(file: File): MediaKind | null {
  return getMediaKind(file.type) ?? getMediaKindFromFileName(file.name)
}

export function isAcceptedMediaFile(file: File): boolean {
  return getFileMediaKind(file) !== null
}

export function filterAcceptedFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(isAcceptedMediaFile)
}

/** Safe upload cap — keep in sync with server UPLOAD_MAX_BYTES default. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '100 MB'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isWithinUploadLimit(file: File): boolean {
  return file.size <= MAX_UPLOAD_BYTES
}

export function getOversizedMediaMessage(file: File): string {
  return `"${file.name}" is ${formatFileSize(file.size)} (max ${MAX_UPLOAD_LABEL})`
}

const MAX_NODE_WIDTH = 480

export function getDisplaySize(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  if (naturalWidth <= MAX_NODE_WIDTH) {
    return { width: naturalWidth, height: naturalHeight }
  }

  const scale = MAX_NODE_WIDTH / naturalWidth
  return {
    width: MAX_NODE_WIDTH,
    height: Math.round(naturalHeight * scale),
  }
}

export function formatDuration(seconds: number): string {
  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function formatFrameRate(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return ''
  const rounded = Math.round(fps * 100) / 100
  if (Number.isInteger(rounded)) return `${rounded} fps`
  // Prefer one decimal when enough (e.g. 29.97 → keep two if needed)
  const one = Math.round(fps * 10) / 10
  if (Math.abs(fps - one) < 0.05) return `${one} fps`
  return `${rounded} fps`
}

export async function probeImage(file: File): Promise<{
  naturalWidth: number
  naturalHeight: number
}> {
  const blobUrl = URL.createObjectURL(file)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`))
      img.src = blobUrl
    })

    return {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}

export async function probeImageUrl(url: string): Promise<{
  naturalWidth: number
  naturalHeight: number
}> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = url
  })

  return {
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }
}

export async function probeVideoUrl(url: string): Promise<{
  naturalWidth: number
  naturalHeight: number
  duration: number
}> {
  const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
    const el = document.createElement('video')
    el.preload = 'metadata'
    el.muted = true
    el.playsInline = true
    el.onloadedmetadata = () => resolve(el)
    el.onerror = () => reject(new Error('Failed to load video'))
    el.src = url
  })

  return {
    naturalWidth: video.videoWidth,
    naturalHeight: video.videoHeight,
    duration: video.duration,
  }
}

export async function probeVideo(file: File): Promise<{
  naturalWidth: number
  naturalHeight: number
  duration: number
}> {
  const blobUrl = URL.createObjectURL(file)

  try {
    const video = await new Promise<HTMLVideoElement>((resolve, reject) => {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.muted = true
      el.playsInline = true
      el.onloadedmetadata = () => resolve(el)
      el.onerror = () => reject(new Error(`Failed to load video: ${file.name}`))
      el.src = blobUrl
    })

    return {
      naturalWidth: video.videoWidth,
      naturalHeight: video.videoHeight,
      duration: video.duration,
    }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}