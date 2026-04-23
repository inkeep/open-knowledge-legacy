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

/**
 * SPEC 2026-04-23 amendment D-A5 — hard blocklist at the main-process
 * `openAsset` handler. Executable extensions are refused before
 * `shell.openPath` dispatch regardless of containment / existence checks.
 *
 * Union of three lists:
 *   - Windows executable set (verified from Obsidian 1.12.7 source
 *     reconstruction, `reports/electron-os-integration-patterns/` D10)
 *   - POSIX shell / launchable set (same source — macOS / Linux)
 *   - OK's existing stored-XSS defense `SCRIPTED_DOC_EXTS`
 *     (HTML / SVG / XML / MHTML variants that execute JS when opened in a
 *     browser chrome)
 *
 * The union is the principled blocklist — every extension in it is either
 * a shell-executable (RCE risk via OS handler) or a scripted document
 * (stored-XSS risk via browser-tab preview). Consumed by the main-process
 * `openAssetSafely` handler (`packages/desktop/src/main/asset-allowlist.ts`).
 *
 * Non-goal: signature-based blocking. We gate on extension because
 * `shell.openPath` dispatches by OS handler which is itself extension-keyed
 * on every platform OK supports.
 */
export const EXECUTABLE_BLOCKLIST_EXTENSIONS: ReadonlySet<string> = new Set([
  // Windows executables
  'exe',
  'bat',
  'cmd',
  'ps1',
  'com',
  'msi',
  'vbs',
  'js',
  'jse',
  'wsf',
  'wsh',
  // POSIX shells + Linux desktop launchers
  'sh',
  'command',
  'csh',
  'ksh',
  'bash',
  'zsh',
  'fish',
  'desktop',
  'action',
  'workflow',
  // Scripted documents (OK's existing SCRIPTED_DOC_EXTS — stored-XSS class)
  'html',
  'htm',
  'svg',
  'xml',
  'mhtml',
  'svgz',
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
//
// SPEC §6 FR-5 post-streaming (2026-04-22): `maxBytes` removed. The
// buffer-to-memory pattern it guarded is gone; streaming uploads are
// disk-bound only. See reports/streaming-upload-refactor/REPORT.md §D8.
export const DEFAULT_UPLOAD_CONFIG: UploadConfig = {
  attachmentFolderPath: './',
  emitFormat: 'wikiembed',
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
