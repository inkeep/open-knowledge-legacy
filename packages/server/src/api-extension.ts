/**
 * HTTP API extension for Hocuspocus — agent write, file ops, and test reset endpoints.
 *
 * Implemented as a Hocuspocus onRequest extension so it works with both
 * the production Server (assembled by `createServer()` in `server-factory.ts`)
 * and the Vite dev plugin.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as wait } from 'node:timers/promises';
import type { Document, Extension, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_ICON_COLORS,
  AgentPatchRequestSchema,
  AgentUndoRequestSchema,
  AgentWriteMdRequestSchema,
  AgentWriteRequestSchema,
  ASSET_EXTENSIONS,
  applyFastDiff,
  CreatePageRequestSchema,
  colorFromSeed,
  createCodeFenceTracker,
  DEFAULT_ATTACHMENT_FOLDER_PATH,
  DEFAULT_DEDUP_MODE,
  DeletePathRequestSchema,
  EmptyRequestSchema,
  getHeadingSlug,
  getParseHealth,
  type HeadingEntry,
  type LocalOpAuthHostRequest,
  LocalOpAuthHostRequestSchema,
  LocalOpAuthPatRequestSchema,
  LocalOpAuthSetIdentityRequestSchema,
  type LocalOpCloneRequest,
  LocalOpCloneRequestSchema,
  LocalOpOpenRequestSchema,
  type Principal,
  prependFrontmatter,
  readFmMap,
  RenamePathRequestSchema,
  type RescueEntryFlat,
  type RescueEntryTimeline,
  RollbackRequestSchema,
  SaveVersionRequestSchema,
  SeedApplyRequestSchema,
  SYSTEM_DOC_NAME,
  SyncResolveConflictRequestSchema,
  SyncSetEnabledRequestSchema,
  SyncTriggerRequestSchema,
  stripFrontmatter,
  UploadRequestSchema,
} from '@inkeep/open-knowledge-core';
import {
  formatCheckpointSubject,
  formatRenameSubject,
  formatRollbackSubject,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import busboy from 'busboy';
import { diffLines } from 'diff';
import { fileTypeFromFile } from 'file-type';
import { captureEffect } from './activity-log.ts';
import { listAgentActivity, synthesizeStackItemDiffText } from './agent-activity.ts';
import type { AgentFocusBroadcaster } from './agent-focus.ts';
import { type AgentPresenceBroadcaster, BROADCASTER_EVICTION_MS } from './agent-presence.ts';
import {
  type AgentSessionManager,
  applyAgentMarkdownWrite,
  applyAgentUndo,
  iconFromClientName,
} from './agent-sessions.ts';
import { type NormalizedSummary, normalizeSummary } from './agent-write-summary.ts';
import { recordContributor, swapContributors } from './contributor-tracker.ts';
import {
  createInstalledAgentsProbe,
  createOsProbe,
  handleInstalledAgents,
  type InstalledAgentScheme,
} from './handoff-api.ts';
import { findHubCandidates } from './hub-candidates.ts';
import {
  extractPageTitle,
  type FrontmatterMetadata,
  parseFrontmatterMetadata,
} from './page-identity.ts';
import { readServerLock } from './server-lock.ts';
import { buildAndOpenSkill } from './skill-install.ts';
import { readUiLock } from './ui-lock.ts';
import {
  HashingPassThrough,
  linkTempToFinalWithCollisionRetry,
  mintTempUploadPath,
} from './upload-streaming.ts';

export { extractPageTitle } from './page-identity.ts';

import { context, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
  ATTR_URL_PATH,
  ATTR_URL_SCHEME,
  ATTR_USER_AGENT_ORIGINAL,
} from '@opentelemetry/semantic-conventions';
import simpleGit from 'simple-git';
import { parseAgentBodyFields, resolveAgentType, validateAgentId } from './agent-id.ts';
import {
  applyRenameMap,
  buildRenameMap,
  ManagedRenameCollisionError,
  ManagedRenameDestinationExistsError,
  ManagedRenameSourceNotFoundError,
  ManagedRenameSourceTypeMismatchError,
} from './apply-managed-rename.ts';
import {
  type BacklinkIndex,
  type GraphNode as IndexedGraphNode,
  isOrphanMode,
} from './backlink-index.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import type { ResolveStrategy } from './conflict-storage.ts';
import type { ContentFilter } from './content-filter.ts';
import {
  type DocExtension,
  forgetDocExtension,
  getDocExtension,
  isSupportedDocFile,
  registerDocExtension,
  SUPPORTED_DOC_EXTENSIONS,
  stripDocExtension,
} from './doc-extensions.ts';
import { extractActorIdentity } from './extract-actor-identity.ts';
import {
  contentHash,
  type FileIndexEntry,
  registerWrite,
  updateFileIndex,
} from './file-watcher.ts';
import { tracedMkdirSync, tracedRenameSync, tracedWriteFileSync } from './fs-traced.ts';
import { withParentLock } from './git-handle.ts';
import { resolveGitIdentity, writeGitIdentity } from './git-identity.ts';
import { sanitizeGitIdentity } from './git-identity-sanitize.ts';
import { createStreamingErrorWriter, errorResponse } from './http/error-response.ts';
import { validateBody, withValidation } from './http/request-validation.ts';
import {
  checkLocalOpSecurity,
  createConcurrencyGuard,
  expandTilde,
  isAllowedGitUrl,
  isSafeLocalPath,
} from './local-op-security.ts';
import { getLogger } from './logger.ts';
import { isAllowedWorkspaceHostHeader, isLoopbackAddress } from './loopback.ts';
import {
  createManagedRenameRecoveryJournal,
  type ManagedRenameSnapshot,
  withManagedRenameRecovery,
} from './managed-rename-journal.ts';
import { mdManager, schema } from './md-manager.ts';
import {
  getMetrics,
  incrementAgentWriteCalls,
  incrementSummariesProvided,
  incrementSummariesTruncated,
} from './metrics.ts';
import {
  deleteReconciledBase,
  getActiveBranch,
  isWithinContentDir,
  safeContentPath,
  setReconciledBase,
} from './persistence.ts';
import {
  applySeed,
  planSeed,
  type ScaffoldPlan,
  SeedPrerequisiteError,
  SeedRootDirError,
} from './seed/index.ts';
import type { PairedWriteOrigin } from './server-observers.ts';
import {
  listRescueCheckpoints,
  SERVICE_WRITER,
  type ShadowRef,
  safetyCheckpoint,
  saveVersion,
  shadowGit,
  type TimelineRescueEntry,
  type WriterIdentity,
} from './shadow-repo.ts';
import { SuggestLinksTargetNotFoundError, suggestLinks } from './suggest-links.ts';
import type { SyncEngine } from './sync-engine.ts';
import { getMeter, getTracer, withSpan } from './telemetry.ts';
import { getDocumentHistory } from './timeline-query.ts';

// Cache the HTTP duration histogram at module scope — lazy-init at first use
// so the meter is a real meter (post-`initTelemetry`), not the pre-init no-op.
// Recreating the histogram every request allocates + registers a fresh
// instrument on every hit (PR review finding 2026-04-24).
let _httpDurationHist: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
function httpDurationHist(): ReturnType<ReturnType<typeof getMeter>['createHistogram']> {
  if (!_httpDurationHist) {
    _httpDurationHist = getMeter().createHistogram('http.server.request.duration', {
      description: 'HTTP server request duration in seconds',
      unit: 's',
    });
  }
  return _httpDurationHist;
}

// Lazy-init so the counter registers against a real meter post-initTelemetry
// (not the pre-init no-op). Matches the httpDurationHist pattern above.
let _hintEmittedCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;
function hintEmittedCounter(): ReturnType<ReturnType<typeof getMeter>['createCounter']> {
  if (!_hintEmittedCounter) {
    _hintEmittedCounter = getMeter().createCounter('ok.preview_attach.hint_emitted', {
      description:
        'Count of attach-preview-once hints emitted on write-tool responses when no editor is attached to __system__',
    });
  }
  return _hintEmittedCounter;
}

// Counter for `agent-patch` FM-intersecting calls. Bounded label set:
// `result ∈ {'rejected','pre_deprecation_passthrough'}`. Today the handler
// always rejects with 400 — the second label is reserved for a possible
// passthrough mode during the deprecation window.
let _agentPatchFmTouchCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null =
  null;
function agentPatchFmTouchCounter(): ReturnType<ReturnType<typeof getMeter>['createCounter']> {
  if (!_agentPatchFmTouchCounter) {
    _agentPatchFmTouchCounter = getMeter().createCounter(
      'ok.frontmatter.agent_patch_fm_touch_total',
      {
        description:
          'Count of agent-patch calls whose find string targets the frontmatter region. Measures incidence during the soft-deprecation window before agent-patch FM-intersecting calls are enforced as 400. Bounded label: result ∈ {rejected, pre_deprecation_passthrough}.',
      },
    );
  }
  return _agentPatchFmTouchCounter;
}

/**
 * Heuristic FM-intersection check for `agent-patch` find strings. Pure
 * function on the find string — runs before any doc state is read.
 *
 * Rejection signal:
 *   - find contains `---` (FM/body separator — opening or closing fence)
 *   - find matches `/^\s*[\w-]+:/` (yaml-style key-value at start)
 *
 * Catches the common case: agents that copy a YAML line verbatim into
 * `find` to splice an FM property. The position-based check inside the
 * transact block catches the rarer case where a non-yaml-shape find
 * happens to land in the FM region (e.g., `find: 'draft'` matching
 * `status: draft`). Together they cover both "find looks like FM" and
 * "find lands in FM."
 */
function findLooksLikeFrontmatter(find: string): boolean {
  // Line-anchored `---` (YAML document fence). Mid-string `---` (e.g. body
  // text containing em-dash sequences or markdown thematic breaks embedded
  // in larger find strings) flows to the position-based check below.
  if (/(^|\n)---(\s|\n|$)/.test(find)) return true;
  // YAML key-value shape — require an actual value (`\s+\S` after the
  // colon) so prose like `Note:` / `IMPORTANT:` / `Warning:` (no value)
  // is left to the position-based check, which rejects only when the find
  // actually lands inside the FM region. Empty-value YAML keys like
  // `draft:` similarly fall through to position-based rejection.
  if (/^\s*[\w-]+:\s+\S/.test(find)) return true;
  return false;
}

let _renameAttributionCounter: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null =
  null;
function renameAttributionCounter(): ReturnType<ReturnType<typeof getMeter>['createCounter']> {
  if (!_renameAttributionCounter) {
    _renameAttributionCounter = getMeter().createCounter('ok.rename.attribution_kind', {
      description:
        'Count of rename and rollback handler dispatches by attribution kind (agent | principal | anonymous)',
    });
  }
  return _renameAttributionCounter;
}

/**
 * Test-only: clear the lazy-initialized rename counter so a test that
 * registers a fresh meter provider via `metrics.setGlobalMeterProvider`
 * can capture subsequent counter increments. Production code never calls this.
 */
export function __resetRenameTelemetryForTesting(): void {
  _renameAttributionCounter = null;
}

/**
 * Transaction origin for rollback (TQ10 — typed `PairedWriteOrigin`).
 *
 * `skipStoreHooks: false` — L1 persistence SHOULD fire after rollback so the
 * restored content reaches disk through the normal pipeline. The
 * file-watcher's registerWrite hash check prevents the self-write from
 * re-triggering reconciliation.
 *
 * `paired: true` — rollback atomically writes both XmlFragment and Y.Text
 * inside one `doc.transact()` block. `satisfies PairedWriteOrigin` gates the
 * marker at authoring time (bridge-correctness SPEC §6 R0 + review iteration 5).
 */
export const ROLLBACK_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'rollback-apply', paired: true },
} as const satisfies PairedWriteOrigin;

/**
 * Managed-rename origin — typed `PairedWriteOrigin`.
 *
 * Exported so the bridge-invariant watcher can enforce by identity (precedent #1)
 * and so server observers can resolve `context.paired` without importing the
 * object transitively (bridge-correctness SPEC §6 R0d).
 *
 * `paired: true` — the caller atomically writes BOTH XmlFragment (via
 * `updateYFragment`) and Y.Text (via `applyFastDiff`) inside one transact
 * block. `satisfies PairedWriteOrigin` is the compile-time gate.
 */
export const MANAGED_RENAME_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'managed-rename', paired: true },
} as const satisfies PairedWriteOrigin;

const log = getLogger('api');

/** Validates a docName and builds a shadow-repo-safe path.
 * Uses the same traversal check as safeContentPath (reject `..` and null bytes)
 * but allows `/` for nested content directories (e.g. `test-content/test-doc`). */
function safeDocPath(docName: string, contentRoot: string): { path: string } | { error: string } {
  if (!docName || docName.includes('..') || docName.includes('\0')) {
    return { error: 'Invalid document name' };
  }
  // Normalize: strip leading './' AND treat bare '.' as empty (git rejects
  // both "./foo" and "./" pathspecs when operating against a bare repo).
  const normalized = contentRoot === '.' ? '' : contentRoot.replace(/^\.\//, '');
  const ext = getDocExtension(docName);
  const path = normalized ? `${normalized}/${docName}${ext}` : `${docName}${ext}`;
  return { path };
}

const GENERIC_PASTE_NAMES = /^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i;

// F9: unicode-preserving. Permits any Unicode letter, number, or combining
// mark, plus pictographic emoji and the punctuation whitelist (., -, _, space).
// Everything else (including `/`, `\`, null bytes, control chars, CRLF) is
// either stripped or replaced so path-escape guards downstream keep their
// invariants. CJK, Arabic, Cyrillic, and emoji survive — macOS/Finder
// ergonomics without sacrificing filesystem safety.
const SAFE_FILENAME_CHARS = /[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}.\-_ ]/gu;
// Stripping C0 + DEL is the whole point — the rule fires on intentional use.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — sanitize must strip control bytes.
const STRIP_ON_SIGHT = /[/\\\x00-\x1f\x7f]/g;

export function sanitizeFilename(name: string): string {
  // Strip path separators and null/control bytes BEFORE any other pass so
  // they cannot reappear inside a replacement and dodge later checks.
  let stripped = name.replace(STRIP_ON_SIGHT, '');
  stripped = stripped.replace(SAFE_FILENAME_CHARS, '_');

  // Collapse underscore and dot runs so "../etc/passwd" → "etcpasswd" and
  // "foo__bar" → "foo_bar".
  stripped = stripped.replace(/_+/g, '_').replace(/\.{2,}/g, '.');

  // No hidden files — trim leading dots and leading underscores.
  stripped = stripped.replace(/^[._]+/, '');
  // Filesystem portability — strip trailing dots (Windows trims them too).
  stripped = stripped.replace(/\.+$/, '');

  if (stripped === '') return 'upload';

  // Most filesystems cap basenames at 255 bytes (ext4, APFS, exFAT). Without a
  // ceiling, a multipart `Content-Disposition` filename approaching busboy's
  // header size can sail through Unicode-letter sanitization and surface as
  // `ENAMETOOLONG` from `linkSync`, which classifies as a generic
  // `storage-error` → 500. Truncate the stem (preserving the extension) to
  // stay within the portable basename ceiling.
  const MAX_BYTES = 255;
  const encoder = new TextEncoder();
  if (encoder.encode(stripped).length > MAX_BYTES) {
    const dotIdx = stripped.lastIndexOf('.');
    const ext = dotIdx >= 0 ? stripped.slice(dotIdx) : '';
    let stem = dotIdx >= 0 ? stripped.slice(0, dotIdx) : stripped;
    // `slice(0, -1)` removes one UTF-16 code unit. A trailing emoji is a
    // surrogate pair, so the loop transiently produces a lone-surrogate
    // string that `TextEncoder` re-encodes as U+FFFD (3 bytes) — harmless
    // since the emoji is fully consumed before the loop exits and the
    // returned string is always valid UTF-8.
    while (encoder.encode(stem + ext).length > MAX_BYTES && stem.length > 0) {
      stem = stem.slice(0, -1);
    }
    stripped = (stem || 'upload') + ext;
    // The loop drains the stem; it cannot shrink the extension itself.
    // An adversarial 250+ byte extension (e.g. `'x.' + 'a'.repeat(300)`)
    // would drain the stem to empty and still leave `'upload' + ext`
    // above the ceiling. Final-pass guard: fall back to extensionless
    // `'upload'` when even the floor exceeds MAX_BYTES.
    if (encoder.encode(stripped).length > MAX_BYTES) stripped = 'upload';
  }

  return stripped;
}

/**
 * SPEC §6 FR-5 / docs/assets-and-embeds.mdx: resolve the destination
 * directory for an upload from the parent doc's path and the configured
 * `upload.attachmentFolderPath`. Matches Obsidian's literal schema (D-J
 * free-form string):
 *
 *   - `"./"` (default)  → same directory as the doc
 *   - `"/"`             → content-directory root
 *   - `"./<sub>"`       → subdirectory beside the doc
 *   - `"<name>"` (bare) → fixed content-relative path
 *
 * Treats any `./` prefix as "relative to doc dir," any other value as
 * "relative to content dir." Empty or whitespace-only strings fall back
 * to the default (doc dir).
 *
 * Returns an absolute path within `resolvedContentDir` — path-escape
 * enforcement happens at the caller via `isWithinContentDir` + `realpath`.
 */
export function resolveUploadDestDir(
  parentDocName: string,
  attachmentFolderPath: string,
  resolvedContentDir: string,
): string {
  const trimmed = attachmentFolderPath.trim();
  if (trimmed === '' || trimmed === './') {
    return resolve(resolvedContentDir, dirname(parentDocName));
  }
  if (trimmed === '/') {
    return resolvedContentDir;
  }
  if (trimmed.startsWith('./')) {
    // Subdirectory beside the doc. `"./attachments"` → `<docDir>/attachments`.
    return resolve(resolvedContentDir, dirname(parentDocName), trimmed.slice(2));
  }
  // Bare name or nested path: fixed content-relative location.
  return resolve(resolvedContentDir, trimmed);
}

/**
 * Read at most `n` bytes from the start of `path`. Used by the SVG sniff
 * fallback — `fileTypeFromFile` can't detect text-based SVG, so we open
 * the tempfile, read its head, and check for `<svg` / `<?xml ... <svg`
 * without ever materializing the whole file.
 */
function readTempFileHead(path: string, n: number): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(n);
    const read = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

/**
 * SPEC §6 FR-2: scan `destDir` non-recursively for an existing file whose
 * sha256 matches the buffer's. Returns the matching basename (case-preserving)
 * or null if no match. Bounded by directory size — O(n) in sibling count, not
 * vault size, per NFR-1. Only files with extensions in ASSET_EXTENSIONS are
 * candidates; everything else (markdown, .git/, etc.) is skipped.
 *
 * `expectedSize` is the buffer's byte length — passed in so we can size-
 * prefilter before hashing siblings. sha256 collision requires equal-sized
 * inputs, so same-extension siblings with a different size are not
 * candidates and we skip their (potentially multi-MB) read. This turns
 * the common "paste a new screenshot" path from O(total asset bytes in
 * dir) back to O(sibling count × stat). Non-ENOENT read failures log at
 * WARN so silent dedup degradation has a signal.
 */
/**
 * Upper bound on size-matched candidates we'll read+hash in a single
 * dedup call. A capture-device folder with 1000+ screenshots at the same
 * resolution could theoretically produce that many same-size siblings;
 * each candidate costs a sync readFileSync + sha256Hex of the entire
 * buffer, which would block the event loop for seconds per upload under
 * adversarial / pathological load.
 *
 * Past the bound, dedup degrades to best-effort: we log a structured
 * WARN and return null (treat as no-match → write a new file with the
 * collision-suffix loop). This is a bounded-resource defense, not a
 * correctness change — a duplicate that slips through produces the
 * cheap storage cost of one extra on-disk copy, not silent data loss.
 * The O(1) hash-cache alternative proposed in the review note is a
 * larger architectural change and a follow-on.
 */
const MAX_DEDUP_SCAN_CANDIDATES = 1000;

/**
 * Stream a file's bytes through a sha256 Hash transform and return the hex
 * digest. Keeps memory O(1) regardless of file size — a 500 MB candidate
 * read by the buffer-based `readFileSync` path would otherwise materialize
 * the whole file in heap, which defeats the streaming-upload amendment's
 * O(1) memory guarantee (SPEC.md §Post-finalization amendment, NFR-1).
 *
 * Throws on read errors so the caller can classify ENOENT (concurrent
 * rename — stay silent) vs other errors (log and skip).
 */
async function streamingHashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function findDuplicateAsset(
  destDir: string,
  sha: string,
  expectedSize: number,
): Promise<string | null> {
  let entries: string[];
  try {
    // Async `readdir` so the directory walk doesn't block the event
    // loop during uploads — bun's loop is shared with WebSocket sync
    // and CRDT updates, and a 1k-entry walk is observable on bursty
    // upload traffic. The MAX_DEDUP_SCAN_CANDIDATES cap (line ~76)
    // bounds the worst case at 1000 same-size siblings, but the
    // pre-cap entry list can still be much larger.
    entries = await readdir(destDir);
  } catch {
    return null;
  }
  const log = getLogger('upload');
  let scanned = 0;
  for (const entry of entries) {
    const ext = extname(entry).slice(1).toLowerCase();
    if (!ASSET_EXTENSIONS.has(ext)) continue;
    const fullPath = resolve(destDir, entry);
    let entryStat: Awaited<ReturnType<typeof stat>>;
    try {
      entryStat = await stat(fullPath);
    } catch {
      continue;
    }
    if (!entryStat.isFile() || entryStat.size !== expectedSize) continue;
    // Bounded scan: only count candidates that passed the cheap size
    // prefilter, since same-size siblings are the ones that cost a
    // full-file hash each (streaming now, not buffered).
    scanned++;
    if (scanned > MAX_DEDUP_SCAN_CANDIDATES) {
      log.warn(
        {
          event: 'upload-dedup-skip',
          reason: 'scan-cap-exceeded',
          destDir,
          scanned: MAX_DEDUP_SCAN_CANDIDATES,
          expectedSize,
        },
        `[upload-dedup] candidate scan exceeded ${MAX_DEDUP_SCAN_CANDIDATES} same-size siblings — degrading to no-dedup for this upload`,
      );
      return null;
    }
    let candidateSha: string;
    try {
      // Stream + hash the candidate to preserve the O(1) memory guarantee
      // the upload pipeline otherwise maintains end-to-end. A 500 MB
      // candidate otherwise spiked heap to 500 MB per scan.
      candidateSha = await streamingHashFile(fullPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // ENOENT is the legitimate concurrent-rename race — stay silent.
      if (code !== 'ENOENT') {
        log.warn(
          { event: 'upload-dedup-skip', reason: 'read-failed', code, entry },
          '[upload-dedup] skipped candidate — read failed',
        );
      }
      continue;
    }
    if (candidateSha === sha) return entry;
  }
  return null;
}

/**
 * Discriminator for write failures so the upload handler can surface a
 * specific error code (`collision-exhaustion` / `storage-full` /
 * `storage-readonly` / `storage-error`) instead of collapsing every
 * filesystem failure into a generic 500 "Failed to save file" response.
 * The code field is a stable part of the error envelope; the numeric
 * HTTP status differentiates transient-yet-retry (500) from full-disk
 * (507) per RFC 4918.
 */
import {
  UploadWriteError,
  type UploadWriteReason,
  uploadStatusFor,
  uploadTitleFor,
} from './upload-errors.ts';

interface UploadResult {
  filename: string;
  mimeType: string;
  parentDocName: string;
  tempPath: string;
  sha: string;
  byteLength: number;
}

/**
 * Stream multipart upload body to a tempfile while hashing on-the-fly.
 *
 * Replaces the buffer-to-memory pattern (chunks.push(chunk) +
 * Buffer.concat) with busboy's streaming 'file' event piped through a
 * HashingPassThrough Transform into createWriteStream(tempPath). Memory
 * becomes O(1); disk is the only bound.
 *
 * Error contract (typed via UploadWriteError.reason — URN-form ProblemType):
 *   - urn:ok:error:malformed-upload: busboy 'error' (unparseable multipart, etc.)
 *   - urn:ok:error:storage-full: ENOSPC / EDQUOT during the write stream
 *   - urn:ok:error:storage-readonly: EROFS / EACCES / EPERM during the write stream
 *   - urn:ok:error:storage-error: any other write-stream error
 *
 * On any error, the tempfile is best-effort unlinked before propagating.
 * See reports/streaming-upload-refactor/REPORT.md §D3-D6 for the rationale.
 */
function readUploadBody(req: IncomingMessage, contentDir: string): Promise<UploadResult> {
  return new Promise((resolveP, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      // `files: 1` caps the file part; `fields` + `fieldSize` cap non-file
      // surface so a flooded multipart can't buffer thousands of fields or a
      // multi-MB string field in memory before the upload body resolves. The
      // legitimate schema (agentId / docName / position / summary) is bounded
      // — short identifiers, never approaching 2 KB or 10 entries. The
      // ENAMETOOLONG-via-crafted-filename DoS path is closed by the 255-byte
      // ceiling in `sanitizeFilename` (the filesystem-portability layer);
      // busboy does not expose a header-section-size limit (only headerPairs
      // count), so the parsed-value cap is the right place.
      bb = busboy({
        headers: req.headers,
        limits: { files: 1, fields: 10, fieldSize: 2 * 1024 },
      });
    } catch (err) {
      reject(new UploadWriteError('urn:ok:error:malformed-upload', err));
      return;
    }

    let settled = false;
    let filename = 'upload';
    let mimeType = '';
    let parentDocName = '';
    let tempPath: string | undefined;
    let pipelineError: unknown;
    // Track whether the 'file' event ever fired. busboy emits 'close' as
    // soon as it finishes parsing the request body — but the file
    // pipeline (createWriteStream + HashingPassThrough) is async and may
    // still be running when 'close' fires. We must NOT resolve to an
    // empty UploadResult on 'close' when a file IS being processed; the
    // pipeline `.then()` is the legitimate resolver in that case. Only
    // the no-file path needs the 'close' fallback.
    let fileEventFired = false;

    // Mint the tempfile path lazily on the first 'file' event — busboy
    // can fire 'error' before any file arrives (e.g. missing boundary)
    // and we'd otherwise create a zero-byte tempfile for no reason.

    const fail = (reason: UploadWriteReason, cause: unknown) => {
      if (settled) return;
      settled = true;
      if (tempPath) {
        try {
          unlinkSync(tempPath);
        } catch {
          // best-effort; orphan sweep catches stragglers
        }
      }
      reject(cause instanceof UploadWriteError ? cause : new UploadWriteError(reason, cause));
    };

    const classifyWriteError = (err: NodeJS.ErrnoException): UploadWriteReason => {
      if (err.code === 'ENOSPC' || err.code === 'EDQUOT') return 'urn:ok:error:storage-full';
      if (err.code === 'EROFS' || err.code === 'EACCES' || err.code === 'EPERM') {
        return 'urn:ok:error:storage-readonly';
      }
      return 'urn:ok:error:storage-error';
    };

    bb.on('field', (name, val) => {
      if (name === 'parentDocName') parentDocName = val;
    });

    bb.on('file', (_fieldname, file, info) => {
      fileEventFired = true;
      filename = info.filename || 'upload';
      mimeType = info.mimeType || '';

      // `mintTempUploadPath` does `tracedMkdirSync(.., { recursive: true })`
      // which can throw ENOSPC / EDQUOT / EROFS / EACCES / EPERM / EIO. An
      // uncaught throw here bubbles back through busboy's `_write` and
      // re-emits as `'error'`, which the listener below classifies as
      // `'urn:ok:error:malformed-upload'` (HTTP 400). That misleads operators triaging
      // a full disk into chasing a phantom client bug. Catch the sync
      // throw, classify via the same table the pipeline rejection uses,
      // and drain the file part so busboy can finish parsing the rest.
      let path: string;
      try {
        path = mintTempUploadPath(contentDir);
      } catch (err) {
        const nodeErr = err as NodeJS.ErrnoException;
        fail(classifyWriteError(nodeErr), err as Error);
        file.resume();
        return;
      }
      tempPath = path;
      const hasher = new HashingPassThrough();
      const writeStream = createWriteStream(path);

      pipeline(file, hasher, writeStream)
        .then(() => {
          if (settled) return;
          settled = true;
          resolveP({
            filename,
            mimeType,
            parentDocName,
            tempPath: path,
            sha: hasher.digest(),
            byteLength: hasher.byteLength(),
          });
        })
        .catch((err) => {
          pipelineError = err;
          // Classify from the deepest write error if available; otherwise
          // treat as a generic storage-error. The unlink happens inside fail().
          const nodeErr = err as NodeJS.ErrnoException;
          fail(classifyWriteError(nodeErr), err);
        });
    });

    bb.on('error', (err) => {
      fail('urn:ok:error:malformed-upload', err);
    });

    // busboy's `close` (Writable, emitClose:true via @types/busboy@1.6.0)
    // fires once busboy finishes parsing the request body. If by then
    // no `file` event ever fired, the request was a well-formed
    // multipart with fields-only (no file part) — resolve with a
    // synthetic empty UploadResult so the route handler's
    // `byteLength === 0` guard returns the standard 400 "No file
    // received." Without this hook the Promise never settles on fields-
    // only uploads and the connection hangs until Node's request
    // timeout fires (DoS).
    //
    // CRUCIAL: gate on `!fileEventFired`. If a file part IS present,
    // busboy emits 'close' as soon as it finishes parsing — but the
    // async write/hash pipeline below may still be running. Resolving
    // here would race the pipeline's legitimate resolveP and produce a
    // spurious empty result. Pipeline resolves win in that case.
    bb.on('close', () => {
      if (settled || pipelineError) return;
      if (fileEventFired) return;
      settled = true;
      resolveP({
        filename: '',
        mimeType: '',
        parentDocName,
        tempPath: '',
        sha: '',
        byteLength: 0,
      });
    });

    // Guard the "client disconnected mid-stream" path. busboy never
    // reaches `_final` if the request aborts before the closing boundary,
    // so its `close` would not fire and the Promise would otherwise hang.
    req.on('close', () => {
      if (settled || pipelineError) return;
      if (!req.complete) {
        fail('urn:ok:error:malformed-upload', new Error('client disconnected'));
      }
    });

    req.pipe(bb);
  });
}

