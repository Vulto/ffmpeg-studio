export type FfmpegProgressPartial = {
  timeSec?: number
  frame?: number
}

/** Parse time= and frame= tokens from ffmpeg stderr/meta lines. */
export function parseFfmpegProgress(text: string): FfmpegProgressPartial | null {
  let timeSec: number | undefined
  let frame: number | undefined

  const timeMatch = text.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (timeMatch) {
    const h = Number(timeMatch[1])
    const m = Number(timeMatch[2])
    const s = Number(timeMatch[3])
    if (Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s)) {
      timeSec = h * 3600 + m * 60 + s
    }
  }

  const frameMatch = text.match(/frame=\s*(\d+)/)
  if (frameMatch) {
    const f = Number(frameMatch[1])
    if (Number.isFinite(f)) frame = f
  }

  if (timeSec === undefined && frame === undefined) return null
  return { timeSec, frame }
}

/**
 * Map parsed progress to 0–100.
 * Prefer time/duration when known; otherwise a soft frame-based estimate capped at 99.
 */
export function progressPercentFromPartial(
  partial: FfmpegProgressPartial,
  durationSec?: number,
): number | null {
  if (
    partial.timeSec !== undefined &&
    durationSec !== undefined &&
    durationSec > 0 &&
    Number.isFinite(durationSec)
  ) {
    return Math.min(99, Math.max(0, (partial.timeSec / durationSec) * 100))
  }

  if (partial.frame !== undefined && partial.frame > 0) {
    // Soft curve without known total frames — keeps bar moving, never full until exit.
    return Math.min(99, Math.max(1, Math.log10(partial.frame + 1) * 25))
  }

  return null
}
