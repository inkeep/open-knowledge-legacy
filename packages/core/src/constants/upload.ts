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

// Internal dispatch typing. These enums discriminate shape-selection in the
// client `pickInsertShape` and server upload handler; they are not a user
// config surface (SPEC 2026-04-24 amendment — zero user-facing upload config).
export type EmitFormat = 'wikiembed' | 'markdown-image';
export type DedupMode = 'off' | 'same-dir';
export type DedupUIMode = 'silent' | 'toast' | 'confirm';

// Fixed upload-surface constants. All values previously reachable via the
// `upload.*` YAML subtree are now hardcoded here. Every consumer — server
// upload handler, client emit dispatch, server mdast→PM pipeline — reads
// these directly. No /api/upload-config round-trip, no user config resolution.
//
// SPEC 2026-04-24 amendment (§Post-finalization amendment — config trim):
// user-facing upload config was removed because every field failed the "real
// user demand" test. Reintroduce only with concrete user evidence; don't add
// a knob on speculation. If a future feature needs a knob it comes with its
// own spec + its own user story.

/**
 * Where uploads land on disk, relative to the containing markdown doc's
 * directory. `'./'` = colocated (drop-next-to-doc UX). Consumed by the
 * server upload handler.
 */
export const DEFAULT_ATTACHMENT_FOLDER_PATH = './';

/**
 * How `pickInsertShape` emits renderable-asset drops. `'wikiembed'` =
 * `![[file.ext]]` (OK-native shape). `'markdown-image'` would emit
 * `![](path)` but is reserved for a future export-time transformation;
 * the runtime always uses `'wikiembed'`.
 */
export const DEFAULT_EMIT_FORMAT: EmitFormat = 'wikiembed';

/**
 * sha256 same-directory dedup scope. Consumed by the server upload handler;
 * if the bytes match an existing sibling, the upload handler returns the
 * existing path.
 */
export const DEFAULT_DEDUP_MODE: DedupMode = 'same-dir';

/**
 * Client feedback shape when a drop dedups to an existing file.
 * `'toast'` = "Reused existing file.png" toast notification.
 */
export const DEFAULT_DEDUP_UI: DedupUIMode = 'toast';

/**
 * Extensions that drop into the editor as `![[file.ext]]` wiki-embed refs.
 * Post-roundtrip, mdast→PM dispatches via `handlers.wikiLinkEmbed`:
 * image-ext → PM `image`; non-image wikiembed-ext → PM text+link mark with
 * `sourceForm: 'wikiembed'`; opaque ext → plain text+link.
 *
 * Kept as a ReadonlySet for O(1) membership check in the client emit path.
 * Identical contents (order-preserved as an array) are consumed by the
 * server mdast→PM pipeline via `Array.from(WIKI_EMBED_EXTENSIONS)`.
 */
export const WIKI_EMBED_EXTENSIONS: ReadonlySet<string> = new Set([
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
]);