/**
 * Resolve a subdirectory path within a base directory, rejecting traversal attempts.
 * Throws if the resolved path escapes the base directory.
 */
export function safeSubdir(baseDir: string, subdir: string): string {
  const resolved = resolve(baseDir, subdir);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}/`)) {
    throw new Error(`Invalid directory: ${subdir}`);
  }
  return resolved;
}

type ContentEntryKind = 'file' | 'folder';

interface RenamedDocMapping {
  fromDocName: string;
  toDocName: string;
}

interface ManagedRenameRewriteSummary {
  markdown: string;
  rewrites: number;
}

interface ManagedRenameRewrittenDoc {
  docName: string;
  rewrites: number;
}

function isValidRelativeContentPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\x00')) {
    return false;
  }

  return path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function listAffectedDocNames(
  index: ReadonlyMap<string, FileIndexEntry>,
  kind: ContentEntryKind,
  path: string,
): string[] {
  const docNames = [...index.keys()].filter((docName) =>
    kind === 'file' ? docName === path : docName === path || docName.startsWith(`${path}/`),
  );
  docNames.sort((a, b) => a.localeCompare(b));
  return docNames;
}

function remapDocNameForRename(
  docName: string,
  kind: ContentEntryKind,
  fromPath: string,
  toPath: string,
): string {
  if (kind === 'file') return toPath;
  if (docName === fromPath) return toPath;
  return `${toPath}${docName.slice(fromPath.length)}`;
}

/**
 * Ensures `fullPath` does not escape `resolvedContentDir` via symlinks (matches persistence
 * symlink-escape checks). Walks up with dirname when the leaf is missing so destinations like
 * `link/new.md` are rejected if `link` resolves outside the content dir.
 *
 * Uses `realpathSync(resolvedContentDir)` as the boundary anchor so platform normalization
 * (e.g. macOS `/var` → `/private/var`) matches `realpathSync` of paths under it.
 */
function assertNoSymlinkEscape(fullPath: string, resolvedContentDir: string): void {
  let contentRoot: string;
  try {
    contentRoot = realpathSync(resolvedContentDir);
  } catch {
    return;
  }

  let cur = fullPath;
  for (;;) {
    try {
      const canonical = realpathSync(cur);
      if (!isWithinContentDir(canonical, contentRoot)) {
        throw new Error('symlink-escape: path resolves outside content directory');
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') {
        throw new Error('symlink-escape: symlink cycle in path');
      }
      if (code !== 'ENOENT') throw err;
      const parent = dirname(cur);
      if (parent === cur) throw err;
      if (parent !== resolvedContentDir && !parent.startsWith(`${resolvedContentDir}${sep}`)) {
        throw err;
      }
      cur = parent;
    }
  }
}

function resolveContentEntryPath(contentDir: string, kind: ContentEntryKind, path: string): string {
  if (!isValidRelativeContentPath(path)) {
    throw new Error('path must be a relative content path');
  }

  const resolvedContentDir = resolve(contentDir);
  // When kind is 'file': if the caller passed an explicit supported extension,
  // use the path verbatim — this is how rename callers signal an extension
  // change (toPath: "foo.mdx" renames foo.md → foo.mdx). Extension-less paths
  // fall through to getDocExtension() + the registered extension map so legacy
  // callers keep the source's existing extension.
  const relativePath =
    kind === 'file' ? (isSupportedDocFile(path) ? path : `${path}${getDocExtension(path)}`) : path;
  const fullPath = resolve(resolvedContentDir, relativePath);

  if (fullPath !== resolvedContentDir && !fullPath.startsWith(`${resolvedContentDir}${sep}`)) {
    throw new Error('path must not escape content directory');
  }

  assertNoSymlinkEscape(fullPath, resolvedContentDir);

  return fullPath;
}

/**
 * Probe disk for the actual on-disk extension of a file's docName, registering
 * it in the doc-extensions map if found. Closes a boot/watcher race where the
 * rename handler runs before the file watcher has observed the source — without
 * this, `getDocExtension()` returns the `.md` default, which silently defeats
 * `.mdx`-specific exclusion patterns and routes existence checks to the wrong
 * path. Iterating in `SUPPORTED_DOC_EXTENSIONS` precedence order ensures the
 * `.mdx` precedence rule is preserved when both files exist on disk.
 * Idempotent — `registerDocExtension` is a no-op when the higher-precedence
 * extension is already registered.
 */
function probeAndRegisterSourceFileExtension(contentDir: string, fromPath: string): void {
  if (!isValidRelativeContentPath(fromPath)) return;
  const resolvedContentDir = resolve(contentDir);
  for (const ext of SUPPORTED_DOC_EXTENSIONS) {
    const candidate = resolve(resolvedContentDir, `${fromPath}${ext}`);
    if (candidate !== resolvedContentDir && !candidate.startsWith(`${resolvedContentDir}${sep}`)) {
      continue;
    }
    if (existsSync(candidate)) {
      registerDocExtension(fromPath, ext);
      return;
    }
  }
}

function toGitRelativePath(projectDir: string, absolutePath: string): string | null {
  const resolvedProjectDir = resolve(projectDir);
  const resolvedPath = resolve(absolutePath);
  if (
    resolvedPath !== resolvedProjectDir &&
    !resolvedPath.startsWith(`${resolvedProjectDir}${sep}`)
  ) {
    return null;
  }
  return relative(resolvedProjectDir, resolvedPath).split(sep).join('/');
}

async function renameTrackedPathInGit(
  projectDir: string | undefined,
  sourcePath: string,
  destinationPath: string,
): Promise<boolean> {
  if (!projectDir) return false;
  const sourceRel = toGitRelativePath(projectDir, sourcePath);
  const destinationRel = toGitRelativePath(projectDir, destinationPath);
  if (!sourceRel || !destinationRel) return false;

  return await withParentLock(async () => {
    const pg = simpleGit({ baseDir: projectDir, timeout: { block: 15_000 } });
    // `ls-files` throws `GitError: fatal: not a git repository` when
    // projectDir isn't a git checkout — normal in test tmpdirs and in Vite
    // dev's isolated OK_TEST_CONTENT_DIR mode. Treat that as "not tracked"
    // so the caller falls back to `fs.renameSync`. Any other git failure
    // (permission denied, corrupted index) also falls through to fs rename
    // rather than 500ing the /api/rename-path handler.
    let tracked = '';
    try {
      tracked = (await pg.raw('ls-files', '--', sourceRel)).trim();
    } catch (err) {
      console.warn('[renameTrackedPathInGit] git ls-files failed, falling back to fs rename:', err);
      return false;
    }
    if (!tracked) return false;
    mkdirSync(dirname(destinationPath), { recursive: true });
    try {
      await pg.raw('mv', '--', sourceRel, destinationRel);
      return true;
    } catch (err) {
      console.warn('[renameTrackedPathInGit] git mv failed, falling back to fs rename:', err);
      return false;
    }
  });
}

export interface ApiExtensionOptions {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  contentDir: string;
  /**
   * Per-process UUID advertised via `GET /api/server-info` and the
   * `__system__` CC1 `server-info` broadcast. Clients cache this value
   * and claim it in the `expectedServerInstanceId` field of their auth
   * token on every connect; the server rejects on mismatch. Part of the
   * CRDT server-restart recovery defense.
   */
  serverInstanceId: string;
  /** Accessor for the watcher's in-memory file index. GET /api/documents reads from this. */
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
  /** Accessor for the alias map (alias docName → canonical docName). */
  getAliasMap?: () => ReadonlyMap<string, string>;
  /**
   * When true, register test-only routes (`/api/test-reset`,
   * `/api/test-rescan-backlinks`). Defaults to `false` — these routes mutate
   * server state in ways unsafe for multi-client use (reset wipes document
   * content; rescan-backlinks rebuilds the index from disk, dropping
   * unpersisted in-memory state) and must never be exposed in production.
   * Enable only in tests and local dev mode.
   */
  enableTestRoutes?: boolean;
  shadowRef?: ShadowRef;
  /** Force-flush the L2 git commit debounce (e.g. after rollback). */
  flushGitCommit?: () => Promise<void>;
  /** Accessor for the current branch from the HEAD watcher. Returns null when unknown. */
  getCurrentBranch?: () => string | null;
  /**
   * Accessor for the latest disk-ack state vectors per document. Wired
   * to `cc1Broadcaster.getLatestDiskAckSVsAsBase64()` in boot.
   * Returned as part of `GET /api/server-info` so clients can recover
   * the per-doc `lastDiskAckedSV` watermark on `__system__` reconnect
   * without relying on stateless CC1 broadcasts (which have no replay).
   * Empty `{}` is the cold-server case (no docs flushed yet); omitted
   * when the broadcaster isn't available (e.g. plugin mode in dev
   * server). Values are base64-encoded `Uint8Array` state vectors.
   */
  getDiskAckSVs?: () => Record<string, string>;
  contentRoot?: string;
  backlinkIndex?: BacklinkIndex;
  signalChannel?: (channel: 'files' | 'backlinks' | 'graph') => void;
  /**
   * Optional. When present, agent write handlers publish per-write attribution
   * entries on `__system__` awareness (`agentFocus` map) with writeKind +
   * currentDoc — the signal that drives browser push-navigation to the doc the
   * agent just wrote. Distinct from `agentPresenceBroadcaster` below, which
   * publishes sustained session state.
   */
  agentFocusBroadcaster?: AgentFocusBroadcaster;
  /**
   * Optional. When present, agent write handlers publish presence entries on
   * `__system__` awareness (`agentPresence` map) so clients can render the
   * multi-agent presence bar and follow the active agent. Omit to disable
   * presence broadcasts entirely (e.g. in tests that don't care).
   */
  agentPresenceBroadcaster?: AgentPresenceBroadcaster;
  /**
   * Optional. Called after every successful agent write (write_document /
   * edit_document). The handler is expected to be cheap and idempotent —
   * the CLI uses it to open the browser on the first agent edit per session.
   */
  onAgentWrite?: () => void;
  /**
   * Getter for the active SyncEngine instance (may be null when dormant or if
   * no remote was detected). Called per-request so it always reflects current state.
   */
  getSyncEngine?: () => SyncEngine | null;
  /**
   * CLI argv prefix used to spawn subprocesses for /api/local-op/* relay endpoints.
   * Defaults to ['open-knowledge'] (assumes CLI is on PATH).
   * Pass [process.execPath, process.argv[1]] from the CLI start command to use
   * the exact runtime that started this server.
   *
   * Example: ['bun', '/path/to/packages/cli/src/cli.ts'] in dev,
   *          ['open-knowledge'] in production.
   */
  localOpCliArgs?: string[];
  /**
   * Path to the project's parent git working tree (i.e. the repo root, not the
   * shadow git dir). When provided, `POST /api/save-version` and
   * `POST /api/rollback` create an additional commit + `ok/v<N>` tag in the
   * parent git repository to make checkpoints and restores team-visible.
   * Parent-git operations are serialized through `parentGitMutex`.
   */
  projectDir?: string;
  /**
   * Basename-index resolver for `![[photo.png]]` wiki-embed refs. Threaded
   * into every server-side `mdManager.parseWithFallback` call (managed-rename
   * body rewrite, rollback content apply) so the resulting PM image/link
   * carries the resolved src/href.
   */
  resolveEmbed?: (basename: string, sourcePath: string) => string | null;
  /**
   * Getter for the server's principal record. Called at request time so
   * deferred async init propagates. Returns null if principal has not
   * yet been loaded or loading failed.
   */
  getPrincipal?: () => Principal | null;
  /**
   * Active ContentFilter (the same instance threaded into the file watcher).
   * When present, `POST /api/rename-path` rejects destinations excluded by
   * `.gitignore` / `.okignore` rules so renames cannot land outside the
   * watched scope. Omit in tests where admission checks aren't relevant.
   */
  contentFilter?: ContentFilter;
  /**
   * OS-scheme install probe used by `GET /api/installed-agents` (web-host
   * parity for the Electron `ok:shell:detect-protocol` IPC — see
   * `handoff-api.ts`). When omitted, the platform's default probe is used
   * (`osascript` / `reg query` / `xdg-mime`). Tests inject a deterministic
   * fake so the endpoint doesn't shell out.
   */
  installedAgentsProbe?: (scheme: InstalledAgentScheme) => Promise<boolean>;
  /**
   * Explicit document unload hook. `createServer()` suppresses Hocuspocus's
   * automatic unload-on-disconnect to avoid reload + IDB duplication, so API
   * paths that intentionally retire a document must opt into unload here.
   */
  forceUnloadDocument?: (document: Document) => Promise<void>;
}

const MAX_BODY_BYTES = 1_048_576;

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function json(
  res: ServerResponse,
  status: number,
  data: unknown,
  extraHeaders?: Record<string, string>,
): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}
/**
 * Extract all ATX headings (# … ######) from a Markdown document.
 * Frontmatter is stripped before scanning so `title:` YAML lines are ignored.
 */
export function extractHeadings(content: string): HeadingEntry[] {
  let body = content;
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const closingIdx = content.indexOf('\n---', 3);
    if (closingIdx !== -1) {
      body = content.slice(closingIdx + 4);
    }
  }

  const headings: HeadingEntry[] = [];
  const slugCounts = new Map<string, number>();
  const isInCodeFence = createCodeFenceTracker();
  for (const line of body.split('\n')) {
    if (isInCodeFence(line)) continue;
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      const slug = getHeadingSlug(text, slugCounts);
      if (slug) headings.push({ level: match[1].length, text, slug });
    }
  }
  return headings;
}

function isSafeDocName(docName: string): boolean {
  return !(
    docName.includes('..') ||
    docName.startsWith('/') ||
    docName.includes('\x00') ||
    docName.includes('\\')
  );
}

/**
 * Returns true when an Origin header value is permitted to reach /api/* endpoints.
 *
 * Allowed:
 * - `"null"` (string) — opaque origin from file:// / packaged Electron (Fetch spec §4.3)
 * - http(s)://localhost[:port] — Electron dev server, ok-ui Vite, browser dev
 * - http(s)://127.x.x.x[:port] — 127.0.0.0/8 loopback block
 * - http(s)://[::1][:port] — IPv6 loopback
 *
 * Rejected: any other origin → 403 on /api/* (CSRF guard for unauthenticated mutating routes).
 */
function isAllowedApiOrigin(origin: string): boolean {
  if (origin === 'null') return true; // file:// / packaged Electron renderer
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

export function createApiExtension(options: ApiExtensionOptions): Extension {
  const {
    hocuspocus,
    sessionManager,
    contentDir,
    serverInstanceId,
    getFileIndex,
    getAliasMap,
    enableTestRoutes = false,
    shadowRef,
    flushGitCommit,
    getCurrentBranch,
    getDiskAckSVs,
    contentRoot,
    backlinkIndex,
    signalChannel,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
    onAgentWrite,
    getSyncEngine,
    localOpCliArgs = ['open-knowledge'],
    projectDir,
    getPrincipal,
    contentFilter,
    installedAgentsProbe,
    forceUnloadDocument,
  } = options;

  // Concurrency guard: at most 1 in-flight request per local-op endpoint
  const localOpGuard = createConcurrencyGuard();

  // Per-scheme cache + in-flight dedup for GET /api/installed-agents.
  // Factory is called once per createApiExtension() so the cache lives for
  // the lifetime of the server (cleared on server restart).
  const installedAgentsCache = createInstalledAgentsProbe({
    probe: installedAgentsProbe ?? createOsProbe(process.platform),
  });

  function resolveDocPath(docName: string): string | null {
    if (!isSafeDocName(docName)) return null;
    const resolvedContentDir = resolve(contentDir);
    const filePath = resolve(resolvedContentDir, `${docName}${getDocExtension(docName)}`);
    if (!filePath.startsWith(`${resolvedContentDir}/`) && filePath !== resolvedContentDir) {
      return null;
    }
    return filePath;
  }

  function readPageTitleForDocName(docName: string): string {
    const filePath = resolveDocPath(docName);
    if (!filePath || !existsSync(filePath)) return docName;
    try {
      return extractPageTitle(readFileSync(filePath, 'utf-8'), docName);
    } catch {
      return docName;
    }
  }

  const EMPTY_METADATA: FrontmatterMetadata = {
    cluster: undefined,
    category: undefined,
    tags: undefined,
  };

  function readFrontmatterMetadataForDocName(docName: string): FrontmatterMetadata {
    try {
      const doc = hocuspocus.documents.get(docName);
      if (doc) {
        const map = readFmMap(doc.getText('source').toString());
        if (Object.keys(map).length > 0) {
          const cluster = typeof map.cluster === 'string' ? map.cluster : undefined;
          const category = typeof map.category === 'string' ? map.category : undefined;
          let tags: string[] | undefined;
          if (Array.isArray(map.tags)) {
            tags = map.tags.length > 0 ? map.tags : undefined;
          } else if (typeof map.tags === 'string' && map.tags) {
            tags = [map.tags];
          }
          return { cluster, category, tags };
        }
      }
    } catch {
      /* fall through to disk */
    }
    try {
      const filePath = resolveDocPath(docName);
      if (!filePath || !existsSync(filePath)) return EMPTY_METADATA;
      const content = readFileSync(filePath, 'utf-8');
      const { frontmatter } = stripFrontmatter(content);
      if (!frontmatter) return EMPTY_METADATA;
      return parseFrontmatterMetadata(frontmatter);
    } catch {
      return EMPTY_METADATA;
    }
  }

  /**
   * Soft orphan-hint (D7 / N1): when a written doc has zero backlinks AND a
   * hub candidate exists in its folder tree, attach a hint suggesting the
   * hub. Returns `undefined` when any prerequisite is unavailable (no
   * backlinkIndex wired, target not in index, has backlinks, or no candidate).
   * Non-throwing — a hint-computation failure must not fail the write.
   */
  function computeOrphanHints(
    docName: string,
  ): Array<{ type: 'orphan'; parentCandidates: string[]; message: string }> | undefined {
    if (!backlinkIndex) return undefined;
    try {
      const backlinks = backlinkIndex.getBacklinks(docName);
      if (backlinks.length > 0) return undefined;
      // This runs on every write — if hub-candidate walking becomes pathological
      // on very large file indexes, we want an observable signal. 5ms is well
      // above the typical <1ms cost for a small-to-medium repo.
      const start = performance.now();
      const candidates = findHubCandidates(docName, getFileIndex());
      const elapsed = performance.now() - start;
      if (elapsed > 5) {
        log.debug(
          { docName, elapsedMs: elapsed, candidateCount: candidates.length },
          '[orphan-hint] findHubCandidates slow',
        );
      }
      if (candidates.length === 0) return undefined;
      const wikiLinks = candidates.map((c) => `[[${c}]]`).join(', ');
      return [
        {
          type: 'orphan',
          parentCandidates: candidates,
          message: `This doc has no backlinks yet. To make it discoverable, consider linking from a parent hub doc (index/overview files in the folder tree): ${wikiLinks}.`,
        },
      ];
    } catch (err) {
      console.warn('[orphan-hint] computeOrphanHints failed:', err);
      return undefined;
    }
  }

  function resolveAlias(docName: string): string {
    return getAliasMap?.().get(docName) ?? docName;
  }

  /**
   * Return the number of live browser/editor connections currently subscribed
   * to the given Hocuspocus document. Zero means the agent is writing to a
   * room nobody is watching. Under the once-per-session preview-attach
   * contract, this is a per-doc diagnostic — the hint threshold is
   * `getSystemSubscriberCount()` (transport-presence on `__system__`).
   *
   * Never throws: a Hocuspocus introspection failure is silent (returns 0).
   */
  function getSubscriberCount(docName: string): number {
    try {
      const doc = hocuspocus.documents.get(docName);
      return doc?.connections.size ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Return the number of live connections to the `__system__` Y.Doc — the
   * shared awareness channel every editor tab subscribes to. Zero means no
   * editor is attached to this server anywhere; non-zero means at least one
   * tab is watching (and will follow agent writes via `AgentFocusBroadcaster`).
   *
   * This is the correct signal for the once-per-session preview-attach hint:
   * the per-doc count flips on every new doc even when the user's tab is open
   * and following, which would produce spurious "attach" hints.
   *
   * Never throws.
   */
  function getSystemSubscriberCount(): number {
    try {
      const doc = hocuspocus.documents.get(SYSTEM_DOC_NAME);
      return doc?.connections.size ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fire-and-forget L1 → L2 flush for a single document.
   *
   * L1 (CRDT → disk): per-document debounce flush so concurrent human edits on
   * other documents are undisturbed.
   * L2 (disk → git): chained after L1 resolves to guarantee disk content is
   * up-to-date before the shadow-repo commit.
   *
   * The returned promise is intentionally not awaited by callers — the HTTP
   * response fires immediately after the CRDT transaction; persistence is
   * best-effort background work.
   */
  function flushDocToGit(docName: string, label: string): void {
    const debounceId = `onStoreDocument-${docName}`;
    const l1 = hocuspocus.debouncer.isDebounced(debounceId)
      ? hocuspocus.debouncer.executeNow(debounceId)
      : Promise.resolve();
    l1.then(() => flushGitCommit?.()).catch((err: unknown) => {
      log.warn({ err }, `[${label}] post-write flush failed`);
    });
  }

  function collectAdmittedDocNames(): Set<string> {
    const admitted = new Set<string>();
    for (const [docName, entry] of getFileIndex()) {
      admitted.add(docName);
      for (const alias of entry.aliases) {
        admitted.add(alias);
      }
    }
    return admitted;
  }

  function createSerializedRunner() {
    let pending = Promise.resolve();
    return async function runSerialized<T>(task: () => Promise<T>): Promise<T> {
      const waitFor = pending;
      let release = () => {};
      pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await waitFor;
      try {
        return await task();
      } finally {
        release();
      }
    };
  }

  // Managed rename mutates overlapping backlink sets across many docs, so serialize it.
  const runSerialized = createSerializedRunner();

  function toManagedRenamePublicError(error: unknown): { status: number; error: string } {
    if (!(error instanceof Error)) {
      return { status: 500, error: 'Failed to rename document' };
    }
    if (error instanceof ManagedRenameSourceNotFoundError) {
      return { status: 404, error: error.message };
    }
    if (error instanceof ManagedRenameDestinationExistsError) {
      return { status: 409, error: error.message };
    }
    if (error instanceof ManagedRenameSourceTypeMismatchError) {
      return { status: 400, error: error.message };
    }
    if (error.message.startsWith('Cannot rename missing document:')) {
      return { status: 404, error: error.message };
    }
    if (error.message.startsWith('Cannot snapshot missing document:')) {
      return { status: 404, error: error.message };
    }
    if (error.message.startsWith('symlink-escape:')) {
      return { status: 400, error: error.message };
    }
    if (error.message === 'Managed rename requires backlink index support') {
      return { status: 503, error: error.message };
    }
    return { status: 500, error: 'Failed to rename document' };
  }

  async function captureAndCloseDocuments(docNames: string[]): Promise<Map<string, string>> {
    const liveContents = new Map<string, string>();

    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      if (document) {
        liveContents.set(docName, document.getText('source').toString());
      }
    }

    for (const docName of docNames) {
      await sessionManager.closeAllForDoc(docName).catch((err) => {
        console.warn(`[file-ops] Failed to close agent session for ${docName}:`, err);
      });
    }

    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      deleteReconciledBase(docName);
      if (!document) continue;
      hocuspocus.closeConnections(docName);
      await (forceUnloadDocument ?? hocuspocus.unloadDocument.bind(hocuspocus))(document);
    }

    return liveContents;
  }

  function syncRenamedDocsToDisk(
    renamed: RenamedDocMapping[],
    liveContents: ReadonlyMap<string, string>,
  ): void {
    for (const { fromDocName, toDocName } of renamed) {
      const filePath = safeContentPath(toDocName, contentDir);
      const liveContent = liveContents.get(fromDocName);
      if (typeof liveContent === 'string') {
        tracedWriteFileSync(filePath, liveContent, 'utf-8');
      }

      const finalContent =
        typeof liveContent === 'string'
          ? liveContent
          : existsSync(filePath)
            ? readFileSync(filePath, 'utf-8')
            : null;

      if (typeof finalContent === 'string') {
        registerWrite(filePath, contentHash(finalContent));
      }
    }
  }

  function buildManagedRenameSnapshots(
    docNames: string[],
    liveContents: ReadonlyMap<string, string>,
  ): ManagedRenameSnapshot[] {
    return docNames.map((docName) => {
      const liveContent = liveContents.get(docName);
      if (typeof liveContent === 'string') {
        return { docName, content: liveContent };
      }

      const filePath = safeContentPath(docName, contentDir);
      if (!existsSync(filePath)) {
        throw new Error(`Cannot snapshot missing document: ${docName}`);
      }

      return {
        docName,
        content: readFileSync(filePath, 'utf-8'),
      };
    });
  }

  function readCurrentDocumentContent(docName: string): string | null {
    const document = hocuspocus.documents.get(docName);
    if (document) {
      return document.getText('source').toString();
    }

    const filePath = resolveContentEntryPath(contentDir, 'file', docName);
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, 'utf-8');
  }

  function writeManagedRenameDocumentToDisk(docName: string, markdown: string): void {
    const filePath = resolveContentEntryPath(contentDir, 'file', docName);
    tracedMkdirSync(dirname(filePath), { recursive: true });
    tracedWriteFileSync(filePath, markdown, 'utf-8');
    registerWrite(filePath, contentHash(markdown));
    setReconciledBase(docName, markdown);

    const fileIndex = getFileIndex();
    if (fileIndex instanceof Map) {
      updateFileIndex(
        { kind: 'update', path: filePath, docName, content: markdown },
        fileIndex as Map<string, FileIndexEntry>,
      );
    }
  }

  function applyManagedRenameMapToLoadedDocument(
    docName: string,
    renameMap: ReadonlyMap<string, string>,
  ): ManagedRenameRewriteSummary {
    const document = hocuspocus.documents.get(docName);
    if (!document) {
      throw new Error(`Document is not loaded: ${docName}`);
    }

    let result: ManagedRenameRewriteSummary = { markdown: '', rewrites: 0 };
    document.transact(() => {
      const xmlFragment = document.getXmlFragment('default');
      const ytext = document.getText('source');
      const currentText = ytext.toString();
      result = applyRenameMap(currentText, docName, renameMap);
      if (result.rewrites === 0) {
        return;
      }

      // Apply rewrite via XmlFragment-authoritative pattern (PRECEDENTS.md precedent #12;
      // replaces the deleted syncTextToFragment helper). Parse new markdown →
      // updateYFragment (preserves user-content Items at matching positions) →
      // mirror Y.Text via applyFastDiff (character-level CRDT mutation).
      const { body } = stripFrontmatter(result.markdown);
      const parseOpts = options.resolveEmbed
        ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
        : undefined;
      const parsedJson = mdManager.parseWithFallback(body, parseOpts);
      const pmNode = schema.nodeFromJSON(parsedJson);
      updateYFragment(document, xmlFragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
      applyFastDiff(ytext, currentText, result.markdown);
    }, MANAGED_RENAME_ORIGIN);
    return result;
  }

  async function _performManagedRenameForDocs(
    fromPath: string,
    toPath: string,
    kind: ContentEntryKind,
  ): Promise<{ renamed: RenamedDocMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] }> {
    return runSerialized(async () =>
      withSpan(
        'rename.executeRewrites',
        {
          attributes: {
            'rename.kind': kind,
          },
        },
        async (span) => {
          if (!backlinkIndex) {
            throw new Error('Managed rename requires backlink index support');
          }

          // Existence + stat + affected-doc enumeration all live inside the
          // serialized critical section so a concurrent file watcher event
          // (external mv add) or in-flight write to the source folder cannot
          // land between enumeration and the disk move and produce a "ghost"
          // file that the recovery journal doesn't know about. POSIX
          // rename(2) does not fail-loud on overwrite, so the lock is the
          // only backstop against silent data loss.
          const sourcePathRoot = resolveContentEntryPath(contentDir, kind, fromPath);
          const destinationPathRoot = resolveContentEntryPath(contentDir, kind, toPath);
          // Handles the case where the client sends an explicit extension that
          // matches the source's existing one (e.g. `toPath: "foo.md"` when
          // the file is already `foo.md`) — `fromPath !== toPath` textually
          // but the on-disk paths resolve to the same file. Treat as no-op,
          // mirroring the extension-less `fromPath === toPath` short-circuit
          // in the handler. Returning empty arrays here propagates as
          // `{ ok: true, renamed: [], rewrittenDocs: [] }` to the caller.
          if (sourcePathRoot === destinationPathRoot) {
            return { renamed: [], rewrittenDocs: [] };
          }
          if (!existsSync(sourcePathRoot)) {
            throw new ManagedRenameSourceNotFoundError(kind);
          }
          if (existsSync(destinationPathRoot)) {
            throw new ManagedRenameDestinationExistsError();
          }
          const sourceStat = statSync(sourcePathRoot);
          if (
            (kind === 'file' && !sourceStat.isFile()) ||
            (kind === 'folder' && !sourceStat.isDirectory())
          ) {
            throw new ManagedRenameSourceTypeMismatchError(kind);
          }

          // Downstream code (safeContentPath, setReconciledBase,
          // backlinkIndex, file index, applyRenameMap) keys on extension-less
          // docNames; folder rename naturally produces them via the file
          // index, but file rename receives `fromPath`/`toPath` with the
          // user-supplied extension. Strip here so the rename map matches
          // currentDocName in applyRenameMap (otherwise pass 1's image-ref
          // recompute is silently skipped) and syncRenamedDocsToDisk doesn't
          // double-extension via getDocExtension fallback.
          const affectedDocNames =
            kind === 'file'
              ? [stripDocExtension(fromPath)]
              : listAffectedDocNames(getFileIndex(), kind, fromPath);
          const affectedDocs: Array<{ from: string; to: string }> = affectedDocNames.map(
            (docName) => ({
              from: docName,
              to:
                kind === 'file'
                  ? stripDocExtension(toPath)
                  : remapDocNameForRename(docName, kind, fromPath, toPath),
            }),
          );
          span.setAttribute('rename.affected_docs', affectedDocs.length);

          if (affectedDocs.length === 0) {
            return { renamed: [], rewrittenDocs: [] };
          }

          const renameMap = buildRenameMap(affectedDocs);
          const renamed: RenamedDocMapping[] = affectedDocs.map(({ from, to }) => ({
            fromDocName: from,
            toDocName: to,
          }));

          const backlinkSourceSet = new Set<string>();
          for (const { from } of affectedDocs) {
            for (const entry of backlinkIndex.getBacklinks(from)) {
              if (!renameMap.has(entry.source)) {
                backlinkSourceSet.add(entry.source);
              }
            }
          }
          const backlinkSources = [...backlinkSourceSet].sort((a, b) => a.localeCompare(b));

          const snapshotContents = new Map<string, string>();
          const rewriteDocNames: string[] = [];
          const missingBacklinkSources: string[] = [];

          for (const docName of [...renameMap.keys(), ...backlinkSources]) {
            if (snapshotContents.has(docName)) continue;

            // For backlink sources (non-renamed docs that link to a rename
            // target): require a real on-disk file. A Y.Doc may be in
            // memory for a docName that has no disk file (e.g.,
            // `openDirectConnection` was triggered by a hover or pre-warm
            // on a redlink). Treating in-memory-only Y.Docs as legitimate
            // backlink sources here would funnel them into the
            // `rewriteDocNames` loop and `writeManagedRenameDocumentToDisk`
            // would materialize a phantom file — `tracedMkdirSync` +
            // `tracedWriteFileSync` create whatever path it's handed.
            // Treat as missing and let the index purge the stale entry.
            if (!renameMap.has(docName)) {
              const filePath = resolveContentEntryPath(contentDir, 'file', docName);
              if (!existsSync(filePath)) {
                missingBacklinkSources.push(docName);
                continue;
              }
            }

            const content = readCurrentDocumentContent(docName);
            if (typeof content === 'string') {
              snapshotContents.set(docName, content);
              if (!renameMap.has(docName)) {
                rewriteDocNames.push(docName);
              }
            } else if (!renameMap.has(docName)) {
              missingBacklinkSources.push(docName);
            }
          }

          for (const { from } of affectedDocs) {
            if (typeof snapshotContents.get(from) !== 'string') {
              throw new Error(`Cannot rename missing document: ${from}`);
            }
          }

          const recoveryJournal = createManagedRenameRecoveryJournal({
            fromPath,
            toPath,
            affectedDocs: [...affectedDocs],
            snapshots: buildManagedRenameSnapshots([...snapshotContents.keys()], snapshotContents),
          });

          const rewrittenDocs: ManagedRenameRewrittenDoc[] = [];

          await withManagedRenameRecovery(contentDir, recoveryJournal, async () => {
            for (const docName of missingBacklinkSources) {
              backlinkIndex.deleteDocument(docName);
            }

            for (const docName of rewriteDocNames) {
              const document = hocuspocus.documents.get(docName);
              const rewritten = document
                ? applyManagedRenameMapToLoadedDocument(docName, renameMap)
                : applyRenameMap(snapshotContents.get(docName) ?? '', docName, renameMap);

              if (rewritten.rewrites > 0) {
                writeManagedRenameDocumentToDisk(docName, rewritten.markdown);
                rewrittenDocs.push({ docName, rewrites: rewritten.rewrites });
              }

              backlinkIndex.updateDocumentFromMarkdown(docName, rewritten.markdown);
            }

            const liveContents = await captureAndCloseDocuments([...renameMap.keys()]);

            const rootSourcePath = resolveContentEntryPath(contentDir, kind, fromPath);
            const rootDestinationPath = resolveContentEntryPath(contentDir, kind, toPath);
            const renamedWithGit = await renameTrackedPathInGit(
              projectDir,
              rootSourcePath,
              rootDestinationPath,
            );
            if (!renamedWithGit) {
              tracedMkdirSync(dirname(rootDestinationPath), { recursive: true });
              tracedRenameSync(rootSourcePath, rootDestinationPath);
            }

            // Pre-register destination extensions so loop 2's
            // `resolveContentEntryPath` and `safeContentPath` produce the
            // correct on-disk paths. For an extension-change rename
            // (`foo.md` → `foo.mdx`), inheriting from the source's recorded
            // extension would point at the no-longer-extant `.md` path; for
            // a same-extension cross-folder rename, the destination docName
            // has no recorded extension yet and would default to `.md`,
            // miscomputing `.mdx` source paths. Forget the source mapping
            // so a renamed-then-recreated source doesn't inherit a stale
            // extension. The file watcher would converge to the same state
            // asynchronously — this just makes loop 2 see it synchronously.
            const explicitDestExt: DocExtension | null =
              kind === 'file' && isSupportedDocFile(toPath)
                ? (extname(toPath).toLowerCase() as DocExtension)
                : null;
            for (const { from, to } of affectedDocs) {
              const sourceExt = getDocExtension(from);
              forgetDocExtension(from);
              registerDocExtension(to, explicitDestExt ?? sourceExt);
            }

            const sortedAffected = [...affectedDocs].sort((a, b) => a.from.localeCompare(b.from));

            for (const { from: fromDocName, to: toDocName } of sortedAffected) {
              const sourcePath = resolveContentEntryPath(contentDir, 'file', fromDocName);
              const destinationPath = resolveContentEntryPath(contentDir, 'file', toDocName);
              const sourceCurrentContent =
                liveContents.get(fromDocName) ??
                snapshotContents.get(fromDocName) ??
                readFileSync(destinationPath, 'utf-8');
              const renamedSource = applyRenameMap(sourceCurrentContent, fromDocName, renameMap);

              syncRenamedDocsToDisk(
                [{ fromDocName, toDocName }],
                new Map([[fromDocName, renamedSource.markdown]]),
              );
              setReconciledBase(toDocName, renamedSource.markdown);

              const fileIndex = getFileIndex();
              if (fileIndex instanceof Map) {
                updateFileIndex(
                  {
                    kind: 'rename',
                    oldPath: sourcePath,
                    newPath: destinationPath,
                    oldDocName: fromDocName,
                    newDocName: toDocName,
                    content: renamedSource.markdown,
                  },
                  fileIndex as Map<string, FileIndexEntry>,
                );
              }

              backlinkIndex.renameDocument(fromDocName, toDocName, renamedSource.markdown);
              if (renamedSource.rewrites > 0) {
                rewrittenDocs.push({ docName: toDocName, rewrites: renamedSource.rewrites });
              }
            }
          });

          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(
              `[backlinks] Failed to persist managed rename cache for ${fromPath} -> ${toPath}:`,
              err,
            );
          });
          signalChannel?.('files');
          signalChannel?.('backlinks');
          signalChannel?.('graph');

          rewrittenDocs.sort((a, b) => a.docName.localeCompare(b.docName));
          span.setAttribute('rename.rewrite_count', rewrittenDocs.length);
          return { renamed, rewrittenDocs };
        },
      ),
    );
  }

  /**
   * Canonical identity boundary (precedent #24) — every mutating POST handler calls this
   * before any Y.Doc mutation. Resolves request body → {agentId, agentName, colorSeed, clientName}.
   * The meta-test in attribution-sweep-coverage.test.ts asserts all handlers call this at entry.
   *
   * Body parsing + sanitization is shared with `extractActorIdentity` via
   * `parseAgentBodyFields` in `agent-id.ts`. This wrapper adds the write-handler
   * default — absent agentId becomes `'claude-1'` so attribution always lands on
   * a stable broadcaster key (matches `getSession()` for presence bar color).
   */
  function extractAgentIdentity(body: Record<string, unknown>): {
    rawAgentId: string | undefined;
    agentId: string;
    agentName: string;
    colorSeed: string;
    clientName: string | undefined;
    clientVersion: string | undefined;
    label: string | undefined;
  } {
    const fields = parseAgentBodyFields(body);
    const agentId = fields.writerId ?? 'claude-1';
    return {
      rawAgentId: fields.rawAgentId,
      agentId,
      agentName: fields.displayName,
      colorSeed: fields.colorSeed ?? fields.rawAgentId ?? agentId,
      clientName: fields.clientName,
      clientVersion: fields.clientVersion,
      label: fields.label,
    };
  }

  /**
   * Build actor-tuple metadata (FR-8) for threading through recordContributor →
   * ContributorEntry → OkActorEntry. Populates:
   *   - principalId from getPrincipal() (stable UUID per local install)
   *   - agentType derived from clientName
   *   - clientName / clientVersion / label passed through from request body
   */
  function buildAgentActor(args: {
    clientName: string | undefined;
    clientVersion?: string;
    label?: string;
  }): {
    principalId?: string;
    agentType?: string;
    clientName?: string;
    clientVersion?: string;
    label?: string;
  } {
    const principalId = getPrincipal?.()?.id;
    return {
      principalId,
      agentType: resolveAgentType(args.clientName),
      clientName: args.clientName,
      clientVersion: args.clientVersion,
      label: args.label,
    };
  }

  /**
   * Shape of the `summary` field appended to a handler's success JSON response
   * when the caller provided a summary (spec FR8). Absent from the response
   * entirely when the caller did not supply a summary (including empty string,
   * which is treated as absent per `normalizeSummary`).
   *
   * `hint` is nested inside `summary` (not a sibling top-level key) so the
   * truncation message always travels with the field it explains — this
   * prevents naming collisions at the response root and tightens the coupling
   * between `truncatedFrom` and the human-readable explanation.
   */
  type SummaryResponse = { value: string; truncatedFrom?: number; hint?: string };

  /**
   * Pure response-shape derivation from a normalized summary — NO side effects.
   * Returns the fields the handler appends to its success JSON when the caller
   * supplied a summary (FR8/FR12). `undefined` return values mean "omit the
   * corresponding response key entirely."
   *
   * The hint is nested inside `response.hint` when truncation fires — callers
   * that want the top-level text line read the value via `response?.hint`.
   */
  function summaryResponseFields(normalized: NormalizedSummary): {
    response?: SummaryResponse;
    stored: string | undefined;
  } {
    if (normalized.kind !== 'value') return { stored: undefined };
    if (normalized.truncatedFrom !== undefined) {
      return {
        response: {
          value: normalized.value,
          truncatedFrom: normalized.truncatedFrom,
          hint: `Summary truncated from ${normalized.truncatedFrom} chars to 80 (max 80).`,
        },
        stored: normalized.value,
      };
    }
    return { response: { value: normalized.value }, stored: normalized.value };
  }

  /**
   * Strip truncation-specific fields from a `SummaryResponse`. Used by the
   * rename / rollback default-substitution path: when the server generates a
   * default like "Renamed X → Y" and that default itself overflows the cap,
   * the agent did not submit the long string — so `truncatedFrom` and the
   * "Summary truncated from ..." hint would misattribute blame to the caller.
   * The stored value is still the truncated form (so the timeline bullet fits),
   * but the diagnostic metadata is silenced in the response.
   */
  function stripDefaultPathTruncation(response: SummaryResponse): SummaryResponse {
    return { value: response.value };
  }

  /**
   * Fire the M1/M2 counters for a summary that is about to be persisted.
   * Call AFTER the contribution is guaranteed to land (i.e. not on 404/409
   * early-returns) so adoption rate reflects successful writes.
   *
   * `fromDefault` suppresses the `summariesTruncated` increment when the
   * truncation came from a server-generated default (rename / rollback default
   * substitution). The agent had no control over those strings, so counting
   * them toward M2 would muddy the "agent behavior" signal per spec §7 M2.
   */
  function countNormalizedSummary(normalized: NormalizedSummary, fromDefault = false): void {
    if (normalized.kind !== 'value') return;
    incrementSummariesProvided();
    if (normalized.truncatedFrom !== undefined && !fromDefault) incrementSummariesTruncated();
  }

  const handleAgentWrite = withValidation(
    AgentWriteRequestSchema,
    async (_req, res, body) => {
      try {
        // `withValidation` already enforces docName safety + body shape.
        // Empty / missing docName falls back to the `'test-doc'` default
        // matching pre-migration behavior.
        const rawDocName =
          body.docName !== undefined && body.docName.length > 0 ? body.docName : 'test-doc';
        const docName = resolveAlias(rawDocName);

        // Identity extraction precedes every SEMANTIC error emission below
        // (precedent #24). Body-shape errors emitted by `withValidation` are
        // anonymous because no Y.Doc mutation is attempted.
        const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
          extractAgentIdentity(body);

        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${docName}' is a reserved document name.`,
            { handler: 'agent-write' },
          );
          return;
        }

        const normalizedSummary = normalizeSummary(body.summary);
        const session = await sessionManager.getSession(docName, agentId, {
          displayName: agentName,
          colorSeed,
          clientName,
        });
        const timestamp = new Date().toISOString();
        const content =
          typeof body.content === 'string' ? body.content : `Hello from the agent! ${timestamp}`;
        const { response: summaryResponse, stored: storedSummary } =
          summaryResponseFields(normalizedSummary);

        // setPresence lives INSIDE the try so the pairing with touchMode('idle')
        // in `finally` is atomic — any throw between setPresence and transact
        // (even future code added here) flips the badge back to idle rather
        // than wedging it on 'editing'.
        try {
          const icon = iconFromClientName(clientName);
          const color = AGENT_ICON_COLORS[icon] ?? colorFromSeed(colorSeed ?? agentId);
          agentPresenceBroadcaster?.setPresence(agentId, {
            displayName: agentName,
            icon,
            color,
            currentDoc: docName,
            mode: 'writing',
            ts: Date.now(),
          });
          // FR-11: register one-shot observer BEFORE write transact so YTextEvent.delta is captured (D22)
          captureEffect(session.dc.document.getText('source'), agentId, colorSeed, clientName);
          // F1 (D2): use per-session origin, not shared AGENT_WRITE_ORIGIN (D32 STOP rule)
          session.dc.document.transact(() => {
            applyAgentMarkdownWrite(
              session.dc.document,
              `${content}\n`,
              'append',
              options.resolveEmbed
                ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
                : undefined,
            );

            const activityMap = session.dc.document.getMap('agent-flash');
            activityMap.set(agentId, {
              agentId,
              timestamp: Date.now(),
              type: 'insert',
              description: `Added (${agentName}): ${content.slice(0, 50)}`,
            });
          }, session.origin);
          recordContributor(
            docName,
            agentId,
            agentName,
            colorSeed,
            undefined,
            buildAgentActor({ clientName, clientVersion, label }),
            storedSummary,
          );
          incrementAgentWriteCalls();
          countNormalizedSummary(normalizedSummary);
        } finally {
          agentPresenceBroadcaster?.touchMode(agentId, 'idle');
        }

        flushDocToGit(docName, 'agent-write');
        onAgentWrite?.();

        // D22: success body is flat — no `{ ok: true }` wrapper. Clients
        // discriminate via HTTP status (`if (!res.ok)`), then safeParse
        // against `AgentWriteSuccessSchema`.
        json(res, 200, {
          timestamp,
          ...(summaryResponse ? { summary: summaryResponse } : {}),
        });
      } catch (e) {
        log.error({ err: e }, '[agent-write] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-write',
          cause: e,
        });
      }
    },
    { handler: 'agent-write', method: 'POST' },
  );

  const handleAgentWriteMd = withValidation(
    AgentWriteMdRequestSchema,
    async (_req, res, body) => {
      try {
        const position = body.position ?? 'append';
        const effectiveDocName =
          body.docName !== undefined && body.docName.length > 0 ? body.docName : 'test-doc';
        const resolvedDocName = resolveAlias(effectiveDocName);

        const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
          extractAgentIdentity(body);

        if (isSystemDoc(resolvedDocName) || isConfigDoc(resolvedDocName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${resolvedDocName}' is a reserved document name.`,
            { handler: 'agent-write-md' },
          );
          return;
        }

        const normalizedSummary = normalizeSummary(body.summary);
        const { response: summaryResponse, stored: storedSummary } =
          summaryResponseFields(normalizedSummary);
        const session = await sessionManager.getSession(resolvedDocName, agentId, {
          displayName: agentName,
          colorSeed,
          clientName,
        });
        const timestamp = new Date().toISOString();

        // setPresence lives INSIDE the try so the pairing with touchMode('idle')
        // in `finally` is atomic — any throw between setPresence and transact
        // (even future code added here) flips the badge back to idle rather
        // than wedging it on 'editing'.
        try {
          const icon = iconFromClientName(clientName);
          const color = AGENT_ICON_COLORS[icon] ?? colorFromSeed(colorSeed ?? agentId);
          agentPresenceBroadcaster?.setPresence(agentId, {
            displayName: agentName,
            icon,
            color,
            currentDoc: resolvedDocName,
            mode: 'writing',
            ts: Date.now(),
          });
          // FR-11: register one-shot observer BEFORE write transact so YTextEvent.delta is captured (D22)
          captureEffect(session.dc.document.getText('source'), agentId, colorSeed, clientName);
          // F1 (D2): use per-session origin, not shared AGENT_WRITE_ORIGIN (D32 STOP rule)
          session.dc.document.transact(() => {
            applyAgentMarkdownWrite(
              session.dc.document,
              body.markdown,
              position,
              options.resolveEmbed
                ? { resolveEmbed: options.resolveEmbed, sourcePath: resolvedDocName }
                : undefined,
            );

            const activityMap = session.dc.document.getMap('agent-flash');
            activityMap.set(agentId, {
              agentId,
              timestamp: Date.now(),
              type: 'insert',
              description: `Added (${agentName}): ${body.markdown.trim().slice(0, 50)}`,
            });
          }, session.origin);
          recordContributor(
            resolvedDocName,
            agentId,
            agentName,
            colorSeed,
            undefined,
            buildAgentActor({ clientName, clientVersion, label }),
            storedSummary,
          );
          incrementAgentWriteCalls();
          countNormalizedSummary(normalizedSummary);
        } finally {
          agentPresenceBroadcaster?.touchMode(agentId, 'idle');
        }

        flushDocToGit(resolvedDocName, 'agent-write-md');

        // Focus (attribution) on __system__ awareness. Focus drives browser
        // push-navigation to the doc the agent just wrote (writeKind); presence
        // is separately maintained via setPresence/touchMode pairs above.
        agentFocusBroadcaster?.setFocus(agentId, {
          agentName,
          currentDoc: resolvedDocName,
          writeKind: 'write',
          ts: Date.now(),
        });
        onAgentWrite?.();

        // Orphan-hint nudge (D7 / N1 cadence norm): if this doc now has zero
        // backlinks and a plausible hub exists in its folder tree, suggest the
        // hub. Soft — agent can ignore. Silent when no backlinkIndex is wired.
        const hints = computeOrphanHints(resolvedDocName);

        const subscriberCount = getSubscriberCount(resolvedDocName);
        const systemSubscriberCount = getSystemSubscriberCount();

        // Once-per-session attach hint counter: fires when no editor is attached
        // to `__system__` (transport-presence = false). Labels are bounded-
        // cardinality per CLAUDE.md STOP rule on OTel attributes — writer-kind
        // is always `agent` at this call site (`handleAgentWriteMd`), and
        // `resolveAgentType` is a 6-valued enum. No raw session IDs or names.
        if (systemSubscriberCount === 0) {
          hintEmittedCounter().add(1, {
            'shadow.writer': 'agent',
            'agent.type': resolveAgentType(clientName),
          });
        }

        // D22: success body is flat — no `{ ok: true }` wrapper.
        json(res, 200, {
          timestamp,
          subscriberCount,
          systemSubscriberCount,
          ...(hints ? { hints } : {}),
          ...(summaryResponse ? { summary: summaryResponse } : {}),
        });
      } catch (e) {
        log.error({ err: e }, '[agent-write-md] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-write-md',
          cause: e,
        });
      }
    },
    { handler: 'agent-write-md', method: 'POST' },
  );

  const handleDocumentRead = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const rawDocName = url.searchParams.get('docName') || 'test-doc';
        if (!isSafeDocName(rawDocName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'document-read',
          });
          return;
        }
        const docName = resolveAlias(rawDocName);
        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${docName}' is a reserved document name.`,
            { handler: 'document-read' },
          );
          return;
        }

        // Existing in-memory Y.Doc → read it directly; no need to round-trip
        // through openDirectConnection (which would still resolve to the same
        // doc but adds a connect/disconnect cycle).
        const existing = hocuspocus.documents.get(docName);
        if (existing) {
          json(res, 200, { docName, content: existing.getText('source').toString() });
          return;
        }

        // No in-memory doc → require an on-disk file before opening a
        // connection. `openDirectConnection` on a missing path materializes
        // an empty Y.Doc into `Hocuspocus.documents` that auto-unload is
        // suppressed for. The persistence layer's phantom-doc guard blocks
        // the eventual 0-byte file write, but any later code path that
        // populates the lingering Y.Doc with content (a mis-routed agent
        // write, the rename spine pulling it in via a stale backlink edge)
        // would then land a phantom file because `reconciledBase` was never
        // set. 404 here closes that whole class.
        const filePath = resolveContentEntryPath(contentDir, 'file', docName);
        if (!existsSync(filePath)) {
          errorResponse(
            res,
            404,
            'urn:ok:error:doc-not-found',
            `Document not found: ${docName}`,
            { handler: 'document-read' },
          );
          return;
        }

        // Read via a transient DirectConnection rather than sessionManager.getSession —
        // this endpoint has no agent identity, and creating a cached session would
        // leak an anonymous "Agent" (icon='bot') entry into the presence bar.
        const dc = await hocuspocus.openDirectConnection(docName);
        try {
          const document = dc.document;
          if (!document) {
            errorResponse(
              res,
              500,
              'urn:ok:error:document-not-available',
              'Document is not available.',
              { handler: 'document-read' },
            );
            return;
          }
          const content = document.getText('source').toString();
          json(res, 200, { docName, content });
        } finally {
          await dc.disconnect();
        }
      } catch (e) {
        console.error('[document-read]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read document.', {
          handler: 'document-read',
          cause: e,
        });
      }
    },
    { handler: 'document-read', method: 'GET', skipBodyParse: true },
  );

  const handleDocumentList = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const dir = url.searchParams.get('dir');

        // Validate dir parameter (reject traversal attempts)
        if (dir) {
          try {
            safeSubdir(contentDir, dir);
          } catch {
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              'Invalid directory parameter.',
              {
                handler: 'document-list',
              },
            );
            return;
          }
        }

        // Read from the watcher's in-memory file index (instant, no filesystem scan)
        const index = getFileIndex();
        const documents: {
          docName: string;
          docExt: string;
          size: number;
          modified: string;
          isSymlink: boolean;
          canonicalDocName: string | null;
          targetPath: string | null;
        }[] = [];

        for (const [docName, entry] of index) {
          // Filter by dir prefix if specified
          if (dir && !docName.startsWith(`${dir}/`) && docName !== dir) continue;

          // getDocExtension() returns the registered on-disk extension for the
          // docName (or `.md` by default when nothing is yet recorded). Surfacing
          // it to the client lets the sidebar render `foo.mdx` vs `foo.md`
          // faithfully instead of hard-coding `.md`.
          const docExt = getDocExtension(docName);

          documents.push({
            docName,
            docExt,
            size: entry.size,
            modified: entry.modified,
            isSymlink: false,
            canonicalDocName: null,
            targetPath: null,
          });

          // Emit alias entries for this canonical file
          for (const alias of entry.aliases) {
            if (dir && !alias.startsWith(`${dir}/`) && alias !== dir) continue;
            const targetRelPath = relative(contentDir, entry.canonicalPath);
            documents.push({
              docName: alias,
              docExt,
              size: entry.size,
              modified: entry.modified,
              isSymlink: true,
              canonicalDocName: docName,
              targetPath: targetRelPath,
            });
          }
        }

        documents.sort((a, b) => a.docName.localeCompare(b.docName));
        json(res, 200, { documents });
      } catch (e) {
        console.error('[document-list]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to list documents.', {
          handler: 'document-list',
          cause: e,
        });
      }
    },
    { handler: 'document-list', method: 'GET', skipBodyParse: true },
  );

  const handleBacklinks = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'backlinks' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const docName = url.searchParams.get('docName');
        if (!docName) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing docName parameter.', {
            handler: 'backlinks',
          });
          return;
        }
        if (!isSafeDocName(docName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'backlinks',
          });
          return;
        }
        const backlinks = backlinkIndex.getBacklinks(docName).map((entry) => ({
          source: entry.source,
          anchor: entry.anchor,
          title: readPageTitleForDocName(entry.source),
          snippet: entry.snippet,
        }));
        json(res, 200, { docName, backlinks });
      } catch (e) {
        console.error('[backlinks]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read backlinks.', {
          handler: 'backlinks',
          cause: e,
        });
      }
    },
    { handler: 'backlinks', method: 'GET', skipBodyParse: true },
  );

  /**
   * Bulk backlink-count lookup. `GET /api/backlink-counts?docNames=a,b,c`
   * returns `{ counts: { a: 3, b: 0, c: 2 } }`. Serves listing UIs
   * (exec ls/grep/find slim enrichment) that need connection density per file
   * without N-amplifying the single-doc `/api/backlinks` endpoint.
   * docNames failing `isSafeDocName` are silently dropped from `counts`.
   */
  const handleBacklinkCounts = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'backlink-counts' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const raw = url.searchParams.get('docNames');
        if (!raw) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing docNames parameter.', {
            handler: 'backlink-counts',
          });
          return;
        }
        const counts: Record<string, number> = {};
        for (const docName of raw.split(',')) {
          const trimmed = docName.trim();
          if (!trimmed || !isSafeDocName(trimmed)) continue;
          counts[trimmed] = backlinkIndex.getBacklinkCount(trimmed);
        }
        json(res, 200, { counts });
      } catch (e) {
        console.error('[backlink-counts]', e);
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read backlink counts.',
          { handler: 'backlink-counts', cause: e },
        );
      }
    },
    { handler: 'backlink-counts', method: 'GET', skipBodyParse: true },
  );

  const handleForwardLinks = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'forward-links' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const docName = url.searchParams.get('docName');
        if (!docName) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing docName parameter.', {
            handler: 'forward-links',
          });
          return;
        }
        if (!isSafeDocName(docName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'forward-links',
          });
          return;
        }
        json(res, 200, {
          docName,
          forwardLinks: backlinkIndex.getForwardLinkEntries(docName).map((entry) =>
            entry.kind === 'doc'
              ? {
                  kind: 'doc' as const,
                  docName: entry.target,
                  anchor: entry.anchor,
                  title: readPageTitleForDocName(entry.target),
                  snippet: entry.snippet,
                }
              : {
                  kind: 'external' as const,
                  url: entry.url,
                  title: entry.label ?? entry.url,
                  snippet: entry.snippet,
                },
          ),
        });
      } catch (e) {
        console.error('[forward-links]', e);
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read forward links.',
          { handler: 'forward-links', cause: e },
        );
      }
    },
    { handler: 'forward-links', method: 'GET', skipBodyParse: true },
  );

  const handleLinkGraph = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'link-graph' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const docName = url.searchParams.get('docName');
        if (docName && !isSafeDocName(docName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'link-graph',
          });
          return;
        }

        const rawDegrees = url.searchParams.get('degrees');
        if (rawDegrees && !docName) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'docName is required when degrees is provided.',
            { handler: 'link-graph' },
          );
          return;
        }

        let nodes: IndexedGraphNode[];
        let links: Array<{ source: string; target: string }>;

        if (rawDegrees && docName) {
          const degrees = Number.parseInt(rawDegrees, 10);
          if (!Number.isFinite(degrees) || degrees < 0) {
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              'degrees must be a non-negative integer.',
              { handler: 'link-graph' },
            );
            return;
          }

          ({ nodes, links } = backlinkIndex.getLinkGraphNeighborhood(docName, degrees));
        } else {
          ({ nodes, links } = backlinkIndex.getLinkGraph());
        }

        const enrichedNodes = nodes.map((node) => {
          if (node.kind === 'doc') {
            const meta = readFrontmatterMetadataForDocName(node.docName);
            return {
              id: node.id,
              kind: 'doc' as const,
              docName: node.docName,
              anchor: node.anchor ?? null,
              label: readPageTitleForDocName(node.docName),
              cluster: meta.cluster ?? null,
              category: meta.category ?? null,
              tags: meta.tags ?? null,
            };
          }
          return {
            id: node.id,
            kind: 'external' as const,
            url: node.url,
            label: node.label ?? node.url,
          };
        });
        json(res, 200, { nodes: enrichedNodes, links });
      } catch (e) {
        console.error('[link-graph]', e);
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read link graph.',
          {
            handler: 'link-graph',
            cause: e,
          },
        );
      }
    },
    { handler: 'link-graph', method: 'GET', skipBodyParse: true },
  );

  const handleOrphans = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'orphans' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const mode = url.searchParams.get('mode') ?? 'both';
        if (!isOrphanMode(mode)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'Invalid orphan mode. Allowed values: incoming, outgoing, both.',
            { handler: 'orphans' },
          );
          return;
        }

        const orphans = backlinkIndex
          .getOrphans([...getFileIndex().keys()], mode)
          .map((docName) => ({
            docName,
            title: readPageTitleForDocName(docName),
          }));
        json(res, 200, { orphans });
      } catch (e) {
        console.error('[orphans]', e);
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read orphan pages.',
          { handler: 'orphans', cause: e },
        );
      }
    },
    { handler: 'orphans', method: 'GET', skipBodyParse: true },
  );

  const handleHubs = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'hubs' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const rawLimit = url.searchParams.get('limit');
        const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 20;
        const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
        const hubs = backlinkIndex.getHubs(limit).map((hub) => ({
          docName: hub.docName,
          title: readPageTitleForDocName(hub.docName),
          count: hub.count,
        }));
        json(res, 200, { hubs });
      } catch (e) {
        console.error('[hubs]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read hub pages.', {
          handler: 'hubs',
          cause: e,
        });
      }
    },
    { handler: 'hubs', method: 'GET', skipBodyParse: true },
  );

  const handleDeadLinks = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      if (!backlinkIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:backlink-index-not-configured',
          'Backlink index is not configured.',
          { handler: 'dead-links' },
        );
        return;
      }
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const sourceDocNames = url.searchParams.getAll('sourceDocName');
        if (sourceDocNames.some((docName) => docName.length === 0 || !isSafeDocName(docName))) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid sourceDocName.', {
            handler: 'dead-links',
          });
          return;
        }

        const sourceDocNameFilter = sourceDocNames.length
          ? [...new Set(sourceDocNames.map((docName) => resolveAlias(docName)))]
          : undefined;
        const deadLinks = backlinkIndex.getDeadLinks(
          collectAdmittedDocNames(),
          sourceDocNameFilter,
        );

        json(res, 200, {
          deadLinks: deadLinks.map((entry) => ({
            target: entry.target,
            sources: entry.sources.map((sourceEntry) => ({
              source: sourceEntry.source,
              title: readPageTitleForDocName(sourceEntry.source),
              snippet: sourceEntry.snippet,
            })),
          })),
        });
      } catch (e) {
        console.error('[dead-links]', e);
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read dead links.',
          { handler: 'dead-links', cause: e },
        );
      }
    },
    { handler: 'dead-links', method: 'GET', skipBodyParse: true },
  );

  const handleAgentPatch = withValidation(
    AgentPatchRequestSchema,
    async (_req, res, body) => {
      try {
        const { find, replace, offset } = body;
        const effectivePatchDocName =
          body.docName !== undefined && body.docName.length > 0 ? body.docName : 'test-doc';
        const docName = resolveAlias(effectivePatchDocName);

        const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
          extractAgentIdentity(body);

        // Heuristic precheck: reject `find` strings that look like a YAML
        // frontmatter block before doing any Y.Doc work. The position-based
        // postcheck below catches non-yaml strings whose first match falls
        // inside the FM region. Frontmatter edits must go through
        // write_document with position:"replace", not edit_document.
        if (findLooksLikeFrontmatter(find)) {
          agentPatchFmTouchCounter().add(1, { result: 'rejected' });
          errorResponse(
            res,
            400,
            'urn:ok:error:frontmatter-edit-not-supported',
            'Frontmatter edits are not supported via edit_document. Use write_document with position:"replace" to rewrite the document including its YAML block.',
            { handler: 'agent-patch' },
          );
          return;
        }

        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${docName}' is a reserved document name.`,
            { handler: 'agent-patch' },
          );
          return;
        }

        const normalizedSummary = normalizeSummary(body.summary);
        const session = await sessionManager.getSession(docName, agentId, {
          displayName: agentName,
          colorSeed,
          clientName,
        });
        const timestamp = new Date().toISOString();

        let notFound = false;
        let staleTarget = false;
        let fmIntersect = false;
        // setPresence lives INSIDE the try so the pairing with touchMode('idle')
        // in `finally` is atomic — any throw between setPresence and transact
        // (even future code added here) flips the badge back to idle rather
        // than wedging it on 'editing'.
        try {
          const icon = iconFromClientName(clientName);
          const color = AGENT_ICON_COLORS[icon] ?? colorFromSeed(colorSeed ?? agentId);
          agentPresenceBroadcaster?.setPresence(agentId, {
            displayName: agentName,
            icon,
            color,
            currentDoc: docName,
            mode: 'writing',
            ts: Date.now(),
          });
          // FR-11: register one-shot observer BEFORE write transact so YTextEvent.delta is captured (D22)
          captureEffect(session.dc.document.getText('source'), agentId, colorSeed, clientName);
          // F1 (D2): use per-session origin, not shared AGENT_WRITE_ORIGIN (D32 STOP rule)
          session.dc.document.transact(() => {
            // Read current authoritative state. Search the FULL markdown
            // (frontmatter + body) so agents can patch frontmatter fields
            // (e.g. `title:`, `cluster:`) the same way they patch body text.
            // XmlFragment is the authoritative body per precedent #12; the
            // frontmatter lives in the YAML region of `Y.Text('source')`
            // (D8) and must be composed in for the search surface to
            // reflect the document as the agent sees it on disk.
            const xmlFragment = session.dc.document.getXmlFragment('default');
            const ytext = session.dc.document.getText('source');
            const currentFm = stripFrontmatter(ytext.toString()).frontmatter;
            const currentBody = mdManager.serialize(
              yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
            );
            const currentFull = prependFrontmatter(currentFm, currentBody);

            const pos =
              offset == null
                ? currentFull.indexOf(find)
                : currentFull.slice(offset, offset + find.length) === find
                  ? offset
                  : -1;
            if (pos === -1) {
              if (offset == null) {
                notFound = true;
              } else {
                staleTarget = true;
              }
              return;
            }

            // Position-based FM-intersection check. The string-shape
            // heuristic above handles yaml-style find strings; this catches
            // the residual class where a non-yaml find (e.g. a single word
            // like `draft`) happens to first-match in the FM region.
            // `pos < currentFm.length` is the necessary-and-sufficient
            // signal — FM is contiguous at doc start, so any match starting
            // before the FM-end byte overlaps the FM region.
            if (pos < currentFm.length) {
              fmIntersect = true;
              return;
            }

            // Splice at the character level. Only body-region patches
            // reach here, so this branch never modifies the FM.
            // applyAgentMarkdownWrite reads the current FM from the YAML
            // region of Y.Text and writes the canonical full document
            // back, so a body-only payload here keeps the existing FM
            // intact.
            const newFull =
              currentFull.slice(0, pos) + replace + currentFull.slice(pos + find.length);
            const { body: newBody } = stripFrontmatter(newFull);
            applyAgentMarkdownWrite(
              session.dc.document,
              newBody,
              'replace',
              options.resolveEmbed
                ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
                : undefined,
            );

            const activityMap = session.dc.document.getMap('agent-flash');
            activityMap.set(agentId, {
              agentId,
              timestamp: Date.now(),
              type: 'insert',
              description: `Patched (${agentName}): ${find.slice(0, 50)}`,
            });
          }, session.origin);
          if (!notFound && !staleTarget && !fmIntersect) {
            // Only count + record when the patch actually applied. The M1
            // denominator excludes 404/409 + FM-intersect 400 so adoption
            // rate reflects successful writes, not total attempts.
            const { stored: storedSummary } = summaryResponseFields(normalizedSummary);
            recordContributor(
              docName,
              agentId,
              agentName,
              colorSeed,
              undefined,
              buildAgentActor({ clientName, clientVersion, label }),
              storedSummary,
            );
            incrementAgentWriteCalls();
            countNormalizedSummary(normalizedSummary);
          }
        } finally {
          agentPresenceBroadcaster?.touchMode(agentId, 'idle');
        }

        if (staleTarget) {
          errorResponse(
            res,
            409,
            'urn:ok:error:stale-target',
            'Target text no longer matches at the requested offset.',
            { handler: 'agent-patch' },
          );
          return;
        }
        if (notFound) {
          errorResponse(res, 404, 'urn:ok:error:target-not-found', 'Text not found in document.', {
            handler: 'agent-patch',
          });
          return;
        }
        if (fmIntersect) {
          agentPatchFmTouchCounter().add(1, { result: 'rejected' });
          errorResponse(
            res,
            400,
            'urn:ok:error:frontmatter-edit-not-supported',
            'Frontmatter edits are not supported via edit_document. Use write_document with position:"replace" to rewrite the document including its YAML block.',
            { handler: 'agent-patch' },
          );
          return;
        }

        flushDocToGit(docName, 'agent-patch');

        // Focus (attribution) on __system__ awareness. Presence is separately
        // maintained via setPresence/touchMode pairs above.
        agentFocusBroadcaster?.setFocus(agentId, {
          agentName,
          currentDoc: docName,
          writeKind: 'edit',
          ts: Date.now(),
        });
        onAgentWrite?.();

        const subscriberCount = getSubscriberCount(docName);
        const systemSubscriberCount = getSystemSubscriberCount();

        // Once-per-session attach hint counter (matches handleAgentWriteMd).
        if (systemSubscriberCount === 0) {
          hintEmittedCounter().add(1, {
            'shadow.writer': 'agent',
            'agent.type': resolveAgentType(clientName),
          });
        }

        const { response: summaryResponse } = summaryResponseFields(normalizedSummary);

        // D22: success body is flat — no `{ ok: true }` wrapper.
        json(res, 200, {
          timestamp,
          subscriberCount,
          systemSubscriberCount,
          ...(summaryResponse ? { summary: summaryResponse } : {}),
        });
      } catch (e) {
        log.error({ err: e }, '[agent-patch] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-patch',
          cause: e,
        });
      }
    },
    { handler: 'agent-patch', method: 'POST' },
  );

  /**
   * POST /api/agent-undo — V0-14 agent undo via per-session Y.UndoManager.
   *
   * Body: { docName?: string, connectionId: string, scope?: 'last' | 'session' }
   *   connectionId — the session's agentId (matches sessionManager key)
   *   scope — 'last' undoes the top UM stack item; 'session' undoes all items.
   *
   * Fires applyAgentUndo under session.undoOrigin (paired: true) — Observer
   * A/B short-circuit; XmlFragment-authoritative composition updates both CRDTs.
   */
  const handleAgentUndo = withValidation(
    AgentUndoRequestSchema,
    async (_req, res, body) => {
      try {
        // FR-5, D42: extract identity from body so shadow-repo attribution
        // threads through the undo write the same way it does through
        // agent-write / agent-write-md / agent-patch. `agentId` is the
        // broadcaster-map key (prefixed via `toBroadcasterKey`) — use it
        // for setPresence/touchMode so cleanup via the keepalive WS close
        // handler finds the entry.
        const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
          extractAgentIdentity(body);

        const rawDocName =
          body.docName !== undefined && body.docName.length > 0 ? body.docName : 'test-doc';
        const docName = resolveAlias(rawDocName);

        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${docName}' is a reserved document name.`,
            { handler: 'agent-undo' },
          );
          return;
        }

        const { connectionId } = body;

        // 'file' scope is a thin alias for 'session' (all bursts on this file's session).
        const scope: 'last' | 'session' =
          body.scope === 'session' || body.scope === 'file' ? 'session' : 'last';

        if (!sessionManager.hasSession(docName, connectionId)) {
          errorResponse(
            res,
            404,
            'urn:ok:error:no-active-session',
            'No active session for this connectionId and docName.',
            { handler: 'agent-undo' },
          );
          return;
        }

        const session = await sessionManager.getSession(docName, connectionId);

        // FR-3: publish presence on __system__ (map-valued, keyed by agentId)
        // instead of the per-doc awareness — the per-doc awareness has ONE
        // shared clientID across N concurrent agents and would stomp.
        //
        // setPresence lives INSIDE the try so the pairing with touchMode('idle')
        // in `finally` is atomic — any throw between setPresence and the undo
        // transact flips the badge back to idle rather than wedging it on 'writing'.
        let undone = false;
        try {
          const icon = iconFromClientName(clientName);
          const color = AGENT_ICON_COLORS[icon] ?? colorFromSeed(colorSeed ?? agentId);
          agentPresenceBroadcaster?.setPresence(agentId, {
            displayName: agentName,
            icon,
            color,
            currentDoc: docName,
            mode: 'writing',
            ts: Date.now(),
          });
          // V0-14 (US-009): XmlFragment-authoritative undo via per-session UM.
          // applyAgentUndo wraps um.undo() + composition in one transact under
          // session.undoOrigin (paired: true) so Observer A/B short-circuit.
          undone = applyAgentUndo(
            session,
            scope,
            options.resolveEmbed
              ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
              : undefined,
          );
          // FR-5 / D42: record attribution for the undo write so the shadow-repo
          // L2 drain fans it out under this session's writer-id. Skip when the
          // UM stack was empty — a no-op undo has no mutation to attribute.
          if (undone) {
            recordContributor(
              docName,
              connectionId,
              agentName,
              colorSeed,
              undefined,
              buildAgentActor({ clientName, clientVersion, label }),
            );
          }
        } finally {
          agentPresenceBroadcaster?.touchMode(agentId, 'idle');
        }

        if (undone) {
          flushDocToGit(docName, 'agent-undo');
        }

        agentFocusBroadcaster?.setFocus(connectionId, {
          agentName: connectionId,
          currentDoc: docName,
          writeKind: 'undo',
          ts: Date.now(),
        });

        // D22: success body is flat — no `{ ok: true }` wrapper.
        json(res, 200, { docName, scope, undone });
      } catch (e) {
        log.error({ err: e }, '[agent-undo] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-undo',
          cause: e,
        });
      }
    },
    { handler: 'agent-undo', method: 'POST' },
  );

  /**
   * GET /api/agent-activity?agentId=<connId>
   * Returns per-file + per-burst stats for one agent's session(s).
   * Exempt from extractAgentIdentity — read-only, no CRDT mutation.
   */
  const handleAgentActivity = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        // `validateAgentId` enforces AGENT_ID_RE (same shape as every mutating
        // POST handler) — consistent identity shape across all surfaces per
        // `packages/server/src/agent-id.ts`'s "three-surfaces" rule.
        const agentId = validateAgentId(url.searchParams.get('agentId'));
        if (agentId === null) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'agentId required (alphanumeric/_/- only).',
            { handler: 'agent-activity' },
          );
          return;
        }
        const result = listAgentActivity(sessionManager, agentId);
        json(res, 200, result);
      } catch (e) {
        log.error({ err: e }, '[agent-activity] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-activity',
          cause: e,
        });
      }
    },
    { handler: 'agent-activity', method: 'GET', skipBodyParse: true },
  );

  /**
   * GET /api/agent-burst-diff?agentId=<connId>&docName=<path>&stackIndex=<n>
   * Returns unified-diff text for one StackItem in a given session.
   * Exempt from extractAgentIdentity — read-only, no CRDT mutation.
   */
  const handleAgentBurstDiff = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const agentId = validateAgentId(url.searchParams.get('agentId'));
        const rawDocName = url.searchParams.get('docName');
        const stackIndexStr = url.searchParams.get('stackIndex');

        if (agentId === null) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'agentId required (alphanumeric/_/- only).',
            { handler: 'agent-burst-diff' },
          );
          return;
        }
        if (!rawDocName || rawDocName.trim() === '') {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'docName required.', {
            handler: 'agent-burst-diff',
          });
          return;
        }
        // Same docName validator every mutating POST handler uses — parity with
        // the rest of the API surface (path traversal, reserved names).
        if (!isSafeDocName(rawDocName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'agent-burst-diff',
          });
          return;
        }
        const docName = resolveAlias(rawDocName);
        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${docName}' is a reserved document name.`,
            { handler: 'agent-burst-diff' },
          );
          return;
        }
        if (!stackIndexStr || Number.isNaN(Number(stackIndexStr))) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'stackIndex must be a number.', {
            handler: 'agent-burst-diff',
          });
          return;
        }
        const stackIndex = Number(stackIndexStr);
        if (!Number.isInteger(stackIndex) || stackIndex < 0) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'stackIndex must be a non-negative integer.',
            { handler: 'agent-burst-diff' },
          );
          return;
        }

        // Typed accessor — no `(as any).sessions` bypass.
        const session = sessionManager.getLiveSession(docName, agentId);
        if (!session) {
          errorResponse(
            res,
            404,
            'urn:ok:error:no-active-session',
            'No active session for this agentId and docName.',
            { handler: 'agent-burst-diff' },
          );
          return;
        }

        const um = session.um;
        if (stackIndex >= um.undoStack.length) {
          errorResponse(
            res,
            404,
            'urn:ok:error:not-found',
            `stackIndex ${stackIndex} out of range (stack has ${um.undoStack.length} items).`,
            { handler: 'agent-burst-diff' },
          );
          return;
        }

        // biome-ignore lint/suspicious/noExplicitAny: Y.StackItem is internal to yjs — structural shape matches YjsStackItemShape in agent-activity.ts
        const stackItem = um.undoStack[stackIndex] as any;
        const ytext = session.dc.document.getText('source');
        const diff = synthesizeStackItemDiffText(stackItem, ytext, docName);
        // `generatedAt` is the server's wall clock at response time (used for
        // client-side cache staleness). The StackItem's capture timestamp is
        // already carried in `/api/agent-activity`'s `bursts[].ts` — no need
        // to duplicate it here.
        json(res, 200, { diff, generatedAt: Date.now() });
      } catch (e) {
        log.error({ err: e }, '[agent-burst-diff] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-burst-diff',
          cause: e,
        });
      }
    },
    { handler: 'agent-burst-diff', method: 'GET', skipBodyParse: true },
  );

  const handleTestReset = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const docName = resolveAlias(url.searchParams.get('docName') ?? 'test-doc');

        // Path traversal guard — reuse the canonical validator from persistence.ts.
        // Throws `Invalid document name: ${docName}` for names that escape contentDir;
        // we translate that to a 400 response. Keeping the guard in one place (not
        // re-implementing the startsWith check inline) ensures handleTestReset stays
        // in lock-step with persistence's onLoadDocument / onStoreDocument validators.
        let filePath: string;
        try {
          filePath = safeContentPath(docName, contentDir);
        } catch (err) {
          // Log the original error (safeContentPath produces messages like
          // `Invalid document name: ${docName}` which are useful for diagnosing
          // unexpected failures beyond the standard path-traversal case — e.g.,
          // encoding errors from resolve(), null-byte truncation, etc.) but
          // still return a sanitized, uniform 400 message to the client so
          // filesystem details never leak through the API boundary.
          console.error('[test-reset] safeContentPath rejected docName:', docName, err);
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'test-reset',
            cause: err,
          });
          return;
        }

        await sessionManager.closeAll(docName);
        hocuspocus.closeConnections(docName);

        // D18: Force-flush any pending onStoreDocument debounced work before unload.
        // Without this, unloadDocument silently no-ops if the debouncer is active
        // (Hocuspocus.shouldUnloadDocument returns false when isDebounced is true).
        const debounceId = `onStoreDocument-${docName}`;
        if (hocuspocus.debouncer.isDebounced(debounceId)) {
          await hocuspocus.debouncer.executeNow(debounceId);
        }

        const doc = hocuspocus.documents.get(docName);
        if (doc) await (forceUnloadDocument ?? hocuspocus.unloadDocument.bind(hocuspocus))(doc);
        writeFileSync(filePath, '', 'utf-8');
        if (backlinkIndex) {
          backlinkIndex.deleteDocument(docName);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(
              `[backlinks] Failed to persist cache after test-reset for ${docName}:`,
              err,
            );
          });
          signalChannel?.('backlinks');
          signalChannel?.('graph');
        }
        signalChannel?.('files');
        json(res, 200, {});
      } catch (e) {
        console.error('[test-reset]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'test-reset',
          cause: e,
        });
      }
    },
    { handler: 'test-reset', method: 'POST', skipBodyParse: true },
  );

  /**
   * Test-only rescue hatch for the @parcel/watcher + inotify race on Linux.
   *
   * Under CI CPU contention, `@parcel/watcher` can drop `create` events for
   * files written into freshly-created subdirectories (the recursive subwatch
   * is registered asynchronously after the IN_CREATE for the directory, so
   * rapid follow-up file writes race the registration). That leaves the
   * backlink index out of sync with the content directory on disk, which the
   * backlink-dependent integration tests (e.g. `agent-focus-wiring.test.ts`
   * orphan-hint shape) cannot otherwise recover from.
   *
   * This endpoint forces `backlinkIndex.rebuildFromDisk()` — authoritative
   * resync from the filesystem that covers dropped events. It is NOT suitable
   * for production: rebuild wipes any in-memory backlink state not yet
   * debounced to disk (e.g. a live agent-write awaiting persistence). Gated
   * behind `enableTestRoutes` for that reason.
   */
  const handleTestRescanBacklinks = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        if (!backlinkIndex) {
          errorResponse(
            res,
            503,
            'urn:ok:error:backlink-index-not-configured',
            'Backlink index not configured.',
            { handler: 'test-rescan-backlinks' },
          );
          return;
        }
        backlinkIndex.rebuildFromDisk();
        void backlinkIndex.saveToDisk().catch((err) => {
          console.warn('[backlinks] Failed to persist cache after test-rescan-backlinks:', err);
        });
        signalChannel?.('backlinks');
        signalChannel?.('graph');
        json(res, 200, {});
      } catch (e) {
        console.error('[test-rescan-backlinks]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'test-rescan-backlinks',
          cause: e,
        });
      }
    },
    { handler: 'test-rescan-backlinks', method: 'POST', skipBodyParse: true },
  );

  const handleSaveVersion = withValidation(
    SaveVersionRequestSchema,
    async (_req, res, body) => {
      try {
        // Thread agent identity FIRST so the attribution-sweep ordering check
        // is satisfied: any errorResponse below this point is post-identity.
        // Shadow availability + writer-id validation are semantic checks that
        // would otherwise route through `openknowledge-service` attribution.
        const saveVersionBody = body as unknown as Record<string, unknown>;
        const {
          rawAgentId: svRawAgentId,
          agentId: svAgentId,
          agentName: svAgentName,
          clientName: svClientName,
        } = extractAgentIdentity(saveVersionBody);

        const shadow = shadowRef?.current;
        if (!shadow) {
          errorResponse(
            res,
            400,
            'urn:ok:error:shadow-not-configured',
            'Shadow repo not configured.',
            { handler: 'save-version' },
          );
          return;
        }

        // Parse optional writers + message + principal from already-validated body.
        const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
        let writers: WriterIdentity[] = [];
        let userMessage: string | undefined;
        let principalName: string | undefined;
        let principalEmail: string | undefined;

        if (typeof body.message === 'string' && body.message.trim()) {
          userMessage = body.message.replace(/[\r\n]/g, ' ').slice(0, 256);
        }
        if (Array.isArray(body.writers)) {
          try {
            writers = body.writers.map((w) => {
              const id = w.id ?? 'unknown';
              if (!SAFE_ID_RE.test(id)) {
                throw new Error(`Invalid writer id: ${id}`);
              }
              return {
                id,
                name: (w.name ?? 'unknown').replace(/[\r\n]/g, ''),
                email: (w.email ?? 'noreply@openknowledge.local').replace(/[\r\n]/g, ''),
              };
            });
          } catch (e) {
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              e instanceof Error ? e.message : 'Invalid writer id.',
              { handler: 'save-version', cause: e },
            );
            return;
          }
        }
        // Optional principal identity: { name?: string, email?: string } (US-020, D12)
        if (body.principal) {
          if (typeof body.principal.name === 'string' && body.principal.name.trim()) {
            principalName = sanitizeGitIdentity(body.principal.name.trim());
          }
          if (typeof body.principal.email === 'string' && body.principal.email.trim()) {
            principalEmail = sanitizeGitIdentity(body.principal.email.trim());
          }
        }

        if (writers.length === 0) {
          if (svRawAgentId !== undefined) {
            const displayName = svClientName ? `${svAgentName} (${svClientName})` : svAgentName;
            writers = [
              { id: svAgentId, name: displayName, email: `${svAgentId}@openknowledge.local` },
            ];
          } else {
            writers = [SERVICE_WRITER];
          }
        }

        const resolvedContentRoot = contentRoot ?? '.';
        const result = await saveVersion(shadow, resolvedContentRoot, writers);

        console.log(`[history] checkpoint ${result.checkpointRef}`);

        // Drain contributor snapshot for Co-Authored-By trailers (US-020, FR-9, D12).
        // swapContributors() atomically captures all agent writes since the last checkpoint.
        const contributorSnapshot = swapContributors();

        // Parent-git commit + ok/v<N> tag (non-fatal if project git unavailable)
        let versionTag: string | undefined;
        if (projectDir) {
          // Verify a git repo exists at projectDir before acquiring the lock (US-021, D45).
          // git rev-parse --git-dir succeeds iff the directory is inside a git repo.
          let parentGitAvailable = false;
          try {
            const checkPg = simpleGit({ baseDir: projectDir, timeout: { block: 5_000 } });
            await checkPg.revparse(['--git-dir']);
            parentGitAvailable = true;
          } catch (e) {
            console.warn(
              `[save-version] parent-git unavailable: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
          if (parentGitAvailable) {
            try {
              versionTag = await withParentLock(async () => {
                const pg = simpleGit({ baseDir: projectDir, timeout: { block: 15_000 } });
                // Count existing ok/v* tags to derive N
                const existing = await pg.tags(['--list', 'ok/v*']);
                const n = existing.all.length + 1;
                const tag = `ok/v${n}`;

                // Author identity: principal from body > git config > openknowledge fallback
                let authorName = 'openknowledge';
                let authorEmail = 'noreply@openknowledge.local';
                if (principalName && principalEmail) {
                  authorName = principalName;
                  authorEmail = principalEmail;
                } else {
                  try {
                    const gitId = await resolveGitIdentity(projectDir);
                    if (gitId) {
                      authorName = gitId.name;
                      authorEmail = gitId.email;
                    }
                  } catch {
                    // no-op — use defaults
                  }
                }

                // Co-Authored-By trailers for agent/principal session contributors (US-020)
                const coAuthorLines: string[] = [];
                for (const entry of contributorSnapshot.values()) {
                  if (
                    entry.writerId.startsWith('agent-') ||
                    entry.writerId.startsWith('principal-')
                  ) {
                    const trailerEmail = `${entry.writerId}@openknowledge.local`;
                    coAuthorLines.push(`Co-Authored-By: ${entry.displayName} <${trailerEmail}>`);
                  }
                }

                // Commit message: checkpoint: subject + trailers (US-015 prefix, US-020 trailers)
                const subjectLine = formatCheckpointSubject(userMessage ?? `Checkpoint v${n}`);
                const commitMsg =
                  coAuthorLines.length > 0
                    ? `${subjectLine}\n\n${coAuthorLines.join('\n')}`
                    : subjectLine;

                // Stage content changes and create commit (allow-empty so a tag always lands)
                const gitPathspec = resolvedContentRoot || '.';
                await pg.add(gitPathspec);
                await pg
                  .env({
                    GIT_AUTHOR_NAME: authorName,
                    GIT_AUTHOR_EMAIL: authorEmail,
                    GIT_COMMITTER_NAME: authorName,
                    GIT_COMMITTER_EMAIL: authorEmail,
                  })
                  .commit(commitMsg, ['--allow-empty']);
                await pg.addTag(tag);
                console.log(`[checkpoint] parent-git commit + tag ${tag}`);
                return tag;
              });
            } catch (e) {
              console.warn('[checkpoint] parent-git commit failed (non-fatal):', e);
            }
          }
        }

        json(res, 200, {
          checkpointRef: result.checkpointRef,
          ...(versionTag ? { versionTag } : {}),
        });
      } catch (e) {
        console.error('[save-version]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'save-version',
          cause: e,
        });
      }
    },
    { handler: 'save-version', method: 'POST' },
  );

  // ── GET /api/history ─────────────────────────────────────────────────────
  const handleHistory = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      const shadow = shadowRef?.current;
      if (!shadow) {
        errorResponse(
          res,
          400,
          'urn:ok:error:shadow-not-configured',
          'Shadow repo not configured.',
          { handler: 'history' },
        );
        return;
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = url.searchParams.get('docName') ?? '';
      const branch = url.searchParams.get('branch') ?? getCurrentBranch?.() ?? 'main';
      if (!docName) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          'docName query parameter is required.',
          { handler: 'history' },
        );
        return;
      }

      if (branch.includes('..') || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid branch name.', {
          handler: 'history',
        });
        return;
      }

      const rawLimit = Number(url.searchParams.get('limit') ?? '50');
      const rawOffset = Number(url.searchParams.get('offset') ?? '0');
      const limit = Math.min(200, Number.isFinite(rawLimit) ? rawLimit : 50);
      const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
      const type = url.searchParams.get('type') ?? undefined;
      const author = url.searchParams.get('author') ?? undefined;
      const excludeAuthor = url.searchParams.get('excludeAuthor') ?? undefined;

      const t0 = Date.now();
      try {
        const resolvedContentRoot = contentRoot ?? '.';
        const result = await getDocumentHistory(
          shadow,
          {
            docName,
            branch,
            limit,
            offset,
            type,
            author,
            excludeAuthor,
          },
          resolvedContentRoot,
        );

        const duration = Date.now() - t0;
        console.log(
          `[timeline] query docName=${docName} entries=${result.entries.length} duration=${duration}ms`,
        );

        json(res, 200, { ...result });
      } catch (e) {
        console.error('[shadow]', e);
        const message = e instanceof Error ? e.message : String(e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', message, {
          handler: 'history',
          cause: e,
        });
      }
    },
    { handler: 'history', method: 'GET', skipBodyParse: true },
  );

  // ── GET /api/history/:sha ─────────────────────────────────────────────────
  async function handleHistoryVersion(
    req: IncomingMessage,
    res: ServerResponse,
    sha: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'history-version',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      errorResponse(res, 400, 'urn:ok:error:shadow-not-configured', 'Shadow repo not configured.', {
        handler: 'history-version',
      });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';

    const resolvedContentRoot = contentRoot ?? '.';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', pathResult.error, {
        handler: 'history-version',
      });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    // Validate SHA format
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid commit SHA.', {
        handler: 'history-version',
      });
      return;
    }

    try {
      // Verify file exists at this commit
      try {
        await sg.raw('cat-file', '-e', `${sha}:${docPath}`);
      } catch (catFileErr) {
        errorResponse(
          res,
          404,
          'urn:ok:error:doc-not-found',
          'Document did not exist at this version.',
          { handler: 'history-version', cause: catFileErr },
        );
        return;
      }

      const content = await sg.raw('show', `${sha}:${docPath}`);

      // Resolve commit metadata
      const logLine = (await sg.raw('log', '-1', '--format=%aI%x00%an', sha)).trim();
      const [timestamp = '', author = ''] = logLine.split('\x00');

      json(res, 200, { sha, content, timestamp, author });
    } catch (e) {
      console.error('[shadow-version]', e);
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'history-version',
        cause: e,
      });
    }
  }

  // ── GET /api/diff ─────────────────────────────────────────────────────────
  const handleDiff = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      const shadow = shadowRef?.current;
      if (!shadow) {
        errorResponse(
          res,
          400,
          'urn:ok:error:shadow-not-configured',
          'Shadow repo not configured.',
          { handler: 'diff' },
        );
        return;
      }

      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = url.searchParams.get('docName') ?? '';
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';

      if (!to || !/^[0-9a-f]{40}$/i.test(to)) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          "'to' must be a valid 40-char commit SHA.",
          { handler: 'diff' },
        );
        return;
      }

      const resolvedContentRoot = contentRoot ?? '.';
      const pathResult = safeDocPath(docName, resolvedContentRoot);
      if ('error' in pathResult) {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', pathResult.error, {
          handler: 'diff',
        });
        return;
      }
      const docPath = pathResult.path;
      const sg = shadowGit(shadow);

      try {
        // Get "to" content
        let toContent: string;
        try {
          toContent = await sg.raw('show', `${to}:${docPath}`);
        } catch (toErr) {
          errorResponse(
            res,
            404,
            'urn:ok:error:doc-not-found',
            'Document did not exist at the target version.',
            { handler: 'diff', cause: toErr },
          );
          return;
        }

        // Get "from" content — either a commit SHA or current Y.Doc text
        let fromContent: string;
        if (from && /^[0-9a-f]{40}$/i.test(from)) {
          try {
            fromContent = await sg.raw('show', `${from}:${docPath}`);
          } catch (fromErr) {
            errorResponse(
              res,
              404,
              'urn:ok:error:doc-not-found',
              'Document did not exist at the source version.',
              { handler: 'diff', cause: fromErr },
            );
            return;
          }
        } else {
          // from omitted — read current Y.Doc content directly (avoids creating an agent session)
          const doc = hocuspocus.documents.get(docName);
          if (!doc) {
            errorResponse(
              res,
              409,
              'urn:ok:error:document-not-open',
              'Document is not currently open — open it in the editor first.',
              { handler: 'diff' },
            );
            return;
          }
          fromContent = doc.getText('source').toString();
        }

        // Strip frontmatter from both sides so the diff shows only body changes.
        // Git content includes frontmatter; Y.Text may or may not depending on
        // sync state. Stripping both sides normalizes the comparison.
        const fromBody = stripFrontmatter(fromContent).body;
        const toBody = stripFrontmatter(toContent).body;
        const changes = diffLines(fromBody, toBody);

        // Build full-file line array: every line annotated as added/removed/unchanged
        const lines: { type: 'added' | 'removed' | 'unchanged'; text: string }[] = [];
        let additions = 0;
        let deletions = 0;
        for (const change of changes) {
          const changeLines = change.value.replace(/\n$/, '').split('\n');
          const type = change.added ? 'added' : change.removed ? 'removed' : 'unchanged';
          for (const text of changeLines) {
            lines.push({ type, text });
          }
          if (change.added) additions += changeLines.length;
          if (change.removed) deletions += changeLines.length;
        }

        json(res, 200, { lines, additions, deletions });
      } catch (e) {
        console.error('[diff]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'diff',
          cause: e,
        });
      }
    },
    { handler: 'diff', method: 'GET', skipBodyParse: true },
  );

  // ── POST /api/rollback ────────────────────────────────────────────────────
  const handleRollback = withValidation(
    RollbackRequestSchema,
    async (_req, res, body) => {
      const bodyObj = body as unknown as Record<string, unknown>;
      const actor = extractActorIdentity(bodyObj, getPrincipal);
      if (actor.kind === 'invalid-summary') {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', 'summary must be a string', {
          handler: 'rollback',
        });
        return;
      }

      // Server-mode availability check. Identity is extracted first so the
      // attribution-sweep ordering invariant holds: any errorResponse below
      // this point is post-identity. The emit is still anonymous on the
      // wire because identity is captured but never echoed.
      const shadow = shadowRef?.current;
      if (!shadow) {
        errorResponse(
          res,
          400,
          'urn:ok:error:rollback-not-configured',
          'Shadow repo not configured.',
          { handler: 'rollback' },
        );
        return;
      }

      const { docName, commitSha, versionTag: versionTagForRollback } = body;

      const resolvedContentRoot = contentRoot ?? '.';
      const pathResult = safeDocPath(docName, resolvedContentRoot);
      if ('error' in pathResult) {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', pathResult.error, {
          handler: 'rollback',
        });
        return;
      }
      const docPath = pathResult.path;
      const sg = shadowGit(shadow);

      const t0 = Date.now();
      try {
        // Verify file exists at this commit
        try {
          await sg.raw('cat-file', '-e', `${commitSha}:${docPath}`);
        } catch (catFileErr) {
          errorResponse(
            res,
            404,
            'urn:ok:error:doc-not-found',
            'Document did not exist at this version.',
            { handler: 'rollback', cause: catFileErr },
          );
          return;
        }

        const markdown = await sg.raw('show', `${commitSha}:${docPath}`);
        const timestamp = new Date().toISOString();

        // snapshot current state before the destructive rollback
        await safetyCheckpoint(shadow, resolvedContentRoot, {
          action: 'rollback',
          context: { docName, targetSha: commitSha },
        });

        // Apply to live Y.Doc via updateYFragment (L1 persistence fires normally)
        const document = hocuspocus.documents.get(docName);
        if (!document) {
          errorResponse(
            res,
            409,
            'urn:ok:error:document-not-open',
            'Document is not currently open — open it in the editor first.',
            { handler: 'rollback' },
          );
          return;
        }

        // FM lives in the YAML region of Y.Text directly (#365); the rollback
        // body parse only needs the body half — `frontmatter` is no longer
        // mirrored into a separate metaMap slot.
        const { body: mdBody } = stripFrontmatter(markdown);
        const rollbackParseOpts = options.resolveEmbed
          ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
          : undefined;
        const parsedJson = mdManager.parseWithFallback(mdBody, rollbackParseOpts);
        const pmNode = schema.nodeFromJSON(parsedJson);
        const xmlFragment = document.getXmlFragment('default');

        document.transact(() => {
          const meta = { mapping: new Map(), isOMark: new Map() };
          updateYFragment(document, xmlFragment, pmNode, meta);

          // Y.Text receives the full markdown (FM + body) verbatim — the
          // YAML region IS the FM source of truth. No separate metadata-map
          // mirror.
          const ytext = document.getText('source');
          const currentText = ytext.toString();
          if (currentText !== markdown) {
            ytext.delete(0, currentText.length);
            ytext.insert(0, markdown);
          }
        }, ROLLBACK_ORIGIN);

        // NOTE: we deliberately do NOT call `setReconciledBase(docName, markdown)`
        // here. Setting the base before `onStoreDocument` has fired would trip the
        // "skip write when serialized === currentBase" guard at
        // `persistence.ts:onStoreDocument` and drop the L1 disk write entirely
        // — which also skips the following `scheduleGitCommit()`, orphaning any
        // `recordContributor(...)` entry we add below into the next unrelated
        // write's L2 commit (a leak surfaced by the agent-write-summaries QA run).
        // Letting `onStoreDocument` fire naturally writes disk AND updates the
        // reconciled base (line 497 of persistence.ts), which is the correct order.

        // 4-way actor switch (NG12 invariant): agent records contributor with
        // optional default summary; principal records with the rollback subject;
        // anonymous skips recordContributor entirely (never default-attribute);
        // invalid-summary already returned above.
        let summaryResponse: SummaryResponse | undefined;
        switch (actor.kind) {
          case 'agent': {
            const shaShort = commitSha.slice(0, 8);
            const agentProvidedSummary = actor.summary.kind === 'value';
            const effectiveNormalized = agentProvidedSummary
              ? actor.summary
              : normalizeSummary(`Restored to ${shaShort}`);
            const fields = summaryResponseFields(effectiveNormalized);
            summaryResponse =
              agentProvidedSummary || !fields.response
                ? fields.response
                : stripDefaultPathTruncation(fields.response);
            recordContributor(
              docName,
              actor.writerId,
              actor.displayName,
              actor.colorSeed,
              formatRollbackSubject(docName, commitSha),
              actor.actor,
              fields.stored,
            );
            incrementAgentWriteCalls();
            countNormalizedSummary(effectiveNormalized, !agentProvidedSummary);
            break;
          }
          case 'principal': {
            const fields = summaryResponseFields(actor.summary);
            summaryResponse = fields.response;
            recordContributor(
              docName,
              actor.writerId,
              actor.displayName,
              actor.colorSeed,
              formatRollbackSubject(docName, commitSha),
              actor.actor,
              fields.stored,
            );
            countNormalizedSummary(actor.summary, false);
            break;
          }
          case 'anonymous':
            log.debug(
              { docName, commitSha: commitSha.slice(0, 8) },
              '[rollback] anonymous actor — no contributor recorded (no agentId in body and getPrincipal() returned null)',
            );
            break;
          default: {
            const _exhaustive: never = actor;
            throw new Error(
              `Unhandled actor kind in handleRollback: ${String((_exhaustive as { kind?: unknown }).kind)}`,
            );
          }
        }
        renameAttributionCounter().add(1, { kind: 'rollback', attribution_kind: actor.kind });

        // Force-flush L1 (onStoreDocument debounce) then L2 (git commit) so the
        // restored version + attribution appear in the timeline within ~100ms
        // rather than waiting for the natural ~4s L1+L2 debounce stack. Uses
        // the shared `flushDocToGit` helper (same pattern as the three
        // agent-write handlers) rather than a raw `flushGitCommit()` which
        // no-ops when no L2 timer is set yet.
        flushDocToGit(docName, 'rollback');

        const duration = Date.now() - t0;
        console.log(
          `[rollback] docName=${docName} from=${commitSha.slice(0, 8)} duration=${duration}ms`,
        );

        // Parent-git commit for team-visible restore record (non-fatal)
        if (projectDir) {
          const versionLabel = versionTagForRollback ?? commitSha.slice(0, 8);
          const restoreMsg = `Restored to ${versionLabel}: ${docName}`;
          const resolvedContentRoot = contentRoot ?? '.';
          withParentLock(async () => {
            const pg = simpleGit({ baseDir: projectDir, timeout: { block: 15_000 } });
            const gitPathspec = resolvedContentRoot || '.';
            await pg.add(gitPathspec);
            await pg.commit(restoreMsg, { '--allow-empty': null });
            console.log(`[rollback] parent-git commit: ${restoreMsg}`);
          }).catch((e) => {
            console.warn('[rollback] parent-git commit failed (non-fatal):', e);
          });
        }

        // Only broadcast agent-focus push-nav when the caller explicitly
        // identified as an agent. UI-driven Restore (principal or anonymous)
        // must not trigger a cross-client push-nav as if an agent did the
        // rollback.
        if (actor.kind === 'agent') {
          agentFocusBroadcaster?.setFocus(actor.writerId, {
            agentName: actor.displayName,
            currentDoc: docName,
            writeKind: 'rollback-apply',
            ts: Date.now(),
          });
        }

        json(res, 200, {
          restoredFrom: commitSha,
          timestamp,
          ...(summaryResponse ? { summary: summaryResponse } : {}),
        });
      } catch (e) {
        console.error('[rollback]', e);
        const message = e instanceof Error ? e.message : String(e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', message, {
          handler: 'rollback',
          cause: e,
        });
      }
    },
    { handler: 'rollback', method: 'POST' },
  );

  const handleMetricsReconciliation = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        json(res, 200, getMetrics());
      } catch (e) {
        log.error({ err: e }, '[metrics-reconciliation] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'metrics-reconciliation',
          cause: e,
        });
      }
    },
    { handler: 'metrics-reconciliation', method: 'GET', skipBodyParse: true },
  );

  const handleMetricsParseHealth = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        json(res, 200, getParseHealth());
      } catch (e) {
        log.error({ err: e }, '[metrics-parse-health] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'metrics-parse-health',
          cause: e,
        });
      }
    },
    { handler: 'metrics-parse-health', method: 'GET', skipBodyParse: true },
  );

  /**
   * GET /api/server-info
   *
   * Returns `{ ok, serverInstanceId, currentBranch, currentDiskAckSVs }`.
   * Called by the client's `ProviderPool` as a boot-time warmup BEFORE
   * any WebSocket provider opens, so the first provider's auth token
   * can carry `expectedServerInstanceId` and `expectedBranch` on the
   * very first connect (avoiding one "null-claim accept → broadcast →
   * populate cache → next connect claim" cycle on cold start).
   *
   * `currentBranch` is the late-join backstop for CC1's `branch-switched`
   * stateless broadcast — disconnected clients reconnecting compare it
   * against their last-observed branch and trigger `handleBranchSwitched`
   * on mismatch (also surfaced as the `expectedBranch` auth-token claim,
   * see `auth-token-schema.ts`). Always populated — `getActiveBranch()`
   * defaults to `'main'` when git is disabled.
   *
   * `currentDiskAckSVs` is the late-join backstop for the per-doc CC1
   * `disk-ack` channel — same recovery shape as `currentBranch` but the
   * per-doc state vector watermark used by mismatch-recycle baseline-
   * selection. Omitted in dev/plugin mode (no CC1 broadcaster).
   *
   * Gating: protected by the global `/api/*` Origin allowlist (CSRF
   * guard against cross-origin browsers). No-Origin requests (curl,
   * server-to-server, LAN peers using non-browser tooling) pass through
   * — the same posture as the rest of the read-side `/api/*` surface
   * (`/api/documents`, `/api/document`, `/api/pages`, `/api/backlinks`).
   * Disclosure shape: `serverInstanceId` is a per-process random UUID;
   * `currentBranch` matches the workspace's git history; the SV map
   * enumerates the same docName set as `/api/documents` plus per-
   * client Lamport op counts (random clientID, no wall-clock).
   * Single-user-loopback deployment model is documented in
   * `server-factory.ts` near the principalAuthExtension; hosted/multi-
   * tenant deployments must wrap this entire `/api/*` class with
   * authentication and per-caller scoping.
   */
  const handleServerInfo = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        const currentBranch = getActiveBranch();
        // `getDiskAckSVs` is wired by standalone boot; plugin mode (dev
        // server) doesn't have a CC1Broadcaster and omits the field. The
        // schema's `.optional()` keeps the response shape valid in both
        // cases without a separate "no broadcaster" branch on the client.
        const currentDiskAckSVs = getDiskAckSVs?.();
        // `Cache-Control: no-store` matches the disclosure semantics: every
        // field is per-process / per-moment state. A back/forward-cached
        // 304 carrying a stale `currentDiskAckSVs` could silently corrupt
        // the recycle baseline-selection on the next mismatch.
        json(
          res,
          200,
          {
            serverInstanceId,
            currentBranch,
            ...(currentDiskAckSVs !== undefined ? { currentDiskAckSVs } : {}),
          },
          { 'Cache-Control': 'no-store' },
        );
      } catch (e) {
        console.error('[server-info]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'server-info',
          cause: e,
        });
      }
    },
    { handler: 'server-info', method: 'GET', skipBodyParse: true },
  );

  async function handlePrincipal(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Loopback + Host-header gate. The principal record discloses operator
    // PII — `display_name` (real name) and `display_email` — sourced from
    // local `git config`. Under `--host 0.0.0.0` (demos, shared dev boxes,
    // Codespaces) this would otherwise be readable by any LAN peer or
    // cross-origin page that bypasses the Origin allowlist (non-browser
    // callers send no `Origin` header). Matches the same gate
    // `handleMetricsAgentPresence` and `handleWorkspace` apply.
    // Authorization runs BEFORE method dispatch so a bad Host never leaks
    // "verb the endpoint expects" via the 405 response (OWASP ASVS V4.1.1).
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      errorResponse(res, 403, 'urn:ok:error:loopback-required', 'Loopback required.', {
        handler: 'principal',
      });
      return;
    }
    if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
      errorResponse(res, 403, 'urn:ok:error:host-not-allowed', 'Host header not allowed.', {
        handler: 'principal',
      });
      return;
    }
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'principal',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    const principal = getPrincipal?.() ?? null;
    if (!principal) {
      errorResponse(res, 404, 'urn:ok:error:principal-not-available', 'Principal not available.', {
        handler: 'principal',
      });
      return;
    }
    json(res, 200, principal);
  }

  async function handleMetricsAgentPresence(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Loopback + Host-header gate — matches /api/workspace. The presence map
    // exposes per-agent identity (`displayName` — operator-configured AGENT
    // label) and the workspace-relative path each agent is currently writing
    // to (`currentDoc`). Those are local-editing-only signals; if a user
    // deploys to `0.0.0.0` / reverse-proxies the port, cross-origin pages or
    // LAN peers MUST NOT be able to read the map. Authorization runs before
    // method dispatch so a bad Host never leaks "verb the endpoint expects"
    // via 405 (same pattern + rationale as handleWorkspace — see its
    // comment block for the ASVS / DNS-rebinding background).
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      errorResponse(res, 403, 'urn:ok:error:loopback-required', 'Loopback required.', {
        handler: 'metrics-agent-presence',
      });
      return;
    }
    if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
      errorResponse(res, 403, 'urn:ok:error:host-not-allowed', 'Host header not allowed.', {
        handler: 'metrics-agent-presence',
      });
      return;
    }
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'metrics-agent-presence',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    try {
      // Pre-filter stale entries using the same threshold the broadcaster
      // uses for opportunistic eviction (runs inside setPresence). Eviction
      // is write-triggered — if the last agent disconnects without the
      // keepalive close firing (proxy ate the frame, `-9` kill) and no other
      // agent writes after, the raw map keeps the zombie entry. Clients
      // already filter with their own 5s TTL so this is invisible to the
      // bar, but `/api/metrics/agent-presence` would otherwise lie to
      // operators. Filtering here matches what a "live" read returns
      // without paying for a sparse timer.
      const rawPresence = agentPresenceBroadcaster?.getPresenceMap() ?? {};
      const now = Date.now();
      const presence: typeof rawPresence = {};
      for (const [agentId, entry] of Object.entries(rawPresence)) {
        if (now - entry.ts < BROADCASTER_EVICTION_MS) {
          presence[agentId] = entry;
        }
      }
      json(res, 200, { presence });
    } catch (e) {
      log.error({ err: e }, '[metrics-agent-presence] handler failed');
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'metrics-agent-presence',
        cause: e,
      });
    }
  }

  async function handleWorkspace(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Authorization runs BEFORE method dispatch: reversing the order turns the
    // method check into a fingerprinting oracle for unauth callers (GET → 403,
    // POST → 405 discloses the verb the endpoint expects). See OWASP ASVS 4.0
    // V4.1.1 — "perform access control on every request."
    //
    // Loopback-only: this endpoint discloses the absolute host filesystem path
    // (including home directory / username). That's fine for the local-editing
    // use case the rest of the API is designed for, but if the user configures
    // `server.host: 0.0.0.0` (demos, shared dev boxes, Codespaces), we do NOT
    // want to leak the host shape over the network or to cross-origin fetches.
    // All loopback clients (including requests from a browser on the same
    // machine) pass — connections from other interfaces are refused.
    //
    // DNS-rebinding defense: `req.socket.remoteAddress` will read `127.0.0.1`
    // for any request that reached the socket via loopback, including requests
    // triggered by a malicious page that rebinds its hostname to `127.0.0.1`.
    // The Host-header allowlist below enforces that the caller actually spoke
    // to us via `localhost` / `127.0.0.1` / `[::1]`, matching the mitigation
    // in the Ethereum/geth JSON-RPC lineage. Same-origin fetches from the
    // editor app pass; cross-origin rebinding attempts are refused.
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      errorResponse(res, 403, 'urn:ok:error:loopback-required', 'Loopback required.', {
        handler: 'workspace',
      });
      return;
    }
    if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
      errorResponse(res, 403, 'urn:ok:error:host-not-allowed', 'Host header not allowed.', {
        handler: 'workspace',
      });
      return;
    }
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'workspace',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    // Absolute, canonical contentDir so the client can build full filesystem
    // paths (e.g. for the sidebar 'Copy path > Full path' action). Symlinks in
    // the workspace root are resolved via realpath so the path matches on-disk
    // truth. We treat error kinds in line with the persistence layer's symlink
    // contract (CLAUDE.md "Symlinks" §):
    //   - ENOENT: contentDir missing on disk → 200 with `symlinkResolved: false`
    //     and the unresolved path. Lets "Copy Path" still produce a meaningful
    //     value when the directory was deleted between server start and this
    //     request; the client decides whether to act on it.
    //   - ELOOP / EACCES / anything else: real filesystem error → 500. Matches
    //     persistence's stricter policy (cyclic symlinks are rejected
    //     everywhere) and avoids handing the user a path that won't resolve.
    const resolvedRoot = resolve(contentDir);
    let resolvedContentDir = resolvedRoot;
    let symlinkResolved = true;
    try {
      resolvedContentDir = realpathSync(resolvedRoot);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code === 'ENOENT') {
        console.warn('[workspace] contentDir does not exist; returning unresolved path', {
          path: resolvedRoot,
        });
        symlinkResolved = false;
      } else {
        console.warn('[workspace] realpath failed for contentDir', { path: resolvedRoot, err });
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'workspace realpath failed.',
          { handler: 'workspace', detail: code ?? undefined, cause: err },
        );
        return;
      }
    }
    // `pathSeparator` lets the client build full paths without guessing from
    // the shape of `contentDir` (which breaks on Windows + forward-slash paths
    // and on POSIX folders that contain a literal backslash in the name).
    json(res, 200, {
      contentDir: resolvedContentDir,
      pathSeparator: sep,
      symlinkResolved,
    });
  }

  /** 24h in milliseconds — rescue buffers older than this are excluded/cleaned. */
  const RESCUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  const handleRescueList = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        if (!shadowRef?.current) {
          // No shadow repo configured = no rescue buffers; emit empty list (success).
          json(res, 200, []);
          return;
        }

        const now = Date.now();
        // `source: 'flat'` rows came from the shutdown-flush path (retained flat-
        // file per SPEC); `source: 'timeline'` rows came from reconcile-delete /
        // branch-switch (migrated to saveInMemoryCheckpoint per R7e). Clients
        // can treat both as interchangeable unless they need the checkpoint sha.
        const entries: (RescueEntryFlat | (RescueEntryTimeline & TimelineRescueEntry))[] = [];

        const rescueDir = resolve(shadowRef.current.gitDir, 'rescue');
        if (existsSync(rescueDir)) {
          try {
            const files = readdirSync(rescueDir).filter((f) => isSupportedDocFile(f));
            for (const file of files) {
              const filePath = resolve(rescueDir, file);
              const stat = statSync(filePath);
              const age = now - stat.mtimeMs;

              if (age > RESCUE_MAX_AGE_MS) {
                try {
                  unlinkSync(filePath);
                } catch (e) {
                  console.debug('[rescue] cleanup failed (non-critical):', e);
                }
                continue;
              }

              entries.push({
                docName: stripDocExtension(file),
                timestamp: stat.mtime.toISOString(),
                size: stat.size,
                source: 'flat',
              });
            }
          } catch (e) {
            console.error('[rescue] Failed to list flat-file rescue buffers:', e);
          }
        }

        // Timeline-ref source — merged in so the unified response surfaces all
        // three rescue classes once R7e's write migration ships (SPEC §6 R7f).
        try {
          const branch = getCurrentBranch?.() ?? 'main';
          const timelineEntries = await listRescueCheckpoints(shadowRef.current, branch);
          for (const t of timelineEntries) {
            entries.push({ ...t, source: 'timeline' });
          }
        } catch (e) {
          console.error('[rescue] Failed to list timeline-ref rescue checkpoints:', e);
        }

        json(res, 200, entries);
      } catch (e) {
        console.error('[rescue]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'rescue-list',
          cause: e,
        });
      }
    },
    { handler: 'rescue-list', method: 'GET', skipBodyParse: true },
  );

  async function handleRescueGet(
    req: IncomingMessage,
    res: ServerResponse,
    docName: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'rescue-get',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    if (!shadowRef?.current) {
      errorResponse(res, 404, 'urn:ok:error:not-found', 'Not found.', { handler: 'rescue-get' });
      return;
    }

    // Flat-file source (shutdown-flush retains flat-file per SPEC). Try
    // this first — the flat-file path is how shutdown-flush delivers the
    // most recent unflushed state, which is the most relevant artifact.
    const rescueBase = resolve(shadowRef.current.gitDir, 'rescue');
    const filePath = resolve(rescueBase, `${docName}${getDocExtension(docName)}`);
    if (!filePath.startsWith(`${rescueBase}/`)) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid document name.', {
        handler: 'rescue-get',
      });
      return;
    }
    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      if (Date.now() - stat.mtimeMs > RESCUE_MAX_AGE_MS) {
        try {
          unlinkSync(filePath);
        } catch {
          // ignore
        }
      } else {
        const content = readFileSync(filePath, 'utf-8');
        res.writeHead(200, {
          'Content-Type': 'text/markdown',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(content);
        return;
      }
    }

    // Timeline-ref source — fall back to the most recent
    // `external-change-rescue` checkpoint for this doc on the current
    // branch (SPEC §6 R7f). Reads the blob via `git cat-file` so large
    // docs stream directly from git object storage.
    try {
      const branch = getCurrentBranch?.() ?? 'main';
      const timelineEntries = await listRescueCheckpoints(shadowRef.current, branch);
      // Most recent for this doc
      const match = timelineEntries
        .filter((e) => e.docName === docName)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      if (match) {
        const sg = shadowGit(shadowRef.current);
        const tree = (await sg.raw('ls-tree', '-r', match.sha)).trim();
        // The blob is the single entry; extract its object SHA.
        const firstLine = tree.split('\n')[0] ?? '';
        const parts = firstLine.split(/\s+/);
        const blobSha = parts[2];
        if (blobSha) {
          const content = await sg.raw('cat-file', '-p', blobSha);
          res.writeHead(200, {
            'Content-Type': 'text/markdown',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(content);
          return;
        }
      }
    } catch (e) {
      console.warn('[rescue] timeline-ref fallback failed:', e);
    }

    errorResponse(res, 404, 'urn:ok:error:not-found', 'Not found.', { handler: 'rescue-get' });
  }

  const handleCreatePage = withValidation(
    CreatePageRequestSchema,
    async (_req, res, body) => {
      try {
        const bodyObj = body as unknown as Record<string, unknown>;
        // Identity boundary: only attribute when the caller explicitly supplies
        // agentId. UI-driven creates fall through to the loaded principal (if
        // any) or anonymous — never to a synthetic 'Claude' default. Mirrors
        // handleRollback / handleRenamePath.
        const actor = extractActorIdentity(bodyObj, getPrincipal);
        if (actor.kind === 'invalid-summary') {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'summary must be a string', {
            handler: 'create-page',
          });
          return;
        }

        const filePath = body.path;
        if (!isSupportedDocFile(filePath)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'path must end with .md or .mdx.',
            { handler: 'create-page' },
          );
          return;
        }
        if (
          filePath.includes('..') ||
          filePath.startsWith('/') ||
          filePath.includes('\x00') ||
          filePath.includes('\\')
        ) {
          errorResponse(res, 400, 'urn:ok:error:path-escape', 'Invalid path.', {
            handler: 'create-page',
            detail: 'path must not contain .. or start with /',
          });
          return;
        }
        const resolvedContentDir = resolve(contentDir);
        const fullPath = resolve(resolvedContentDir, filePath);
        if (!fullPath.startsWith(`${resolvedContentDir}/`) && fullPath !== resolvedContentDir) {
          errorResponse(
            res,
            400,
            'urn:ok:error:path-escape',
            'path must not escape content directory.',
            { handler: 'create-page' },
          );
          return;
        }
        const candidateDocName = stripDocExtension(filePath);
        if (isSystemDoc(candidateDocName) || isConfigDoc(candidateDocName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${candidateDocName}' is a reserved document name.`,
            { handler: 'create-page' },
          );
          return;
        }
        mkdirSync(dirname(fullPath), { recursive: true });
        const initialContent = '';
        try {
          writeFileSync(fullPath, initialContent, { encoding: 'utf-8', flag: 'wx' });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
            errorResponse(res, 409, 'urn:ok:error:doc-already-exists', 'File already exists.', {
              handler: 'create-page',
              cause: err,
            });
            return;
          }
          throw err;
        }
        const docName = stripDocExtension(filePath);
        // Synchronously bump the content filter's sibling-asset dirCount so any
        // sibling asset drop that follows is admitted by the `ASSET_EXTENSIONS`
        // rule. The file watcher's `create` event will also increment later,
        // which would double-count — so we also `registerWrite` to mark this
        // as a self-write, and the watcher skips its own `incrementMdDir` on
        // self-writes. See file-watcher.ts for the paired logic.
        if (contentFilter) {
          contentFilter.incrementMdDir(dirname(docName));
        }
        registerWrite(fullPath, contentHash(initialContent));
        switch (actor.kind) {
          case 'agent':
          case 'principal':
            recordContributor(
              docName,
              actor.writerId,
              actor.displayName,
              actor.colorSeed,
              undefined,
              actor.actor,
            );
            break;
          case 'anonymous':
            // UI-driven create with no loaded principal — no contributor recorded.
            break;
          default: {
            const _exhaustive: never = actor;
            throw new Error(
              `Unhandled actor kind in handleCreatePage: ${String((_exhaustive as { kind?: unknown }).kind)}`,
            );
          }
        }
        const fileIndex = typeof getFileIndex === 'function' ? getFileIndex() : null;
        if (fileIndex instanceof Map) {
          updateFileIndex(
            { kind: 'create', path: fullPath, docName, content: initialContent },
            fileIndex as Map<string, FileIndexEntry>,
          );
        }
        if (backlinkIndex) {
          backlinkIndex.updateDocumentFromMarkdown(docName, initialContent);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(`[backlinks] Failed to persist create-page cache for ${docName}:`, err);
          });
          signalChannel?.('backlinks');
          signalChannel?.('graph');
        }
        signalChannel?.('files');
        json(res, 200, { docName });
      } catch (e) {
        console.error('[create-page]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to create page.', {
          handler: 'create-page',
          cause: e,
        });
      }
    },
    { handler: 'create-page', method: 'POST' },
  );

  const handlePageHeadings = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const docName = url.searchParams.get('docName');
        if (!docName || docName.length === 0) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'Missing docName query parameter.',
            { handler: 'page-headings' },
          );
          return;
        }
        if (!isSafeDocName(docName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'page-headings',
          });
          return;
        }
        const filePath = resolveDocPath(docName);
        if (!filePath) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'page-headings',
          });
          return;
        }
        if (!existsSync(filePath)) {
          errorResponse(res, 404, 'urn:ok:error:doc-not-found', 'Page not found.', {
            handler: 'page-headings',
          });
          return;
        }
        const content = readFileSync(filePath, 'utf-8');
        const headings = extractHeadings(content);
        json(res, 200, { docName, headings });
      } catch (e) {
        console.error('[page-headings]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read headings.', {
          handler: 'page-headings',
          cause: e,
        });
      }
    },
    { handler: 'page-headings', method: 'GET', skipBodyParse: true },
  );

  const handleRenamePath = withValidation(
    RenamePathRequestSchema,
    async (_req, res, body) => {
      try {
        const bodyObj = body as unknown as Record<string, unknown>;
        const actor = extractActorIdentity(bodyObj, getPrincipal);
        if (actor.kind === 'invalid-summary') {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'summary must be a string', {
            handler: 'rename-path',
          });
          return;
        }
        const { kind, fromPath, toPath } = body;
        if (!isValidRelativeContentPath(fromPath) || !isValidRelativeContentPath(toPath)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'Paths must be relative content paths.',
            { handler: 'rename-path' },
          );
          return;
        }
        if (
          kind === 'file' &&
          (isSystemDoc(fromPath) ||
            isSystemDoc(toPath) ||
            isConfigDoc(fromPath) ||
            isConfigDoc(toPath))
        ) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            'Reserved document names cannot be renamed.',
            { handler: 'rename-path' },
          );
          return;
        }
        // Reject paths whose first segment is `.ok` — that directory holds
        // per-machine OK runtime state (server.lock, principal.json, cache,
        // etc.) and is symmetric with the `__system__` carve-out above. The
        // `AGENTS.md` file inside `.ok/` is a tracked content file by design,
        // but a rename TO or FROM this directory would clobber OK bookkeeping.
        if (
          fromPath === '.ok' ||
          fromPath.startsWith('.ok/') ||
          toPath === '.ok' ||
          toPath.startsWith('.ok/')
        ) {
          errorResponse(res, 400, 'urn:ok:error:reserved-docname', '.ok is a reserved directory.', {
            handler: 'rename-path',
          });
          return;
        }
        if (fromPath === toPath) {
          json(res, 200, { renamed: [], rewrittenDocs: [] });
          return;
        }
        // On case-insensitive filesystems (macOS APFS default, Windows NTFS) a
        // case-only move would no-op or behave unpredictably; reject explicitly.
        if (fromPath.toLowerCase() === toPath.toLowerCase()) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'Case-only renames are not supported.',
            { handler: 'rename-path' },
          );
          return;
        }

        // Register the source's actual on-disk extension before downstream
        // checks so admission and existsSync probes both see the right value
        // when the file watcher hasn't yet observed the source (boot race).
        if (kind === 'file') {
          probeAndRegisterSourceFileExtension(contentDir, fromPath);
        }

        if (contentFilter) {
          // Mirror `resolveContentEntryPath`'s explicit-extension detection so
          // a destination like `bar.mdx` is checked verbatim instead of as
          // `bar.mdx.md` (which would miss `*.mdx` exclusion patterns).
          const excluded =
            kind === 'file'
              ? contentFilter.isExcluded(
                  isSupportedDocFile(toPath) ? toPath : `${toPath}${getDocExtension(fromPath)}`,
                )
              : contentFilter.isDirExcluded(toPath);
          if (excluded) {
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              `Destination ${kind === 'file' ? 'document' : 'folder'} is excluded by the project content config.`,
              { handler: 'rename-path' },
            );
            return;
          }
        }

        let result: { renamed: RenamedDocMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] };
        try {
          result = await _performManagedRenameForDocs(fromPath, toPath, kind);
        } catch (err) {
          if (err instanceof ManagedRenameCollisionError) {
            errorResponse(res, 409, 'urn:ok:error:doc-already-exists', err.message, {
              handler: 'rename-path',
              detail: `colliding: ${err.colliding
                .map((c) => `${c.existing}→${c.incoming}@${c.to}`)
                .join(', ')}`,
              cause: err,
            });
            return;
          }
          throw err;
        }

        if (result.renamed.length === 0) {
          json(res, 200, { renamed: [], rewrittenDocs: [] });
          return;
        }

        let summaryResponse: SummaryResponse | undefined;
        switch (actor.kind) {
          case 'agent': {
            const agentProvidedSummary = actor.summary.kind === 'value';
            const effectiveNormalized = agentProvidedSummary
              ? actor.summary
              : normalizeSummary(`Renamed ${fromPath} → ${toPath}`);
            const fields = summaryResponseFields(effectiveNormalized);
            summaryResponse =
              agentProvidedSummary || !fields.response
                ? fields.response
                : stripDefaultPathTruncation(fields.response);
            for (const { fromDocName, toDocName } of result.renamed) {
              recordContributor(
                toDocName,
                actor.writerId,
                actor.displayName,
                actor.colorSeed,
                formatRenameSubject(fromDocName, toDocName),
                actor.actor,
                fields.stored,
              );
            }
            incrementAgentWriteCalls();
            countNormalizedSummary(effectiveNormalized, !agentProvidedSummary);
            for (const { toDocName } of result.renamed) {
              flushDocToGit(toDocName, 'rename-path');
            }
            break;
          }
          case 'principal': {
            const fields = summaryResponseFields(actor.summary);
            summaryResponse = fields.response;
            for (const { fromDocName, toDocName } of result.renamed) {
              recordContributor(
                toDocName,
                actor.writerId,
                actor.displayName,
                actor.colorSeed,
                formatRenameSubject(fromDocName, toDocName),
                actor.actor,
                fields.stored,
              );
            }
            countNormalizedSummary(actor.summary, false);
            for (const { toDocName } of result.renamed) {
              flushDocToGit(toDocName, 'rename-path');
            }
            break;
          }
          case 'anonymous':
            log.debug(
              { kind, fromPath, toPath, affectedDocs: result.renamed.length },
              '[rename-path] anonymous actor — no contributor recorded (no agentId in body and getPrincipal() returned null)',
            );
            break;
          default: {
            const _exhaustive: never = actor;
            throw new Error(
              `Unhandled actor kind in handleRenamePath: ${String((_exhaustive as { kind?: unknown }).kind)}`,
            );
          }
        }
        renameAttributionCounter().add(1, { kind: `rename-${kind}`, attribution_kind: actor.kind });

        json(res, 200, {
          renamed: result.renamed,
          rewrittenDocs: result.rewrittenDocs,
          ...(summaryResponse ? { summary: summaryResponse } : {}),
        });
      } catch (e) {
        console.error('[rename-path]', e);
        const { status, error } = toManagedRenamePublicError(e);
        errorResponse(res, status, 'urn:ok:error:internal-server-error', error, {
          handler: 'rename-path',
          cause: e,
        });
      }
    },
    { handler: 'rename-path', method: 'POST' },
  );

  const handleDeletePath = withValidation(
    DeletePathRequestSchema,
    async (_req, res, body) => {
      try {
        extractAgentIdentity(body as unknown as Record<string, unknown>); // attribution threading (FR-5, D42)
        const { kind, path } = body;
        if (!isValidRelativeContentPath(path)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'path must be a relative content path.',
            { handler: 'delete-path' },
          );
          return;
        }

        const targetPath = resolveContentEntryPath(contentDir, kind, path);
        if (!existsSync(targetPath)) {
          errorResponse(res, 404, 'urn:ok:error:doc-not-found', `${kind} does not exist.`, {
            handler: 'delete-path',
          });
          return;
        }

        const targetStat = statSync(targetPath);
        if (
          (kind === 'file' && !targetStat.isFile()) ||
          (kind === 'folder' && !targetStat.isDirectory())
        ) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', `Target path is not a ${kind}.`, {
            handler: 'delete-path',
          });
          return;
        }

        const deletedDocNames =
          kind === 'file' ? [path] : listAffectedDocNames(getFileIndex(), kind, path);

        await captureAndCloseDocuments(deletedDocNames);

        if (kind === 'file') {
          unlinkSync(targetPath);
        } else {
          rmSync(targetPath, { recursive: true, force: false });
        }

        json(res, 200, { deletedDocNames });
      } catch (e) {
        console.error('[delete-path]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to delete path.', {
          handler: 'delete-path',
          cause: e,
        });
      }
    },
    { handler: 'delete-path', method: 'POST' },
  );

  const handlePages = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        const index = getFileIndex();
        const pages: {
          docName: string;
          title: string;
          docExt: string;
          size: number;
          modified: string;
        }[] = [];
        for (const [docName, entry] of index) {
          let title = docName;
          const docExt = getDocExtension(docName);
          try {
            const filePath = resolve(contentDir, `${docName}${docExt}`);
            const content = readFileSync(filePath, 'utf-8');
            title = extractPageTitle(content, docName);
          } catch (err) {
            console.warn(`[pages] Failed to read title for ${docName}:`, err);
          }
          pages.push({ docName, title, docExt, size: entry.size, modified: entry.modified });
        }
        pages.sort((a, b) => a.docName.localeCompare(b.docName));
        json(res, 200, { pages });
      } catch (e) {
        console.error('[pages]', e);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to list pages.', {
          handler: 'pages',
          cause: e,
        });
      }
    },
    { handler: 'pages', method: 'GET', skipBodyParse: true },
  );

  const handleSuggestLinks = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const docName = url.searchParams.get('docName');
        if (!docName) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing docName parameter.', {
            handler: 'suggest-links',
          });
          return;
        }
        if (!isSafeDocName(docName)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'suggest-links',
          });
          return;
        }
        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-docname',
            `'${docName}' is a reserved document name.`,
            { handler: 'suggest-links' },
          );
          return;
        }

        const result = await suggestLinks({
          hocuspocus,
          fileIndex: getFileIndex(),
          docName,
        });
        json(res, 200, result);
      } catch (error) {
        if (error instanceof SuggestLinksTargetNotFoundError) {
          errorResponse(res, 404, 'urn:ok:error:doc-not-found', 'Page not found.', {
            handler: 'suggest-links',
            cause: error,
          });
          return;
        }
        console.error('[suggest-links]', error);
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to suggest links.', {
          handler: 'suggest-links',
          cause: error,
        });
      }
    },
    { handler: 'suggest-links', method: 'GET', skipBodyParse: true },
  );

  async function handleUploadAsset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'upload-asset',
        extraHeaders: { Allow: 'POST' },
      });
      return;
    }

    let uploadResult: UploadResult | undefined;
    try {
      uploadResult = await readUploadBody(req, contentDir);
    } catch (e) {
      // All body-parse failures land as UploadWriteError with a URN-form
      // reason. Tempfile cleanup is handled inside readUploadBody's error
      // path. Anonymous emit (no extractAgentIdentity yet) is semantically
      // OK — no Y.Doc mutation has been attempted.
      if (e instanceof UploadWriteError) {
        errorResponse(res, uploadStatusFor(e.reason), e.reason, uploadTitleFor(e.reason), {
          handler: 'upload-asset',
          cause: e,
        });
        return;
      }
      errorResponse(res, 400, 'urn:ok:error:malformed-upload', 'Failed to parse upload.', {
        handler: 'upload-asset',
        cause: e,
      });
      return;
    }

    const { filename, tempPath, sha, byteLength, parentDocName: rawParentDocName } = uploadResult;

    // Belt-and-braces cleanup: if anything below this point errors or
    // early-returns, the tempfile must go away. Every early-return path
    // below that does NOT consume tempPath via linkTempToFinal* runs this.
    const cleanupTempfile = () => {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // best-effort; orphan sweep reaps stragglers
        }
      }
    };

    // Validate metadata fields (parentDocName etc.) via the shared
    // `validateBody` middleware. Body-shape failure emits 400
    // `urn:ok:error:invalid-request` BEFORE `extractAgentIdentity` runs —
    // an anonymous response is semantically correct here because no Y.Doc
    // mutation is attempted. Mirrors `withValidation`'s policy for JSON
    // handlers.
    const validated = validateBody(UploadRequestSchema, { parentDocName: rawParentDocName }, res, {
      handler: 'upload-asset',
    });
    if (!validated.ok) {
      cleanupTempfile();
      return;
    }
    const { parentDocName } = validated.value;

    // Identity extracted from query params (multipart body precludes JSON).
    // Capture agentId / agentName so structured upload logs carry
    // attribution — mirrors precedent #24/#25 and lets operators trace
    // unexpected file-creation events back to the originating agent
    // during incident investigation. Both fields follow bounded shapes
    // (agentId matches AGENT_ID_RE; agentName is sanitized) so they
    // remain cardinality-safe for log indexing.
    //
    // CRUCIAL: identity extraction must precede every SEMANTIC error
    // emission below (path-escape, no-file-received, storage-error). Body-
    // shape errors above (urn:ok:error:invalid-request, urn:ok:error:malformed-upload)
    // are anonymous because no Y.Doc mutation is attempted. The
    // attribution-sweep-coverage ordering check enforces this distinction
    // (precedent #24).
    const { agentId, agentName } = extractAgentIdentity(
      Object.fromEntries(new URL(req.url ?? '', 'http://localhost').searchParams.entries()),
    );

    if (byteLength === 0) {
      cleanupTempfile();
      errorResponse(res, 400, 'urn:ok:error:no-file-received', 'No file received.', {
        handler: 'upload-asset',
      });
      return;
    }

    // D15: reject path-escape attempts.
    if (
      parentDocName.includes('\x00') ||
      parentDocName.includes('..') ||
      parentDocName.startsWith('/')
    ) {
      cleanupTempfile();
      errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
        handler: 'upload-asset',
      });
      return;
    }

    const resolvedContentDir = resolve(contentDir);
    const destDir = resolveUploadDestDir(
      parentDocName,
      DEFAULT_ATTACHMENT_FOLDER_PATH,
      resolvedContentDir,
    );
    if (!isWithinContentDir(destDir, resolvedContentDir)) {
      cleanupTempfile();
      errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
        handler: 'upload-asset',
      });
      return;
    }
    // mkdir -p the destination — bare-name / nested attachmentFolderPath
    // values produce directories that may not exist at first upload.
    try {
      mkdirSync(destDir, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        cleanupTempfile();
        errorResponse(res, 500, 'urn:ok:error:storage-error', 'Failed to write upload.', {
          handler: 'upload-asset',
          cause: err,
          detail: 'failed to create attachment directory',
        });
        return;
      }
    }

    // Symlink escape check: realpath the dest dir and compare against realpath'd contentDir
    try {
      const realDestDir = realpathSync(destDir);
      let realContentDir: string;
      try {
        realContentDir = realpathSync(resolvedContentDir);
      } catch {
        realContentDir = resolvedContentDir;
      }
      if (!isWithinContentDir(realDestDir, realContentDir)) {
        cleanupTempfile();
        errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
          handler: 'upload-asset',
        });
        return;
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Directory doesn't exist yet — will be created below; no symlink escape possible
      } else {
        cleanupTempfile();
        errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
          handler: 'upload-asset',
          cause: e,
        });
        return;
      }
    }

    // D-M LOCKED accept-all: every file is accepted — there's no user-
    // facing byte cap post-streaming (disk fullness surfaces as 507
    // instead). The magic-byte sniff is only consulted to (a) preserve
    // the SVG `<img>`-only routing for NFR-3 security and (b) recover
    // an extension when the upload arrived with a generic clipboard
    // filename. Non-sniffable bytes are accepted under the client-
    // supplied filename.
    //
    // Post-streaming-refactor the sniff reads from tempPath via
    // fileTypeFromFile which only pulls the minimum-required bytes.
    const fileTypeResult = await fileTypeFromFile(tempPath);
    let detectedMime: string | undefined = fileTypeResult?.mime;
    let detectedExt: string | undefined = fileTypeResult?.ext;
    // file-type can't detect SVG (text-based, no magic bytes) — check manually.
    // STOP: this fallback is LOAD-BEARING for NFR-3 — SVG must render via
    // <img>, never inline DOM. Do not remove without a compensating guard.
    if (!detectedMime) {
      const head = readTempFileHead(tempPath, 256);
      // Strip a leading UTF-8 BOM (U+FEFF) before the pattern match.
      // `trimStart()` removes ECMAScript whitespace but not the BOM, so a
      // file starting with `\xEF\xBB\xBF<svg ...>` would otherwise evade the
      // head check the comment above documents as the SVG-disguised-as-PNG
      // sniff fallback.
      const headText = head.toString('utf-8').replace(/^﻿/, '').trimStart();
      if (
        headText.startsWith('<svg') ||
        (headText.startsWith('<?xml') && headText.includes('<svg'))
      ) {
        detectedMime = 'image/svg+xml';
        detectedExt = 'svg';
      }
    }

    // Same-dir sha256 dedup. Bounded scan over destDir, skipped entirely
    // when DEFAULT_DEDUP_MODE === 'off'. The dedup test happens BEFORE
    // filename synthesis so a duplicate paste preserves the existing
    // on-disk basename instead of producing a fresh pasted-<ts>.png stub.
    // Server returns { deduped: true } so the client surfaces a toast.
    //
    // The hash + size come from the streaming pipeline (no buffer). On a
    // dedup hit the tempfile is unlinked and we short-circuit without
    // touching the destDir inode — `linkTempToFinalWithCollisionRetry`
    // never runs.
    if (DEFAULT_DEDUP_MODE === 'same-dir') {
      const existing = await findDuplicateAsset(destDir, sha, byteLength);
      if (existing) {
        cleanupTempfile();
        const relPath = relative(contentDir, resolve(destDir, existing));
        log.info(
          {
            event: 'upload',
            endpoint: req.url ?? '/api/upload',
            agentId,
            agentName,
            dedup: true,
            mime: detectedMime ?? null,
            size: byteLength,
            destPath: relPath,
            httpStatus: 200,
          },
          '[upload] dedup hit',
        );
        // RFC 9457 §3 success path: drop the `ok: true` wrapper. Wire
        // shape is `{ src, path, deduped }` with `Content-Type:
        // application/json`. Clients use HTTP-status discrimination
        // (`if (!res.ok)`) to choose between this success schema and
        // `ProblemDetailsSchema`.
        json(res, 200, { src: existing, path: relPath, deduped: true });
        return;
      }
    }

    // D8 / GENERIC_PASTE_NAMES: clipboard paste arrives with synthetic names
    // ("image.png", "Clipboard 2024-04-21 14:23:45"). Replace with a
    // timestamp stem so the disk filename is human-meaningful.
    let finalFilename: string;
    const isGenericPaste = !filename || filename === 'upload' || GENERIC_PASTE_NAMES.test(filename);
    if (isGenericPaste) {
      const now = new Date();
      const ts = now
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14)
        .replace(/(\d{8})(\d{6})/, '$1-$2');
      // Prefer the sniffed extension when present; otherwise try the
      // client-supplied extname, finally fall back to .bin.
      const fallbackExt = filename ? extname(filename).slice(1) : '';
      const ext = detectedExt ?? fallbackExt ?? '';
      finalFilename = ext === '' ? `pasted-${ts}` : `pasted-${ts}.${ext}`;
    } else {
      finalFilename = sanitizeFilename(filename);
    }

    try {
      const destFilename = linkTempToFinalWithCollisionRetry(tempPath, destDir, finalFilename);
      const relPath = relative(contentDir, resolve(destDir, destFilename));
      log.info(
        {
          event: 'upload',
          endpoint: req.url ?? '/api/upload',
          agentId,
          agentName,
          dedup: false,
          mime: detectedMime ?? null,
          size: byteLength,
          // `destPath` is the contentDir-relative asset path. High-
          // cardinality by nature — a vault with 10K assets produces
          // 10K distinct values. Fine as a log field consumed by text-
          // search / by-incident filtering; NEVER promote it to a
          // metric label (Prometheus / Datadog will blow up memory on
          // per-asset label explosion). Keep the nested-context shape
          // below if you later route these through an aggregator so
          // auto-label-extraction honors the sub-object convention.
          destPath: relPath,
          httpStatus: 200,
        },
        '[upload] write ok',
      );
      json(res, 200, { src: destFilename, path: relPath, deduped: false });
    } catch (e) {
      // linkTempToFinalWithCollisionRetry best-effort unlinks the tempfile
      // on throw; no extra cleanupTempfile() call needed here.
      const reason: UploadWriteReason =
        e instanceof UploadWriteError ? e.reason : 'urn:ok:error:storage-error';
      log.error(
        {
          event: 'upload',
          endpoint: req.url ?? '/api/upload',
          agentId,
          agentName,
          filename: finalFilename,
          size: byteLength,
          reason,
          httpStatus: uploadStatusFor(reason),
          err: e,
        },
        '[upload] write failed',
      );
      errorResponse(res, uploadStatusFor(reason), reason, uploadTitleFor(reason), {
        handler: 'upload-asset',
        cause: e,
      });
    }
  }

  // ─── Local-op relay endpoints (/api/local-op/*) ─────────────────────────────
  // FR18: loopback + origin + path safety + URL allowlist + concurrency=1 + 10-min timeout

  const LOCAL_OP_CLONE_KEY = '/api/local-op/clone';
  const LOCAL_OP_OPEN_KEY = '/api/local-op/open';
  /** Wall-clock timeout for clone subprocess (10 min). */
  const LOCAL_OP_TIMEOUT_MS = 10 * 60 * 1000;
  /** Max time to wait for a spawned server's lock file to show a port > 0. */
  const LOCAL_OP_OPEN_TIMEOUT_MS = 45_000;

  /**
   * POST /api/local-op/clone
   *
   * Body: { url: string, dir: string }
   * Spawns: open-knowledge clone --json --dir <dir> <url>
   * Streams: NDJSON lines via chunked HTTP.
   *
   * Pre-stream errors (security gate, method, body shape, URL/path safety,
   * concurrency) emit RFC 9457 problem+json via `errorResponse(...)` (D22).
   * Mid-stream errors (clone subprocess failure, timeout, server-start
   * chain) emit `{ type: 'error', problem: ProblemDetails }` events through
   * `streamingProblemEvent(...)` (D36 c). The streaming protocol's outer
   * `type` field stays the kind discriminator (`progress | complete |
   * error`); the URN problem identifier lives nested under `problem.type`.
   *
   * CLI events are intercepted: complete events are swallowed and
   * synthesized post-server-start; CLI error events are wrapped in the
   * typed envelope so every mid-stream error has a `problem` payload.
   */
  const HANDLE_LOCAL_OP_CLONE = 'local-op-clone';
  const handleLocalOpClone = withValidation(LocalOpCloneRequestSchema, handleLocalOpCloneInner, {
    handler: HANDLE_LOCAL_OP_CLONE,
    method: 'POST',
    preBodyGate: (req, res) => checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_CLONE }),
  });
  async function handleLocalOpCloneInner(
    _req: IncomingMessage,
    res: ServerResponse,
    body: LocalOpCloneRequest,
  ): Promise<void> {
    const { url, dir } = body;

    // Semantic checks (post-shape): protocol allowlist + path safety.
    if (!isAllowedGitUrl(url)) {
      errorResponse(
        res,
        400,
        'urn:ok:error:url-not-allowed',
        'URL protocol is not allowed for clone.',
        { handler: HANDLE_LOCAL_OP_CLONE, detail: `url=${url}` },
      );
      return;
    }
    if (!isSafeLocalPath(dir)) {
      errorResponse(
        res,
        400,
        'urn:ok:error:dir-outside-home',
        'Clone destination must be within the user home directory.',
        { handler: HANDLE_LOCAL_OP_CLONE, detail: `dir=${dir}` },
      );
      return;
    }

    // Concurrency guard: reject concurrent requests to this endpoint.
    if (!localOpGuard.tryAcquire(LOCAL_OP_CLONE_KEY)) {
      errorResponse(
        res,
        429,
        'urn:ok:error:concurrent-operation',
        'A clone operation is already in progress.',
        { handler: HANDLE_LOCAL_OP_CLONE },
      );
      return;
    }

    // Start chunked NDJSON response — past this point, errors emit inline
    // streaming events via `streamingProblemEvent(...)`, not `errorResponse`.
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    /** Write a typed mid-stream error event and emit one telemetry+log line. */
    const writeStreamError = createStreamingErrorWriter(res, HANDLE_LOCAL_OP_CLONE);

    // CLI clone takes `dir` as a positional argument (not a `--dir` flag).
    // Expand `~` here so the CLI doesn't treat it as a literal directory name.
    const targetDir = expandTilde(dir);
    const [cmd, ...baseArgs] = localOpCliArgs;
    const spawnArgs = [...baseArgs, 'clone', '--json', url, targetDir];

    let timedOut = false;
    let settled = false;
    // The CLI emits `{type:'complete', dir}` on success, but the browser
    // client expects `{type:'complete', port}`. We intercept the CLI's
    // complete event, boot a server at the cloned dir, then emit a
    // rewritten complete with the port. CLI `error` events are wrapped in
    // a typed `problem` envelope; non-terminal `progress` events flow
    // through unchanged.
    let cloneCompleteDir: string | null = null;
    let stdoutBuffer = '';

    const child = spawn(cmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, LOCAL_OP_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: { type?: unknown; dir?: unknown; message?: unknown } | null = null;
        try {
          parsed = JSON.parse(line) as { type?: unknown; dir?: unknown; message?: unknown };
        } catch {
          /* non-JSON — ignore */
        }
        if (parsed && parsed.type === 'complete' && typeof parsed.dir === 'string') {
          // Swallow this line; we'll emit our own complete after starting the server.
          cloneCompleteDir = parsed.dir;
          continue;
        }
        if (parsed && parsed.type === 'error') {
          // Wrap the CLI's untyped error into the canonical streaming envelope so
          // every mid-stream error event carries a `problem: ProblemDetails`
          // payload — clients read `event.problem.title`, not `event.message`.
          const cliMessage = typeof parsed.message === 'string' ? parsed.message : undefined;
          writeStreamError(
            500,
            'urn:ok:error:clone-failed',
            'Clone subprocess reported an error.',
            {
              detail: cliMessage,
            },
          );
          continue;
        }
        if (!res.writableEnded) res.write(`${line}\n`);
      }
    });

    // Buffer stderr so we can surface it when the clone fails; also log.
    const stderrChunks: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      log.debug({ msg: chunk.toString('utf-8').trim() }, '[local-op/clone] stderr');
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      const stderrOutput = Buffer.concat(stderrChunks).toString('utf-8').trim();
      if (settled) {
        localOpGuard.release(LOCAL_OP_CLONE_KEY);
        return;
      }
      settled = true;

      void (async () => {
        try {
          if (timedOut && !res.writableEnded) {
            writeStreamError(
              504,
              'urn:ok:error:clone-timeout',
              'Clone timed out after 10 minutes.',
              { detail: stderrOutput || undefined },
            );
          } else if (code !== 0 && !res.writableEnded) {
            if (stderrOutput) {
              log.warn({ code, stderr: stderrOutput, url, dir }, '[local-op/clone] clone failed');
            }
            writeStreamError(
              500,
              'urn:ok:error:clone-failed',
              `Clone subprocess exited with code ${code}.`,
              { detail: stderrOutput || undefined },
            );
          } else if (code === 0 && cloneCompleteDir && !res.writableEnded) {
            // Chain into server-start so the client can redirect.
            const result = await startServerAtDirAndGetPort(cloneCompleteDir);
            if (!res.writableEnded) {
              if ('port' in result) {
                res.write(`${JSON.stringify({ type: 'complete', port: result.port })}\n`);
              } else {
                writeStreamError(
                  500,
                  'urn:ok:error:server-start-failed',
                  'Cloned successfully but failed to start the project server.',
                  { detail: result.error },
                );
              }
            }
          }
        } finally {
          if (!res.writableEnded) res.end();
          localOpGuard.release(LOCAL_OP_CLONE_KEY);
        }
      })();
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        if (!res.writableEnded) {
          // Fixed-vocabulary detail — Node's spawn ENOENT/EACCES messages carry
          // the resolved binary path; `cause` preserves diagnostics for Pino.
          writeStreamError(
            500,
            'urn:ok:error:clone-failed',
            'Failed to spawn the clone subprocess.',
            { cause: err },
          );
          res.end();
        }
      }
      localOpGuard.release(LOCAL_OP_CLONE_KEY);
    });
  }

  /**
   * Spawn a detached Open Knowledge server at `dir` and poll the server.lock
   * until a real port appears. Reused by /api/local-op/open and by the clone
   * handler to chain clone → server-start → redirect.
   *
   * NOTE: The CLI's `start` command has no `--content-dir` flag — it derives
   * the content dir from cwd + config. So we spawn with `cwd: dir` instead
   * of passing a flag.
   */
  /**
   * Ensure both the collab server (`ok start`) and the React UI (`ok ui`) are
   * live for `dir`, and return the UI port — that's the browser-navigable
   * redirect target post-lifecycle-split. `ok start` serves only the collab
   * API/WebSocket and returns 404 at `/` with an `ok ui`-pointing message.
   *
   * Three cases:
   *   1. `ui.lock` is live → reuse its port (UI already running in that dir).
   *   2. `server.lock` live but `ui.lock` absent/stale → spawn `ok ui` alone;
   *      `ok start` won't re-spawn its UI sibling when the server-lock is held.
   *   3. Nothing live → spawn `ok start`; it auto-spawns `ok ui` as a sibling
   *      (see `start.ts` ~line 340, "auto-spawned ok ui sibling").
   *
   * Polls `ui.lock` (not `server.lock`) because only `ui.lock.port` hosts the
   * React bundle. Single polling loop covers cases 2 and 3 uniformly.
   */
  async function startServerAtDirAndGetPort(
    dir: string,
  ): Promise<{ port: number } | { error: string }> {
    const absDir = resolve(expandTilde(dir));
    const lockDir = resolve(absDir, '.ok');

    // Case 1: UI already live — reuse.
    const existingUi = readUiLock(lockDir);
    if (existingUi && existingUi.port > 0) {
      return { port: existingUi.port };
    }

    // Case 2 vs 3: pick which CLI command to spawn based on whether the
    // collab server is already live. `ok ui` alone is correct and necessary
    // when `server.lock` is held (can't re-run `ok start` under a live lock).
    const existingServer = readServerLock(lockDir);
    const [cmd, ...baseArgs] = localOpCliArgs;
    const cliCmd = existingServer && existingServer.port > 0 ? 'ui' : 'start';
    const spawnArgs = [...baseArgs, cliCmd];
    // Pipe stderr so we can log why a spawn failed; ignore stdout.
    const child = spawn(cmd, spawnArgs, {
      cwd: absDir,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      // Explicit `interactive` — `OK_LOCK_KIND` may be inherited from a
      // surrounding MCP-spawn parent and we don't want a user-driven
      // local-op/open relay to mark its child server as `mcp-spawned`.
      env: { ...process.env, OK_LOCK_KIND: 'interactive', OK_PARENT_PID: String(process.pid) },
    });

    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
      log.warn(
        { cwd: absDir, cliCmd, msg: chunk.toString('utf-8').trim() },
        '[local-op/open] child stderr',
      );
    });

    let earlyExitCode: number | null = null;
    child.on('exit', (code) => {
      earlyExitCode = code ?? -1;
    });

    // `unref` so the child survives past the parent. Do it after attaching
    // the stderr listener so we still capture its output.
    child.unref();

    const deadline = Date.now() + LOCAL_OP_OPEN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await wait(500);
      const uiLock = readUiLock(lockDir);
      if (uiLock && uiLock.port > 0) {
        return { port: uiLock.port };
      }
      if (earlyExitCode !== null) {
        const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
        return {
          error: `\`ok ${cliCmd}\` exited (code ${earlyExitCode})${stderr ? ` — ${stderr}` : ''}`,
        };
      }
    }
    const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim();
    return {
      error: `UI did not start within the expected time${stderr ? ` — ${stderr}` : ''}`,
    };
  }

  /**
   * POST /api/local-op/open
   *
   * Body: { dir: string }
   * Spawns: open-knowledge start --content-dir <dir> (detached, unref'd)
   * Polls <dir>/.ok/server.lock until port > 0 appears.
   * Returns: { port: number }
   */
  const HANDLE_LOCAL_OP_OPEN = 'local-op-open';
  const handleLocalOpOpen = withValidation(
    LocalOpOpenRequestSchema,
    async (_req, res, body) => {
      const { dir } = body;

      // Security: dir must be within user home dir
      if (!isSafeLocalPath(dir)) {
        errorResponse(
          res,
          400,
          'urn:ok:error:dir-outside-home',
          'dir must be within the user home directory.',
          { handler: HANDLE_LOCAL_OP_OPEN, detail: `dir=${dir}` },
        );
        return;
      }

      // Concurrency guard
      if (!localOpGuard.tryAcquire(LOCAL_OP_OPEN_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'A server-open operation is already in progress.',
          { handler: HANDLE_LOCAL_OP_OPEN },
        );
        return;
      }

      try {
        const result = await startServerAtDirAndGetPort(dir);
        if ('port' in result) {
          json(res, 200, { port: result.port });
        } else {
          errorResponse(
            res,
            504,
            'urn:ok:error:server-open-failed',
            'Failed to open project server.',
            { handler: HANDLE_LOCAL_OP_OPEN, detail: result.error },
          );
        }
      } finally {
        localOpGuard.release(LOCAL_OP_OPEN_KEY);
      }
    },
    {
      handler: HANDLE_LOCAL_OP_OPEN,
      method: 'POST',
      preBodyGate: (req, res) => checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_OPEN }),
    },
  );

  // ─── Auth relay endpoints (/api/local-op/auth/*) ────────────────────────────
  // FR18: loopback + origin security enforced on all five endpoints.
  // Each endpoint has its own concurrency key to allow parallel auth operations
  // (e.g., status check while login is in progress).

  const LOCAL_OP_AUTH_LOGIN_KEY = '/api/local-op/auth/login';
  const LOCAL_OP_AUTH_STATUS_KEY = '/api/local-op/auth/status';
  const LOCAL_OP_AUTH_REPOS_KEY = '/api/local-op/auth/repos';
  const LOCAL_OP_AUTH_SIGNOUT_KEY = '/api/local-op/auth/signout';
  const LOCAL_OP_AUTH_PAT_KEY = '/api/local-op/auth/pat';

  /**
   * POST /api/local-op/auth/login
   *
   * Body: { host?: string }
   * Spawns: auth login --json [--host <host>]
   * Streams: NDJSON lines (verification + complete events) via chunked HTTP.
   * The device-flow subprocess manages its own timeout.
   *
   * Streaming endpoint per US-005 pattern: pre-stream errors emit
   * `application/problem+json`; mid-stream errors emit a typed event
   * `{ type: 'error', problem: ProblemDetails }`. The CLI's own
   * `{ type: 'error', message }` events are intercepted and wrapped so the
   * client always sees the canonical streaming envelope.
   */
  const HANDLE_LOCAL_OP_AUTH_LOGIN = 'local-op-auth-login';
  const handleLocalOpAuthLogin = withValidation(
    LocalOpAuthHostRequestSchema,
    handleLocalOpAuthLoginInner,
    {
      handler: HANDLE_LOCAL_OP_AUTH_LOGIN,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_LOGIN }),
    },
  );
  async function handleLocalOpAuthLoginInner(
    _req: IncomingMessage,
    res: ServerResponse,
    body: LocalOpAuthHostRequest,
  ): Promise<void> {
    const host = body.host ?? 'github.com';

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_LOGIN_KEY)) {
      errorResponse(
        res,
        429,
        'urn:ok:error:concurrent-operation',
        'An auth login operation is already in progress.',
        { handler: HANDLE_LOCAL_OP_AUTH_LOGIN },
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    /** Write a typed mid-stream error event (US-005 pattern). */
    const writeStreamError = createStreamingErrorWriter(res, HANDLE_LOCAL_OP_AUTH_LOGIN);

    const [cmd, ...baseArgs] = localOpCliArgs;
    const spawnArgs = [...baseArgs, 'auth', 'login', '--json', '--host', host];

    let settled = false;
    let sawTerminalEvent = false;
    let stdoutBuffer = '';
    const child = spawn(cmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
    }, LOCAL_OP_TIMEOUT_MS);

    // Kill the child if the client disconnects so `auth login` doesn't keep
    // polling in the background and write a token to the keychain that the
    // user never saw confirmation for.
    const onClientClose = () => {
      if (!child.killed) child.kill('SIGTERM');
    };
    res.on('close', onClientClose);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: { type?: unknown; message?: unknown } | null = null;
        try {
          evt = JSON.parse(line) as { type?: unknown; message?: unknown };
        } catch {
          /* non-JSON line (e.g. keychain-backend log) — ignore */
        }
        if (evt && evt.type === 'error') {
          // Wrap the CLI's untyped error into the typed streaming envelope.
          const detail = typeof evt.message === 'string' ? evt.message : undefined;
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            'Auth login subprocess reported an error.',
            { detail },
          );
          sawTerminalEvent = true;
          continue;
        }
        if (evt && evt.type === 'complete') {
          sawTerminalEvent = true;
        }
        if (!res.writableEnded) res.write(`${line}\n`);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      log.debug({ msg: chunk.toString('utf-8').trim() }, '[local-op/auth/login] stderr');
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      res.off('close', onClientClose);
      if (!settled) {
        settled = true;
        if (!res.writableEnded) {
          if (code === 0 && !sawTerminalEvent) {
            // CLI exited cleanly without emitting a terminal event — synthesize
            // one so the client's stream reader can resolve. Login name will be
            // filled in by the next /api/local-op/auth/status poll.
            res.write(`${JSON.stringify({ type: 'complete', host, login: '' })}\n`);
          } else if (code !== 0) {
            writeStreamError(
              500,
              'urn:ok:error:auth-failed',
              `Auth login subprocess exited with code ${code}.`,
            );
          }
        }
        res.end();
      }
      localOpGuard.release(LOCAL_OP_AUTH_LOGIN_KEY);
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      res.off('close', onClientClose);
      if (!settled) {
        settled = true;
        if (!res.writableEnded) {
          // Fixed-vocabulary detail — see clone-failed catch site.
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            'Failed to spawn the auth login subprocess.',
            { cause: err },
          );
          res.end();
        }
      }
      localOpGuard.release(LOCAL_OP_AUTH_LOGIN_KEY);
    });
  }

  /**
   * POST /api/local-op/auth/status
   *
   * Body: { host?: string }
   * Spawns: auth status --json [--host <host>]
   * Returns: the single NDJSON line as parsed JSON.
   */
  const HANDLE_LOCAL_OP_AUTH_STATUS = 'local-op-auth-status';
  const handleLocalOpAuthStatus = withValidation(
    LocalOpAuthHostRequestSchema,
    async (_req, res, body) => {
      const host = body.host ?? 'github.com';

      if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_STATUS_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'An auth status operation is already in progress.',
          { handler: HANDLE_LOCAL_OP_AUTH_STATUS },
        );
        return;
      }

      try {
        const [cmd, ...baseArgs] = localOpCliArgs;
        const spawnArgs = [...baseArgs, 'auth', 'status', '--json', '--host', host];

        const output = await new Promise<string>((resolve, reject) => {
          const child = spawn(cmd, spawnArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env },
          });
          const killTimer = setTimeout(() => {
            child.kill('SIGTERM');
          }, 30_000);
          const chunks: Buffer[] = [];
          child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
          child.on('close', () => {
            clearTimeout(killTimer);
            resolve(Buffer.concat(chunks).toString('utf-8'));
          });
          child.on('error', (err) => {
            clearTimeout(killTimer);
            reject(err);
          });
        });

        // The CLI may emit non-JSON log lines on stdout before the terminal
        // event (e.g. keychain probe messages on older builds). Find the last
        // parseable JSON line and return that.
        const lines = output
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        let parsed: unknown = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            parsed = JSON.parse(lines[i] as string);
            break;
          } catch {
            /* skip non-JSON line */
          }
        }
        if (parsed !== null) {
          json(res, 200, parsed);
        } else {
          json(res, 200, { authenticated: false });
        }
      } catch (err) {
        // Fixed-vocabulary detail — raw err.message can carry filesystem paths,
        // git stderr, or errno strings. Pino logs preserve full diagnostics via
        // `cause` for server-side triage; the wire body stays bounded.
        errorResponse(res, 500, 'urn:ok:error:auth-failed', 'Auth status check failed.', {
          handler: HANDLE_LOCAL_OP_AUTH_STATUS,
          cause: err,
        });
      } finally {
        localOpGuard.release(LOCAL_OP_AUTH_STATUS_KEY);
      }
    },
    {
      handler: HANDLE_LOCAL_OP_AUTH_STATUS,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_STATUS }),
    },
  );

  /**
   * POST /api/local-op/auth/repos
   *
   * Body: { host?: string }
   * Spawns: auth repos --json [--host <host>]
   * Streams: NDJSON via chunked HTTP.
   *
   * Streaming endpoint per US-005 pattern: pre-stream errors emit
   * `application/problem+json`; mid-stream errors emit a typed event
   * `{ type: 'error', problem: ProblemDetails }`. CLI `error` events are
   * intercepted and wrapped to keep the streaming envelope canonical.
   */
  const HANDLE_LOCAL_OP_AUTH_REPOS = 'local-op-auth-repos';
  const handleLocalOpAuthRepos = withValidation(
    LocalOpAuthHostRequestSchema,
    handleLocalOpAuthReposInner,
    {
      handler: HANDLE_LOCAL_OP_AUTH_REPOS,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_REPOS }),
    },
  );
  async function handleLocalOpAuthReposInner(
    _req: IncomingMessage,
    res: ServerResponse,
    body: LocalOpAuthHostRequest,
  ): Promise<void> {
    const host = body.host ?? 'github.com';

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_REPOS_KEY)) {
      errorResponse(
        res,
        429,
        'urn:ok:error:concurrent-operation',
        'An auth repos operation is already in progress.',
        { handler: HANDLE_LOCAL_OP_AUTH_REPOS },
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    /** Write a typed mid-stream error event (US-005 pattern). */
    const writeStreamError = createStreamingErrorWriter(res, HANDLE_LOCAL_OP_AUTH_REPOS);

    const [cmd, ...baseArgs] = localOpCliArgs;
    const spawnArgs = [...baseArgs, 'auth', 'repos', '--json', '--host', host];

    let settled = false;
    let stdoutBuffer = '';
    const child = spawn(cmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
    }, LOCAL_OP_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let evt: { type?: unknown; message?: unknown } | null = null;
        try {
          evt = JSON.parse(line) as { type?: unknown; message?: unknown };
        } catch {
          /* non-JSON line — ignore */
        }
        if (evt && evt.type === 'error') {
          // Wrap CLI's untyped error into the canonical streaming envelope.
          const detail = typeof evt.message === 'string' ? evt.message : undefined;
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            'Auth repos subprocess reported an error.',
            { detail },
          );
          continue;
        }
        if (!res.writableEnded) res.write(`${line}\n`);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      log.debug({ msg: chunk.toString('utf-8').trim() }, '[local-op/auth/repos] stderr');
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        if (code !== 0 && !res.writableEnded) {
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            `Auth repos subprocess exited with code ${code}.`,
          );
        }
        res.end();
      }
      localOpGuard.release(LOCAL_OP_AUTH_REPOS_KEY);
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        if (!res.writableEnded) {
          // Fixed-vocabulary detail — see clone-failed catch site.
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            'Failed to spawn the auth repos subprocess.',
            { cause: err },
          );
          res.end();
        }
      }
      localOpGuard.release(LOCAL_OP_AUTH_REPOS_KEY);
    });
  }

  /**
   * POST /api/local-op/auth/signout
   *
   * Body: { host?: string }
   * Spawns: auth signout [--host <host>]
   * Returns: {} (flat success per D22)
   */
  const HANDLE_LOCAL_OP_AUTH_SIGNOUT = 'local-op-auth-signout';
  const handleLocalOpAuthSignout = withValidation(
    LocalOpAuthHostRequestSchema,
    async (_req, res, body) => {
      const host = body.host ?? 'github.com';

      if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_SIGNOUT_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'An auth signout operation is already in progress.',
          { handler: HANDLE_LOCAL_OP_AUTH_SIGNOUT },
        );
        return;
      }

      try {
        const [cmd, ...baseArgs] = localOpCliArgs;
        const spawnArgs = [...baseArgs, 'auth', 'signout', '--host', host];

        await new Promise<void>((resolve, reject) => {
          const child = spawn(cmd, spawnArgs, {
            stdio: 'ignore',
            env: { ...process.env },
          });
          const killTimer = setTimeout(() => {
            child.kill('SIGTERM');
          }, 30_000);
          child.on('close', () => {
            clearTimeout(killTimer);
            resolve();
          });
          child.on('error', (err) => {
            clearTimeout(killTimer);
            reject(err);
          });
        });

        json(res, 200, {});
      } catch (err) {
        // Fixed-vocabulary detail — see HANDLE_LOCAL_OP_AUTH_STATUS catch site.
        errorResponse(res, 500, 'urn:ok:error:auth-failed', 'Auth signout failed.', {
          handler: HANDLE_LOCAL_OP_AUTH_SIGNOUT,
          cause: err,
        });
      } finally {
        localOpGuard.release(LOCAL_OP_AUTH_SIGNOUT_KEY);
      }
    },
    {
      handler: HANDLE_LOCAL_OP_AUTH_SIGNOUT,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_SIGNOUT }),
    },
  );

  /**
   * POST /api/local-op/auth/pat
   *
   * Body: { pat: string, host?: string }
   * Spawns: auth pat --json [--host <host>] with pat piped to stdin.
   * Returns: the NDJSON complete-event as parsed JSON.
   */
  const HANDLE_LOCAL_OP_AUTH_PAT = 'local-op-auth-pat';
  const handleLocalOpAuthPat = withValidation(
    LocalOpAuthPatRequestSchema,
    async (_req, res, body) => {
      const { pat, host: hostInput } = body;
      const host = hostInput ?? 'github.com';

      if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_PAT_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'An auth pat operation is already in progress.',
          { handler: HANDLE_LOCAL_OP_AUTH_PAT },
        );
        return;
      }

      try {
        const [cmd, ...baseArgs] = localOpCliArgs;
        const spawnArgs = [...baseArgs, 'auth', 'pat', '--json', '--host', host];

        const output = await new Promise<string>((resolve, reject) => {
          const child = spawn(cmd, spawnArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
          });
          const killTimer = setTimeout(() => {
            child.kill('SIGTERM');
          }, 30_000);
          // Write the PAT to stdin and close it so the CLI readline resolves
          child.stdin.write(`${pat}\n`);
          child.stdin.end();

          const chunks: Buffer[] = [];
          child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
          child.on('close', (code) => {
            clearTimeout(killTimer);
            if (code !== 0) {
              reject(new Error(`auth pat exited with code ${code}`));
            } else {
              resolve(Buffer.concat(chunks).toString('utf-8'));
            }
          });
          child.on('error', (err) => {
            clearTimeout(killTimer);
            reject(err);
          });
        });

        // Same robustness as status: pick the last JSON line, ignore any
        // non-JSON output the CLI may have emitted.
        const lines = output
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        let parsed: unknown = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            parsed = JSON.parse(lines[i] as string);
            break;
          } catch {
            /* skip non-JSON line */
          }
        }
        if (parsed !== null) {
          json(res, 200, parsed);
        } else {
          json(res, 200, {});
        }
      } catch (err) {
        // Fixed-vocabulary detail — see HANDLE_LOCAL_OP_AUTH_STATUS catch site.
        errorResponse(res, 500, 'urn:ok:error:auth-failed', 'Auth pat failed.', {
          handler: HANDLE_LOCAL_OP_AUTH_PAT,
          cause: err,
        });
      } finally {
        localOpGuard.release(LOCAL_OP_AUTH_PAT_KEY);
      }
    },
    {
      handler: HANDLE_LOCAL_OP_AUTH_PAT,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_PAT }),
    },
  );

  // ─── GET /api/local-op/auth/identity ───────────────────────────────────────
  // Reads the resolved git identity via the identity resolution chain.
  // Returns flat { identity: { name, email } | null } per D22 (no `ok: true` wrapper).

  const HANDLE_LOCAL_OP_AUTH_IDENTITY = 'local-op-auth-identity';
  async function handleLocalOpAuthIdentity(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_IDENTITY })) return;
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: HANDLE_LOCAL_OP_AUTH_IDENTITY,
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    if (!projectDir) {
      errorResponse(res, 400, 'urn:ok:error:no-project-dir', 'No project directory configured.', {
        handler: HANDLE_LOCAL_OP_AUTH_IDENTITY,
      });
      return;
    }
    try {
      // Step 3 of the chain (OAuth profile fallback) requires a tokenStore; the
      // server package doesn't import the CLI's token store today, so we resolve
      // only local + global config tiers here. Sign-in flows pre-fill the form
      // with OAuth name/email separately.
      const identity = await resolveGitIdentity(projectDir);
      json(res, 200, { identity });
    } catch (err) {
      // Fixed-vocabulary detail — see HANDLE_LOCAL_OP_AUTH_STATUS catch site.
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Identity resolution failed.', {
        handler: HANDLE_LOCAL_OP_AUTH_IDENTITY,
        cause: err,
      });
    }
  }

  // ─── POST /api/local-op/auth/set-identity ──────────────────────────────────
  // Writes git user.name + user.email to repo-local config via writeGitIdentity
  // On success, nudges the sync engine to re-probe the identity chain
  // so the UI unresolved-nudge clears immediately instead of waiting for the
  // next push cycle.

  const LOCAL_OP_AUTH_SET_IDENTITY_KEY = '/api/local-op/auth/set-identity';

  const HANDLE_LOCAL_OP_AUTH_SET_IDENTITY = 'local-op-auth-set-identity';
  const handleLocalOpAuthSetIdentity = withValidation(
    LocalOpAuthSetIdentityRequestSchema,
    async (_req, res, body) => {
      const name = body.name.trim();
      const email = body.email.trim();

      if (!projectDir) {
        errorResponse(res, 400, 'urn:ok:error:no-project-dir', 'No project directory configured.', {
          handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY,
        });
        return;
      }

      if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_SET_IDENTITY_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'A set-identity operation is already in progress.',
          { handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY },
        );
        return;
      }

      try {
        writeGitIdentity(projectDir, name, email);
        // Fire-and-forget: the sync engine re-probes + signals CC1 'sync-status'
        // so the unresolved nudge clears in the UI without waiting on the push timer.
        void getSyncEngine?.()
          ?.refreshIdentity()
          .catch(() => {
            /* best-effort — status will catch up on next push cycle */
          });
        json(res, 200, {});
      } catch (err) {
        // Fixed-vocabulary detail — see HANDLE_LOCAL_OP_AUTH_STATUS catch site.
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Set-identity failed.', {
          handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY,
          cause: err,
        });
      } finally {
        localOpGuard.release(LOCAL_OP_AUTH_SET_IDENTITY_KEY);
      }
    },
    {
      handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY }),
    },
  );

  // ─── Security helpers for sync endpoints ────────────────────────────────────
  // Sync endpoints reuse the shared loopback + origin check from local-op-security.ts
  // to avoid duplicating the same logic (checkLocalOpSecurity already imported above).

  // ─── Sync endpoints ──────────────────────────────────────────────────────────

  async function handleSyncStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'sync-status' })) return;
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'sync-status',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    try {
      const engine = getSyncEngine?.();
      if (!engine) {
        // Shape must stay aligned with SyncStatus (see sync-engine.ts) — the UI
        // reads these fields unconditionally. Dormant fallback when the engine
        // isn't constructed (no remote, sync disabled at boot).
        json(res, 200, {
          state: 'dormant',
          lastSyncUtc: null,
          lastFetchUtc: null,
          lastPushedSha: null,
          ahead: 0,
          behind: 0,
          consecutiveFailures: 0,
          conflictCount: 0,
          hasRemote: false,
          syncEnabled: false,
          identityUnresolved: false,
        });
        return;
      }
      json(res, 200, engine.getStatus());
    } catch (e) {
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'sync-status',
        cause: e,
      });
    }
  }

  const handleSyncTrigger = withValidation(
    SyncTriggerRequestSchema,
    async (_req, res, body) => {
      const engine = getSyncEngine?.();
      if (!engine) {
        // Race-window guard: the preBodyGate confirmed the engine was active,
        // but it could have been torn down between gate and inner-handler
        // invocation. Treat as 503 — same as the gate would have.
        errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
          handler: 'sync-trigger',
        });
        return;
      }
      const op = body.op ?? 'sync';
      // Fire-and-return: 202 Accepted immediately, trigger runs in background.
      json(res, 202, { op });
      void engine.trigger(op);
    },
    {
      handler: 'sync-trigger',
      method: 'POST',
      preBodyGate: (req, res) => {
        if (!checkLocalOpSecurity(req, res, { handler: 'sync-trigger' })) return false;
        const engine = getSyncEngine?.();
        if (!engine) {
          errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
            handler: 'sync-trigger',
          });
          return false;
        }
        return true;
      },
    },
  );

  const handleSyncSetEnabled = withValidation(
    SyncSetEnabledRequestSchema,
    async (_req, res, body) => {
      const engine = getSyncEngine?.();
      if (!engine) {
        // Race-window guard — see HANDLE_SYNC_TRIGGER comment.
        errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
          handler: 'sync-set-enabled',
        });
        return;
      }
      try {
        await engine.setEnabled(body.enabled);
        json(res, 200, { status: engine.getStatus() });
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to toggle sync.', {
          handler: 'sync-set-enabled',
          cause: e,
        });
      }
    },
    {
      handler: 'sync-set-enabled',
      method: 'POST',
      preBodyGate: (req, res) => {
        if (!checkLocalOpSecurity(req, res, { handler: 'sync-set-enabled' })) return false;
        const engine = getSyncEngine?.();
        if (!engine) {
          errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
            handler: 'sync-set-enabled',
          });
          return false;
        }
        return true;
      },
    },
  );

  async function handleSyncConflicts(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'sync-conflicts' })) return;
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'sync-conflicts',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    try {
      const engine = getSyncEngine?.();
      const conflicts = engine ? engine.getConflicts() : [];
      json(res, 200, { conflicts });
    } catch (e) {
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'sync-conflicts',
        cause: e,
      });
    }
  }

  const handleSyncResolveConflict = withValidation(
    SyncResolveConflictRequestSchema,
    async (_req, res, body) => {
      const engine = getSyncEngine?.();
      if (!engine) {
        // Race-window guard — see HANDLE_SYNC_TRIGGER comment.
        errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
          handler: 'sync-resolve-conflict',
        });
        return;
      }
      const { file, strategy, content } = body;
      try {
        await engine.resolveConflict(file, strategy as ResolveStrategy, content);
        json(res, 200, {});
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to resolve conflict.',
          {
            handler: 'sync-resolve-conflict',
            cause: e,
          },
        );
      }
    },
    {
      handler: 'sync-resolve-conflict',
      method: 'POST',
      preBodyGate: (req, res) => {
        if (!checkLocalOpSecurity(req, res, { handler: 'sync-resolve-conflict' })) return false;
        const engine = getSyncEngine?.();
        if (!engine) {
          errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
            handler: 'sync-resolve-conflict',
          });
          return false;
        }
        return true;
      },
    },
  );

  async function handleSyncConflictContent(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'sync-conflict-content' })) return;
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'sync-conflict-content',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    if (!projectDir) {
      errorResponse(
        res,
        503,
        'urn:ok:error:project-repo-not-configured',
        'Project repo not configured.',
        { handler: 'sync-conflict-content' },
      );
      return;
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const file = url.searchParams.get('file');
    if (!file) {
      errorResponse(
        res,
        400,
        'urn:ok:error:invalid-request',
        'Missing required query param: file.',
        {
          handler: 'sync-conflict-content',
        },
      );
      return;
    }
    // Reject obvious path-traversal; git itself rejects paths outside the index.
    if (file.includes('..') || file.startsWith('/')) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid file path.', {
        handler: 'sync-conflict-content',
      });
      return;
    }
    const pg = simpleGit({ baseDir: projectDir, timeout: { block: 15_000 } });
    // git stages: 1 = base, 2 = ours, 3 = theirs. Any may be missing for
    // delete/edit or add/add conflicts — tolerate by returning empty content.
    async function showStage(stage: 1 | 2 | 3): Promise<string> {
      try {
        return await pg.raw(['show', `:${stage}:${file}`]);
      } catch {
        return '';
      }
    }
    try {
      const [base, ours, theirs] = await Promise.all([showStage(1), showStage(2), showStage(3)]);
      json(res, 200, { file, base, ours, theirs });
    } catch (e) {
      errorResponse(
        res,
        500,
        'urn:ok:error:internal-server-error',
        'Failed to read conflict content.',
        {
          handler: 'sync-conflict-content',
          cause: e,
        },
      );
    }
  }

  // ─── `ok seed` scaffolder endpoints ──────────────────────────────────────
  // GET /api/seed/plan  → 200 {plan} (RFC 9457 problem+json on error)
  // POST /api/seed/apply with { plan } → 200 {result} (RFC 9457 problem+json on error)
  //
  // Same `planSeed` / `applySeed` logic the CLI subcommand and Electron IPC
  // handler use. The IPC bridge (`ok:seed:plan` / `ok:seed:apply`) keeps its
  // in-process discriminated-union shape (`{ok: true, plan}` / `{ok: false,
  // error: {kind, message}}`); the HTTP fallback in `seedClient()` translates
  // RFC 9457 problem+json back to that shape at the renderer boundary so
  // `SeedDialog` / `EmptyEditorState` are transport-agnostic.
  // Gated on `checkLocalOpSecurity` because the operation mutates the local
  // filesystem; same contract as /api/local-op/* and /api/installed-agents.

  /**
   * GET `/api/seed/plan?rootDir=brain` — preview the scaffold for a given
   * subfolder. `rootDir` defaults to `.` (project root). Prerequisite-missing
   * (no git init) → 422 with `urn:ok:error:seed-prerequisite-missing`;
   * invalid-root (escape segments, absolute path) → 400 with
   * `urn:ok:error:seed-invalid-root`. Both surface a `detail` carrying the
   * underlying message so renderers can echo it.
   */
  async function handleSeedPlan(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'seed-plan' })) return;
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'seed-plan',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rootDir = url.searchParams.get('rootDir') ?? undefined;
    try {
      const plan = await planSeed({ projectDir: contentDir, rootDir });
      json(res, 200, { plan });
    } catch (err) {
      if (err instanceof SeedPrerequisiteError) {
        errorResponse(
          res,
          422,
          'urn:ok:error:seed-prerequisite-missing',
          'Seed prerequisite missing.',
          { handler: 'seed-plan', detail: err.message, cause: err },
        );
        return;
      }
      if (err instanceof SeedRootDirError) {
        errorResponse(res, 400, 'urn:ok:error:seed-invalid-root', 'Invalid seed root directory.', {
          handler: 'seed-plan',
          detail: err.message,
          cause: err,
        });
        return;
      }
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'seed-plan',
        cause: err,
      });
    }
  }

  const handleSeedApply = withValidation(
    SeedApplyRequestSchema,
    async (_req, res, body) => {
      // SeedApplyRequestSchema accepts `plan: unknown` (forward-compat); reject
      // non-object payloads here so applySeed sees a structured value.
      const planValue = body.plan;
      if (!planValue || typeof planValue !== 'object') {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid plan payload.', {
          handler: 'seed-apply',
        });
        return;
      }
      const plan = planValue as ScaffoldPlan;
      try {
        // The plan already has rootDir baked into its entries — apply only
        // needs projectDir.
        const result = await applySeed(plan, { projectDir: contentDir });
        json(res, 200, { result });
      } catch (err) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to apply seed plan.',
          {
            handler: 'seed-apply',
            cause: err,
          },
        );
      }
    },
    {
      handler: 'seed-apply',
      method: 'POST',
      preBodyGate: (req, res) => checkLocalOpSecurity(req, res, { handler: 'seed-apply' }),
    },
  );

  /**
   * `POST /api/install-skill` — build `openknowledge.skill` and open it via
   * the OS file association so Claude Desktop's native install dialog takes
   * over. Web-host counterpart of the Electron `okDesktop.skill.buildAndOpen`
   * bridge — both delegate to `buildAndOpenSkill` in `skill-install.ts`.
   *
   * Loopback-only via `checkLocalOpSecurity` — the handler spawns child
   * processes (`open` / `start` / `xdg-open`) and writes to the user's
   * `~/Downloads`, which is squarely state-mutating.
   *
   * Request body (optional JSON): `{ noOpen?: boolean, out?: string }`.
   * Response: the `BuildAndOpenSkillResult` shape verbatim.
   */
  async function handleInstallSkill(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'install-skill' })) return;
    if (req.method !== 'POST') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'install-skill',
        extraHeaders: { Allow: 'POST' },
      });
      return;
    }

    const opts: { noOpen?: boolean; out?: string } = {};
    try {
      const raw = await readBody(req);
      if (raw.length > 0) {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (typeof parsed.noOpen === 'boolean') opts.noOpen = parsed.noOpen;
        if (typeof parsed.out === 'string') {
          // `out` flows into `path.resolve()` + `mkdir({recursive: true})` +
          // `spawn('cmd', ['/c', 'start', '""', skillPath])` on Windows.
          // Confine to $HOME consistent with sibling local-op handlers
          // (`handleLocalOpClone`, `handleLocalOpOpen`).
          if (!isSafeLocalPath(parsed.out)) {
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              'Output path must be within home directory.',
              { handler: 'install-skill' },
            );
            return;
          }
          opts.out = parsed.out;
        }
      }
    } catch (e) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid JSON body.', {
        handler: 'install-skill',
        cause: e,
      });
      return;
    }

    try {
      const result = await buildAndOpenSkill(opts);
      json(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', message, {
        handler: 'install-skill',
        cause: err,
      });
    }
  }

  async function handleInstalledAgentsRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Loopback + DNS-rebinding gate. Same contract the rest of the host-
    // disclosure surface uses (`/api/workspace`, every `/api/local-op/*`) —
    // this endpoint discloses a stable OS-level fingerprint of which AI
    // agents are installed, readable without preflight under the permissive
    // `Access-Control-Allow-Origin: *` that `/api/*` sets. Gating on
    // `checkLocalOpSecurity` confines the fingerprint to same-machine,
    // same-origin callers (the editor UI) and refuses cross-origin browser
    // contexts + DNS-rebinding attempts that would otherwise succeed.
    // `checkLocalOpSecurity` itself emits RFC 9457 problem+json on rejection.
    if (!checkLocalOpSecurity(req, res, { handler: 'installed-agents' })) return;
    try {
      await handleInstalledAgents(req, res, installedAgentsCache.probeAll);
    } catch (e) {
      // Defensive: `handleInstalledAgents` catches internally, so this only
      // fires on truly unexpected throws (e.g., probeAll synchronously
      // throwing before its internal try/catch). Guard `headersSent` so we
      // don't double-emit if the inner handler already wrote a response.
      if (!res.headersSent) {
        log.error({ err: e }, '[installed-agents] route wrapper failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'installed-agents',
          cause: e,
        });
      }
    }
  }

  async function handleSyncAbortMerge(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'sync-abort-merge' })) return;
    if (req.method !== 'POST') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'sync-abort-merge',
        extraHeaders: { Allow: 'POST' },
      });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
      errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
        handler: 'sync-abort-merge',
      });
      return;
    }
    try {
      await engine.abortMerge();
      json(res, 200, {});
    } catch (e) {
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to abort merge.', {
        handler: 'sync-abort-merge',
        cause: e,
      });
    }
  }

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
    '/api/document': handleDocumentRead,
    '/api/documents': handleDocumentList,
    '/api/backlinks': handleBacklinks,
    '/api/backlink-counts': handleBacklinkCounts,
    '/api/forward-links': handleForwardLinks,
    '/api/link-graph': handleLinkGraph,
    '/api/dead-links': handleDeadLinks,
    '/api/orphans': handleOrphans,
    '/api/hubs': handleHubs,
    '/api/pages': handlePages,
    '/api/suggest-links': handleSuggestLinks,
    '/api/page-headings': handlePageHeadings,
    '/api/create-page': handleCreatePage,
    '/api/rename-path': handleRenamePath,
    '/api/delete-path': handleDeletePath,
    '/api/upload': handleUploadAsset,
    '/api/agent-write': handleAgentWrite,
    '/api/agent-write-md': handleAgentWriteMd,
    '/api/agent-patch': handleAgentPatch,
    '/api/agent-undo': handleAgentUndo,
    '/api/agent-activity': handleAgentActivity,
    '/api/agent-burst-diff': handleAgentBurstDiff,
    '/api/save-version': handleSaveVersion,
    '/api/history': handleHistory,
    '/api/diff': handleDiff,
    '/api/rollback': handleRollback,
    '/api/metrics/reconciliation': handleMetricsReconciliation,
    '/api/metrics/parse-health': handleMetricsParseHealth,
    '/api/metrics/agent-presence': handleMetricsAgentPresence,
    '/api/server-info': handleServerInfo,
    '/api/principal': handlePrincipal,
    '/api/rescue': handleRescueList,
    '/api/workspace': handleWorkspace,
    '/api/sync/status': handleSyncStatus,
    '/api/sync/trigger': handleSyncTrigger,
    '/api/sync/set-enabled': handleSyncSetEnabled,
    '/api/sync/conflicts': handleSyncConflicts,
    '/api/sync/conflict-content': handleSyncConflictContent,
    '/api/sync/resolve-conflict': handleSyncResolveConflict,
    '/api/sync/abort-merge': handleSyncAbortMerge,
    '/api/local-op/clone': handleLocalOpClone,
    '/api/local-op/open': handleLocalOpOpen,
    '/api/local-op/auth/login': handleLocalOpAuthLogin,
    '/api/local-op/auth/status': handleLocalOpAuthStatus,
    '/api/local-op/auth/repos': handleLocalOpAuthRepos,
    '/api/local-op/auth/signout': handleLocalOpAuthSignout,
    '/api/local-op/auth/pat': handleLocalOpAuthPat,
    '/api/local-op/auth/identity': handleLocalOpAuthIdentity,
    '/api/local-op/auth/set-identity': handleLocalOpAuthSetIdentity,
    '/api/installed-agents': handleInstalledAgentsRoute,
    '/api/install-skill': handleInstallSkill,
    '/api/seed/plan': handleSeedPlan,
    '/api/seed/apply': handleSeedApply,
  };

  if (enableTestRoutes) {
    routes['/api/test-reset'] = handleTestReset;
    routes['/api/test-rescan-backlinks'] = handleTestRescanBacklinks;
  }

  // DNS-rebinding defense: routes that mutate local filesystem / CRDT /
  // vault state. A DNS-rebound cross-origin page could otherwise POST to
  // these endpoints and write to the user's content dir. Read-only
  // endpoints (document/pages/backlinks/…) stay accessible so the editor
  // UI can bootstrap against the collab server; mutations require a
  // loopback Host header. /api/workspace enforces this inline already.
  const MUTATING_ROUTES: ReadonlySet<string> = new Set([
    '/api/upload',
    '/api/create-page',
    '/api/rename-path',
    '/api/delete-path',
    '/api/agent-write',
    '/api/agent-write-md',
    '/api/agent-patch',
    '/api/save-version',
    '/api/rollback',
    '/api/sync/trigger',
    '/api/sync/set-enabled',
    '/api/sync/resolve-conflict',
    '/api/sync/abort-merge',
    '/api/test-reset',
    '/api/test-rescan-backlinks',
    '/api/install-skill',
  ]);
  // Every `/api/local-op/*` endpoint mutates local filesystem state or
  // issues network requests on behalf of the user — clone/open/auth
  // flows all fit. Prefix-match so new local-op handlers are protected
  // by default.
  const STATE_MUTATING_PREFIXES: ReadonlyArray<string> = ['/api/local-op/'];

  return {
    priority: 100, // Higher priority — API routes run before static file serving
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
      const url = request.url?.split('?')[0];
      if (!url) return;

      // Origin-allowlist CORS for /api/*. Only loopback origins are accepted:
      // - No Origin header (same-origin browser tab, curl, CLI): passes through.
      // - Origin "null" (Electron packaged renderer, file:// per Fetch spec §4.3): allowed.
      // - http(s)://localhost[:port] / 127.x.x.x[:port] / [::1][:port]: allowed.
      // - Any other Origin: 403 — closes the CSRF door on unauthenticated mutating
      //   routes (/api/agent-write-md, /api/rollback, /api/manage/delete, etc.)
      //   without breaking the Electron renderer or local Vite dev servers.
      //
      // When an allowed Origin is present, it is reflected verbatim in ACAO (not
      // `*`) so the browser's preflight check passes while non-loopback origins are
      // still refused by the gate above. `Vary: Origin` prevents cache poisoning.
      //
      // Setting via `setHeader` (not `writeHead`) so handler responses that call
      // `writeHead(status, { ... })` inherit these headers. The typeof guard handles
      // unit tests that stub only `writeHead` + `end`.
      if (url.startsWith('/api/')) {
        const origin = request.headers.origin;
        if (origin !== undefined && !isAllowedApiOrigin(origin)) {
          // RFC 9457 problem+json. Tag the handler as `api-origin-gate` so
          // the `ok.api.error.count` counter distinguishes onRequest-level
          // CSRF rejections from per-handler emits. The cross-origin browser
          // can't read the body anyway (CORS strips it) but consistent wire
          // shape lets server-to-server callers + tests parse uniformly.
          errorResponse(response, 403, 'urn:ok:error:invalid-origin', 'Origin not allowed.', {
            handler: 'api-origin-gate',
          });
          return;
        }
        if (typeof response.setHeader === 'function') {
          if (origin !== undefined) {
            response.setHeader('Access-Control-Allow-Origin', origin);
            response.setHeader('Vary', 'Origin');
          }
          response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          // Allow OTel W3C trace-context propagation from the browser SDK.
          response.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, traceparent, tracestate, baggage',
          );
        }
        // OPTIONS preflight — short-circuit with 204 + the headers above.
        if (request.method === 'OPTIONS') {
          response.writeHead(204);
          response.end();
          return;
        }
      }

      // DNS-rebinding defense for state-mutating endpoints. The
      // `isLoopbackAddress` TCP-peer check and `isAllowedWorkspaceHostHeader`
      // Host-header check together block the standard rebinding pattern
      // (attacker-owned hostname whose DNS resolves to 127.0.0.1 after an
      // initial attacker-serves-JS response — the TCP peer is loopback,
      // but the Host header names the attacker domain). The same mitigation
      // already gates `/api/workspace`; without it, a rebinding page could
      // POST /api/upload + /api/agent-write, mutating the local vault.
      //
      // Test-harness note: Node's production socket always has
      // `remoteAddress` set by the kernel; the only path that reaches
      // this check without a socket is a mocked `IncomingMessage` built
      // from `Readable.from(...)`. Those mocks bypass the HTTP listener
      // entirely and can't be reached by a real remote attacker, so a
      // missing socket is treated as test-context and skips the check.
      // The Host-header gate still fires (tests set `host: 'localhost'`),
      // so the protection remains meaningful for any production path.
      if (MUTATING_ROUTES.has(url) || STATE_MUTATING_PREFIXES.some((p) => url.startsWith(p))) {
        const peerAddress = request.socket?.remoteAddress;
        if (peerAddress !== undefined && !isLoopbackAddress(peerAddress)) {
          errorResponse(response, 403, 'urn:ok:error:loopback-required', 'Loopback required.', {
            handler: 'api-mutating-gate',
          });
          return;
        }
        if (!isAllowedWorkspaceHostHeader(request.headers.host)) {
          errorResponse(
            response,
            403,
            'urn:ok:error:host-not-allowed',
            'Host header not allowed.',
            { handler: 'api-mutating-gate' },
          );
          return;
        }
      }

      // Only /api/* gets a server span. Non-API routes (static file serving,
      // Hocuspocus's own paths) fall through silently. (Route dispatch
      // happens inside the OTel active-span block below.)
      if (!url.startsWith('/api/')) return;

      // Extract incoming trace context (W3C traceparent header) so this server
      // span attaches as a child of the browser-initiated trace.
      const extractedCtx = propagation.extract(context.active(), request.headers);
      const method = request.method ?? 'GET';
      // Normalize route for low-cardinality metric labels. `:id` placeholders
      // replace dynamic segments; anything else collapses to the URL prefix.
      let routeTemplate = url;
      if (url.startsWith('/api/rescue/')) routeTemplate = '/api/rescue/:docName';
      else if (url.startsWith('/api/history/')) routeTemplate = '/api/history/:sha';

      const tracer = getTracer();
      const started = Date.now();
      await context.with(extractedCtx, () =>
        tracer.startActiveSpan(
          `HTTP ${method} ${routeTemplate}`,
          {
            kind: SpanKind.SERVER,
            attributes: {
              [ATTR_HTTP_REQUEST_METHOD]: method,
              [ATTR_HTTP_ROUTE]: routeTemplate,
              [ATTR_URL_PATH]: url,
              [ATTR_URL_SCHEME]: 'http',
              [ATTR_USER_AGENT_ORIGINAL]: request.headers['user-agent'] ?? '',
            },
          },
          async (span) => {
            try {
              // Static routes
              const handler = routes[url];
              if (handler) {
                await handler(request, response);
              } else if (url.startsWith('/api/rescue/')) {
                const docName = decodeURIComponent(url.slice('/api/rescue/'.length));
                if (docName) await handleRescueGet(request, response, docName);
              } else if (url.startsWith('/api/history/')) {
                const sha = decodeURIComponent(url.slice('/api/history/'.length));
                if (sha) await handleHistoryVersion(request, response, sha);
              }

              const status = response.statusCode;
              span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, status);
              if (status >= 500) {
                span.setStatus({ code: SpanStatusCode.ERROR, message: `status ${status}` });
              }
            } catch (err) {
              span.recordException(err as Error);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err instanceof Error ? err.message : String(err),
              });
              throw err;
            } finally {
              span.end();
              const durSec = (Date.now() - started) / 1000;
              httpDurationHist().record(durSec, {
                [ATTR_HTTP_REQUEST_METHOD]: method,
                [ATTR_HTTP_ROUTE]: routeTemplate,
                [ATTR_HTTP_RESPONSE_STATUS_CODE]: response.statusCode,
              });
            }
          },
        ),
      );
    },
  };
}
