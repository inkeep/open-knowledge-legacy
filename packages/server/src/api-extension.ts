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
import { readdir, readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pipeline } from 'node:stream/promises';
import { setTimeout as wait } from 'node:timers/promises';
import type { Document, Extension, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_ICON_COLORS,
  ASSET_EXTENSIONS,
  applyFastDiff,
  colorFromSeed,
  createCodeFenceTracker,
  createWorkspaceSearchCorpus,
  createWorkspaceSearchDocument,
  DEFAULT_ATTACHMENT_FOLDER_PATH,
  DEFAULT_DEDUP_MODE,
  getHeadingSlug,
  getParseHealth,
  type HeadingEntry,
  INLINE_RENDERABLE_EXTENSIONS,
  type Principal,
  prependFrontmatter,
  readFmMap,
  SYSTEM_DOC_NAME,
  searchWorkspaceCorpus,
  stripFrontmatter,
  type WorkspaceSearchCorpus,
  type WorkspaceSearchDocument,
  type WorkspaceSearchIntent,
  type WorkspaceSearchScope,
} from '@inkeep/open-knowledge-core';
import {
  formatCheckpointSubject,
  formatRenameSubject,
  formatRollbackSubject,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { updateYFragment } from '@tiptap/y-tiptap';
import busboy from 'busboy';
import { diffLines } from 'diff';
import { fileTypeFromFile } from 'file-type';
import { parse as parseYaml } from 'yaml';
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
import { isAllowedApiOrigin } from './api-origin.ts';
import { collectReferencedAssets, toContentRelativePath } from './asset-references.ts';
import { assetContentTypeForPath } from './asset-serve-middleware.ts';
import { enrichDirectory } from './content/enrichment.ts';
import { applyNestedFolderRulesUpsert } from './content/folder-rule-write.ts';
import {
  applyTemplateDelete,
  applyTemplateWrite,
  type TemplateFrontmatter,
} from './content/templates-write.ts';
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
import { readSkillInstallStateSnapshot } from './skill-state.ts';
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
import {
  checkLocalOpSecurity,
  createConcurrencyGuard,
  expandTilde,
  isAllowedGitUrl,
  isSafeLocalPath,
} from './local-op-security.ts';
import { type AuthEvent, runCloneSubprocess, runDeviceFlowSubprocess } from './local-ops/index.ts';
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
  incrementAgentPatchFindMismatches,
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
import type { TagIndex } from './tag-index.ts';
import { getMeter, getTracer, withSpan } from './telemetry.ts';
import { getDocumentHistory } from './timeline-query.ts';

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

function findLooksLikeFrontmatter(find: string): boolean {
  if (/(^|\n)---(\s|\n|$)/.test(find)) return true;
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

export function __resetRenameTelemetryForTesting(): void {
  _renameAttributionCounter = null;
}

export const ROLLBACK_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'rollback-apply', paired: true },
} as const satisfies PairedWriteOrigin;

export const MANAGED_RENAME_ORIGIN = {
  source: 'local' as const,
  skipStoreHooks: false,
  context: { origin: 'managed-rename', paired: true },
} as const satisfies PairedWriteOrigin;

const log = getLogger('api');

function safeDocPath(docName: string, contentRoot: string): { path: string } | { error: string } {
  if (!docName || docName.includes('..') || docName.includes('\0')) {
    return { error: 'Invalid document name' };
  }
  const normalized = contentRoot === '.' ? '' : contentRoot.replace(/^\.\//, '');
  const ext = getDocExtension(docName);
  const path = normalized ? `${normalized}/${docName}${ext}` : `${docName}${ext}`;
  return { path };
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB

const GENERIC_PASTE_NAMES = /^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i;
const SAFE_FILENAME_CHARS = /[^\p{L}\p{N}\p{M}\p{Extended_Pictographic}.\-_ ]/gu;
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — sanitize must strip control bytes.
const STRIP_ON_SIGHT = /[/\\\x00-\x1f\x7f]/g;

export function sanitizeFilename(name: string): string {
  let stripped = name.replace(STRIP_ON_SIGHT, '');
  stripped = stripped.replace(SAFE_FILENAME_CHARS, '_');

  stripped = stripped.replace(/_+/g, '_').replace(/\.{2,}/g, '.');

  stripped = stripped.replace(/^[._]+/, '');
  stripped = stripped.replace(/\.+$/, '');

  if (stripped === '') return 'upload';

  const MAX_BYTES = 255;
  const encoder = new TextEncoder();
  if (encoder.encode(stripped).length > MAX_BYTES) {
    const dotIdx = stripped.lastIndexOf('.');
    const ext = dotIdx >= 0 ? stripped.slice(dotIdx) : '';
    let stem = dotIdx >= 0 ? stripped.slice(0, dotIdx) : stripped;
    while (encoder.encode(stem + ext).length > MAX_BYTES && stem.length > 0) {
      stem = stem.slice(0, -1);
    }
    stripped = (stem || 'upload') + ext;
    if (encoder.encode(stripped).length > MAX_BYTES) stripped = 'upload';
  }

  return stripped;
}

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
    return resolve(resolvedContentDir, dirname(parentDocName), trimmed.slice(2));
  }
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

const MAX_DEDUP_SCAN_CANDIDATES = 1000;

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
      candidateSha = await streamingHashFile(fullPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
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

import { UploadWriteError, type UploadWriteReason } from './upload-errors.ts';

interface UploadResult {
  filename: string;
  mimeType: string;
  parentDocName: string;
  tempPath: string;
  sha: string;
  byteLength: number;
}

function readUploadBody(req: IncomingMessage, contentDir: string): Promise<UploadResult> {
  return new Promise((resolveP, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      bb = busboy({
        headers: req.headers,
        limits: { files: 1, fields: 10, fieldSize: 2 * 1024 },
      });
    } catch (err) {
      reject(new UploadWriteError('malformed-upload', err));
      return;
    }

    let settled = false;
    let filename = 'upload';
    let mimeType = '';
    let parentDocName = '';
    let tempPath: string | undefined;
    let pipelineError: unknown;
    let fileEventFired = false;

    const fail = (reason: UploadWriteReason, cause: unknown) => {
      if (settled) return;
      settled = true;
      if (tempPath) {
        try {
          unlinkSync(tempPath);
        } catch {}
      }
      reject(cause instanceof UploadWriteError ? cause : new UploadWriteError(reason, cause));
    };

    const classifyWriteError = (err: NodeJS.ErrnoException): UploadWriteReason => {
      if (err.code === 'ENOSPC' || err.code === 'EDQUOT') return 'storage-full';
      if (err.code === 'EROFS' || err.code === 'EACCES' || err.code === 'EPERM') {
        return 'storage-readonly';
      }
      return 'storage-error';
    };

    bb.on('field', (name, val) => {
      if (name === 'parentDocName') parentDocName = val;
    });

    bb.on('file', (_fieldname, file, info) => {
      fileEventFired = true;
      filename = info.filename || 'upload';
      mimeType = info.mimeType || '';

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
          const nodeErr = err as NodeJS.ErrnoException;
          fail(classifyWriteError(nodeErr), err);
        });
    });

    bb.on('error', (err) => {
      fail('malformed-upload', err);
    });

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

    req.on('close', () => {
      if (settled || pipelineError) return;
      if (!req.complete) {
        fail('malformed-upload', new Error('client disconnected'));
      }
    });

    req.pipe(bb);
  });
}

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
  const relativePath =
    kind === 'file' ? (isSupportedDocFile(path) ? path : `${path}${getDocExtension(path)}`) : path;
  const fullPath = resolve(resolvedContentDir, relativePath);

  if (fullPath !== resolvedContentDir && !fullPath.startsWith(`${resolvedContentDir}${sep}`)) {
    throw new Error('path must not escape content directory');
  }

  assertNoSymlinkEscape(fullPath, resolvedContentDir);

  return fullPath;
}

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
  serverInstanceId: string;
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
  getAliasMap?: () => ReadonlyMap<string, string>;
  enableTestRoutes?: boolean;
  shadowRef?: ShadowRef;
  flushGitCommit?: () => Promise<void>;
  getCurrentBranch?: () => string | null;
  getDiskAckSVs?: () => Record<string, string>;
  contentRoot?: string;
  backlinkIndex?: BacklinkIndex;
  tagIndex?: TagIndex;
  signalChannel?: (channel: 'files' | 'backlinks' | 'graph' | 'tags') => void;
  agentFocusBroadcaster?: AgentFocusBroadcaster;
  agentPresenceBroadcaster?: AgentPresenceBroadcaster;
  onAgentWrite?: () => void;
  getSyncEngine?: () => SyncEngine | null;
  localOpCliArgs?: string[];
  projectDir?: string;
  resolveEmbed?: (basename: string, sourcePath: string) => string | null;
  getPrincipal?: () => Principal | null;
  contentFilter?: ContentFilter;
  installedAgentsProbe?: (scheme: InstalledAgentScheme) => Promise<boolean>;
  forceUnloadDocument?: (document: Document) => Promise<void>;
}

