export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

/**
 * Canonical image-extension set. One source of truth for every dispatch
 * question: client emit-shape (`pickInsertShape`), server mdast→PM
 * (`handlers.wikiLinkEmbed`), client TipTap renderHTML (WikiLinkEmbed).
 * Widening here (e.g. heic) lands in all three dispatch paths atomically.
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
]);

// SPEC §13 / FR-6 / D-H widening: ContentFilter must admit non-image asset
// extensions so they sit alongside markdown in the file index. The default
// matches the FR-5 `wikiEmbedExtensions` allowlist plus opaque types that
// the upload handler accepts (zip, fonts) but never wiki-embeds.
export const ASSET_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'zip',
  'woff',
  'woff2',
]);

// SPEC §6 FR-5 — shape of the upload configuration shared between cli (Zod
// schema source) and server (handler consumer). Defined in core so both sides
// resolve the same type without crossing package boundaries.
export type EmitFormat = 'wikiembed' | 'markdown-image';
export type DedupMode = 'off' | 'same-dir';
export type DedupUIMode = 'silent' | 'toast' | 'confirm';

export interface UploadConfig {
  attachmentFolderPath: string;
  emitFormat: EmitFormat;
  maxBytes: number;
  dedup: {
    mode: DedupMode;
    ui: DedupUIMode;
  };
  wikiEmbedExtensions: string[];
}

// Canonical default. Mirrors the Zod schema default in
// packages/cli/src/config/schema.ts. Kept here so every consumer — server
// upload handler, `/api/upload-config` response fallback, client emit
// dispatch — reads from the same source. If the list widens via config,
// the server resolves at request time; this constant is only used as a
// structural fallback when no config is wired (tests + client bootstrap
// before the first /api/upload-config fetch completes).
export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  attachmentFolderPath: './',
  emitFormat: 'wikiembed',
  maxBytes: 25 * 1024 * 1024,
  dedup: { mode: 'same-dir', ui: 'toast' },
  wikiEmbedExtensions: [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'avif',
    'svg',
    'pdf',
    'mp4',
    'webm',
    'mov',
    'mp3',
    'wav',
    'ogg',
    'm4a',
  ],
};
