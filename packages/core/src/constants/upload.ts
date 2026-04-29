export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg'] as const;

// `audio/webm` is intentionally absent: file-type@22's magic-byte detection
// returns `video/webm` for any WebM/Matroska container regardless of whether
// the stream is audio-only. Listing `audio/webm` here would never match the
// MIME `fileTypeFromBuffer` returns and would 400 every audio-only-webm
// upload that reached the allowlist check.
export const ALLOWED_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const;

export const ASSET_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
