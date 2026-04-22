export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

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
