/**
 * HTTP API extension for Hocuspocus — agent write, file ops, and test reset endpoints.
 *
 * Implemented as a Hocuspocus onRequest extension so it works with both
 * the standalone Server and the Vite dev plugin.
 */

import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import type { Extension, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_ICON_COLORS,
  ALLOWED_IMAGE_MIME_TYPES,
  applyFastDiff,
  colorFromSeed,
  createCodeFenceTracker,
  getHeadingSlug,
  getParseHealth,
  type HeadingEntry,
  type Principal,
  prependFrontmatter,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import {
  formatCheckpointSubject,
  formatRenameSubject,
  formatRollbackSubject,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import busboy from 'busboy';
import { diffLines } from 'diff';
import { fileTypeFromBuffer } from 'file-type';
import { captureEffect } from './activity-log.ts';
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
import { readUiLock } from './ui-lock.ts';

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
import { AGENT_ID_RE, toBroadcasterKey } from './agent-id.ts';
import {
  type BacklinkIndex,
  type GraphNode as IndexedGraphNode,
  isOrphanMode,
} from './backlink-index.ts';
import { isSystemDoc } from './cc1-broadcast.ts';
import type { ResolveStrategy } from './conflict-storage.ts';
import { getDocExtension, isSupportedDocFile, stripDocExtension } from './doc-extensions.ts';
import {
  contentHash,
  type FileIndexEntry,
  registerWrite,
  updateFileIndex,
} from './file-watcher.ts';
import { withParentLock } from './git-handle.ts';
import { resolveGitIdentity, writeGitIdentity } from './git-identity.ts';
import { sanitizeGitIdentity } from './git-identity-sanitize.ts';
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
import {
  rewriteMarkdownLinksForDocumentRename,
  rewriteWikiLinksForDocumentRename,
} from './managed-rename-rewrite.ts';
import { mdManager, schema } from './md-manager.ts';
import {
  getMetrics,
  incrementAgentWriteCalls,
  incrementSummariesProvided,
  incrementSummariesTruncated,
} from './metrics.ts';
import {
  deleteReconciledBase,
  isWithinContentDir,
  safeContentPath,
  setReconciledBase,
} from './persistence.ts';
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
import { getMeter, getTracer } from './telemetry.ts';
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
  source: 'local',
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
  source: 'local',
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
  const normalized = contentRoot.replace(/^\.\//, '');
  const ext = getDocExtension(docName);
  const path = normalized ? `${normalized}/${docName}${ext}` : `${docName}${ext}`;
  return { path };
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES: Set<string> = new Set(ALLOWED_IMAGE_MIME_TYPES);

const GENERIC_PASTE_NAMES = /^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i;

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '');
  const ext = extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const safeStem = stem.replace(/[^a-zA-Z0-9_\-.]/g, '_') || 'upload';
  const safeExt = ext.replace(/[^a-zA-Z0-9_.]/g, '');
  return safeStem + safeExt;
}

function writeUploadAtomic(destDir: string, sanitized: string, buffer: Buffer): string {
  const ext = extname(sanitized);
  const stem = sanitized.slice(0, sanitized.length - ext.length);
  const candidates = [sanitized, ...Array.from({ length: 99 }, (_, i) => `${stem}-${i + 1}${ext}`)];

  for (const name of candidates) {
    const destPath = resolve(destDir, name);
    try {
      const fd = openSync(destPath, 'wx');
      try {
        writeSync(fd, buffer);
      } finally {
        closeSync(fd);
      }
      return name;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw err;
    }
  }
  throw new Error('Could not find available filename after 100 attempts');
}

interface UploadResult {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  parentDocName: string;
}

function readUploadBody(req: IncomingMessage, maxBytes: number): Promise<UploadResult> {
  return new Promise((resolveP, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 1 } });
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    let filename = 'upload';
    let mimeType = '';
    let parentDocName = '';
    const chunks: Buffer[] = [];
    let exceeded = false;

    bb.on('field', (name, val) => {
      if (name === 'parentDocName') parentDocName = val;
    });

    bb.on('file', (_fieldname, file, info) => {
      filename = info.filename || 'upload';
      mimeType = info.mimeType || '';

      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      file.on('limit', () => {
        exceeded = true;
        req.unpipe(bb);
        if (!settled) {
          settled = true;
          reject(new Error('Payload too large'));
        }
      });

      file.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });

    bb.on('finish', () => {
      if (!settled) {
        if (exceeded) {
          settled = true;
          reject(new Error('Payload too large'));
          return;
        }
        if (!mimeType && chunks.length === 0) {
          settled = true;
          reject(new Error('No file received'));
          return;
        }
        settled = true;
        resolveP({ filename, mimeType, buffer: Buffer.concat(chunks), parentDocName });
      }
    });

    bb.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
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

function rewriteSupportedLinksForDocumentRename(
  markdown: string,
  sourceDocName: string,
  oldDocName: string,
  newDocName: string,
): ManagedRenameRewriteSummary {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const wikiRewrite = rewriteWikiLinksForDocumentRename(body, oldDocName, newDocName);
  const markdownRewrite = rewriteMarkdownLinksForDocumentRename(
    wikiRewrite.markdown,
    sourceDocName,
    oldDocName,
    newDocName,
  );

  return {
    markdown: prependFrontmatter(frontmatter, markdownRewrite.markdown),
    rewrites: wikiRewrite.rewrites + markdownRewrite.rewrites,
  };
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
  // use the path verbatim — this is how the rename handler signals an
  // extension change (newDocName: "foo.mdx" renames foo.md → foo.mdx).
  // Extension-less paths fall through to getDocExtension() + the registered
  // extension map so legacy callers keep the source's existing extension.
  const relativePath =
    kind === 'file' ? (isSupportedDocFile(path) ? path : `${path}${getDocExtension(path)}`) : path;
  const fullPath = resolve(resolvedContentDir, relativePath);

  if (fullPath !== resolvedContentDir && !fullPath.startsWith(`${resolvedContentDir}${sep}`)) {
    throw new Error('path must not escape content directory');
  }

  assertNoSymlinkEscape(fullPath, resolvedContentDir);

  return fullPath;
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
    const tracked = (await pg.raw('ls-files', '--', sourceRel)).trim();
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
   * Getter for the server's principal record (D50, US-024).
   * Called at request time so deferred async init propagates.
   * Returns null if principal has not yet been loaded or loading failed.
   */
  getPrincipal?: () => Principal | null;
  /**
   * OS-scheme install probe used by `GET /api/installed-agents` (web-host
   * parity for the Electron `ok:shell:detect-protocol` IPC — see
   * `handoff-api.ts`). When omitted, the platform's default probe is used
   * (`osascript` / `reg query` / `xdg-mime`). Tests inject a deterministic
   * fake so the endpoint doesn't shell out.
   */
  installedAgentsProbe?: (scheme: InstalledAgentScheme) => Promise<boolean>;
}

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
    getFileIndex,
    getAliasMap,
    enableTestRoutes = false,
    shadowRef,
    flushGitCommit,
    getCurrentBranch,
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
    installedAgentsProbe,
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
        const metaMap = doc.getMap('metadata');
        const fm = metaMap.get('frontmatter');
        if (typeof fm === 'string' && fm) return parseFrontmatterMetadata(fm);
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
   * room nobody is watching — the MCP tool surfaces that as a warning so the
   * user can open the preview.
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

  function toManagedRenamePublicError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Failed to rename document';
    }

    if (
      error.message === 'Managed rename requires backlink index support' ||
      error.message.startsWith('Cannot rename missing document:') ||
      error.message.startsWith('symlink-escape:')
    ) {
      return error.message;
    }

    return 'Failed to rename document';
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
      await hocuspocus.unloadDocument(document);
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
        writeFileSync(filePath, liveContent, 'utf-8');
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
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, markdown, 'utf-8');
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

  function applyManagedRenameToLoadedDocument(
    docName: string,
    oldDocName: string,
    newDocName: string,
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
      result = rewriteSupportedLinksForDocumentRename(currentText, docName, oldDocName, newDocName);
      if (result.rewrites === 0) {
        return;
      }

      // Apply rewrite via XmlFragment-authoritative pattern (PRECEDENTS.md precedent #12;
      // replaces the deleted syncTextToFragment helper). Parse new markdown →
      // updateYFragment (preserves user-content Items at matching positions) →
      // mirror Y.Text via applyFastDiff (character-level CRDT mutation).
      const { body } = stripFrontmatter(result.markdown);
      const parsedJson = mdManager.parseWithFallback(body);
      const pmNode = schema.nodeFromJSON(parsedJson);
      updateYFragment(document, xmlFragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
      applyFastDiff(ytext, currentText, result.markdown);
    }, MANAGED_RENAME_ORIGIN);
    return result;
  }

  async function _performManagedRename(
    sourceDocName: string,
    destinationDocName: string,
  ): Promise<{ renamed: RenamedDocMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] }> {
    return runSerialized(async () => {
      if (!backlinkIndex) {
        throw new Error('Managed rename requires backlink index support');
      }

      const sourcePath = resolveContentEntryPath(contentDir, 'file', sourceDocName);
      const destinationPath = resolveContentEntryPath(contentDir, 'file', destinationDocName);
      const renamed: RenamedDocMapping[] = [
        { fromDocName: sourceDocName, toDocName: destinationDocName },
      ];

      const backlinkSources = [
        ...new Set(backlinkIndex.getBacklinks(sourceDocName).map((entry) => entry.source)),
      ].sort((a, b) => a.localeCompare(b));
      const snapshotContents = new Map<string, string>();
      const rewriteDocNames: string[] = [];
      const missingBacklinkSources: string[] = [];

      for (const docName of [sourceDocName, ...backlinkSources]) {
        if (snapshotContents.has(docName)) continue;
        const content = readCurrentDocumentContent(docName);
        if (typeof content === 'string') {
          snapshotContents.set(docName, content);
          if (docName !== sourceDocName) {
            rewriteDocNames.push(docName);
          }
        } else if (docName !== sourceDocName) {
          missingBacklinkSources.push(docName);
        }
      }

      const sourceSnapshot = snapshotContents.get(sourceDocName);
      if (typeof sourceSnapshot !== 'string') {
        throw new Error(`Cannot rename missing document: ${sourceDocName}`);
      }

      const recoveryJournal = createManagedRenameRecoveryJournal({
        sourceDocName,
        destinationDocName,
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
            ? applyManagedRenameToLoadedDocument(docName, sourceDocName, destinationDocName)
            : rewriteSupportedLinksForDocumentRename(
                snapshotContents.get(docName) ?? '',
                docName,
                sourceDocName,
                destinationDocName,
              );

          if (rewritten.rewrites > 0) {
            writeManagedRenameDocumentToDisk(docName, rewritten.markdown);
            rewrittenDocs.push({ docName, rewrites: rewritten.rewrites });
          }

          backlinkIndex.updateDocumentFromMarkdown(docName, rewritten.markdown);
        }

        const sourceLiveContents = await captureAndCloseDocuments([sourceDocName]);
        const sourceCurrentContent =
          sourceLiveContents.get(sourceDocName) ??
          snapshotContents.get(sourceDocName) ??
          readFileSync(sourcePath, 'utf-8');
        const renamedSource = rewriteSupportedLinksForDocumentRename(
          sourceCurrentContent,
          sourceDocName,
          sourceDocName,
          destinationDocName,
        );

        const renamedWithGit = await renameTrackedPathInGit(
          projectDir,
          sourcePath,
          destinationPath,
        );
        if (!renamedWithGit) {
          mkdirSync(dirname(destinationPath), { recursive: true });
          renameSync(sourcePath, destinationPath);
        }
        syncRenamedDocsToDisk(renamed, new Map([[sourceDocName, renamedSource.markdown]]));
        setReconciledBase(destinationDocName, renamedSource.markdown);

        const fileIndex = getFileIndex();
        if (fileIndex instanceof Map) {
          updateFileIndex(
            {
              kind: 'rename',
              oldPath: sourcePath,
              newPath: destinationPath,
              oldDocName: sourceDocName,
              newDocName: destinationDocName,
              content: renamedSource.markdown,
            },
            fileIndex as Map<string, FileIndexEntry>,
          );
        }

        backlinkIndex.renameDocument(sourceDocName, destinationDocName, renamedSource.markdown);
        if (renamedSource.rewrites > 0) {
          rewrittenDocs.push({ docName: destinationDocName, rewrites: renamedSource.rewrites });
        }
      });

      void backlinkIndex.saveToDisk().catch((err) => {
        console.warn(
          `[backlinks] Failed to persist managed rename cache for ${sourceDocName} -> ${destinationDocName}:`,
          err,
        );
      });
      signalChannel?.('files');
      signalChannel?.('backlinks');
      signalChannel?.('graph');

      rewrittenDocs.sort((a, b) => a.docName.localeCompare(b.docName));
      return { renamed, rewrittenDocs };
    });
  }

  const AGENT_NAME_MAX_LEN = 128;

  /**
   * Canonical identity boundary (precedent #24) — every mutating POST handler calls this
   * before any Y.Doc mutation. Resolves request body → {agentId, agentName, colorSeed, clientName}.
   * The meta-test in attribution-sweep-coverage.test.ts asserts all handlers call this at entry.
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
    let rawAgentId = typeof body.agentId === 'string' ? body.agentId : undefined;
    if (rawAgentId !== undefined && !AGENT_ID_RE.test(rawAgentId)) {
      rawAgentId = undefined;
    }
    const agentId = rawAgentId ? toBroadcasterKey(rawAgentId) : 'claude-1';
    const agentName =
      typeof body.agentName === 'string' ? sanitizeGitIdentity(body.agentName) : 'Claude';
    let clientName = typeof body.clientName === 'string' ? body.clientName : undefined;
    if (clientName !== undefined) {
      clientName = sanitizeGitIdentity(clientName);
    }
    let clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion : undefined;
    if (clientVersion !== undefined) {
      clientVersion = sanitizeGitIdentity(clientVersion);
    }
    let label = typeof body.label === 'string' ? body.label : undefined;
    if (label !== undefined) {
      label = sanitizeGitIdentity(label);
    }
    // colorSeed must match what getSession() uses for presence bar color consistency.
    // Prefer MCP-provided colorSeed (label-based) over raw UUID fallback.
    const colorSeed =
      typeof body.colorSeed === 'string' && body.colorSeed.length > 0
        ? body.colorSeed.slice(0, AGENT_NAME_MAX_LEN)
        : (rawAgentId ?? agentId);
    return { rawAgentId, agentId, agentName, colorSeed, clientName, clientVersion, label };
  }

  /**
   * Derive `agent_type` from `clientInfo.name` (FR-8). Mirrors the registry used by
   * `iconFromClientName` on the client side. Unknown clients map to `'bot'`.
   */
  function resolveAgentType(clientName: string | undefined): string {
    if (!clientName) return 'bot';
    const lower = clientName.toLowerCase();
    if (lower.includes('claude')) return 'claude';
    if (lower.includes('cursor')) return 'cursor';
    if (lower.includes('codex')) return 'codex';
    if (lower.includes('cline')) return 'cline';
    if (lower.includes('windsurf')) return 'windsurf';
    return 'bot';
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

  async function handleAgentWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: Record<string, unknown>;
      try {
        body =
          rawBody.length > 0 ? (JSON.parse(rawBody.toString()) as Record<string, unknown>) : {};
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      const rawDocName =
        typeof body.docName === 'string' && body.docName.length > 0 ? body.docName : 'test-doc';
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
        extractAgentIdentity(body);
      const normalizedSummary = normalizeSummary(body.summary);
      if (normalizedSummary.kind === 'invalid') {
        json(res, 400, { ok: false, error: 'summary must be a string' });
        return;
      }
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
          applyAgentMarkdownWrite(session.dc.document, `${content}\n`, 'append');

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

      json(res, 200, {
        ok: true,
        timestamp,
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      log.error({ err: e }, '[agent-write] handler failed');
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleAgentWriteMd(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const { markdown, position: pos } = body as Record<string, unknown>;
      if (!markdown || typeof markdown !== 'string') {
        json(res, 400, { ok: false, error: 'markdown field required' });
        return;
      }

      const position = pos === 'prepend' ? 'prepend' : pos === 'replace' ? 'replace' : 'append';
      const rawDocName = (body as Record<string, unknown>).docName;
      const effectiveDocName =
        typeof rawDocName === 'string' && rawDocName.length > 0 ? rawDocName : 'test-doc';
      if (!isSafeDocName(effectiveDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const resolvedDocName = resolveAlias(effectiveDocName);
      if (isSystemDoc(resolvedDocName)) {
        json(res, 400, { ok: false, error: `'${resolvedDocName}' is a reserved document name` });
        return;
      }
      const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
        extractAgentIdentity(body as Record<string, unknown>);
      const normalizedSummary = normalizeSummary((body as Record<string, unknown>).summary);
      if (normalizedSummary.kind === 'invalid') {
        json(res, 400, { ok: false, error: 'summary must be a string' });
        return;
      }
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
          applyAgentMarkdownWrite(session.dc.document, markdown, position);

          const activityMap = session.dc.document.getMap('agent-flash');
          activityMap.set(agentId, {
            agentId,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added (${agentName}): ${markdown.trim().slice(0, 50)}`,
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

      json(res, 200, {
        ok: true,
        timestamp,
        subscriberCount,
        ...(hints ? { hints } : {}),
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      log.error({ err: e }, '[agent-write-md] handler failed');
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleDocumentRead(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const rawDocName = url.searchParams.get('docName') || 'test-doc';
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      // Read via a transient DirectConnection rather than sessionManager.getSession —
      // this endpoint has no agent identity, and creating a cached session would
      // leak an anonymous "Agent" (icon='bot') entry into the presence bar.
      const dc = await hocuspocus.openDirectConnection(docName);
      try {
        const document = dc.document;
        if (!document) {
          json(res, 500, { ok: false, error: 'Document not available' });
          return;
        }
        const content = document.getText('source').toString();
        json(res, 200, { ok: true, docName, content });
      } finally {
        await dc.disconnect();
      }
    } catch (e) {
      console.error('[document-read]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleDocumentList(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const dir = url.searchParams.get('dir');

      // Validate dir parameter (reject traversal attempts)
      if (dir) {
        try {
          safeSubdir(contentDir, dir);
        } catch {
          json(res, 400, { ok: false, error: 'Invalid directory parameter' });
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
      json(res, 200, { ok: true, documents });
    } catch (e) {
      console.error('[document-list]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleBacklinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const backlinks = backlinkIndex.getBacklinks(docName).map((entry) => ({
        source: entry.source,
        anchor: entry.anchor,
        title: readPageTitleForDocName(entry.source),
        snippet: entry.snippet,
      }));
      json(res, 200, { ok: true, docName, backlinks });
    } catch (e) {
      console.error('[backlinks]', e);
      json(res, 500, { ok: false, error: 'Failed to read backlinks' });
    }
  }

  /**
   * Bulk backlink-count lookup. `GET /api/backlink-counts?docNames=a,b,c`
   * returns `{ ok: true, counts: { a: 3, b: 0, c: 2 } }`. Serves listing UIs
   * (exec ls/grep/find slim enrichment) that need connection density per file
   * without N-amplifying the single-doc `/api/backlinks` endpoint.
   * docNames failing `isSafeDocName` are silently dropped from `counts`.
   */
  async function handleBacklinkCounts(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const raw = url.searchParams.get('docNames');
      if (!raw) {
        json(res, 400, { ok: false, error: 'Missing docNames parameter' });
        return;
      }
      const counts: Record<string, number> = {};
      for (const docName of raw.split(',')) {
        const trimmed = docName.trim();
        if (!trimmed || !isSafeDocName(trimmed)) continue;
        counts[trimmed] = backlinkIndex.getBacklinkCount(trimmed);
      }
      json(res, 200, { ok: true, counts });
    } catch (e) {
      console.error('[backlink-counts]', e);
      json(res, 500, { ok: false, error: 'Failed to read backlink counts' });
    }
  }

  async function handleForwardLinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      json(res, 200, {
        ok: true,
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
      json(res, 500, { ok: false, error: 'Failed to read forward links' });
    }
  }

  async function handleLinkGraph(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (docName && !isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }

      const rawDegrees = url.searchParams.get('degrees');
      if (rawDegrees && !docName) {
        json(res, 400, { ok: false, error: 'docName is required when degrees is provided' });
        return;
      }

      let nodes: IndexedGraphNode[];
      let links: Array<{ source: string; target: string }>;

      if (rawDegrees && docName) {
        const degrees = Number.parseInt(rawDegrees, 10);
        if (!Number.isFinite(degrees) || degrees < 0) {
          json(res, 400, { ok: false, error: 'degrees must be a non-negative integer' });
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
      json(res, 200, { ok: true, nodes: enrichedNodes, links });
    } catch (e) {
      console.error('[link-graph]', e);
      json(res, 500, { ok: false, error: 'Failed to read link graph' });
    }
  }

  async function handleOrphans(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const mode = url.searchParams.get('mode') ?? 'both';
      if (!isOrphanMode(mode)) {
        json(res, 400, {
          ok: false,
          error: 'Invalid orphan mode. Allowed values: incoming, outgoing, both',
        });
        return;
      }

      const orphans = backlinkIndex.getOrphans([...getFileIndex().keys()], mode).map((docName) => ({
        docName,
        title: readPageTitleForDocName(docName),
      }));
      json(res, 200, { ok: true, orphans });
    } catch (e) {
      console.error('[orphans]', e);
      json(res, 500, { ok: false, error: 'Failed to read orphan pages' });
    }
  }

  async function handleHubs(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
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
      json(res, 200, { ok: true, hubs });
    } catch (e) {
      console.error('[hubs]', e);
      json(res, 500, { ok: false, error: 'Failed to read hub pages' });
    }
  }

  async function handleDeadLinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const sourceDocNames = url.searchParams.getAll('sourceDocName');
      if (sourceDocNames.some((docName) => docName.length === 0 || !isSafeDocName(docName))) {
        json(res, 400, { ok: false, error: 'Invalid sourceDocName' });
        return;
      }

      const sourceDocNameFilter = sourceDocNames.length
        ? [...new Set(sourceDocNames.map((docName) => resolveAlias(docName)))]
        : undefined;
      const deadLinks = backlinkIndex.getDeadLinks(collectAdmittedDocNames(), sourceDocNameFilter);

      const response = {
        ok: true,
        deadLinks: deadLinks.map((entry) => ({
          target: entry.target,
          sources: entry.sources.map((sourceEntry) => ({
            source: sourceEntry.source,
            title: readPageTitleForDocName(sourceEntry.source),
            snippet: sourceEntry.snippet,
          })),
        })),
      };

      json(res, 200, response);
    } catch (e) {
      console.error('[dead-links]', e);
      json(res, 500, { ok: false, error: 'Failed to read dead links' });
    }
  }

  async function handleAgentPatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }
      const {
        find,
        replace,
        docName: bodyDocName,
        offset: rawOffset,
      } = body as Record<string, unknown>;
      if (typeof find !== 'string' || find.length === 0) {
        json(res, 400, { ok: false, error: 'find field required' });
        return;
      }
      if (typeof replace !== 'string') {
        json(res, 400, { ok: false, error: 'replace field required' });
        return;
      }
      const hasOffset = Object.hasOwn(body, 'offset');
      let offset: number | undefined;
      if (hasOffset) {
        if (typeof rawOffset !== 'number' || !Number.isInteger(rawOffset) || rawOffset < 0) {
          json(res, 400, { ok: false, error: 'offset must be a non-negative integer' });
          return;
        }
        offset = rawOffset;
      }
      const effectivePatchDocName =
        typeof bodyDocName === 'string' && bodyDocName.length > 0 ? bodyDocName : 'test-doc';
      if (!isSafeDocName(effectivePatchDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(effectivePatchDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
        extractAgentIdentity(body as Record<string, unknown>);
      const normalizedSummary = normalizeSummary((body as Record<string, unknown>).summary);
      if (normalizedSummary.kind === 'invalid') {
        json(res, 400, { ok: false, error: 'summary must be a string' });
        return;
      }
      const session = await sessionManager.getSession(docName, agentId, {
        displayName: agentName,
        colorSeed,
        clientName,
      });
      const timestamp = new Date().toISOString();

      let notFound = false;
      let staleTarget = false;
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
          // frontmatter lives in Y.Map('metadata') and must be composed
          // in for the search surface to reflect the document as the
          // agent sees it on disk.
          const xmlFragment = session.dc.document.getXmlFragment('default');
          const metaMap = session.dc.document.getMap('metadata');
          const currentFm = (metaMap.get('frontmatter') as string | undefined) ?? '';
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

          // Splice at the character level. The result is the authoritative
          // post-patch full document — if the patch deletes the FM region,
          // metaMap must be cleared accordingly. Route through explicit
          // split-then-write so empty-FM is distinguishable from
          // "body-only payload" (which applyAgentMarkdownWrite preserves).
          const newFull =
            currentFull.slice(0, pos) + replace + currentFull.slice(pos + find.length);
          const { frontmatter: newFm, body: newBody } = stripFrontmatter(newFull);
          if (newFm !== currentFm) {
            metaMap.set('frontmatter', newFm);
          }
          applyAgentMarkdownWrite(session.dc.document, newBody, 'replace');

          const activityMap = session.dc.document.getMap('agent-flash');
          activityMap.set(agentId, {
            agentId,
            timestamp: Date.now(),
            type: 'insert',
            description: `Patched (${agentName}): ${find.slice(0, 50)}`,
          });
        }, session.origin);
        if (!notFound && !staleTarget) {
          // Only count + record when the patch actually applied. The M1
          // denominator excludes 404/409 so adoption rate reflects successful
          // writes, not total attempts.
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
        json(res, 409, {
          ok: false,
          error: 'Target text no longer matches at the requested offset',
        });
        return;
      }
      if (notFound) {
        json(res, 404, { ok: false, error: 'Text not found in document' });
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

      const { response: summaryResponse } = summaryResponseFields(normalizedSummary);

      json(res, 200, {
        ok: true,
        timestamp,
        subscriberCount,
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      log.error({ err: e }, '[agent-patch] handler failed');
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

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
  async function handleAgentUndo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: Record<string, unknown>;
      try {
        body =
          rawBody.length > 0 ? (JSON.parse(rawBody.toString()) as Record<string, unknown>) : {};
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      // FR-5, D42: extract identity from body so shadow-repo attribution threads through
      // the undo write the same way it does through agent-write / agent-write-md / agent-patch.
      // MCP clients that don't yet forward identity fall back to extractAgentIdentity defaults.
      // `agentId` is the broadcaster-map key (prefixed via `toBroadcasterKey`) — use it for
      // setPresence/touchMode so cleanup via the keepalive WS close handler finds the entry.
      const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
        extractAgentIdentity(body);

      const rawDocName =
        typeof body.docName === 'string' && body.docName.length > 0 ? body.docName : 'test-doc';
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }

      const connectionId = typeof body.connectionId === 'string' ? body.connectionId : undefined;
      if (!connectionId) {
        json(res, 400, { ok: false, error: 'connectionId required' });
        return;
      }

      const rawScope = body.scope;
      const scope: 'last' | 'session' = rawScope === 'session' ? 'session' : 'last';

      if (!sessionManager.hasSession(docName, connectionId)) {
        json(res, 404, { ok: false, error: 'No active session for this connectionId and docName' });
        return;
      }

      const session = await sessionManager.getSession(docName, connectionId);

      // FR-3: publish presence on __system__ (map-valued, keyed by agentId)
      // instead of the per-doc awareness — the per-doc awareness has ONE
      // shared clientID across N concurrent agents and would stomp. The
      // broadcaster map is keyed by `agentId` (prefixed via toBroadcasterKey)
      // so the keepalive-WS close handler's cleanup path finds the entry.
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
        undone = applyAgentUndo(session, scope);
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

      json(res, 200, { ok: true, docName, scope, undone });
    } catch (e) {
      log.error({ err: e }, '[agent-undo] handler failed');
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleTestReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
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
        json(res, 400, { ok: false, error: 'Invalid docName' });
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
      if (doc) await hocuspocus.unloadDocument(doc);
      writeFileSync(filePath, '', 'utf-8');
      if (backlinkIndex) {
        backlinkIndex.deleteDocument(docName);
        void backlinkIndex.saveToDisk().catch((err) => {
          console.warn(`[backlinks] Failed to persist cache after test-reset for ${docName}:`, err);
        });
        signalChannel?.('backlinks');
        signalChannel?.('graph');
      }
      signalChannel?.('files');
      json(res, 200, { ok: true });
    } catch (e) {
      console.error('[test-reset]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

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
  async function handleTestRescanBacklinks(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      if (!backlinkIndex) {
        json(res, 503, { ok: false, error: 'Backlink index not configured' });
        return;
      }
      backlinkIndex.rebuildFromDisk();
      void backlinkIndex.saveToDisk().catch((err) => {
        console.warn('[backlinks] Failed to persist cache after test-rescan-backlinks:', err);
      });
      signalChannel?.('backlinks');
      signalChannel?.('graph');
      json(res, 200, { ok: true });
    } catch (e) {
      console.error('[test-rescan-backlinks]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleSaveVersion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      // Parse optional writers + message + principal from body
      const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
      let writers: WriterIdentity[] = [];
      let userMessage: string | undefined;
      let saveVersionBody: Record<string, unknown> = {};
      let principalName: string | undefined;
      let principalEmail: string | undefined;
      if (rawBody.length > 0) {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(rawBody.toString()) as Record<string, unknown>;
        } catch {
          json(res, 400, { ok: false, error: 'Invalid JSON' });
          return;
        }
        saveVersionBody = body;
        if (typeof body.message === 'string' && body.message.trim()) {
          userMessage = body.message.replace(/[\r\n]/g, ' ').slice(0, 256);
        }
        if (Array.isArray(body.writers)) {
          writers = (body.writers as Array<Record<string, string>>).map((w) => {
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
        }
        // Optional principal identity: { name: string, email: string } (US-020, D12)
        const p = body.principal;
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          const pr = p as Record<string, unknown>;
          if (typeof pr.name === 'string' && pr.name.trim()) {
            principalName = sanitizeGitIdentity(pr.name.trim());
          }
          if (typeof pr.email === 'string' && pr.email.trim()) {
            principalEmail = sanitizeGitIdentity(pr.email.trim());
          }
        }
      }

      // Thread agent identity — extends writers[] with calling agent (D42).
      const {
        rawAgentId: svRawAgentId,
        agentId: svAgentId,
        agentName: svAgentName,
        clientName: svClientName,
      } = extractAgentIdentity(saveVersionBody);
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

      const resolvedContentRoot = contentRoot ?? 'content';
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
        ok: true,
        checkpointRef: result.checkpointRef,
        ...(versionTag ? { versionTag } : {}),
      });
    } catch (e) {
      console.error('[save-version]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  // ── GET /api/history ─────────────────────────────────────────────────────
  async function handleHistory(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';
    const branch = url.searchParams.get('branch') ?? getCurrentBranch?.() ?? 'main';
    if (!docName) {
      json(res, 400, { ok: false, error: 'docName query parameter is required' });
      return;
    }

    if (branch.includes('..') || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) {
      json(res, 400, { ok: false, error: 'Invalid branch name' });
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
      const resolvedContentRoot = contentRoot ?? 'content';
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

      json(res, 200, { ok: true, ...result });
    } catch (e) {
      console.error('[shadow]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  // ── GET /api/history/:sha ─────────────────────────────────────────────────
  async function handleHistoryVersion(
    req: IncomingMessage,
    res: ServerResponse,
    sha: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';

    const resolvedContentRoot = contentRoot ?? 'content';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    // Validate SHA format
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      json(res, 400, { ok: false, error: 'Invalid commit SHA' });
      return;
    }

    try {
      // Verify file exists at this commit
      try {
        await sg.raw('cat-file', '-e', `${sha}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at this version' });
        return;
      }

      const content = await sg.raw('show', `${sha}:${docPath}`);

      // Resolve commit metadata
      const logLine = (await sg.raw('log', '-1', '--format=%aI%x00%an', sha)).trim();
      const [timestamp = '', author = ''] = logLine.split('\x00');

      json(res, 200, { ok: true, sha, content, timestamp, author });
    } catch (e) {
      console.error('[shadow-version]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  // ── GET /api/diff ─────────────────────────────────────────────────────────
  async function handleDiff(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';

    if (!to || !/^[0-9a-f]{40}$/i.test(to)) {
      json(res, 400, { ok: false, error: "'to' must be a valid 40-char commit SHA" });
      return;
    }

    const resolvedContentRoot = contentRoot ?? 'content';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    try {
      // Get "to" content
      let toContent: string;
      try {
        toContent = await sg.raw('show', `${to}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at the target version' });
        return;
      }

      // Get "from" content — either a commit SHA or current Y.Doc text
      let fromContent: string;
      if (from && /^[0-9a-f]{40}$/i.test(from)) {
        try {
          fromContent = await sg.raw('show', `${from}:${docPath}`);
        } catch {
          json(res, 404, { ok: false, error: 'Document did not exist at the source version' });
          return;
        }
      } else {
        // from omitted — read current Y.Doc content directly (avoids creating an agent session)
        const doc = hocuspocus.documents.get(docName);
        if (!doc) {
          json(res, 409, {
            ok: false,
            error: 'Document is not currently open — open it in the editor first',
          });
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

      json(res, 200, { ok: true, lines, additions, deletions });
    } catch (e) {
      console.error('[diff]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  // ── POST /api/rollback ────────────────────────────────────────────────────
  async function handleRollback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readBody(req);
    } catch {
      json(res, 413, { ok: false, error: 'Payload too large' });
      return;
    }

    let body: unknown;
    try {
      body = rawBody.length > 0 ? JSON.parse(rawBody.toString()) : {};
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' });
      return;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      json(res, 400, { ok: false, error: 'Body must be a JSON object' });
      return;
    }

    const {
      agentId: rollbackAgentId,
      agentName: rollbackAgentName,
      colorSeed: rollbackColorSeed,
      clientName: rollbackClientName,
      clientVersion: rollbackClientVersion,
      label: rollbackLabel,
    } = extractAgentIdentity(body as Record<string, unknown>); // attribution threading (FR-5, D42)

    const {
      docName: rawDocName,
      commitSha: rawSha,
      versionTag: rawVersionTag,
    } = body as Record<string, unknown>;
    const docName = typeof rawDocName === 'string' ? rawDocName : '';
    const commitSha = typeof rawSha === 'string' ? rawSha : '';
    const versionTagForRollback = typeof rawVersionTag === 'string' ? rawVersionTag : undefined;

    if (!docName) {
      json(res, 400, { ok: false, error: 'docName required' });
      return;
    }
    if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha)) {
      json(res, 400, { ok: false, error: 'commitSha must be a valid 40-char commit SHA' });
      return;
    }

    // D22 LOCKED 1-way door: UI-driven rollback (EditorPane.tsx:155 Restore
    // button) posts no `agentId`. Without this guard, `extractAgentIdentity`
    // defaults would attribute every human Restore to Claude. Only when the
    // caller explicitly sends `agentId` do we attribute + record a summary.
    //
    // Validation runs unconditionally (independent of `hasAgentId`) so a
    // malformed `summary: 42` returns 400 even when identity is absent — this
    // surfaces MCP-client identity-passthrough regressions loudly instead of
    // silently dropping the summary on the floor. The attribution semantics
    // (D22) are unchanged: `recordContributor` still only fires when
    // `hasAgentId` is true.
    const bodyObj = body as Record<string, unknown>;
    const hasAgentId = typeof bodyObj.agentId === 'string' && bodyObj.agentId.length > 0;
    const normalizedSummary = normalizeSummary(bodyObj.summary);
    if (normalizedSummary.kind === 'invalid') {
      json(res, 400, { ok: false, error: 'summary must be a string' });
      return;
    }

    const resolvedContentRoot = contentRoot ?? 'content';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    const t0 = Date.now();
    try {
      // Verify file exists at this commit
      try {
        await sg.raw('cat-file', '-e', `${commitSha}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at this version' });
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
        json(res, 409, {
          ok: false,
          error: 'Document is not currently open — open it in the editor first',
        });
        return;
      }

      const { frontmatter, body: mdBody } = stripFrontmatter(markdown);
      const parsedJson = mdManager.parseWithFallback(mdBody);
      const pmNode = schema.nodeFromJSON(parsedJson);
      const xmlFragment = document.getXmlFragment('default');

      document.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(document, xmlFragment, pmNode, meta);

        const ytext = document.getText('source');
        const currentText = ytext.toString();
        if (currentText !== markdown) {
          ytext.delete(0, currentText.length);
          ytext.insert(0, markdown);
        }

        // Update metadata map with restored frontmatter so persistence
        // serializes the correct frontmatter on next L1 flush.
        const metaMap = document.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
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

      // D22 LOCKED: attribute + record summary ONLY when caller supplied
      // agentId. UI-driven Restore (no agentId) stays anonymous — no bullet,
      // no focus push, no actor tuple. Default summary `"Restored to <sha-short>"`
      // applies when agent-supplied summary was absent; the default goes through
      // `normalizeSummary` too so the 80-char cap covers the default path (FR10).
      //
      // When the default is used and it happens to truncate (rare for rollback
      // since "Restored to <8-char-sha>" is ~22 chars, but we keep the code
      // path symmetric with `handleRename` where defaults frequently overflow
      // for deeply-nested doc paths), we strip `truncatedFrom` + `hint` from
      // the response: the agent never submitted the long string, so the
      // "Summary truncated from N chars to 80" message would misattribute
      // blame to the caller. `summariesTruncated` is also suppressed for
      // server-generated defaults so the M2 metric reflects agent behavior.
      let summaryResponse: SummaryResponse | undefined;
      if (hasAgentId) {
        const shaShort = commitSha.slice(0, 8);
        const agentProvidedSummary = normalizedSummary.kind === 'value';
        const effectiveNormalized = agentProvidedSummary
          ? normalizedSummary
          : normalizeSummary(`Restored to ${shaShort}`);
        const fields = summaryResponseFields(effectiveNormalized);
        summaryResponse =
          agentProvidedSummary || !fields.response
            ? fields.response
            : stripDefaultPathTruncation(fields.response);
        recordContributor(
          docName,
          rollbackAgentId,
          rollbackAgentName,
          rollbackColorSeed,
          formatRollbackSubject(docName, commitSha),
          buildAgentActor({
            clientName: rollbackClientName,
            clientVersion: rollbackClientVersion,
            label: rollbackLabel,
          }),
          fields.stored,
        );
        incrementAgentWriteCalls();
        countNormalizedSummary(effectiveNormalized, !agentProvidedSummary);
      }

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
        const resolvedContentRoot = contentRoot ?? 'content';
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

      // D22: only broadcast agent-focus push-nav when the caller explicitly
      // identified as an agent. UI-driven Restore (no agentId) must not
      // trigger a cross-client push-nav as if Claude-1 did the rollback.
      if (hasAgentId) {
        agentFocusBroadcaster?.setFocus(rollbackAgentId, {
          agentName: rollbackAgentName,
          currentDoc: docName,
          writeKind: 'rollback-apply',
          ts: Date.now(),
        });
      }

      json(res, 200, {
        ok: true,
        restoredFrom: commitSha,
        timestamp,
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      console.error('[rollback]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleMetricsReconciliation(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    json(res, 200, getMetrics());
  }

  async function handleMetricsParseHealth(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    json(res, 200, getParseHealth());
  }

  async function handlePrincipal(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    const principal = getPrincipal?.() ?? null;
    if (!principal) {
      json(res, 404, { error: 'Principal not available' });
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
      json(res, 403, { ok: false, error: 'loopback-required' });
      return;
    }
    if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
      json(res, 403, { ok: false, error: 'host-header-not-allowed' });
      return;
    }
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
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
      json(res, 403, { ok: false, error: 'loopback-required' });
      return;
    }
    if (!isAllowedWorkspaceHostHeader(req.headers.host)) {
      json(res, 403, { ok: false, error: 'host-header-not-allowed' });
      return;
    }
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
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
        json(res, 500, { ok: false, error: 'workspace-realpath-failed', code: code ?? null });
        return;
      }
    }
    // `pathSeparator` lets the client build full paths without guessing from
    // the shape of `contentDir` (which breaks on Windows + forward-slash paths
    // and on POSIX folders that contain a literal backslash in the name).
    json(res, 200, {
      ok: true,
      contentDir: resolvedContentDir,
      pathSeparator: sep,
      symlinkResolved,
    });
  }

  /** 24h in milliseconds — rescue buffers older than this are excluded/cleaned. */
  const RESCUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  async function handleRescueList(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    if (!shadowRef?.current) {
      json(res, 200, []);
      return;
    }

    const now = Date.now();
    // `source: 'flat'` rows came from the shutdown-flush path (retained flat-
    // file per SPEC); `source: 'timeline'` rows came from reconcile-delete /
    // branch-switch (migrated to saveInMemoryCheckpoint per R7e). Clients
    // can treat both as interchangeable unless they need the checkpoint sha.
    interface RescueRowFlat {
      docName: string;
      timestamp: string;
      size: number;
      source: 'flat';
    }
    interface RescueRowTimeline extends TimelineRescueEntry {
      source: 'timeline';
    }
    const entries: (RescueRowFlat | RescueRowTimeline)[] = [];

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
  }

  async function handleRescueGet(
    req: IncomingMessage,
    res: ServerResponse,
    docName: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    if (!shadowRef?.current) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Flat-file source (shutdown-flush retains flat-file per SPEC). Try
    // this first — the flat-file path is how shutdown-flush delivers the
    // most recent unflushed state, which is the most relevant artifact.
    const rescueBase = resolve(shadowRef.current.gitDir, 'rescue');
    const filePath = resolve(rescueBase, `${docName}${getDocExtension(docName)}`);
    if (!filePath.startsWith(`${rescueBase}/`)) {
      res.writeHead(400);
      res.end('Invalid document name');
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

    res.writeHead(404);
    res.end('Not found');
  }

  async function handleCreatePage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }
      const {
        agentId: createPageAgentId,
        agentName: createPageAgentName,
        colorSeed: createPageColorSeed,
        clientName: createPageClientName,
        clientVersion: createPageClientVersion,
        label: createPageLabel,
      } = extractAgentIdentity(body as Record<string, unknown>); // attribution threading (FR-5, D42)
      const { path: filePath } = body as Record<string, unknown>;
      if (!filePath || typeof filePath !== 'string' || filePath.length === 0) {
        json(res, 400, { ok: false, error: 'path is required' });
        return;
      }
      if (!isSupportedDocFile(filePath)) {
        json(res, 400, { ok: false, error: 'path must end with .md or .mdx' });
        return;
      }
      if (
        filePath.includes('..') ||
        filePath.startsWith('/') ||
        filePath.includes('\x00') ||
        filePath.includes('\\')
      ) {
        json(res, 400, { ok: false, error: 'path must not contain .. or start with /' });
        return;
      }
      const resolvedContentDir = resolve(contentDir);
      const fullPath = resolve(resolvedContentDir, filePath);
      if (!fullPath.startsWith(`${resolvedContentDir}/`) && fullPath !== resolvedContentDir) {
        json(res, 400, { ok: false, error: 'path must not escape content directory' });
        return;
      }
      const candidateDocName = stripDocExtension(filePath);
      if (isSystemDoc(candidateDocName)) {
        json(res, 400, { ok: false, error: `'${candidateDocName}' is a reserved document name` });
        return;
      }
      mkdirSync(dirname(fullPath), { recursive: true });
      const initialContent = '';
      try {
        writeFileSync(fullPath, initialContent, { encoding: 'utf-8', flag: 'wx' });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          json(res, 409, { ok: false, error: 'File already exists' });
          return;
        }
        throw err;
      }
      const docName = stripDocExtension(filePath);
      recordContributor(
        docName,
        createPageAgentId,
        createPageAgentName,
        createPageColorSeed,
        undefined,
        buildAgentActor({
          clientName: createPageClientName,
          clientVersion: createPageClientVersion,
          label: createPageLabel,
        }),
      );
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
      json(res, 200, { ok: true, docName });
    } catch (e) {
      console.error('[create-page]', e);
      json(res, 500, { ok: false, error: 'Failed to create page' });
    }
  }

  async function handlePageHeadings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName || typeof docName !== 'string' || docName.length === 0) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const filePath = resolveDocPath(docName);
      if (!filePath) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      if (!existsSync(filePath)) {
        json(res, 404, { ok: false, error: 'Page not found' });
        return;
      }
      const content = readFileSync(filePath, 'utf-8');
      const headings = extractHeadings(content);
      json(res, 200, { ok: true, docName, headings });
    } catch (e) {
      console.error('[page-headings]', e);
      json(res, 500, { ok: false, error: 'Failed to read headings' });
    }
  }

  async function handleRename(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const {
        agentId: renameAgentId,
        agentName: renameAgentName,
        colorSeed: renameColorSeed,
        clientName: renameClientName,
        clientVersion: renameClientVersion,
        label: renameLabel,
      } = extractAgentIdentity(body as Record<string, unknown>); // attribution threading (FR-5, D42)
      const { docName, newDocName } = body as Record<string, unknown>;
      if (typeof docName !== 'string' || typeof newDocName !== 'string') {
        json(res, 400, { ok: false, error: 'docName and newDocName are required' });
        return;
      }
      if (!isValidRelativeContentPath(docName) || !isValidRelativeContentPath(newDocName)) {
        json(res, 400, { ok: false, error: 'Document names must be relative content paths' });
        return;
      }
      if (isSystemDoc(docName) || isSystemDoc(newDocName)) {
        json(res, 400, { ok: false, error: 'Reserved document names cannot be renamed' });
        return;
      }
      if (docName === newDocName) {
        json(res, 200, { ok: true, renamed: [], rewrittenDocs: [] });
        return;
      }
      if (!backlinkIndex) {
        json(res, 503, { ok: false, error: 'Backlink index unavailable' });
        return;
      }

      // D22 LOCKED 1-way door: only attribute when the caller explicitly
      // supplies agentId. Any future UI-driven rename (no agentId) stays
      // anonymous as today — even though the rename handler has no existing
      // UI call site, adding the guard up front keeps the pattern uniform
      // with `handleRollback` and prevents `extractAgentIdentity` defaults
      // from silently attributing future UI paths to Claude.
      //
      // Validation runs unconditionally (independent of `hasAgentId`) so a
      // malformed `summary: 42` returns 400 even when identity is absent —
      // this surfaces MCP-client identity-passthrough regressions loudly
      // instead of silently dropping the summary on the floor. The
      // attribution semantics (D22) are unchanged.
      const bodyObj = body as Record<string, unknown>;
      const hasAgentId = typeof bodyObj.agentId === 'string' && bodyObj.agentId.length > 0;
      const normalizedSummary = normalizeSummary(bodyObj.summary);
      if (normalizedSummary.kind === 'invalid') {
        json(res, 400, { ok: false, error: 'summary must be a string' });
        return;
      }

      const sourcePath = resolveContentEntryPath(contentDir, 'file', docName);
      const destinationPath = resolveContentEntryPath(contentDir, 'file', newDocName);
      // Handles the case where the client sends an explicit extension that
      // matches the source's existing one (e.g. `newDocName: "foo.md"` when
      // the file is already `foo.md`) — `docName !== newDocName` textually
      // but the on-disk paths resolve to the same file. Treat as no-op,
      // mirroring the extension-less `docName === newDocName` short-circuit
      // above.
      if (sourcePath === destinationPath) {
        json(res, 200, { ok: true, renamed: [], rewrittenDocs: [] });
        return;
      }
      if (!existsSync(sourcePath)) {
        json(res, 404, { ok: false, error: 'Document does not exist' });
        return;
      }
      if (existsSync(destinationPath)) {
        json(res, 409, { ok: false, error: 'Destination already exists' });
        return;
      }

      const result = await _performManagedRename(docName, newDocName);

      // D22 LOCKED: only attribute when the caller explicitly sent agentId.
      // UI-driven rename stays anonymous on the timeline (no bullet, no focus
      // push, no actor tuple). Attribute on the NEW docName per D15/FR9 — the
      // backlink-rewritten side-effect docs stay anonymous (defaultWriter) to
      // avoid "Claude renamed X → Y" noise on every inbound doc.
      //
      // When the default "Renamed X → Y" template overflows the 80-char cap
      // (common for deeply-nested doc paths, e.g. `specs/2026-04-19-ci-signal-quality/SPEC`
      // pairs blow past 80 easily), we strip `truncatedFrom` + `hint` from the
      // response: the agent never submitted the long string, so the
      // "Summary truncated from N chars to 80" hint would misattribute blame
      // to the caller. `summariesTruncated` is also suppressed for
      // server-generated defaults so the M2 metric reflects agent behavior,
      // not server-template width.
      let summaryResponse: SummaryResponse | undefined;
      if (hasAgentId) {
        const agentProvidedSummary = normalizedSummary.kind === 'value';
        const effectiveNormalized = agentProvidedSummary
          ? normalizedSummary
          : normalizeSummary(`Renamed ${docName} → ${newDocName}`);
        const fields = summaryResponseFields(effectiveNormalized);
        summaryResponse =
          agentProvidedSummary || !fields.response
            ? fields.response
            : stripDefaultPathTruncation(fields.response);
        recordContributor(
          newDocName as string,
          renameAgentId,
          renameAgentName,
          renameColorSeed,
          formatRenameSubject(docName as string, newDocName as string),
          buildAgentActor({
            clientName: renameClientName,
            clientVersion: renameClientVersion,
            label: renameLabel,
          }),
          fields.stored,
        );
        incrementAgentWriteCalls();
        countNormalizedSummary(effectiveNormalized, !agentProvidedSummary);
        // BUG-1 (agent-write-summaries QA Phase 7): drain the just-recorded
        // pendingContributors entry into its own L2 shadow commit. Parallels
        // the `flushDocToGit(...)` call in `handleRollback` above; uses
        // `flushDocToGit(newDocName, ...)` because the source doc may no
        // longer be open after `_performManagedRename` closed it.
        flushDocToGit(newDocName as string, 'rename');
      }

      json(res, 200, {
        ok: true,
        renamed: result.renamed,
        rewrittenDocs: result.rewrittenDocs,
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      console.error('[rename]', e);
      json(res, 500, { ok: false, error: toManagedRenamePublicError(e) });
    }
  }

  async function handleRenamePath(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      extractAgentIdentity(body as Record<string, unknown>); // attribution threading (FR-5, D42)
      const { kind, fromPath, toPath } = body as Record<string, unknown>;
      if (kind !== 'file' && kind !== 'folder') {
        json(res, 400, { ok: false, error: 'kind must be "file" or "folder"' });
        return;
      }
      if (typeof fromPath !== 'string' || typeof toPath !== 'string') {
        json(res, 400, { ok: false, error: 'fromPath and toPath are required' });
        return;
      }
      if (!isValidRelativeContentPath(fromPath) || !isValidRelativeContentPath(toPath)) {
        json(res, 400, { ok: false, error: 'Paths must be relative content paths' });
        return;
      }
      if (fromPath === toPath) {
        json(res, 200, { ok: true, renamed: [] });
        return;
      }

      const sourcePath = resolveContentEntryPath(contentDir, kind, fromPath);
      const destinationPath = resolveContentEntryPath(contentDir, kind, toPath);

      if (!existsSync(sourcePath)) {
        json(res, 404, { ok: false, error: `${kind} does not exist` });
        return;
      }
      if (existsSync(destinationPath)) {
        json(res, 409, { ok: false, error: 'Destination already exists' });
        return;
      }

      const sourceStat = statSync(sourcePath);
      if (
        (kind === 'file' && !sourceStat.isFile()) ||
        (kind === 'folder' && !sourceStat.isDirectory())
      ) {
        json(res, 400, { ok: false, error: `Source path is not a ${kind}` });
        return;
      }

      const affectedDocNames = listAffectedDocNames(getFileIndex(), kind, fromPath);
      const renamed: RenamedDocMapping[] =
        kind === 'file'
          ? [{ fromDocName: fromPath, toDocName: toPath }]
          : affectedDocNames.map((docName) => ({
              fromDocName: docName,
              toDocName: remapDocNameForRename(docName, kind, fromPath, toPath),
            }));

      const liveContents = await captureAndCloseDocuments(
        renamed.map(({ fromDocName }) => fromDocName),
      );

      const applyRename = async (): Promise<void> => {
        const renamedWithGit = await renameTrackedPathInGit(
          projectDir,
          sourcePath,
          destinationPath,
        );
        if (!renamedWithGit) {
          mkdirSync(dirname(destinationPath), { recursive: true });
          renameSync(sourcePath, destinationPath);
        }
        syncRenamedDocsToDisk(renamed, liveContents);
      };

      if (kind === 'file') {
        const recoveryJournal = createManagedRenameRecoveryJournal({
          sourceDocName: fromPath,
          destinationDocName: toPath,
          snapshots: buildManagedRenameSnapshots(
            renamed.map(({ fromDocName }) => fromDocName),
            liveContents,
          ),
        });
        await withManagedRenameRecovery(contentDir, recoveryJournal, applyRename);
      } else {
        await applyRename();

        const fileIndex = getFileIndex();
        for (const { fromDocName, toDocName } of renamed) {
          updateFileIndex(
            {
              kind: 'rename',
              oldPath: resolveContentEntryPath(contentDir, 'file', fromDocName),
              newPath: resolveContentEntryPath(contentDir, 'file', toDocName),
              oldDocName: fromDocName,
              newDocName: toDocName,
              content:
                liveContents.get(fromDocName) ??
                readFileSync(resolveContentEntryPath(contentDir, 'file', toDocName), 'utf-8'),
            },
            fileIndex as Map<string, FileIndexEntry>,
          );
        }

        if (backlinkIndex) {
          for (const { fromDocName, toDocName } of renamed) {
            backlinkIndex.renameDocument(
              fromDocName,
              toDocName,
              liveContents.get(fromDocName) ??
                readFileSync(resolveContentEntryPath(contentDir, 'file', toDocName), 'utf-8'),
            );
          }

          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(
              `[backlinks] Failed to persist folder rename cache for ${fromPath} -> ${toPath}:`,
              err,
            );
          });
          signalChannel?.('backlinks');
          signalChannel?.('graph');
        }

        signalChannel?.('files');
      }

      json(res, 200, { ok: true, renamed });
    } catch (e) {
      console.error('[rename-path]', e);
      json(res, 500, { ok: false, error: 'Failed to rename path' });
    }
  }

  async function handleDeletePath(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      extractAgentIdentity(body as Record<string, unknown>); // attribution threading (FR-5, D42)
      const { kind, path } = body as Record<string, unknown>;
      if (kind !== 'file' && kind !== 'folder') {
        json(res, 400, { ok: false, error: 'kind must be "file" or "folder"' });
        return;
      }
      if (typeof path !== 'string' || !isValidRelativeContentPath(path)) {
        json(res, 400, { ok: false, error: 'path must be a relative content path' });
        return;
      }

      const targetPath = resolveContentEntryPath(contentDir, kind, path);
      if (!existsSync(targetPath)) {
        json(res, 404, { ok: false, error: `${kind} does not exist` });
        return;
      }

      const targetStat = statSync(targetPath);
      if (
        (kind === 'file' && !targetStat.isFile()) ||
        (kind === 'folder' && !targetStat.isDirectory())
      ) {
        json(res, 400, { ok: false, error: `Target path is not a ${kind}` });
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

      json(res, 200, { ok: true, deletedDocNames });
    } catch (e) {
      console.error('[delete-path]', e);
      json(res, 500, { ok: false, error: 'Failed to delete path' });
    }
  }

  async function handlePages(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
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
      json(res, 200, { ok: true, pages });
    } catch (e) {
      console.error('[pages]', e);
      json(res, 500, { ok: false, error: 'Failed to list pages' });
    }
  }

  async function handleSuggestLinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }

      const result = await suggestLinks({
        hocuspocus,
        fileIndex: getFileIndex(),
        docName,
      });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (error instanceof SuggestLinksTargetNotFoundError) {
        json(res, 404, { ok: false, error: 'Page not found' });
        return;
      }
      console.error('[suggest-links]', error);
      json(res, 500, { ok: false, error: 'Failed to suggest links' });
    }
  }

  async function handleUploadImage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    let uploadResult: UploadResult | undefined;
    try {
      uploadResult = await readUploadBody(req, MAX_UPLOAD_BYTES);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Payload too large') {
        json(res, 413, { ok: false, error: 'Payload too large' });
      } else if (message === 'No file received') {
        json(res, 400, { ok: false, error: 'No file received' });
      } else {
        json(res, 400, { ok: false, error: `Failed to parse upload: ${message}` });
      }
      return;
    }

    const { filename, buffer, parentDocName } = uploadResult;
    // attribution threading (FR-5, D42): extract identity from query params (multipart body precludes JSON)
    extractAgentIdentity(
      Object.fromEntries(new URL(req.url ?? '', 'http://localhost').searchParams.entries()),
    );

    if (!parentDocName) {
      json(res, 400, { ok: false, error: 'parentDocName is required' });
      return;
    }

    // D15: reject path-escape attempts
    if (
      parentDocName.includes('\x00') ||
      parentDocName.includes('..') ||
      parentDocName.startsWith('/')
    ) {
      json(res, 400, { ok: false, error: 'path-escape' });
      return;
    }

    const resolvedContentDir = resolve(contentDir);
    const destDir = resolve(resolvedContentDir, dirname(parentDocName));
    if (!isWithinContentDir(destDir, resolvedContentDir)) {
      json(res, 400, { ok: false, error: 'path-escape' });
      return;
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
        json(res, 400, { ok: false, error: 'path-escape' });
        return;
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Directory doesn't exist yet — will be created below; no symlink escape possible
      } else {
        json(res, 400, { ok: false, error: 'path-escape' });
        return;
      }
    }

    // Magic bytes check — ignore the client-supplied mimeType entirely
    const fileTypeResult = await fileTypeFromBuffer(buffer);
    let detectedMime: string | undefined = fileTypeResult?.mime;
    let detectedExt: string | undefined = fileTypeResult?.ext;
    // file-type can't detect SVG (text-based, no magic bytes) — check manually
    if (!detectedMime) {
      const head = buffer.subarray(0, 256).toString('utf-8').trimStart();
      if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
        detectedMime = 'image/svg+xml';
        detectedExt = 'svg';
      }
    }
    if (!detectedMime || !detectedExt || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      json(res, 400, {
        ok: false,
        error: `Unsupported file type${detectedMime ? `: ${detectedMime}` : ''}`,
      });
      return;
    }

    // D8: detect clipboard paste (generic/empty filename) → timestamp stem
    let finalFilename: string;
    if (!filename || filename === 'upload' || GENERIC_PASTE_NAMES.test(filename)) {
      const now = new Date();
      const ts = now
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14)
        .replace(/(\d{8})(\d{6})/, '$1-$2');
      finalFilename = `pasted-${ts}.${detectedExt}`;
    } else {
      finalFilename = sanitizeFilename(filename);
    }

    mkdirSync(destDir, { recursive: true });

    try {
      const destFilename = writeUploadAtomic(destDir, finalFilename, buffer);
      const relPath = relative(contentDir, resolve(destDir, destFilename));
      console.log(`[upload] ok ${relPath} ${buffer.length}`);
      json(res, 200, { ok: true, src: destFilename });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[upload] error ${finalFilename} ${buffer.length} ${message}`);
      json(res, 500, { ok: false, error: 'Failed to save file' });
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
   */
  async function handleLocalOpClone(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    // Parse request body
    let url: string;
    let dir: string;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { url?: unknown; dir?: unknown };
      if (typeof parsed.url !== 'string' || !parsed.url) {
        json(res, 400, { ok: false, error: 'Missing or invalid url' });
        return;
      }
      if (typeof parsed.dir !== 'string' || !parsed.dir) {
        json(res, 400, { ok: false, error: 'Missing or invalid dir' });
        return;
      }
      url = parsed.url;
      dir = parsed.dir;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    // Security: URL protocol allowlist
    if (!isAllowedGitUrl(url)) {
      json(res, 400, { ok: false, error: 'URL protocol not allowed' });
      return;
    }

    // Security: dir must be within user home dir (no traversal)
    if (!isSafeLocalPath(dir)) {
      json(res, 400, {
        ok: false,
        error: 'dir must be within the user home directory',
      });
      return;
    }

    // Concurrency guard: reject concurrent requests to this endpoint
    if (!localOpGuard.tryAcquire(LOCAL_OP_CLONE_KEY)) {
      json(res, 429, { ok: false, error: 'A clone operation is already in progress' });
      return;
    }

    // Start chunked NDJSON response
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    // CLI clone takes `dir` as a positional argument (not a `--dir` flag).
    // Expand `~` here so the CLI doesn't treat it as a literal directory name.
    const targetDir = expandTilde(dir);
    const [cmd, ...baseArgs] = localOpCliArgs;
    const spawnArgs = [...baseArgs, 'clone', '--json', url, targetDir];

    let timedOut = false;
    let settled = false;
    // The CLI emits `{type:'complete', dir}` on success, but the browser
    // client expects `{type:'complete', port}`. We intercept the CLI's
    // complete event, boot a server at the cloned dir, then emit a rewritten
    // complete with the port. Non-terminal events (progress / error) flow
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
        let parsed: { type?: unknown; dir?: unknown } | null = null;
        try {
          parsed = JSON.parse(line) as { type?: unknown; dir?: unknown };
        } catch {
          /* non-JSON — ignore */
        }
        if (parsed && parsed.type === 'complete' && typeof parsed.dir === 'string') {
          // Swallow this line; we'll emit our own complete after starting the server.
          cloneCompleteDir = parsed.dir;
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
            res.write(
              `${JSON.stringify({ type: 'error', message: 'Clone timed out after 10 minutes' })}\n`,
            );
          } else if (code !== 0 && !res.writableEnded) {
            if (stderrOutput) {
              log.warn({ code, stderr: stderrOutput, url, dir }, '[local-op/clone] clone failed');
            }
            const detail = stderrOutput ? ` — ${stderrOutput}` : '';
            res.write(
              `${JSON.stringify({ type: 'error', message: `Clone process exited with code ${code}${detail}` })}\n`,
            );
          } else if (code === 0 && cloneCompleteDir && !res.writableEnded) {
            // Chain into server-start so the client can redirect.
            const result = await startServerAtDirAndGetPort(cloneCompleteDir);
            if (!res.writableEnded) {
              if ('port' in result) {
                res.write(`${JSON.stringify({ type: 'complete', port: result.port })}\n`);
              } else {
                res.write(`${JSON.stringify({ type: 'error', message: result.error })}\n`);
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
          res.write(`${JSON.stringify({ type: 'error', message: err.message })}\n`);
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
    const lockDir = resolve(absDir, '.open-knowledge');

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
      env: { ...process.env },
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
      await new Promise<void>((r) => setTimeout(r, 500));
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
   * Polls <dir>/.open-knowledge/server.lock until port > 0 appears.
   * Returns: { port: number }
   */
  async function handleLocalOpOpen(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let dir: string;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { dir?: unknown };
      if (typeof parsed.dir !== 'string' || !parsed.dir) {
        json(res, 400, { ok: false, error: 'Missing or invalid dir' });
        return;
      }
      dir = parsed.dir;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    // Security: dir must be within user home dir
    if (!isSafeLocalPath(dir)) {
      json(res, 400, {
        ok: false,
        error: 'dir must be within the user home directory',
      });
      return;
    }

    // Concurrency guard
    if (!localOpGuard.tryAcquire(LOCAL_OP_OPEN_KEY)) {
      json(res, 429, { ok: false, error: 'A server-open operation is already in progress' });
      return;
    }

    try {
      const result = await startServerAtDirAndGetPort(dir);
      if ('port' in result) {
        json(res, 200, { port: result.port });
      } else {
        json(res, 504, { ok: false, error: result.error });
      }
    } finally {
      localOpGuard.release(LOCAL_OP_OPEN_KEY);
    }
  }

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
   */
  async function handleLocalOpAuthLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let host = 'github.com';
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { host?: unknown };
      if (typeof parsed.host === 'string' && parsed.host) host = parsed.host;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_LOGIN_KEY)) {
      json(res, 429, { ok: false, error: 'An auth login operation is already in progress' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

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
      if (!res.writableEnded) res.write(chunk);
      // Parse line-by-line to detect whether the CLI emitted a terminal event
      // (`complete` | `error`). If it didn't but the process exits 0, we
      // synthesize one below so the client never hangs on a silent exit.
      stdoutBuffer += chunk.toString('utf-8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as { type?: unknown };
          if (parsed.type === 'complete' || parsed.type === 'error') {
            sawTerminalEvent = true;
          }
        } catch {
          /* non-JSON line (e.g. keychain-backend log) — ignore */
        }
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
            res.write(
              `${JSON.stringify({ type: 'error', message: `auth login exited with code ${code}` })}\n`,
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
          res.write(`${JSON.stringify({ type: 'error', message: err.message })}\n`);
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
  async function handleLocalOpAuthStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let host = 'github.com';
    try {
      const body = await readBody(req);
      const raw = body.toString().trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw) as { host?: unknown };
        if (typeof parsed.host === 'string' && parsed.host) host = parsed.host;
      }
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_STATUS_KEY)) {
      json(res, 429, { ok: false, error: 'An auth status operation is already in progress' });
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
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'auth status failed',
      });
    } finally {
      localOpGuard.release(LOCAL_OP_AUTH_STATUS_KEY);
    }
  }

  /**
   * POST /api/local-op/auth/repos
   *
   * Body: { host?: string }
   * Spawns: auth repos --json [--host <host>]
   * Streams: NDJSON via chunked HTTP.
   */
  async function handleLocalOpAuthRepos(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let host = 'github.com';
    try {
      const body = await readBody(req);
      const raw = body.toString().trim();
      if (raw.length > 0) {
        const parsed = JSON.parse(raw) as { host?: unknown };
        if (typeof parsed.host === 'string' && parsed.host) host = parsed.host;
      }
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_REPOS_KEY)) {
      json(res, 429, { ok: false, error: 'An auth repos operation is already in progress' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    const [cmd, ...baseArgs] = localOpCliArgs;
    const spawnArgs = [...baseArgs, 'auth', 'repos', '--json', '--host', host];

    let settled = false;
    const child = spawn(cmd, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const killTimer = setTimeout(() => {
      child.kill('SIGTERM');
    }, LOCAL_OP_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (!res.writableEnded) res.write(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      log.debug({ msg: chunk.toString('utf-8').trim() }, '[local-op/auth/repos] stderr');
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        if (code !== 0 && !res.writableEnded) {
          res.write(
            `${JSON.stringify({ type: 'error', message: `auth repos exited with code ${code}` })}\n`,
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
          res.write(`${JSON.stringify({ type: 'error', message: err.message })}\n`);
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
   * Returns: { ok: true }
   */
  async function handleLocalOpAuthSignout(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let host = 'github.com';
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { host?: unknown };
      if (typeof parsed.host === 'string' && parsed.host) host = parsed.host;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_SIGNOUT_KEY)) {
      json(res, 429, { ok: false, error: 'An auth signout operation is already in progress' });
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

      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'auth signout failed',
      });
    } finally {
      localOpGuard.release(LOCAL_OP_AUTH_SIGNOUT_KEY);
    }
  }

  /**
   * POST /api/local-op/auth/pat
   *
   * Body: { pat: string, host?: string }
   * Spawns: auth pat --json [--host <host>] with pat piped to stdin.
   * Returns: the NDJSON complete-event as parsed JSON.
   */
  async function handleLocalOpAuthPat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let host = 'github.com';
    let pat: string;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { pat?: unknown; host?: unknown };
      if (typeof parsed.pat !== 'string' || !parsed.pat) {
        json(res, 400, { ok: false, error: 'Missing or invalid pat' });
        return;
      }
      pat = parsed.pat;
      if (typeof parsed.host === 'string' && parsed.host) host = parsed.host;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_PAT_KEY)) {
      json(res, 429, { ok: false, error: 'An auth pat operation is already in progress' });
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
        json(res, 200, { ok: true });
      }
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'auth pat failed',
      });
    } finally {
      localOpGuard.release(LOCAL_OP_AUTH_PAT_KEY);
    }
  }

  // ─── GET /api/local-op/auth/identity ───────────────────────────────────────
  // Reads the resolved git identity via the identity resolution chain.
  // Returns { ok: true, identity: { name, email } | null }.

  async function handleLocalOpAuthIdentity(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!projectDir) {
      json(res, 400, { ok: false, error: 'No project directory configured' });
      return;
    }
    try {
      // Step 3 of the chain (OAuth profile fallback) requires a tokenStore; the
      // server package doesn't import the CLI's token store today, so we resolve
      // only local + global config tiers here. Sign-in flows pre-fill the form
      // with OAuth name/email separately.
      const identity = await resolveGitIdentity(projectDir);
      json(res, 200, { ok: true, identity });
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'identity resolution failed',
      });
    }
  }

  // ─── POST /api/local-op/auth/set-identity ──────────────────────────────────
  // Writes git user.name + user.email to repo-local config via writeGitIdentity
  // On success, nudges the sync engine to re-probe the identity chain
  // so the UI unresolved-nudge clears immediately instead of waiting for the
  // next push cycle.

  const LOCAL_OP_AUTH_SET_IDENTITY_KEY = '/api/local-op/auth/set-identity';

  async function handleLocalOpAuthSetIdentity(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let name: string;
    let email: string;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { name?: unknown; email?: unknown };
      if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
        json(res, 400, { ok: false, error: 'Missing or invalid name' });
        return;
      }
      if (typeof parsed.email !== 'string' || !parsed.email.trim()) {
        json(res, 400, { ok: false, error: 'Missing or invalid email' });
        return;
      }
      name = parsed.name.trim();
      email = parsed.email.trim();
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    if (!projectDir) {
      json(res, 400, { ok: false, error: 'No project directory configured' });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_AUTH_SET_IDENTITY_KEY)) {
      json(res, 429, { ok: false, error: 'A set-identity operation is already in progress' });
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
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'set-identity failed',
      });
    } finally {
      localOpGuard.release(LOCAL_OP_AUTH_SET_IDENTITY_KEY);
    }
  }

  // ─── Security helpers for sync endpoints ────────────────────────────────────
  // Sync endpoints reuse the shared loopback + origin check from local-op-security.ts
  // to avoid duplicating the same logic (checkLocalOpSecurity already imported above).

  // ─── Sync endpoints ──────────────────────────────────────────────────────────

  async function handleSyncStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
      // Shape must stay aligned with SyncStatus (see sync-engine.ts) — the UI
      // reads these fields unconditionally.
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
  }

  async function handleSyncTrigger(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
      json(res, 503, { ok: false, error: 'Sync engine not active' });
      return;
    }
    let op: 'sync' | 'push' | 'pull' = 'sync';
    try {
      const body = await readBody(req);
      if (body.length > 0) {
        const parsed = JSON.parse(body.toString()) as Record<string, unknown>;
        if (parsed.op === 'push' || parsed.op === 'pull' || parsed.op === 'sync') {
          op = parsed.op as 'push' | 'pull' | 'sync';
        }
      }
    } catch {
      // Ignore parse errors — use default op
    }
    // Fire-and-return: 202 Accepted immediately, trigger runs in background
    json(res, 202, { ok: true, op });
    void engine.trigger(op);
  }

  async function handleSyncSetEnabled(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
      json(res, 503, { ok: false, error: 'Sync engine not active' });
      return;
    }
    let enabled: boolean;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as Record<string, unknown>;
      if (typeof parsed.enabled !== 'boolean') {
        json(res, 400, { ok: false, error: 'enabled must be a boolean' });
        return;
      }
      enabled = parsed.enabled;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }
    await engine.setEnabled(enabled);
    json(res, 200, { ok: true, status: engine.getStatus() });
  }

  async function handleSyncConflicts(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    const conflicts = engine ? engine.getConflicts() : [];
    json(res, 200, { conflicts });
  }

  async function handleSyncResolveConflict(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
      json(res, 503, { ok: false, error: 'Sync engine not active' });
      return;
    }
    let body: Record<string, unknown>;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw.toString()) as Record<string, unknown>;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }
    const { file, strategy, content } = body as {
      file?: string;
      strategy?: string;
      content?: string;
    };
    if (!file || typeof file !== 'string') {
      json(res, 400, { ok: false, error: 'Missing required field: file' });
      return;
    }
    if (strategy !== 'mine' && strategy !== 'theirs' && strategy !== 'content') {
      json(res, 400, {
        ok: false,
        error: "Invalid strategy: must be 'mine', 'theirs', or 'content'",
      });
      return;
    }
    try {
      await engine.resolveConflict(file, strategy as ResolveStrategy, content);
      json(res, 200, { ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleSyncConflictContent(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!projectDir) {
      json(res, 503, { ok: false, error: 'Project repo not configured' });
      return;
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const file = url.searchParams.get('file');
    if (!file) {
      json(res, 400, { ok: false, error: 'Missing required query param: file' });
      return;
    }
    // Reject obvious path-traversal; git itself rejects paths outside the index.
    if (file.includes('..') || file.startsWith('/')) {
      json(res, 400, { ok: false, error: 'Invalid file path' });
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
      json(res, 200, { ok: true, file, base, ours, theirs });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
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
    if (!checkLocalOpSecurity(req, res, json)) return;
    return handleInstalledAgents(req, res, installedAgentsCache.probeAll);
  }

  async function handleSyncAbortMerge(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
      json(res, 503, { ok: false, error: 'Sync engine not active' });
      return;
    }
    try {
      await engine.abortMerge();
      json(res, 200, { ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
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
    '/api/rename': handleRename,
    '/api/rename-path': handleRenamePath,
    '/api/delete-path': handleDeletePath,
    '/api/upload-image': handleUploadImage,
    '/api/agent-write': handleAgentWrite,
    '/api/agent-write-md': handleAgentWriteMd,
    '/api/agent-patch': handleAgentPatch,
    '/api/agent-undo': handleAgentUndo,
    '/api/save-version': handleSaveVersion,
    '/api/history': handleHistory,
    '/api/diff': handleDiff,
    '/api/rollback': handleRollback,
    '/api/metrics/reconciliation': handleMetricsReconciliation,
    '/api/metrics/parse-health': handleMetricsParseHealth,
    '/api/metrics/agent-presence': handleMetricsAgentPresence,
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
  };

  if (enableTestRoutes) {
    routes['/api/test-reset'] = handleTestReset;
    routes['/api/test-rescan-backlinks'] = handleTestRescanBacklinks;
  }

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
          if (typeof response.setHeader === 'function') {
            response.setHeader('Content-Type', 'application/json');
          }
          response.writeHead(403);
          response.end(JSON.stringify({ ok: false, error: 'origin-not-allowed' }));
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

      // Only /api/* gets a server span. Non-API routes (static file serving,
      // Hocuspocus's own paths) fall through silently.
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