interface WorkspaceSearchCacheEntry {
  fingerprint: string;
  corpus?: WorkspaceSearchCorpus;
  pending?: Promise<WorkspaceSearchCorpus>;
}

const workspaceSearchCaches = new Map<string, WorkspaceSearchCacheEntry>();

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
    tagIndex,
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

  const localOpGuard = createConcurrencyGuard();
  let referencedAssetsCache: {
    signature: string;
    assets: ReturnType<typeof collectReferencedAssets>;
  } | null = null;

  function referencedAssetsSignature(index: ReadonlyMap<string, FileIndexEntry>): string {
    return [...index.entries()]
      .map(
        ([docName, entry]) =>
          `${docName}\0${entry.canonicalPath}\0${entry.size}\0${entry.modified}\0${entry.aliases.join('\0')}`,
      )
      .sort()
      .join('\n');
  }

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
    } catch {}
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

  function computeOrphanHints(
    docName: string,
  ): Array<{ type: 'orphan'; parentCandidates: string[]; message: string }> | undefined {
    if (!backlinkIndex) return undefined;
    try {
      const backlinks = backlinkIndex.getBacklinks(docName);
      if (backlinks.length > 0) return undefined;
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

      const { body } = stripFrontmatter(result.markdown);
      const parseOpts = options.resolveEmbed
        ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
        : undefined;
      const parsedJson = mdManager.parseWithFallback(body, parseOpts);
      const pmNode = schema.nodeFromJSON(parsedJson);
      applyFastDiff(ytext, currentText, result.markdown);
      updateYFragment(document, xmlFragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
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

          const sourcePathRoot = resolveContentEntryPath(contentDir, kind, fromPath);
          const destinationPathRoot = resolveContentEntryPath(contentDir, kind, toPath);
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

  type SummaryResponse = { value: string; truncatedFrom?: number; hint?: string };

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

  function stripDefaultPathTruncation(response: SummaryResponse): SummaryResponse {
    return { value: response.value };
  }

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
      if (isSystemDoc(docName) || isConfigDoc(docName)) {
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
        captureEffect(session.dc.document.getText('source'), agentId, colorSeed, clientName);
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
      if (isSystemDoc(resolvedDocName) || isConfigDoc(resolvedDocName)) {
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
        captureEffect(session.dc.document.getText('source'), agentId, colorSeed, clientName);
        session.dc.document.transact(() => {
          applyAgentMarkdownWrite(
            session.dc.document,
            markdown,
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

      agentFocusBroadcaster?.setFocus(agentId, {
        agentName,
        currentDoc: resolvedDocName,
        writeKind: 'write',
        ts: Date.now(),
      });
      onAgentWrite?.();

      const hints = computeOrphanHints(resolvedDocName);

      const subscriberCount = getSubscriberCount(resolvedDocName);
      const systemSubscriberCount = getSystemSubscriberCount();

      if (systemSubscriberCount === 0) {
        hintEmittedCounter().add(1, {
          'shadow.writer': 'agent',
          'agent.type': resolveAgentType(clientName),
        });
      }

      json(res, 200, {
        ok: true,
        timestamp,
        subscriberCount,
        systemSubscriberCount,
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
      if (isSystemDoc(docName) || isConfigDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }

      const existing = hocuspocus.documents.get(docName);
      if (existing) {
        json(res, 200, { ok: true, docName, content: existing.getText('source').toString() });
        return;
      }

      const filePath = resolveContentEntryPath(contentDir, 'file', docName);
      if (!existsSync(filePath)) {
        json(res, 404, { ok: false, error: `Document not found: ${docName}` });
        return;
      }

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

      if (dir) {
        try {
          safeSubdir(contentDir, dir);
        } catch {
          json(res, 400, { ok: false, error: 'Invalid directory parameter' });
          return;
        }
      }

      const index = getFileIndex();
      const documents: {
        kind: 'document' | 'asset';
        docName: string;
        docExt: string;
        path?: string;
        assetExt?: string;
        mediaKind?: 'image' | 'video' | null;
        referencedBy?: string[];
        size: number;
        modified: string;
        isSymlink: boolean;
        canonicalDocName: string | null;
        targetPath: string | null;
      }[] = [];

      for (const [docName, entry] of index) {
        if (dir && !docName.startsWith(`${dir}/`) && docName !== dir) continue;

        const docExt = getDocExtension(docName);

        documents.push({
          kind: 'document',
          docName,
          docExt,
          size: entry.size,
          modified: entry.modified,
          isSymlink: false,
          canonicalDocName: null,
          targetPath: null,
        });

        for (const alias of entry.aliases) {
          if (dir && !alias.startsWith(`${dir}/`) && alias !== dir) continue;
          const targetRelPath = relative(contentDir, entry.canonicalPath);
          documents.push({
            kind: 'document',
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

      let assets: ReturnType<typeof collectReferencedAssets> = [];
      try {
        const assetSignature = referencedAssetsSignature(index);
        if (referencedAssetsCache?.signature !== assetSignature) {
          referencedAssetsCache = {
            signature: assetSignature,
            assets: collectReferencedAssets({
              contentDir,
              fileIndex: index,
              readMarkdown: (path) => {
                try {
                  return readFileSync(path, 'utf-8');
                } catch {
                  return null;
                }
              },
            }),
          };
        }
        assets = referencedAssetsCache?.assets ?? [];
      } catch (err) {
        referencedAssetsCache = null;
        console.warn('[document-list] asset collection failed; returning documents only:', err);
      }
      for (const asset of assets) {
        if (dir && !asset.path.startsWith(`${dir}/`) && asset.path !== dir) continue;
        documents.push({
          kind: 'asset',
          docName: asset.path,
          docExt: asset.assetExt,
          path: asset.path,
          assetExt: asset.assetExt,
          mediaKind: asset.mediaKind,
          referencedBy: asset.referencedBy,
          size: asset.size,
          modified: asset.modified,
          isSymlink: false,
          canonicalDocName: null,
          targetPath: null,
        });
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

  async function handleTagsList(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!tagIndex) {
      json(res, 503, { ok: false, error: 'Tag index not configured' });
      return;
    }
    try {
      const tags = tagIndex.getAllTags();
      json(res, 200, { ok: true, tags });
    } catch (e) {
      console.error('[tags-list]', e);
      json(res, 500, { ok: false, error: 'Failed to read tags' });
    }
  }

  async function handleTagsForName(
    req: IncomingMessage,
    res: ServerResponse,
    rawName: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!tagIndex) {
      json(res, 503, { ok: false, error: 'Tag index not configured' });
      return;
    }
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      json(res, 400, { ok: false, error: 'Invalid tag name encoding' });
      return;
    }
    if (!name) {
      json(res, 400, { ok: false, error: 'Missing tag name' });
      return;
    }
    try {
      const docs = tagIndex.getDocsForTagWithMatches(name).map(({ docName, matchingTags }) => ({
        docName,
        title: readPageTitleForDocName(docName),
        matchingTags,
        snippet: null,
      }));
      json(res, 200, { ok: true, name, docs });
    } catch (e) {
      console.error('[tags-for-name]', e);
      json(res, 500, { ok: false, error: 'Failed to read tag membership' });
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
      if (findLooksLikeFrontmatter(find)) {
        agentPatchFmTouchCounter().add(1, { result: 'rejected' });
        json(res, 400, {
          ok: false,
          error:
            'Frontmatter edits are not supported via edit_document. Frontmatter editing through MCP is currently unavailable; use write_document with position:"replace" to rewrite the document including its YAML block.',
        });
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
      if (isSystemDoc(docName) || isConfigDoc(docName)) {
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
      let fmIntersect = false;
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
        captureEffect(session.dc.document.getText('source'), agentId, colorSeed, clientName);
        session.dc.document.transact(() => {
          const ytextSnapshot = session.dc.document.getText('source').toString();
          const { frontmatter: currentFm, body: currentBody } = stripFrontmatter(ytextSnapshot);
          const currentFull = prependFrontmatter(currentFm, currentBody);

          const pos =
            offset == null
              ? currentFull.indexOf(find)
              : currentFull.slice(offset, offset + find.length) === find
                ? offset
                : -1;
          if (pos === -1) {
            console.warn(
              JSON.stringify({
                event: 'agent-patch-find-mismatch',
                'doc.name': docName,
                findLength: find.length,
                replaceLength: replace.length,
                hadOffset: offset != null,
              }),
            );
            incrementAgentPatchFindMismatches();
            if (offset == null) {
              notFound = true;
            } else {
              staleTarget = true;
            }
            return;
          }

          if (pos < currentFm.length) {
            fmIntersect = true;
            return;
          }

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
      if (fmIntersect) {
        agentPatchFmTouchCounter().add(1, { result: 'rejected' });
        json(res, 400, {
          ok: false,
          error:
            'Frontmatter edits are not supported via edit_document. Frontmatter editing through MCP is currently unavailable; use write_document with position:"replace" to rewrite the document including its YAML block.',
        });
        return;
      }

      flushDocToGit(docName, 'agent-patch');

      agentFocusBroadcaster?.setFocus(agentId, {
        agentName,
        currentDoc: docName,
        writeKind: 'edit',
        ts: Date.now(),
      });
      onAgentWrite?.();

      const subscriberCount = getSubscriberCount(docName);
      const systemSubscriberCount = getSystemSubscriberCount();

      if (systemSubscriberCount === 0) {
        hintEmittedCounter().add(1, {
          'shadow.writer': 'agent',
          'agent.type': resolveAgentType(clientName),
        });
      }

      const { response: summaryResponse } = summaryResponseFields(normalizedSummary);

      json(res, 200, {
        ok: true,
        timestamp,
        subscriberCount,
        systemSubscriberCount,
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      log.error({ err: e }, '[agent-patch] handler failed');
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

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

      const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
        extractAgentIdentity(body);

      const rawDocName =
        typeof body.docName === 'string' && body.docName.length > 0 ? body.docName : 'test-doc';
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName) || isConfigDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }

      const connectionId = typeof body.connectionId === 'string' ? body.connectionId : undefined;
      if (!connectionId) {
        json(res, 400, { ok: false, error: 'connectionId required' });
        return;
      }

      const rawScope = body.scope;
      const scope: 'last' | 'session' =
        rawScope === 'session' || rawScope === 'file' ? 'session' : 'last';

      if (!sessionManager.hasSession(docName, connectionId)) {
        json(res, 404, { ok: false, error: 'No active session for this connectionId and docName' });
        return;
      }

      const session = await sessionManager.getSession(docName, connectionId);

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
        undone = applyAgentUndo(
          session,
          scope,
          options.resolveEmbed
            ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
            : undefined,
        );
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

  async function handleAgentActivity(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const agentId = validateAgentId(url.searchParams.get('agentId'));
      if (agentId === null) {
        json(res, 400, { ok: false, error: 'agentId required (alphanumeric/_/- only)' });
        return;
      }
      const result = listAgentActivity(sessionManager, agentId);
      json(res, 200, { ok: true, ...result });
    } catch (e) {
      log.error({ err: e }, '[agent-activity] handler failed');
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleAgentBurstDiff(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const agentId = validateAgentId(url.searchParams.get('agentId'));
      const rawDocName = url.searchParams.get('docName');
      const stackIndexStr = url.searchParams.get('stackIndex');

      if (agentId === null) {
        json(res, 400, { ok: false, error: 'agentId required (alphanumeric/_/- only)' });
        return;
      }
      if (!rawDocName || rawDocName.trim() === '') {
        json(res, 400, { ok: false, error: 'docName required' });
        return;
      }
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName) || isConfigDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      if (!stackIndexStr || Number.isNaN(Number(stackIndexStr))) {
        json(res, 400, { ok: false, error: 'stackIndex must be a number' });
        return;
      }
      const stackIndex = Number(stackIndexStr);
      if (!Number.isInteger(stackIndex) || stackIndex < 0) {
        json(res, 400, { ok: false, error: 'stackIndex must be a non-negative integer' });
        return;
      }

      const session = sessionManager.getLiveSession(docName, agentId);
      if (!session) {
        json(res, 404, { ok: false, error: 'No active session for this agentId and docName' });
        return;
      }

      const um = session.um;
      if (stackIndex >= um.undoStack.length) {
        json(res, 404, {
          ok: false,
          error: `stackIndex ${stackIndex} out of range (stack has ${um.undoStack.length} items)`,
        });
        return;
      }

      // biome-ignore lint/suspicious/noExplicitAny: Y.StackItem is internal to yjs — structural shape matches YjsStackItemShape in agent-activity.ts
      const stackItem = um.undoStack[stackIndex] as any;
      const ytext = session.dc.document.getText('source');
      const diff = synthesizeStackItemDiffText(stackItem, ytext, docName);
      json(res, 200, { ok: true, diff, generatedAt: Date.now() });
    } catch (e) {
      log.error({ err: e }, '[agent-burst-diff] handler failed');
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

      let filePath: string;
      try {
        filePath = safeContentPath(docName, contentDir);
      } catch (err) {
        console.error('[test-reset] safeContentPath rejected docName:', docName, err);
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }

      await sessionManager.closeAll(docName);
      hocuspocus.closeConnections(docName);

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

      const resolvedContentRoot = contentRoot ?? '.';
      const result = await saveVersion(shadow, resolvedContentRoot, writers);

      console.log(`[history] checkpoint ${result.checkpointRef}`);

      const contributorSnapshot = swapContributors();

      let versionTag: string | undefined;
      if (projectDir) {
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
              const existing = await pg.tags(['--list', 'ok/v*']);
              const n = existing.all.length + 1;
              const tag = `ok/v${n}`;

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
                } catch {}
              }

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

              const subjectLine = formatCheckpointSubject(userMessage ?? `Checkpoint v${n}`);
              const commitMsg =
                coAuthorLines.length > 0
                  ? `${subjectLine}\n\n${coAuthorLines.join('\n')}`
                  : subjectLine;

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

      json(res, 200, { ok: true, ...result });
    } catch (e) {
      console.error('[shadow]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

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

    const resolvedContentRoot = contentRoot ?? '.';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      json(res, 400, { ok: false, error: 'Invalid commit SHA' });
      return;
    }

    try {
      try {
        await sg.raw('cat-file', '-e', `${sha}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at this version' });
        return;
      }

      const content = await sg.raw('show', `${sha}:${docPath}`);

      const logLine = (await sg.raw('log', '-1', '--format=%aI%x00%an', sha)).trim();
      const [timestamp = '', author = ''] = logLine.split('\x00');

      json(res, 200, { ok: true, sha, content, timestamp, author });
    } catch (e) {
      console.error('[shadow-version]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

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

    const resolvedContentRoot = contentRoot ?? '.';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    try {
      let toContent: string;
      try {
        toContent = await sg.raw('show', `${to}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at the target version' });
        return;
      }

      let fromContent: string;
      if (from && /^[0-9a-f]{40}$/i.test(from)) {
        try {
          fromContent = await sg.raw('show', `${from}:${docPath}`);
        } catch {
          json(res, 404, { ok: false, error: 'Document did not exist at the source version' });
          return;
        }
      } else {
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

      const fromBody = stripFrontmatter(fromContent).body;
      const toBody = stripFrontmatter(toContent).body;
      const changes = diffLines(fromBody, toBody);

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

    const bodyObj = body as Record<string, unknown>;
    const actor = extractActorIdentity(bodyObj, getPrincipal);
    if (actor.kind === 'invalid-summary') {
      json(res, 400, { ok: false, error: 'summary must be a string' });
      return;
    }

    const { docName: rawDocName, commitSha: rawSha, versionTag: rawVersionTag } = bodyObj;
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

    const resolvedContentRoot = contentRoot ?? '.';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    const t0 = Date.now();
    try {
      try {
        await sg.raw('cat-file', '-e', `${commitSha}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at this version' });
        return;
      }

      const markdown = await sg.raw('show', `${commitSha}:${docPath}`);
      const timestamp = new Date().toISOString();

      await safetyCheckpoint(shadow, resolvedContentRoot, {
        action: 'rollback',
        context: { docName, targetSha: commitSha },
      });

      const document = hocuspocus.documents.get(docName);
      if (!document) {
        json(res, 409, {
          ok: false,
          error: 'Document is not currently open — open it in the editor first',
        });
        return;
      }

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

        const ytext = document.getText('source');
        const currentText = ytext.toString();
        if (currentText !== markdown) {
          ytext.delete(0, currentText.length);
          ytext.insert(0, markdown);
        }
      }, ROLLBACK_ORIGIN);

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

      flushDocToGit(docName, 'rollback');

      const duration = Date.now() - t0;
      console.log(
        `[rollback] docName=${docName} from=${commitSha.slice(0, 8)} duration=${duration}ms`,
      );

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

      if (actor.kind === 'agent') {
        agentFocusBroadcaster?.setFocus(actor.writerId, {
          agentName: actor.displayName,
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
      const message = e instanceof Error ? e.message : 'Failed to roll back document';
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

  async function handleServerInfo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    const currentBranch = getActiveBranch();
    const currentDiskAckSVs = getDiskAckSVs?.();
    json(
      res,
      200,
      {
        ok: true,
        serverInstanceId,
        currentBranch,
        ...(currentDiskAckSVs !== undefined ? { currentDiskAckSVs } : {}),
      },
      { 'Cache-Control': 'no-store' },
    );
  }

  async function handlePrincipal(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    json(res, 200, {
      ok: true,
      contentDir: resolvedContentDir,
      pathSeparator: sep,
      symlinkResolved,
    });
  }

  async function handleAsset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const assetPath = url.searchParams.get('path');
      if (!assetPath || assetPath.includes('\0')) {
        json(res, 400, { ok: false, error: 'Missing asset path' });
        return;
      }
      const contentType = assetContentTypeForPath(assetPath);
      const assetExt = extname(assetPath).slice(1).toLowerCase();
      if (!contentType || !ASSET_EXTENSIONS.has(assetExt)) {
        json(res, 415, { ok: false, error: 'Unsupported asset type' });
        return;
      }
      const resolvedContentDir = realpathSync(contentDir);
      const requestedPath = resolve(resolvedContentDir, assetPath);
      let canonicalPath: string;
      try {
        canonicalPath = realpathSync(requestedPath);
      } catch {
        json(res, 404, { ok: false, error: 'Asset not found' });
        return;
      }
      if (!isWithinContentDir(canonicalPath, resolvedContentDir)) {
        json(res, 400, { ok: false, error: 'Invalid asset path' });
        return;
      }
      let stat: ReturnType<typeof statSync>;
      try {
        stat = statSync(canonicalPath);
      } catch {
        json(res, 404, { ok: false, error: 'Asset not found' });
        return;
      }
      if (!stat.isFile()) {
        json(res, 404, { ok: false, error: 'Asset not found' });
        return;
      }
      const relativePath = toContentRelativePath(resolvedContentDir, canonicalPath);
      if (relativePath !== assetPath.split('\\').join('/')) {
        json(res, 400, { ok: false, error: 'Invalid asset path' });
        return;
      }
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': INLINE_RENDERABLE_EXTENSIONS.has(assetExt) ? 'inline' : 'attachment',
        'Cache-Control': 'no-store',
      };
      if (assetExt === 'svg') {
        headers['Content-Security-Policy'] =
          "sandbox; default-src 'none'; style-src 'unsafe-inline'";
      }
      res.writeHead(200, headers);
      try {
        await pipeline(createReadStream(canonicalPath), res);
      } catch (streamError) {
        console.error('[asset]', streamError);
        if (!res.headersSent) {
          json(res, 500, { ok: false, error: 'Failed to read asset' });
        } else if (!res.destroyed) {
          res.destroy(streamError instanceof Error ? streamError : undefined);
        }
      }
    } catch (err) {
      console.error('[asset]', err);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

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
        } catch {}
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

    try {
      const branch = getCurrentBranch?.() ?? 'main';
      const timelineEntries = await listRescueCheckpoints(shadowRef.current, branch);
      const match = timelineEntries
        .filter((e) => e.docName === docName)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      if (match) {
        const sg = shadowGit(shadowRef.current);
        const tree = (await sg.raw('ls-tree', '-r', match.sha)).trim();
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
      const actor = extractActorIdentity(body as Record<string, unknown>, getPrincipal);
      if (actor.kind === 'invalid-summary') {
        json(res, 400, { ok: false, error: 'summary must be a string' });
        return;
      }
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
      if (isSystemDoc(candidateDocName) || isConfigDoc(candidateDocName)) {
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

      const bodyObj = body as Record<string, unknown>;
      const actor = extractActorIdentity(bodyObj, getPrincipal);
      if (actor.kind === 'invalid-summary') {
        json(res, 400, { ok: false, error: 'summary must be a string' });
        return;
      }
      const { kind, fromPath, toPath } = bodyObj;
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
      if (
        kind === 'file' &&
        (isSystemDoc(fromPath) ||
          isSystemDoc(toPath) ||
          isConfigDoc(fromPath) ||
          isConfigDoc(toPath))
      ) {
        json(res, 400, { ok: false, error: 'Reserved document names cannot be renamed' });
        return;
      }
      if (
        fromPath === '.ok' ||
        fromPath.startsWith('.ok/') ||
        toPath === '.ok' ||
        toPath.startsWith('.ok/')
      ) {
        json(res, 400, { ok: false, error: '.ok is a reserved directory' });
        return;
      }
      if (fromPath === toPath) {
        json(res, 200, { ok: true, renamed: [], rewrittenDocs: [] });
        return;
      }
      if (fromPath.toLowerCase() === toPath.toLowerCase()) {
        json(res, 400, { ok: false, error: 'Case-only renames are not supported' });
        return;
      }

      if (kind === 'file') {
        probeAndRegisterSourceFileExtension(contentDir, fromPath);
      }

      if (contentFilter) {
        const excluded =
          kind === 'file'
            ? contentFilter.isExcluded(
                isSupportedDocFile(toPath) ? toPath : `${toPath}${getDocExtension(fromPath)}`,
              )
            : contentFilter.isDirExcluded(toPath);
        if (excluded) {
          json(res, 400, {
            ok: false,
            error: `Destination ${kind === 'file' ? 'document' : 'folder'} is excluded by the workspace content config`,
          });
          return;
        }
      }

      let result: { renamed: RenamedDocMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] };
      try {
        result = await _performManagedRenameForDocs(fromPath, toPath, kind);
      } catch (err) {
        if (err instanceof ManagedRenameCollisionError) {
          json(res, 409, {
            ok: false,
            error: err.message,
            colliding: err.colliding,
          });
          return;
        }
        throw err;
      }

      if (result.renamed.length === 0) {
        json(res, 200, { ok: true, renamed: [], rewrittenDocs: [] });
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
        ok: true,
        renamed: result.renamed,
        rewrittenDocs: result.rewrittenDocs,
        ...(summaryResponse ? { summary: summaryResponse } : {}),
      });
    } catch (e) {
      console.error('[rename-path]', e);
      const { status, error } = toManagedRenamePublicError(e);
      json(res, status, { ok: false, error });
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

  function validateFolderRel(
    raw: string,
    res: ServerResponse,
    label: 'path' | 'folder' = 'path',
  ): { folderRel: string; resolvedContentDir: string } | null {
    const folderRel = raw.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (folderRel.split('/').some((seg) => seg === '..') || raw.startsWith('/')) {
      json(res, 400, { ok: false, error: `Invalid ${label}: must be project-root-relative` });
      return null;
    }
    const resolvedContentDir = resolve(contentDir);
    const candidateAbs =
      folderRel === '' ? resolvedContentDir : resolve(resolvedContentDir, folderRel);
    if (
      candidateAbs !== resolvedContentDir &&
      !candidateAbs.startsWith(`${resolvedContentDir}${sep}`)
    ) {
      json(res, 400, { ok: false, error: 'Path escapes content directory' });
      return null;
    }
    return { folderRel, resolvedContentDir };
  }

  const TEMPLATE_NAME_RE = /^[A-Za-z0-9_-]+$/;
  function validateTemplateName(name: string, res: ServerResponse): boolean {
    if (!name || !TEMPLATE_NAME_RE.test(name)) {
      json(res, 400, {
        ok: false,
        error: 'Invalid name: must be letters / digits / `_` / `-` only (no `.md` extension).',
      });
      return false;
    }
    return true;
  }

  function pickFrontmatterFields(raw: unknown): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === undefined) continue;
      out[key] = value;
    }
    return out;
  }

  async function handleFolderConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      return handleFolderConfigGet(req, res);
    }
    if (req.method === 'PUT') {
      return handleFolderConfigPut(req, res);
    }
    json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  async function handleFolderConfigGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const validated = validateFolderRel(url.searchParams.get('path') ?? '', res);
      if (!validated) return;
      const meta = await enrichDirectory(validated.folderRel, {
        projectDir: validated.resolvedContentDir,
      });
      const localFmPath = resolve(
        validated.resolvedContentDir,
        validated.folderRel,
        '.ok',
        'frontmatter.yml',
      );
      let frontmatterLocal: Record<string, unknown> | null = null;
      if (existsSync(localFmPath)) {
        try {
          const raw = await readFile(localFmPath, 'utf-8');
          const parsed = parseYaml(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatterLocal = parsed as Record<string, unknown>;
          } else {
            frontmatterLocal = {};
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          console.warn(`[folder-config:get] malformed YAML in ${localFmPath}: ${reason}`);
          frontmatterLocal = null;
        }
      }
      json(res, 200, { ok: true, folder: meta, frontmatter_local: frontmatterLocal });
    } catch (error) {
      console.error('[folder-config:get]', error);
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'internal error',
      });
    }
  }

  async function handleFolderConfigPut(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const raw = (await readBody(req)).toString('utf-8');
      const parsed = JSON.parse(raw) as {
        path?: unknown;
        frontmatter?: unknown;
      };
      const validated = validateFolderRel(typeof parsed.path === 'string' ? parsed.path : '', res);
      if (!validated) return;

      const match = validated.folderRel === '' ? '**' : `${validated.folderRel}/**`;
      const result = applyNestedFolderRulesUpsert({
        projectDir: validated.resolvedContentDir,
        rules: [{ match, frontmatter: pickFrontmatterFields(parsed.frontmatter) }],
      });

      if (!result.ok) {
        const status =
          result.error.code === 'WRITE_ERROR' || result.error.code === 'BAD_PROJECT_DIR'
            ? 500
            : 400;
        json(res, status, {
          ok: false,
          error: { code: result.error.code, message: result.error.message },
        });
        return;
      }

      json(res, 200, { ok: true, applied: result.applied });
    } catch (error) {
      console.error('[folder-config:put]', error);
      const status = error instanceof SyntaxError ? 400 : 500;
      json(res, status, {
        ok: false,
        error: error instanceof Error ? error.message : 'internal error',
      });
    }
  }

  async function handleTemplate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      return handleTemplateGet(req, res);
    }
    if (req.method === 'PUT') {
      return handleTemplatePut(req, res);
    }
    if (req.method === 'DELETE') {
      return handleTemplateDelete(req, res);
    }
    json(res, 405, { ok: false, error: 'Method not allowed' });
  }

  async function handleTemplateGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const name = url.searchParams.get('name') ?? '';
      if (!validateTemplateName(name, res)) return;
      const validated = validateFolderRel(url.searchParams.get('folder') ?? '', res, 'folder');
      if (!validated) return;
      const { folderRel, resolvedContentDir } = validated;

      const segments = folderRel === '' ? [] : folderRel.split('/');
      let foundAbs: string | null = null;
      let foundFolder: string | null = null;
      let foundScope: 'local' | 'inherited' | null = null;

      for (let depth = segments.length; depth >= 0; depth--) {
        const ancestorFolder = depth === 0 ? '' : segments.slice(0, depth).join('/');
        const ancestorAbs =
          ancestorFolder === '' ? resolvedContentDir : resolve(resolvedContentDir, ancestorFolder);
        if (
          ancestorAbs !== resolvedContentDir &&
          !ancestorAbs.startsWith(`${resolvedContentDir}${sep}`)
        ) {
          continue;
        }
        const candidate = resolve(ancestorAbs, '.ok', 'templates', `${name}.md`);
        if (existsSync(candidate)) {
          foundAbs = candidate;
          foundFolder = ancestorFolder;
          foundScope = depth === segments.length ? 'local' : 'inherited';
          break;
        }
      }

      if (!foundAbs || foundFolder === null || foundScope === null) {
        json(res, 404, {
          ok: false,
          error: `Template "${name}" not found for folder "${folderRel || '.'}". Walked leaf → root.`,
        });
        return;
      }

      const raw = await readFile(foundAbs, 'utf-8');
      const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
      const match = raw.match(FRONTMATTER_RE);
      let frontmatter: Record<string, unknown> = {};
      let body = raw;
      if (match) {
        try {
          const parsed = parseYaml(match[1]);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatter = parsed as Record<string, unknown>;
          }
        } catch {}
        body = raw.slice(match[0].length);
      }

      const relPath = relative(resolvedContentDir, foundAbs)
        .split(/[\\/]/)
        .filter(Boolean)
        .join('/');

      json(res, 200, {
        ok: true,
        template: {
          name,
          folder: foundFolder,
          scope: foundScope,
          path: relPath,
          frontmatter,
          body,
        },
      });
    } catch (error) {
      console.error('[template:get]', error);
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'internal error',
      });
    }
  }

  async function handleTemplatePut(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const raw = (await readBody(req)).toString('utf-8');
      const parsed = JSON.parse(raw) as {
        folder?: unknown;
        name?: unknown;
        body?: unknown;
        frontmatter?: unknown;
      };
      const name = typeof parsed.name === 'string' ? parsed.name : '';
      if (!validateTemplateName(name, res)) return;
      const validated = validateFolderRel(
        typeof parsed.folder === 'string' ? parsed.folder : '',
        res,
        'folder',
      );
      if (!validated) return;

      const result = applyTemplateWrite({
        projectDir: validated.resolvedContentDir,
        folder: validated.folderRel,
        name,
        body: typeof parsed.body === 'string' ? parsed.body : '',
        frontmatter: pickFrontmatterFields(parsed.frontmatter) satisfies TemplateFrontmatter,
      });
      if (!result.ok) {
        const status =
          result.error.code === 'WRITE_ERROR' || result.error.code === 'BAD_PROJECT_DIR'
            ? 500
            : 400;
        json(res, status, {
          ok: false,
          error: { code: result.error.code, message: result.error.message },
        });
        return;
      }
      json(res, 200, {
        ok: true,
        path: result.path,
        created: result.created,
        warnings: result.warnings,
      });
    } catch (error) {
      console.error('[template:put]', error);
      const status = error instanceof SyntaxError ? 400 : 500;
      json(res, status, {
        ok: false,
        error: error instanceof Error ? error.message : 'internal error',
      });
    }
  }

  async function handleTemplateDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const name = url.searchParams.get('name') ?? '';
      if (!validateTemplateName(name, res)) return;
      const validated = validateFolderRel(url.searchParams.get('folder') ?? '', res, 'folder');
      if (!validated) return;

      const result = applyTemplateDelete({
        projectDir: validated.resolvedContentDir,
        folder: validated.folderRel,
        name,
      });
      if (!result.ok) {
        const status =
          result.error.code === 'WRITE_ERROR' || result.error.code === 'BAD_PROJECT_DIR'
            ? 500
            : 400;
        json(res, status, {
          ok: false,
          error: { code: result.error.code, message: result.error.message },
        });
        return;
      }
      json(res, 200, { ok: true, existed: result.existed, path: result.path });
    } catch (error) {
      console.error('[template:delete]', error);
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'internal error',
      });
    }
  }

  function deriveFolderSearchDocuments(
    pages: readonly WorkspaceSearchDocument[],
  ): WorkspaceSearchDocument[] {
    const folderModified = new Map<string, number>();
    for (const page of pages) {
      const segments = page.path.split('/').filter(Boolean);
      segments.pop();
      for (let i = 1; i <= segments.length; i++) {
        const folderPath = segments.slice(0, i).join('/');
        folderModified.set(
          folderPath,
          Math.max(folderModified.get(folderPath) ?? 0, page.modifiedTs),
        );
      }
    }
    return [...folderModified.entries()].map(([path, modifiedTs]) =>
      createWorkspaceSearchDocument({ kind: 'folder', path, modifiedTs }),
    );
  }

  function buildSearchSnippet(content: string, query: string): string | undefined {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery || !content) return undefined;
    const normalizedContent = content.toLowerCase();
    const index = normalizedContent.indexOf(normalizedQuery);
    if (index < 0) return undefined;
    const start = Math.max(0, index - 80);
    const end = Math.min(content.length, index + normalizedQuery.length + 120);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < content.length ? '...' : '';
    return `${prefix}${content.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
  }

  function parseSearchIntent(value: unknown): WorkspaceSearchIntent {
    if (value === 'autocomplete' || value === 'full_text' || value === 'omnibar') return value;
    return 'omnibar';
  }

  function parseSearchScopes(value: unknown): WorkspaceSearchScope[] | undefined {
    const rawScopes =
      typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : undefined;
    if (!rawScopes) return undefined;
    const scopes = rawScopes.filter(
      (scope): scope is WorkspaceSearchScope =>
        scope === 'page' || scope === 'folder' || scope === 'content',
    );
    return scopes.length > 0 ? scopes : undefined;
  }

  class SearchRequestError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }

  async function readSearchRequest(req: IncomingMessage): Promise<{
    query: string;
    intent: WorkspaceSearchIntent;
    scopes?: WorkspaceSearchScope[];
    limit?: number;
  }> {
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '', 'http://localhost');
      const limit = url.searchParams.get('limit');
      return {
        query: url.searchParams.get('query') ?? '',
        intent: parseSearchIntent(url.searchParams.get('intent')),
        scopes: parseSearchScopes(url.searchParams.get('scope') ?? url.searchParams.get('scopes')),
        limit: limit === null ? undefined : Number(limit),
      };
    }

    let body: Buffer;
    try {
      body = await readBody(req);
    } catch {
      throw new SearchRequestError(413, 'Payload too large');
    }

    let parsed: {
      query?: unknown;
      intent?: unknown;
      scope?: unknown;
      scopes?: unknown;
      limit?: unknown;
    };
    try {
      const value = JSON.parse(body.toString()) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new SearchRequestError(400, 'Invalid JSON body');
      }
      parsed = value as typeof parsed;
    } catch (err) {
      if (err instanceof SearchRequestError) throw err;
      throw new SearchRequestError(400, 'Invalid JSON body');
    }
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      intent: parseSearchIntent(parsed.intent),
      scopes: parseSearchScopes(parsed.scopes ?? parsed.scope),
      limit: typeof parsed.limit === 'number' ? parsed.limit : Number(parsed.limit),
    };
  }

  async function buildWorkspaceSearchDocumentsFromIndex(): Promise<WorkspaceSearchDocument[]> {
    const pages: WorkspaceSearchDocument[] = [];
    for (const [docName, entry] of getFileIndex()) {
      if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
      let content = '';
      let title = docName;
      try {
        content = await readFile(entry.canonicalPath, 'utf-8');
        title = extractPageTitle(content, docName);
      } catch (err) {
        console.warn(`[search] Failed to index ${docName}:`, err);
      }
      pages.push(
        createWorkspaceSearchDocument({
          kind: 'page',
          path: docName,
          title,
          content,
          modifiedTs: Date.parse(entry.modified),
        }),
      );
    }
    return [...pages, ...deriveFolderSearchDocuments(pages)];
  }

  function workspaceSearchFingerprint(): string {
    return [...getFileIndex()]
      .filter(([docName]) => !isSystemDoc(docName) && !isConfigDoc(docName))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([docName, entry]) =>
          `${docName}\u0000${entry.modified}\u0000${entry.size}\u0000${entry.canonicalPath}\u0000${entry.inode}\u0000${entry.aliases.join(',')}`,
      )
      .join('\u0001');
  }

  async function getWorkspaceSearchCorpus(): Promise<WorkspaceSearchCorpus> {
    const cacheKey = `${contentDir}\u0000${projectDir ?? ''}`;
    const fingerprint = workspaceSearchFingerprint();
    const workspaceSearchCache = workspaceSearchCaches.get(cacheKey);
    if (workspaceSearchCache?.fingerprint === fingerprint && workspaceSearchCache.corpus) {
      return workspaceSearchCache.corpus;
    }
    if (workspaceSearchCache?.fingerprint === fingerprint && workspaceSearchCache.pending) {
      return workspaceSearchCache.pending;
    }

    const pending = buildWorkspaceSearchDocumentsFromIndex().then((documents) =>
      createWorkspaceSearchCorpus(documents),
    );
    workspaceSearchCaches.set(cacheKey, { fingerprint, pending });
    try {
      const corpus = await pending;
      if (workspaceSearchCaches.get(cacheKey)?.pending === pending) {
        workspaceSearchCaches.set(cacheKey, { fingerprint, corpus });
      }
      return corpus;
    } catch (err) {
      if (workspaceSearchCaches.get(cacheKey)?.pending === pending) {
        workspaceSearchCaches.delete(cacheKey);
      }
      throw err;
    }
  }

  function prewarmWorkspaceSearchCache(): void {
    if (process.env.NODE_ENV === 'test') return;
    for (const delayMs of [0, 1000, 3000]) {
      setTimeout(() => {
        void getWorkspaceSearchCorpus().catch((err) => {
          console.warn('[search] Failed to prewarm workspace search cache:', err);
        });
      }, delayMs);
    }
  }

  prewarmWorkspaceSearchCache();

  async function handleSearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const startedAt = performance.now();
      const request = await readSearchRequest(req);
      if (request.query.length > 200) {
        json(res, 400, { ok: false, error: 'Query is too long' });
        return;
      }
      const corpus = await getWorkspaceSearchCorpus();
      const results = searchWorkspaceCorpus(corpus, request.query, {
        intent: request.intent,
        scopes: request.scopes,
        limit: request.limit,
      });
      json(res, 200, {
        ok: true,
        query: request.query,
        intent: request.intent,
        results: results.map((result) => ({
          kind: result.document.kind,
          path: result.document.path,
          title: result.document.title,
          score: result.score,
          signals: result.signals,
          snippet:
            result.document.kind === 'page'
              ? buildSearchSnippet(result.document.content, request.query)
              : undefined,
        })),
        elapsedMs: Math.max(0, performance.now() - startedAt),
      });
    } catch (err) {
      if (err instanceof SearchRequestError) {
        json(res, err.status, { ok: false, error: err.message });
        return;
      }
      console.error('[search]', err);
      json(res, 500, { ok: false, error: 'Failed to search workspace' });
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
      if (isSystemDoc(docName) || isConfigDoc(docName)) {
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
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let uploadResult: UploadResult | undefined;
    try {
      uploadResult = await readUploadBody(req, contentDir);
    } catch (e) {
      if (e instanceof UploadWriteError) {
        if (e.reason === 'malformed-upload') {
          json(res, 400, { ok: false, error: 'malformed-upload' });
          return;
        }
        if (e.reason === 'storage-full') {
          json(res, 507, { ok: false, error: 'storage-full' });
          return;
        }
        if (e.reason === 'storage-readonly') {
          json(res, 500, { ok: false, error: 'storage-readonly' });
          return;
        }
        json(res, 500, { ok: false, error: 'storage-error' });
        return;
      }
      const message = e instanceof Error ? e.message : String(e);
      json(res, 400, { ok: false, error: `Failed to parse upload: ${message}` });
      return;
    }

    const { filename, tempPath, sha, byteLength, parentDocName } = uploadResult;

    const { agentId, agentName } = extractAgentIdentity(
      Object.fromEntries(new URL(req.url ?? '', 'http://localhost').searchParams.entries()),
    );

    const cleanupTempfile = () => {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {}
      }
    };

    if (byteLength === 0) {
      cleanupTempfile();
      json(res, 400, { ok: false, error: 'No file received' });
      return;
    }

    if (!parentDocName) {
      cleanupTempfile();
      json(res, 400, { ok: false, error: 'parentDocName is required' });
      return;
    }

    if (
      parentDocName.includes('\x00') ||
      parentDocName.includes('..') ||
      parentDocName.startsWith('/')
    ) {
      cleanupTempfile();
      json(res, 400, { ok: false, error: 'path-escape' });
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
      json(res, 400, { ok: false, error: 'path-escape' });
      return;
    }
    try {
      mkdirSync(destDir, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        cleanupTempfile();
        log.error({ err, destDir }, '[upload] failed to create attachment directory');
        json(res, 500, { ok: false, error: 'storage-error' });
        return;
      }
    }

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
        json(res, 400, { ok: false, error: 'path-escape' });
        return;
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
      } else {
        cleanupTempfile();
        json(res, 400, { ok: false, error: 'path-escape' });
        return;
      }
    }

    const fileTypeResult = await fileTypeFromFile(tempPath);
    let detectedMime: string | undefined = fileTypeResult?.mime;
    let detectedExt: string | undefined = fileTypeResult?.ext;
    if (!detectedMime) {
      const head = readTempFileHead(tempPath, 256);
      const headText = head.toString('utf-8').replace(/^﻿/, '').trimStart();
      if (
        headText.startsWith('<svg') ||
        (headText.startsWith('<?xml') && headText.includes('<svg'))
      ) {
        detectedMime = 'image/svg+xml';
        detectedExt = 'svg';
      }
    }

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
        json(res, 200, { ok: true, src: existing, path: relPath, deduped: true });
        return;
      }
    }

    let finalFilename: string;
    const isGenericPaste = !filename || filename === 'upload' || GENERIC_PASTE_NAMES.test(filename);
    if (isGenericPaste) {
      const now = new Date();
      const ts = now
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14)
        .replace(/(\d{8})(\d{6})/, '$1-$2');
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
          destPath: relPath,
          httpStatus: 200,
        },
        '[upload] write ok',
      );
      json(res, 200, { ok: true, src: destFilename, path: relPath, deduped: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const reason = e instanceof UploadWriteError ? e.reason : 'unknown';
      log.error(
        {
          event: 'upload',
          endpoint: req.url ?? '/api/upload',
          agentId,
          agentName,
          filename: finalFilename,
          size: byteLength,
          reason,
          message,
          httpStatus: e instanceof UploadWriteError && e.reason === 'storage-full' ? 507 : 500,
        },
        '[upload] write failed',
      );
      if (e instanceof UploadWriteError) {
        if (e.reason === 'storage-full') {
          json(res, 507, { ok: false, error: 'storage-full' });
          return;
        }
        if (e.reason === 'storage-readonly') {
          json(res, 500, { ok: false, error: 'storage-readonly' });
          return;
        }
        if (e.reason === 'collision-exhaustion') {
          json(res, 500, { ok: false, error: 'collision-exhaustion' });
          return;
        }
        json(res, 500, { ok: false, error: 'storage-error' });
        return;
      }
      json(res, 500, { ok: false, error: 'storage-error' });
    }
  }

  const LOCAL_OP_CLONE_KEY = '/api/local-op/clone';
  const LOCAL_OP_OPEN_KEY = '/api/local-op/open';
  const LOCAL_OP_TIMEOUT_MS = 10 * 60 * 1000;
  const LOCAL_OP_OPEN_TIMEOUT_MS = 45_000;

  async function handleLocalOpClone(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

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

    if (!isAllowedGitUrl(url)) {
      json(res, 400, { ok: false, error: 'URL protocol not allowed' });
      return;
    }

    if (!isSafeLocalPath(dir)) {
      json(res, 400, {
        ok: false,
        error: 'dir must be within the user home directory',
      });
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_CLONE_KEY)) {
      json(res, 429, { ok: false, error: 'A clone operation is already in progress' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    let cloneCompleteDir: string | null = null;

    const flow = runCloneSubprocess({
      cliArgs: localOpCliArgs,
      url,
      dir,
      timeoutMs: LOCAL_OP_TIMEOUT_MS,
      onEvent: (event) => {
        if (event.type === 'complete') {
          cloneCompleteDir = event.dir;
          return;
        }
        if (event.type === 'error') {
          if (event.message) {
            log.warn({ stderr: event.message, url, dir }, '[local-op/clone] clone failed');
          }
        }
        if (!res.writableEnded) {
          res.write(`${JSON.stringify(event)}\n`);
        }
      },
    });

    void (async () => {
      try {
        await flow.done;
        if (cloneCompleteDir && !res.writableEnded) {
          const result = await startServerAtDirAndGetPort(cloneCompleteDir);
          if (!res.writableEnded) {
            if ('port' in result) {
              res.write(
                `${JSON.stringify({ type: 'complete', port: result.port, dir: cloneCompleteDir })}\n`,
              );
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

    res.on('close', () => {
      flow.cancel();
    });
  }

  async function startServerAtDirAndGetPort(
    dir: string,
  ): Promise<{ port: number } | { error: string }> {
    const absDir = resolve(expandTilde(dir));
    const lockDir = resolve(absDir, '.ok');

    const existingUi = readUiLock(lockDir);
    if (existingUi && existingUi.port > 0) {
      return { port: existingUi.port };
    }

    const existingServer = readServerLock(lockDir);
    const [cmd, ...baseArgs] = localOpCliArgs;
    const cliCmd = existingServer && existingServer.port > 0 ? 'ui' : 'start';
    const spawnArgs = [...baseArgs, cliCmd];
    const child = spawn(cmd, spawnArgs, {
      cwd: absDir,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
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

    if (!isSafeLocalPath(dir)) {
      json(res, 400, {
        ok: false,
        error: 'dir must be within the user home directory',
      });
      return;
    }

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

  const LOCAL_OP_AUTH_LOGIN_KEY = '/api/local-op/auth/login';
  const LOCAL_OP_AUTH_STATUS_KEY = '/api/local-op/auth/status';
  const LOCAL_OP_AUTH_REPOS_KEY = '/api/local-op/auth/repos';
  const LOCAL_OP_AUTH_SIGNOUT_KEY = '/api/local-op/auth/signout';
  const LOCAL_OP_AUTH_PAT_KEY = '/api/local-op/auth/pat';

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

    const flow = runDeviceFlowSubprocess({
      cliArgs: localOpCliArgs,
      host,
      timeoutMs: LOCAL_OP_TIMEOUT_MS,
      onEvent: (event: AuthEvent) => {
        if (!res.writableEnded) {
          res.write(`${JSON.stringify(event)}\n`);
        }
      },
    });

    const onClientClose = () => {
      flow.cancel();
    };
    res.on('close', onClientClose);

    void flow.done.finally(() => {
      res.off('close', onClientClose);
      if (!res.writableEnded) res.end();
      localOpGuard.release(LOCAL_OP_AUTH_LOGIN_KEY);
    });
  }

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

      const lines = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let parsed: unknown = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          parsed = JSON.parse(lines[i] as string);
          break;
        } catch {}
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

      const lines = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let parsed: unknown = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          parsed = JSON.parse(lines[i] as string);
          break;
        } catch {}
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
      const identity = await resolveGitIdentity(projectDir);
      json(res, 200, { ok: true, identity });
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : 'identity resolution failed',
      });
    }
  }

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
      void getSyncEngine?.()
        ?.refreshIdentity()
        .catch(() => {});
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

  async function handleSyncStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const engine = getSyncEngine?.();
    if (!engine) {
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
    } catch {}
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
    if (file.includes('..') || file.startsWith('/')) {
      json(res, 400, { ok: false, error: 'Invalid file path' });
      return;
    }
    const pg = simpleGit({ baseDir: projectDir, timeout: { block: 15_000 } });
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

  async function handleSeedPlan(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const rootDir = url.searchParams.get('rootDir') ?? undefined;
    try {
      const plan = await planSeed({ projectDir: contentDir, rootDir });
      json(res, 200, { ok: true, plan });
    } catch (err) {
      if (err instanceof SeedPrerequisiteError) {
        json(res, 200, {
          ok: false,
          error: { kind: 'prerequisite-missing', message: err.message },
        });
        return;
      }
      if (err instanceof SeedRootDirError) {
        json(res, 200, {
          ok: false,
          error: { kind: 'invalid-root', message: err.message },
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: { kind: 'internal', message } });
    }
  }

  async function handleSeedApply(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    let plan: ScaffoldPlan;
    try {
      const body = await readBody(req);
      const parsed = JSON.parse(body.toString()) as { plan?: unknown };
      if (!parsed.plan || typeof parsed.plan !== 'object') {
        json(res, 400, { ok: false, error: 'Missing or invalid plan' });
        return;
      }
      plan = parsed.plan as ScaffoldPlan;
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    try {
      const result = await applySeed(plan, { projectDir: contentDir });
      json(res, 200, { ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: { kind: 'internal', message } });
    }
  }

  async function handleInstallSkill(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    const opts: { noOpen?: boolean; out?: string; force?: boolean } = {};
    try {
      const raw = await readBody(req);
      if (raw.length > 0) {
        const parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (typeof parsed.noOpen === 'boolean') opts.noOpen = parsed.noOpen;
        if (typeof parsed.force === 'boolean') opts.force = parsed.force;
        if (typeof parsed.out === 'string') {
          if (!isSafeLocalPath(parsed.out)) {
            json(res, 400, {
              ok: false,
              error: 'Output path must be within home directory',
            });
            return;
          }
          opts.out = parsed.out;
        }
      }
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    try {
      const result = await buildAndOpenSkill(opts);
      json(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: { kind: 'internal', message } });
    }
  }

  async function handleSkillInstallState(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, json)) return;
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const snapshot = await readSkillInstallStateSnapshot(homedir());
      json(res, 200, { ok: true, ...snapshot }, { 'Cache-Control': 'no-store' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { ok: false, error: { kind: 'internal', message } });
    }
  }

  async function handleInstalledAgentsRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
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
    '/api/tags': handleTagsList,
    '/api/pages': handlePages,
    '/api/folder-config': handleFolderConfig,
    '/api/template': handleTemplate,
    '/api/search': handleSearch,
    '/api/suggest-links': handleSuggestLinks,
    '/api/page-headings': handlePageHeadings,
    '/api/create-page': handleCreatePage,
    '/api/rename-path': handleRenamePath,
    '/api/delete-path': handleDeletePath,
    '/api/upload': handleUploadImage,
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
    '/api/asset': handleAsset,
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
    '/api/skill/install-state': handleSkillInstallState,
    '/api/seed/plan': handleSeedPlan,
    '/api/seed/apply': handleSeedApply,
  };

  if (enableTestRoutes) {
    routes['/api/test-reset'] = handleTestReset;
    routes['/api/test-rescan-backlinks'] = handleTestRescanBacklinks;
  }

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
    '/api/folder-config',
    '/api/template',
  ]);
  const STATE_MUTATING_PREFIXES: ReadonlyArray<string> = ['/api/local-op/'];

  return {
    priority: 100, // Higher priority — API routes run before static file serving
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
      const url = request.url?.split('?')[0];
      if (!url) return;

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
          response.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, traceparent, tracestate, baggage',
          );
        }
        if (request.method === 'OPTIONS') {
          response.writeHead(204);
          response.end();
          return;
        }
      }

      if (MUTATING_ROUTES.has(url) || STATE_MUTATING_PREFIXES.some((p) => url.startsWith(p))) {
        const peerAddress = request.socket?.remoteAddress;
        if (peerAddress !== undefined && !isLoopbackAddress(peerAddress)) {
          json(response, 403, { ok: false, error: 'loopback-required' });
          return;
        }
        if (!isAllowedWorkspaceHostHeader(request.headers.host)) {
          json(response, 403, { ok: false, error: 'host-header-not-allowed' });
          return;
        }
      }

      if (!url.startsWith('/api/')) return;

      const extractedCtx = propagation.extract(context.active(), request.headers);
      const method = request.method ?? 'GET';
      let routeTemplate = url;
      if (url.startsWith('/api/rescue/')) routeTemplate = '/api/rescue/:docName';
      else if (url.startsWith('/api/history/')) routeTemplate = '/api/history/:sha';
      else if (url.startsWith('/api/tags/')) routeTemplate = '/api/tags/:name';

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
              const handler = routes[url];
              if (handler) {
                await handler(request, response);
              } else if (url.startsWith('/api/rescue/')) {
                const docName = decodeURIComponent(url.slice('/api/rescue/'.length));
                if (docName) await handleRescueGet(request, response, docName);
              } else if (url.startsWith('/api/history/')) {
                const sha = decodeURIComponent(url.slice('/api/history/'.length));
                if (sha) await handleHistoryVersion(request, response, sha);
              } else if (url.startsWith('/api/tags/')) {
                const rawName = url.slice('/api/tags/'.length);
                if (rawName) await handleTagsForName(request, response, rawName);
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
