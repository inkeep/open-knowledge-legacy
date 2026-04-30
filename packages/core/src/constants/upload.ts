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
//
// These three arrays survive PR #270's accept-all server pipeline as
// declarative metadata only — consumed by `<input accept>` in PropPanel's
// file picker (UX hint to the OS file dialog) and by built-ins.ts as data
// values on `htmlImgProps[0].accept` / `htmlVideoProps[0].accept` /
// `htmlAudioProps[0].accept`. The server itself is accept-all (D-M LOCKED);
// these arrays are picker-side filters, not security boundaries.
export const ALLOWED_AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg'] as const;

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
 * Canonical video-extension set. Strict subset of `WIKI_EMBED_EXTENSIONS`;
 * disjoint from `IMAGE_EXTENSIONS` and `AUDIO_EXTENSIONS`. Members are the
 * browser-renderable video containers — `<video>` element survives them
 * across modern engines, and the sirv middleware serves them with
 * `Content-Disposition: inline` (see `INLINE_RENDERABLE_EXTENSIONS`).
 *
 * One source of truth for video-shape dispatch: client emit
 * (`pickInsertShape` returns `'jsx-video'`) and server mdast→PM
 * (`handlers.wikiLinkEmbed` emits `jsxComponent('WikiEmbedVideo')`).
 */
export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv']);

/**
 * Canonical audio-extension set. Strict subset of `WIKI_EMBED_EXTENSIONS`;
 * disjoint from `IMAGE_EXTENSIONS` and `VIDEO_EXTENSIONS`. Members render
 * inline via `<audio>` and serve with `Content-Disposition: inline`.
 *
 * Mirrors `VIDEO_EXTENSIONS`'s role: one dispatch source for
 * `pickInsertShape` (`'jsx-audio'`) and `handlers.wikiLinkEmbed`
 * (`jsxComponent('WikiEmbedAudio')`).
 */
export const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
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
  // macOS installer + script classes (2026-04-24b amendment). `.dmg`/`.pkg`/
  // `.mpkg` mount via Launch Services; `.scpt`/`.applescript` run in Script
  // Editor which can shell out; `.terminal`/`.prefpane` auto-open system UI
  // with embedded settings (social-engineering class).
  'dmg',
  'pkg',
  'mpkg',
  'scpt',
  'applescript',
  'terminal',
  'prefpane',
  // macOS URL-file classes — `.webloc`/`.inetloc`/`.fileloc` carry a URL
  // that Launch Services navigates on open. `.fileloc` can embed `file://`
  // schemes (CVE-2022-22590 class).
  'webloc',
  'inetloc',
  'fileloc',
  // Cross-platform package + archive-installer classes
  'jar',
  'appimage',
  'deb',
  'rpm',
  'msix',
  'appx',
  'ipa',
  'apk',
  // Windows shortcut / program-information files
  'pif',
  'scr',
  'lnk',
  'url',
]);

// SPEC §13 / FR-6 / D-H widening: ContentFilter must admit non-image asset
// extensions so they sit alongside markdown in the file index.
//
// 2026-04-24b amendment (Post-finalization): widened from the FR-5
// `wikiEmbedExtensions` subset to common user-drop extensions, so D-M
// accept-all holds end-to-end. Serve-side dispatch uses
// `INLINE_RENDERABLE_EXTENSIONS` (below) for `Content-Disposition: inline`
// and attachment-serves the rest; extension-based admission here is
// defense-in-depth against source-file leakage (`.ts`/`.py`/`.sh` NOT in
// this set, so they stay excluded by the content filter even when sitting
// next to an .md sibling).
export const ASSET_EXTENSIONS: ReadonlySet<string> = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'apng',
  'heic',
  'heif',
  'tiff',
  'bmp',
  'ico',
  // Documents
  'pdf',
  // Video
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  'avi',
  'flv',
  'wmv',
  'mpeg',
  'mpg',
  // Audio
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
  // Archives
  'zip',
  // Fonts
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  // Office documents
  'docx',
  'xlsx',
  'pptx',
  // Tabular / text / data
  'csv',
  'txt',
  'rtf',
  'json',
]);

/**
 * Extensions that the browser renders safely INLINE when served with the
 * correct Content-Type — images, PDFs, video, audio, safe SVG via `<img>`.
 * Anything outside this set served via sirv MUST get
 * `Content-Disposition: attachment` so the browser downloads rather than
 * attempting to render ambiguously (stored-XSS defense aligned with
 * HedgeDoc's GHSA-x74j-jmf9-534w posture and Docmost's extension-gated
 * dispatch). Consumed by the Vite dev-plugin sirv middleware
 * (`packages/app/src/server/hocuspocus-plugin.ts`).
 *
 * Strict subset of ASSET_EXTENSIONS. Expanding this set is a privilege
 * decision — every addition broadens the inline-render surface and its
 * XSS-risk envelope. Office docs / archives / fonts / data files stay OUT
 * so they're attachment-only.
 */
export const INLINE_RENDERABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  // Images (browsers render inline via `<img>` or the address-bar viewer)
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'apng',
  'heic',
  'heif',
  'tiff',
  'bmp',
  'ico',
  // SVG: served as `<img src>` only (NFR-3). The `X-Content-Type-Options:
  // nosniff` header + Content-Disposition: inline lets the browser render
  // the vector but NOT execute embedded script when navigated to directly
  // (Chrome treats top-level-nav SVG as scriptable; attachment for top-
  // level would break the `<img>` embed use-case, so inline + nosniff is
  // the compromise — matches Docmost's PNG/SVG posture).
  'svg',
  // PDF (Chromium built-in viewer; attachment would defeat it)
  'pdf',
  // Video
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  // Audio
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
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
 * block-context image/video/audio → `jsxComponent('WikiEmbed*')`;
 * everything else (inline embeds, allowlisted-but-no-descriptor cases) →
 * PM text+link mark with `sourceForm: 'wikiembed'`; opaque ext → plain
 * text+link.
 *
 * Kept as a ReadonlySet for O(1) membership check in the client emit path.
 * Identical contents (order-preserved as an array) are consumed by the
 * server mdast→PM pipeline via `Array.from(WIKI_EMBED_EXTENSIONS)`.
 */
export const WIKI_EMBED_EXTENSIONS: ReadonlySet<string> = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  // Documents
  'pdf',
  // Video — 2026-04-24b amendment widened to common browser-renderable
  // video containers. Each here renders inline via the FR-A5 NodeView's
  // chip + the sirv middleware's `Content-Disposition: inline` (from
  // INLINE_RENDERABLE_EXTENSIONS). Extensions like .avi / .wmv / .flv
  // that ARE admitted to serve (ASSET_EXTENSIONS) but NOT inline-
  // renderable by browsers stay OUT of this wiki-embed emit set — they
  // emit as markdown-link so the text shape reflects their opaque nature.
  'mp4',
  'webm',
  'mov',
  'm4v',
  'mkv',
  // Audio
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'flac',
  'aac',
  'opus',
]);
