import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { setTimeout as wait } from 'node:timers/promises';
import type { Document, Extension, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_ICON_COLORS,
  AgentActivitySuccessSchema,
  AgentBurstDiffSuccessSchema,
  AgentPatchRequestSchema,
  AgentPatchSuccessSchema,
  AgentUndoRequestSchema,
  AgentUndoSuccessSchema,
  AgentWriteMdRequestSchema,
  AgentWriteMdSuccessSchema,
  AgentWriteRequestSchema,
  AgentWriteSuccessSchema,
  ASSET_EXTENSIONS,
  BacklinkCountsSuccessSchema,
  BacklinksSuccessSchema,
  CONFIG_DOC_NAME_OKIGNORE,
  CreateFolderRequestSchema,
  CreateFolderSuccessSchema,
  CreatePageRequestSchema,
  CreatePageSuccessSchema,
  colorFromSeed,
  createCodeFenceTracker,
  createWorkspaceSearchCorpus,
  createWorkspaceSearchDocument,
  DEFAULT_ATTACHMENT_FOLDER_PATH,
  DEFAULT_DEDUP_MODE,
  DeadLinksSuccessSchema,
  DeletePathRequestSchema,
  DeletePathSuccessSchema,
  DiffSuccessSchema,
  type DocumentListEntry,
  DocumentListSuccessSchema,
  DocumentReadSuccessSchema,
  EmptyRequestSchema,
  encodeShareUrl,
  FolderConfigGetSuccessSchema,
  FolderConfigPutRequestSchema,
  FolderConfigPutSuccessSchema,
  ForwardLinksSuccessSchema,
  getHeadingSlug,
  getParseHealth,
  type HeadingEntry,
  HistorySuccessSchema,
  HistoryVersionSuccessSchema,
  HubsSuccessSchema,
  INLINE_RENDERABLE_EXTENSIONS,
  type InlineAssetMediaKind,
  InstallSkillRequestSchema,
  InstallSkillSuccessSchema,
  LinkGraphSuccessSchema,
  LocalOpAuthEmptySuccessSchema,
  type LocalOpAuthHostRequest,
  LocalOpAuthHostRequestSchema,
  LocalOpAuthIdentitySuccessSchema,
  LocalOpAuthPatRequestSchema,
  LocalOpAuthPatSuccessSchema,
  LocalOpAuthSetIdentityRequestSchema,
  LocalOpAuthStatusSuccessSchema,
  type LocalOpCloneRequest,
  LocalOpCloneRequestSchema,
  LocalOpOpenRequestSchema,
  LocalOpOpenSuccessSchema,
  MetricsAgentPresenceSuccessSchema,
  MetricsParseHealthSuccessSchema,
  MetricsReconciliationSuccessSchema,
  mediaKindForSidebarAssetExtension,
  OrphansSuccessSchema,
  PageHeadingsSuccessSchema,
  PagesSuccessSchema,
  type Principal,
  PrincipalSuccessSchema,
  type ProblemType,
  prependFrontmatter,
  RenamePathRequestSchema,
  RenamePathSuccessSchema,
  type RescueEntryFlat,
  type RescueEntryTimeline,
  RescueListSuccessSchema,
  RollbackRequestSchema,
  RollbackSuccessSchema,
  readFmMap,
  SaveVersionRequestSchema,
  SaveVersionSuccessSchema,
  SearchRequestSchema,
  SearchSuccessSchema,
  SeedApplyRequestSchema,
  SeedApplySuccessSchema,
  SeedListPacksSuccessSchema,
  SeedPlanSuccessSchema,
  ServerInfoSuccessSchema,
  ShareConstructUrlRequestSchema,
  ShareConstructUrlResponseSchema,
  SharePublishNameCheckResponseSchema,
  SharePublishOwnersResponseSchema,
  SharePublishRequestSchema,
  SharePublishResponseSchema,
  SkillInstallStateSuccessSchema,
  SuggestLinksSuccessSchema,
  SYSTEM_DOC_NAME,
  SyncAbortMergeSuccessSchema,
  SyncConflictContentSuccessSchema,
  SyncConflictsSuccessSchema,
  SyncResolveConflictRequestSchema,
  SyncResolveConflictSuccessSchema,
  SyncStatusSchema,
  SyncTriggerRequestSchema,
  SyncTriggerSuccessSchema,
  searchWorkspaceCorpus,
  stripFrontmatter,
  TagsForNameSuccessSchema,
  TagsListSuccessSchema,
  TemplateDeleteSuccessSchema,
  TemplateGetSuccessSchema,
  TemplatePutRequestSchema,
  TemplatePutSuccessSchema,
  TestRescanBacklinksSuccessSchema,
  TestRescanFilesSuccessSchema,
  TestResetSuccessSchema,
  TrashCleanupRequestSchema,
  TrashCleanupSuccessSchema,
  UploadAssetSuccessSchema,
  UploadRequestSchema,
  type WorkspaceSearchCorpus,
  type WorkspaceSearchDocument,
  type WorkspaceSearchIntent,
  type WorkspaceSearchScope,
  WorkspaceSuccessSchema,
} from '@inkeep/open-knowledge-core';
import {
  formatCheckpointSubject,
  formatRenameSubject,
  formatRollbackSubject,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import busboy from 'busboy';
import { diffLines } from 'diff';
import { fileTypeFromFile } from 'file-type';
import { parse as parseYaml } from 'yaml';
import { captureEffect } from './activity-log.ts';
import { listAgentActivity, synthesizeStackItemDiffText } from './agent-activity.ts';
import type { AgentFocusBroadcaster } from './agent-focus.ts';
import { type AgentPresenceBroadcaster, BROADCASTER_EVICTION_MS } from './agent-presence.ts';
import {
  AgentSessionCapacityError,
  type AgentSessionManager,
  applyAgentMarkdownWrite,
  applyAgentUndo,
  iconFromClientName,
} from './agent-sessions.ts';
import { type NormalizedSummary, normalizeSummary } from './agent-write-summary.ts';
import { isAllowedApiOrigin } from './api-origin.ts';
import { collectReferencedAssets, toContentRelativePath } from './asset-references.ts';
import { assetContentTypeForPath } from './asset-serve-middleware.ts';
import { getLocalDir } from './config/paths.ts';
import { CONFIG_VALIDATION_REVERT_ORIGIN } from './config-edit-origin.ts';
import { enrichDirectory } from './content/enrichment.ts';
import { applyNestedFolderRulesUpsert } from './content/folder-rule-write.ts';
import { applySubstitution, todayIsoUtc } from './content/substitution.ts';
import { resolveTemplatesAvailable } from './content/templates-resolver.ts';
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
import { handleHandoffDispatch } from './handoff-dispatch-api.ts';
import { findHubCandidates } from './hub-candidates.ts';
import {
  extractPageTitle,
  type FrontmatterMetadata,
  parseFrontmatterMetadata,
} from './page-identity.ts';
import type { RecentlyRemovedDocs } from './recently-removed-docs.ts';
import { readServerLock } from './server-lock.ts';
import {
  buildGitHubBlobUrl,
  emitShareConstructUrlLog,
  isValidShareDocPath,
  SHARE_BASE_URL,
  SHARE_CONSTRUCT_URL_HANDLER_TAG,
} from './share/construct-url.ts';
import {
  branchExistsOnOrigin,
  readGitHeadBranch,
  readOriginGitHubRepo,
} from './share/git-context.ts';
import {
  emitSharePublishLog,
  isValidShareOwnerName,
  isValidShareRepoName,
  parseNameCheckEvent,
  parseOwnersEvent,
  parsePublishEvent,
  pickTerminalJsonLine,
  redactShareSubprocessStderr,
  SHARE_PUBLISH_HANDLER_TAG,
  SHARE_PUBLISH_KEY,
  SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG,
  SHARE_PUBLISH_NAME_CHECK_KEY,
  SHARE_PUBLISH_OWNERS_HANDLER_TAG,
  SHARE_PUBLISH_OWNERS_KEY,
  SHARE_PUBLISH_TIMEOUT_MS,
} from './share/publish.ts';
import { buildAndOpenSkill } from './skill-install.ts';
import { readSkillInstallStateSnapshot } from './skill-state.ts';
import { handleSpawnCursor } from './spawn-cursor-api.ts';
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
  BacklinkIndexRequiredError,
  buildRenameMap,
  ManagedRenameCollisionError,
  ManagedRenameDestinationExistsError,
  ManagedRenameMissingDocumentError,
  ManagedRenameSnapshotMissingError,
  ManagedRenameSourceNotFoundError,
  ManagedRenameSourceTypeMismatchError,
  SymlinkEscapeError,
} from './apply-managed-rename.ts';
import {
  type BacklinkIndex,
  type GraphNode as IndexedGraphNode,
  isOrphanMode,
} from './backlink-index.ts';
import { composeAndWriteRawBody, replaceRawBody } from './bridge-intake.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import type { ResolveStrategy } from './conflict-storage.ts';
import type { ContentFilter } from './content-filter.ts';
import {
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
  type FolderIndexEntry,
  registerWrite,
  removeFolderIndexEntries as removeFolderIndexEntriesFromIndex,
  updateFileIndex,
  upsertFolderIndexEntry as upsertFolderIndexEntryInIndex,
} from './file-watcher.ts';
import {
  classifyFsPath,
  normalizeFsPath,
  tracedMkdirSync,
  tracedRenameSync,
  tracedWriteFileSync,
} from './fs-traced.ts';
import { withParentLock } from './git-handle.ts';
import { resolveGitIdentity, writeGitIdentity } from './git-identity.ts';
import { sanitizeGitIdentity } from './git-identity-sanitize.ts';
import {
  createStreamingErrorWriter,
  errorResponse,
  type HttpErrorStatus,
} from './http/error-response.ts';
import { validateBody, withValidation } from './http/request-validation.ts';
import { successResponse } from './http/success-response.ts';
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
  appendRenameLogEntry,
  createAncestorShaSetCache,
  gcRenameLog,
  getOrLoadRenameLogIndex,
  type RenameLogEntry,
  resolveDocPathAtCommit,
} from './rename-log.ts';
import {
  applySeed,
  coercePackId,
  listStarterPacks,
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
import { getMeter, getTracer, withSpan, withSpanSync } from './telemetry.ts';
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

/** Validates a docName and builds a shadow-repo-safe path.
 * Uses the same traversal check as safeContentPath (reject `..` and null bytes)
 * but allows `/` for nested content directories (e.g. `test-content/test-doc`). */
function safeDocPath(docName: string, contentRoot: string): { path: string } | { error: string } {
  if (!docName || docName.includes('..') || docName.includes('\0')) {
    return { error: 'Invalid document name.' };
  }
  const normalized = contentRoot === '.' ? '' : contentRoot.replace(/^\.\//, '');
  const ext = getDocExtension(docName);
  const path = normalized ? `${normalized}/${docName}${ext}` : `${docName}${ext}`;
  return { path };
}

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

import {
  classifyUploadErrno,
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

function readUploadBody(req: IncomingMessage, projectDir: string): Promise<UploadResult> {
  return new Promise((resolveP, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
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

    const classifyWriteError = classifyUploadErrno;

    bb.on('field', (name, val) => {
      if (name === 'parentDocName') parentDocName = val;
    });

    bb.on('file', (_fieldname, file, info) => {
      fileEventFired = true;
      filename = info.filename || 'upload';
      mimeType = info.mimeType || '';

      let path: string;
      try {
        path = mintTempUploadPath(projectDir);
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
      fail('urn:ok:error:malformed-upload', err);
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
        fail('urn:ok:error:malformed-upload', new Error('client disconnected'));
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

function synthesizeShowAllAssetExt(name: string): string {
  const ext = extname(name);
  if (ext) return ext.slice(1).toLowerCase();
  if (name.startsWith('.') && name.length > 1) return name.slice(1).toLowerCase();
  return 'file';
}

interface WalkShowAllOpts {
  contentDir: string;
  contentFilter: ContentFilter;
  dirFilter: string | null;
  documents: DocumentListEntry[];
  getDocExtension: (docName: string) => string;
}

async function walkContentDirForShowAll(opts: WalkShowAllOpts): Promise<void> {
  const { contentDir, contentFilter, dirFilter, documents, getDocExtension } = opts;

  const passesDirFilter = (rel: string): boolean => {
    if (!dirFilter) return true;
    return rel === dirFilter || rel.startsWith(`${dirFilter}/`);
  };

  let contentDirCanonical: string;
  try {
    contentDirCanonical = await realpath(contentDir);
  } catch {
    contentDirCanonical = contentDir;
  }
  const isInsideContentDir = (resolved: string): boolean => {
    if (resolved === contentDirCanonical) return true;
    return resolved.startsWith(`${contentDirCanonical}/`);
  };

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (err) {
      console.warn(`[document-list][showAll] readdir failed for ${absDir}:`, err);
      return;
    }

    for (const entry of entries) {
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (contentFilter.isDirExcluded(relPath, { bypassFilters: true })) continue;

        const dirAbsRaw = `${absDir}/${entry.name}`;
        let dirCanonical: string;
        try {
          dirCanonical = await realpath(dirAbsRaw);
        } catch (err) {
          console.warn(`[document-list][showAll] realpath failed for ${dirAbsRaw}:`, err);
          continue;
        }
        if (!isInsideContentDir(dirCanonical)) {
          console.warn(
            `[document-list][showAll] refusing symlink-escape ${dirAbsRaw} -> ${dirCanonical}`,
          );
          continue;
        }

        if (passesDirFilter(relPath)) {
          let folderStat: import('node:fs').Stats | null = null;
          try {
            folderStat = await stat(dirAbsRaw);
          } catch (err) {
            console.warn(`[document-list][showAll] stat failed for ${dirAbsRaw}:`, err);
          }
          documents.push({
            kind: 'folder',
            path: relPath,
            size: 0,
            modified: folderStat ? folderStat.mtime.toISOString() : '',
            docExt: '.md',
            isSymlink: false,
            canonicalDocName: null,
            targetPath: null,
          });
        }

        await walk(dirAbsRaw, relPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (contentFilter.isExcluded(relPath, { bypassFilters: true })) continue;
      if (!passesDirFilter(relPath)) continue;

      let fileStat: import('node:fs').Stats | null = null;
      try {
        fileStat = await stat(`${absDir}/${entry.name}`);
      } catch (err) {
        console.warn(`[document-list][showAll] stat failed for ${absDir}/${entry.name}:`, err);
        continue;
      }

      if (isSupportedDocFile(entry.name)) {
        const docName = relPath.replace(/\.(md|mdx)$/i, '');
        const docExt = getDocExtension(docName);
        documents.push({
          kind: 'document',
          docName,
          docExt,
          size: fileStat.size,
          modified: fileStat.mtime.toISOString(),
          isSymlink: false,
          canonicalDocName: null,
          targetPath: null,
        });
        continue;
      }

      const assetExt = synthesizeShowAllAssetExt(entry.name);
      const mediaKind: InlineAssetMediaKind | null = ASSET_EXTENSIONS.has(assetExt)
        ? mediaKindForSidebarAssetExtension(assetExt)
        : null;
      documents.push({
        kind: 'asset',
        docName: relPath,
        docExt: assetExt,
        path: relPath,
        assetExt,
        mediaKind,
        referencedBy: [],
        size: fileStat.size,
        modified: fileStat.mtime.toISOString(),
        isSymlink: false,
        canonicalDocName: null,
        targetPath: null,
      });
    }
  }

  const startAbs = dirFilter ? `${contentDir}/${dirFilter}` : contentDir;
  const startRel = dirFilter ?? '';
  await walk(startAbs, startRel);
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
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new SymlinkEscapeError('content directory does not exist');
    }
    throw err;
  }

  let cur = fullPath;
  for (;;) {
    try {
      const canonical = realpathSync(cur);
      if (!isWithinContentDir(canonical, contentRoot)) {
        throw new SymlinkEscapeError('path resolves outside content directory');
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') {
        throw new SymlinkEscapeError('symlink cycle in path');
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
  getFolderIndex?: () => ReadonlyMap<string, FolderIndexEntry>;
  getAliasMap?: () => ReadonlyMap<string, string>;
  rescanFiles?: () => void;
  enableTestRoutes?: boolean;
  shadowRef?: ShadowRef;
  flushGitCommit?: () => Promise<void>;
  flushContributors?: () => Promise<void>;
  getCurrentBranch?: () => string | null;
  getDiskAckSVs?: () => Record<string, string>;
  contentRoot?: string;
  backlinkIndex?: BacklinkIndex;
  tagIndex?: TagIndex;
  signalChannel?: (channel: 'files' | 'backlinks' | 'graph') => void;
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
  ready?: Promise<void>;
  recentlyRemovedDocs?: RecentlyRemovedDocs;
}

interface WorkspaceSearchCacheEntry {
  fingerprint: string;
  corpus?: WorkspaceSearchCorpus;
  pending?: Promise<WorkspaceSearchCorpus>;
}

const workspaceSearchCaches = new Map<string, WorkspaceSearchCacheEntry>();

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

export function isSafeDocName(docName: string): boolean {
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
    getFolderIndex,
    getAliasMap,
    rescanFiles,
    enableTestRoutes = false,
    shadowRef,
    flushGitCommit,
    flushContributors,
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
    ready,
    recentlyRemovedDocs,
  } = options;

  const localOpGuard = createConcurrencyGuard();
  let referencedAssetsCache: {
    signature: string;
    assets: ReturnType<typeof collectReferencedAssets>;
  } | null = null;

  function getMutableFolderIndex(): Map<string, FolderIndexEntry> | null {
    const index = getFolderIndex?.();
    return index instanceof Map ? (index as Map<string, FolderIndexEntry>) : null;
  }

  function upsertFolderIndexEntry(fullPath: string): void {
    const index = getMutableFolderIndex();
    if (!index) return;
    try {
      const folderStat = statSync(fullPath);
      upsertFolderIndexEntryInIndex(index, contentDir, fullPath, folderStat, fullPath);
    } catch (err) {
      console.warn(`[api-extension] folder index stat failed for ${fullPath}:`, err);
    }
  }

  function upsertFolderIndexPathSegments(path: string): void {
    const segments = path.split('/').filter(Boolean);
    for (let i = 1; i <= segments.length; i += 1) {
      upsertFolderIndexEntry(resolve(contentDir, segments.slice(0, i).join('/')));
    }
  }

  function removeFolderIndexEntries(path: string): void {
    const index = getMutableFolderIndex();
    if (!index) return;
    removeFolderIndexEntriesFromIndex(index, path);
  }

  function renameFolderIndexEntries(fromPath: string, toPath: string): void {
    const index = getMutableFolderIndex();
    if (!index) return;
    const renamed: Array<[string, FolderIndexEntry]> = [];
    for (const [folderPath, entry] of [...index.entries()]) {
      if (folderPath !== fromPath && !folderPath.startsWith(`${fromPath}/`)) continue;
      index.delete(folderPath);
      const suffix = folderPath.slice(fromPath.length);
      renamed.push([`${toPath}${suffix}`, entry]);
    }
    if (renamed.length === 0) {
      const destinationPath = resolveContentEntryPath(contentDir, 'folder', toPath);
      if (existsSync(destinationPath)) upsertFolderIndexEntry(destinationPath);
      return;
    }
    for (const [folderPath, entry] of renamed) {
      index.set(folderPath, {
        ...entry,
        modified: new Date().toISOString(),
        canonicalPath: resolve(contentDir, folderPath),
      });
    }
  }

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

  function readPageTitleForLinkedDocName(docName: string, admitted: Set<string>): string {
    if (!admitted.has(docName)) return docName;
    return readPageTitleForDocName(docName);
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

  function readFrontmatterMetadataForLinkedDocName(
    docName: string,
    admitted: Set<string>,
  ): FrontmatterMetadata {
    if (!admitted.has(docName)) return EMPTY_METADATA;
    return readFrontmatterMetadataForDocName(docName);
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

  const withPeriod = (s: string): string => (s.endsWith('.') ? s : `${s}.`);

  function toManagedRenamePublicError(error: unknown): {
    status: HttpErrorStatus;
    type: ProblemType;
    error: string;
  } {
    if (!(error instanceof Error)) {
      return {
        status: 500,
        type: 'urn:ok:error:internal-server-error',
        error: 'Failed to rename document.',
      };
    }
    if (error instanceof ManagedRenameSourceNotFoundError) {
      return { status: 404, type: 'urn:ok:error:doc-not-found', error: withPeriod(error.message) };
    }
    if (error instanceof ManagedRenameDestinationExistsError) {
      return {
        status: 409,
        type: 'urn:ok:error:doc-already-exists',
        error: withPeriod(error.message),
      };
    }
    if (error instanceof ManagedRenameSourceTypeMismatchError) {
      return {
        status: 400,
        type: 'urn:ok:error:invalid-request',
        error: withPeriod(error.message),
      };
    }
    if (error instanceof ManagedRenameMissingDocumentError) {
      return { status: 404, type: 'urn:ok:error:doc-not-found', error: withPeriod(error.message) };
    }
    if (error instanceof ManagedRenameSnapshotMissingError) {
      return { status: 404, type: 'urn:ok:error:doc-not-found', error: withPeriod(error.message) };
    }
    if (error instanceof SymlinkEscapeError) {
      return { status: 400, type: 'urn:ok:error:path-escape', error: withPeriod(error.message) };
    }
    if (error instanceof BacklinkIndexRequiredError) {
      return {
        status: 503,
        type: 'urn:ok:error:backlink-index-not-configured',
        error: withPeriod(error.message),
      };
    }
    return {
      status: 500,
      type: 'urn:ok:error:internal-server-error',
      error: 'Failed to rename document.',
    };
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
        throw new ManagedRenameSnapshotMissingError(docName);
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
      const ytext = document.getText('source');
      result = applyRenameMap(ytext.toString(), docName, renameMap);
      if (result.rewrites === 0) {
        return;
      }
      composeAndWriteRawBody(document, result.markdown, 'managed-rename', false);
    }, MANAGED_RENAME_ORIGIN);
    return result;
  }

  async function _performManagedRenameForDocs(
    fromPath: string,
    toPath: string,
    kind: ContentEntryKind,
    options?: {
      actor?: {
        writerId: string;
        displayName: string;
        colorSeed?: string;
        actorMetadata?: {
          principalId?: string;
          agentType?: string;
          clientName?: string;
          clientVersion?: string;
          label?: string;
        };
      };
    },
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
            throw new BacklinkIndexRequiredError();
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
            if (kind === 'folder') {
              const renamedWithGit = await renameTrackedPathInGit(
                projectDir,
                sourcePathRoot,
                destinationPathRoot,
              );
              if (!renamedWithGit) {
                tracedMkdirSync(dirname(destinationPathRoot), { recursive: true });
                tracedRenameSync(sourcePathRoot, destinationPathRoot);
              }
              renameFolderIndexEntries(fromPath, toPath);
              signalChannel?.('files');
            }
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
              throw new ManagedRenameMissingDocumentError(from);
            }
          }

          const recoveryJournal = createManagedRenameRecoveryJournal({
            fromPath,
            toPath,
            affectedDocs: [...affectedDocs],
            snapshots: buildManagedRenameSnapshots([...snapshotContents.keys()], snapshotContents),
          });

          const rewrittenDocs: ManagedRenameRewrittenDoc[] = [];

          await withManagedRenameRecovery(projectDir ?? contentDir, recoveryJournal, async () => {
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

            if (recentlyRemovedDocs) {
              for (const { from, to } of affectedDocs) {
                if (isSystemDoc(from) || isConfigDoc(from)) continue;
                recentlyRemovedDocs.setRenamed(from, to);
                console.info(
                  JSON.stringify({
                    event: 'recently-removed-docs-populate',
                    from,
                    to,
                    kind: 'renamed',
                    source: 'spine',
                  }),
                );
              }
            }

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
            if (kind === 'folder') {
              renameFolderIndexEntries(fromPath, toPath);
            }

            const liveContents = await captureAndCloseDocuments([...renameMap.keys()]);

            if (
              process.env.NODE_ENV === 'test' &&
              process.env.OK_TEST_RENAME_FAULT === 'pre-append'
            ) {
              throw new Error('OK_TEST_RENAME_FAULT=pre-append');
            }

            if (shadowRef?.current) {
              const shadow = shadowRef.current;
              withSpanSync('rename.appendLog', { attributes: { 'rename.kind': kind } }, (span) => {
                const groupId = randomUUID();
                const at = new Date().toISOString();
                const branch = getCurrentBranch?.() ?? 'main';
                const renameLogIndex = getOrLoadRenameLogIndex(shadow.gitDir);
                const actorWriter = options?.actor
                  ? {
                      writerId: options.actor.writerId,
                      displayName: options.actor.displayName,
                    }
                  : { writerId: SERVICE_WRITER.id, displayName: SERVICE_WRITER.name };
                let entriesAppended = 0;
                for (const { from, to } of affectedDocs) {
                  const logEntry: RenameLogEntry = {
                    v: 1,
                    from,
                    to,
                    at,
                    commitSha: '',
                    branch,
                    groupId,
                    kind,
                    actor: actorWriter,
                  };
                  appendRenameLogEntry(shadow.gitDir, logEntry, renameLogIndex, shadow);
                  entriesAppended += 1;
                  if (options?.actor) {
                    recordContributor(
                      to,
                      options.actor.writerId,
                      options.actor.displayName,
                      options.actor.colorSeed,
                      formatRenameSubject(from, to),
                      options.actor.actorMetadata,
                      undefined,
                      [{ from, to }],
                    );
                  } else {
                    recordContributor(
                      to,
                      SERVICE_WRITER.id,
                      SERVICE_WRITER.name,
                      SERVICE_WRITER.id,
                      formatRenameSubject(from, to),
                      undefined,
                      undefined,
                      [{ from, to }],
                    );
                  }
                }
                span.setAttribute('rename.entries_appended', entriesAppended);
              });
            }

            const explicitDestExt: string | null =
              kind === 'file' && isSupportedDocFile(toPath) ? extname(toPath) : null;
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

            if (
              process.env.NODE_ENV === 'test' &&
              process.env.OK_TEST_RENAME_FAULT === 'pre-journal-clear'
            ) {
              throw new Error('OK_TEST_RENAME_FAULT=pre-journal-clear');
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

  const handleAgentWrite = withValidation(
    AgentWriteRequestSchema,
    async (_req, res, body) => {
      try {
        const rawDocName =
          body.docName !== undefined && body.docName.length > 0 ? body.docName : 'test-doc';
        const docName = resolveAlias(rawDocName);

        const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
          extractAgentIdentity(body);

        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-doc-name',
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

        successResponse(
          res,
          200,
          AgentWriteSuccessSchema,
          {
            timestamp,
            ...(summaryResponse ? { summary: summaryResponse } : {}),
          },
          { handler: 'agent-write' },
        );
      } catch (e) {
        if (e instanceof AgentSessionCapacityError) {
          errorResponse(
            res,
            503,
            'urn:ok:error:too-many-agent-sessions',
            'Too many agent sessions.',
            { handler: 'agent-write', cause: e, extraHeaders: { 'Retry-After': '10' } },
          );
          return;
        }
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
            'urn:ok:error:reserved-doc-name',
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

        successResponse(
          res,
          200,
          AgentWriteMdSuccessSchema,
          {
            timestamp,
            subscriberCount,
            systemSubscriberCount,
            ...(hints ? { hints } : {}),
            ...(summaryResponse ? { summary: summaryResponse } : {}),
          },
          { handler: 'agent-write-md' },
        );
      } catch (e) {
        if (e instanceof AgentSessionCapacityError) {
          errorResponse(
            res,
            503,
            'urn:ok:error:too-many-agent-sessions',
            'Too many agent sessions.',
            { handler: 'agent-write-md', cause: e, extraHeaders: { 'Retry-After': '10' } },
          );
          return;
        }
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
            'urn:ok:error:reserved-doc-name',
            `'${docName}' is a reserved document name.`,
            { handler: 'document-read' },
          );
          return;
        }

        const existing = hocuspocus.documents.get(docName);
        if (existing) {
          successResponse(
            res,
            200,
            DocumentReadSuccessSchema,
            { docName, content: existing.getText('source').toString() },
            { handler: 'document-read' },
          );
          return;
        }

        const filePath = resolveContentEntryPath(contentDir, 'file', docName);
        if (!existsSync(filePath)) {
          errorResponse(res, 404, 'urn:ok:error:doc-not-found', `Document not found: ${docName}.`, {
            handler: 'document-read',
          });
          return;
        }

        const dc = await hocuspocus.openDirectConnection(docName);
        try {
          const document = dc.document;
          if (!document) {
            errorResponse(
              res,
              500,
              'urn:ok:error:doc-not-available',
              'Document is not available.',
              { handler: 'document-read' },
            );
            return;
          }
          const content = document.getText('source').toString();
          successResponse(
            res,
            200,
            DocumentReadSuccessSchema,
            { docName, content },
            { handler: 'document-read' },
          );
        } finally {
          await dc.disconnect();
        }
      } catch (e) {
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
        if (ready) {
          await ready.catch((err: unknown) => {
            log.warn(
              { err, handler: 'document-list' },
              '[api] ready gate rejected — responding with partial index',
            );
          });
        }
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const dir = url.searchParams.get('dir');
        const showAll = url.searchParams.get('showAll') === 'true';

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

        if (showAll && contentFilter) {
          const documents: DocumentListEntry[] = [];
          try {
            await walkContentDirForShowAll({
              contentDir,
              contentFilter,
              dirFilter: dir,
              documents,
              getDocExtension,
            });
            documents.sort((a, b) => {
              const aPath = a.kind === 'folder' ? (a.path ?? '') : (a.docName ?? a.path ?? '');
              const bPath = b.kind === 'folder' ? (b.path ?? '') : (b.docName ?? b.path ?? '');
              return aPath.localeCompare(bPath);
            });
            successResponse(
              res,
              200,
              DocumentListSuccessSchema,
              { documents },
              { handler: 'document-list' },
            );
          } catch (e) {
            errorResponse(
              res,
              500,
              'urn:ok:error:internal-server-error',
              'Failed to list documents (showAll mode).',
              { handler: 'document-list', cause: e },
            );
          }
          return;
        }

        const index = getFileIndex();
        const folderIndex = getFolderIndex?.() ?? new Map<string, FolderIndexEntry>();
        const documents: DocumentListEntry[] = [];

        for (const [folderPath, entry] of folderIndex) {
          if (dir && !folderPath.startsWith(`${dir}/`) && folderPath !== dir) continue;
          documents.push({
            kind: 'folder',
            path: folderPath,
            size: 0,
            modified: entry.modified,
            docExt: '.md',
            isSymlink: false,
            canonicalDocName: null,
            targetPath: null,
          });
        }

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
                isExcluded: contentFilter ? (rel) => contentFilter.isPathIgnored(rel) : undefined,
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

        documents.sort((a, b) => {
          const aPath = a.kind === 'folder' ? (a.path ?? '') : (a.docName ?? a.path ?? '');
          const bPath = b.kind === 'folder' ? (b.path ?? '') : (b.docName ?? b.path ?? '');
          return aPath.localeCompare(bPath);
        });
        successResponse(
          res,
          200,
          DocumentListSuccessSchema,
          { documents },
          { handler: 'document-list' },
        );
      } catch (e) {
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
        successResponse(
          res,
          200,
          BacklinksSuccessSchema,
          { docName, backlinks },
          { handler: 'backlinks' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read backlinks.', {
          handler: 'backlinks',
          cause: e,
        });
      }
    },
    { handler: 'backlinks', method: 'GET', skipBodyParse: true },
  );

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
        successResponse(
          res,
          200,
          BacklinkCountsSuccessSchema,
          { counts },
          { handler: 'backlink-counts' },
        );
      } catch (e) {
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
        const admitted = collectAdmittedDocNames();
        successResponse(
          res,
          200,
          ForwardLinksSuccessSchema,
          {
            docName,
            forwardLinks: backlinkIndex.getForwardLinkEntries(docName).map((entry) =>
              entry.kind === 'doc'
                ? {
                    kind: 'doc' as const,
                    docName: entry.target,
                    anchor: entry.anchor,
                    title: readPageTitleForLinkedDocName(entry.target, admitted),
                    snippet: entry.snippet,
                  }
                : {
                    kind: 'external' as const,
                    url: entry.url,
                    title: entry.label ?? entry.url,
                    snippet: entry.snippet,
                  },
            ),
          },
          { handler: 'forward-links' },
        );
      } catch (e) {
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

        const admitted = collectAdmittedDocNames();
        const enrichedNodes = nodes.map((node) => {
          if (node.kind === 'doc') {
            const meta = readFrontmatterMetadataForLinkedDocName(node.docName, admitted);
            return {
              id: node.id,
              kind: 'doc' as const,
              docName: node.docName,
              anchor: node.anchor ?? null,
              label: readPageTitleForLinkedDocName(node.docName, admitted),
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
        successResponse(
          res,
          200,
          LinkGraphSuccessSchema,
          { nodes: enrichedNodes, links },
          { handler: 'link-graph' },
        );
      } catch (e) {
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
        successResponse(res, 200, OrphansSuccessSchema, { orphans }, { handler: 'orphans' });
      } catch (e) {
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
        const admitted = collectAdmittedDocNames();
        const hubs = backlinkIndex.getHubs(limit).map((hub) => ({
          docName: hub.docName,
          title: readPageTitleForLinkedDocName(hub.docName, admitted),
          count: hub.count,
        }));
        successResponse(res, 200, HubsSuccessSchema, { hubs }, { handler: 'hubs' });
      } catch (e) {
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

        successResponse(
          res,
          200,
          DeadLinksSuccessSchema,
          {
            deadLinks: deadLinks.map((entry) => ({
              target: entry.target,
              sources: entry.sources.map((sourceEntry) => ({
                source: sourceEntry.source,
                title: readPageTitleForDocName(sourceEntry.source),
                snippet: sourceEntry.snippet,
              })),
            })),
          },
          { handler: 'dead-links' },
        );
      } catch (e) {
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
            'urn:ok:error:reserved-doc-name',
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
              if (offset == null) {
                notFound = true;
              } else {
                staleTarget = true;
              }
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

        successResponse(
          res,
          200,
          AgentPatchSuccessSchema,
          {
            timestamp,
            subscriberCount,
            systemSubscriberCount,
            ...(summaryResponse ? { summary: summaryResponse } : {}),
          },
          { handler: 'agent-patch' },
        );
      } catch (e) {
        if (e instanceof AgentSessionCapacityError) {
          errorResponse(
            res,
            503,
            'urn:ok:error:too-many-agent-sessions',
            'Too many agent sessions.',
            { handler: 'agent-patch', cause: e, extraHeaders: { 'Retry-After': '10' } },
          );
          return;
        }
        log.error({ err: e }, '[agent-patch] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'agent-patch',
          cause: e,
        });
      }
    },
    { handler: 'agent-patch', method: 'POST' },
  );

  const handleAgentUndo = withValidation(
    AgentUndoRequestSchema,
    async (_req, res, body) => {
      try {
        const { agentId, agentName, colorSeed, clientName, clientVersion, label } =
          extractAgentIdentity(body);

        const rawDocName =
          body.docName !== undefined && body.docName.length > 0 ? body.docName : 'test-doc';
        const docName = resolveAlias(rawDocName);

        if (isSystemDoc(docName) || isConfigDoc(docName)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-doc-name',
            `'${docName}' is a reserved document name.`,
            { handler: 'agent-undo' },
          );
          return;
        }

        const { connectionId } = body;

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

        successResponse(
          res,
          200,
          AgentUndoSuccessSchema,
          { docName, scope, undone },
          { handler: 'agent-undo' },
        );
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

  const handleAgentActivity = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
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
        successResponse(res, 200, AgentActivitySuccessSchema, result, {
          handler: 'agent-activity',
        });
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
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing docName parameter.', {
            handler: 'agent-burst-diff',
          });
          return;
        }
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
            'urn:ok:error:reserved-doc-name',
            `'${docName}' is a reserved document name.`,
            { handler: 'agent-burst-diff' },
          );
          return;
        }
        if (!stackIndexStr || Number.isNaN(Number(stackIndexStr))) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'StackIndex must be a number.', {
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
        successResponse(
          res,
          200,
          AgentBurstDiffSuccessSchema,
          { diff, generatedAt: Date.now() },
          { handler: 'agent-burst-diff' },
        );
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

        let filePath: string;
        try {
          filePath = safeContentPath(docName, contentDir);
        } catch (err) {
          log.error({ err, docName }, '[test-reset] safeContentPath rejected docName');
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid docName.', {
            handler: 'test-reset',
            cause: err,
          });
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
            console.warn(
              `[backlinks] Failed to persist cache after test-reset for ${docName}:`,
              err,
            );
          });
          signalChannel?.('backlinks');
          signalChannel?.('graph');
        }

        const resetOkignoreParam = url.searchParams.get('reset-okignore');
        const resetOkignore = resetOkignoreParam !== 'false';
        if (resetOkignore) {
          try {
            const okignorePath = resolve(contentDir, '.okignore');
            const okignoreDoc = hocuspocus.documents.get(CONFIG_DOC_NAME_OKIGNORE);
            if (okignoreDoc) {
              const ytext = okignoreDoc.getText('source');
              if (ytext.length > 0) {
                okignoreDoc.transact(() => {
                  ytext.delete(0, ytext.length);
                }, CONFIG_VALIDATION_REVERT_ORIGIN);
              }
            }
            if (existsSync(okignorePath)) {
              writeFileSync(okignorePath, '', 'utf-8');
            }
            if (contentFilter) {
              await contentFilter.rebuildIgnorePatterns();
            }
          } catch (err) {
            console.warn('[test-reset] okignore reset partial failure:', err);
          }
        }
        signalChannel?.('files');
        successResponse(res, 200, TestResetSuccessSchema, {}, { handler: 'test-reset' });
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'test-reset',
          cause: e,
        });
      }
    },
    { handler: 'test-reset', method: 'POST', skipBodyParse: true },
  );

  const handleTestRescanBacklinks = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        if (!backlinkIndex) {
          errorResponse(
            res,
            503,
            'urn:ok:error:backlink-index-not-configured',
            'Backlink index is not configured.',
            { handler: 'test-rescan-backlinks' },
          );
          return;
        }
        await backlinkIndex.rebuildFromDisk();
        void backlinkIndex.saveToDisk().catch((err) => {
          console.warn('[backlinks] Failed to persist cache after test-rescan-backlinks:', err);
        });
        signalChannel?.('backlinks');
        signalChannel?.('graph');
        successResponse(
          res,
          200,
          TestRescanBacklinksSuccessSchema,
          {},
          { handler: 'test-rescan-backlinks' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'test-rescan-backlinks',
          cause: e,
        });
      }
    },
    { handler: 'test-rescan-backlinks', method: 'POST', skipBodyParse: true },
  );

  const handleTestRescanFiles = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        if (!rescanFiles) {
          errorResponse(
            res,
            503,
            'urn:ok:error:file-rescan-not-configured',
            'Watcher rescan capability is not configured.',
            { handler: 'test-rescan-files' },
          );
          return;
        }
        rescanFiles();
        signalChannel?.('files');
        successResponse(
          res,
          200,
          TestRescanFilesSuccessSchema,
          {},
          { handler: 'test-rescan-files' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'test-rescan-files',
          cause: e,
        });
      }
    },
    { handler: 'test-rescan-files', method: 'POST', skipBodyParse: true },
  );

  const handleSaveVersion = withValidation(
    SaveVersionRequestSchema,
    async (_req, res, body) => {
      try {
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
            503,
            'urn:ok:error:shadow-not-configured',
            'Shadow repo not configured.',
            { handler: 'save-version' },
          );
          return;
        }

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

        try {
          await gcRenameLog(shadow, getOrLoadRenameLogIndex(shadow.gitDir));
        } catch (err) {
          console.warn('[rename-log] post-saveVersion GC failed:', err);
        }

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

        successResponse(
          res,
          200,
          SaveVersionSuccessSchema,
          {
            checkpointRef: result.checkpointRef,
            ...(versionTag ? { versionTag } : {}),
          },
          { handler: 'save-version' },
        );
      } catch (e) {
        log.error({ err: e }, '[save-version] handler failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'save-version',
          cause: e,
        });
      }
    },
    { handler: 'save-version', method: 'POST' },
  );

  const handleHistory = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      const shadow = shadowRef?.current;
      if (!shadow) {
        errorResponse(
          res,
          503,
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

      const resolvedContentRoot = contentRoot ?? '.';
      const docPathResult = safeDocPath(docName, resolvedContentRoot);
      if ('error' in docPathResult) {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', docPathResult.error, {
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

        successResponse(res, 200, HistorySuccessSchema, { ...result }, { handler: 'history' });
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read history.', {
          handler: 'history',
          cause: e,
        });
      }
    },
    { handler: 'history', method: 'GET', skipBodyParse: true },
  );

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
      errorResponse(res, 503, 'urn:ok:error:shadow-not-configured', 'Shadow repo not configured.', {
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
    const sg = shadowGit(shadow);
    const branch = getCurrentBranch?.() ?? 'main';

    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid commit SHA.', {
        handler: 'history-version',
      });
      return;
    }

    try {
      const renameLogIndex = getOrLoadRenameLogIndex(shadow.gitDir);
      const ancestorCache = createAncestorShaSetCache();
      const historicalPath = await resolveDocPathAtCommit(
        shadow,
        docName,
        sha,
        branch,
        renameLogIndex,
        (name) => {
          const p = safeDocPath(name, resolvedContentRoot);
          return 'error' in p ? `${name}.md` : p.path;
        },
        ancestorCache,
      );
      if (historicalPath === null) {
        errorResponse(
          res,
          404,
          'urn:ok:error:doc-not-found',
          'Document did not exist at this version.',
          { handler: 'history-version' },
        );
        return;
      }

      const content = await sg.raw('show', `${sha}:${historicalPath}`);

      const logLine = (await sg.raw('log', '-1', '--format=%aI%x00%an', sha)).trim();
      const [timestamp = '', author = ''] = logLine.split('\x00');

      successResponse(
        res,
        200,
        HistoryVersionSuccessSchema,
        { sha, content, timestamp, author },
        { handler: 'history-version' },
      );
    } catch (e) {
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'history-version',
        cause: e,
      });
    }
  }

  const handleDiff = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      const shadow = shadowRef?.current;
      if (!shadow) {
        errorResponse(
          res,
          503,
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
      const sg = shadowGit(shadow);
      const branch = getCurrentBranch?.() ?? 'main';

      const renameLogIndex = getOrLoadRenameLogIndex(shadow.gitDir);
      const ancestorCache = createAncestorShaSetCache();
      const pathFor = (name: string): string => {
        const p = safeDocPath(name, resolvedContentRoot);
        return 'error' in p ? `${name}.md` : p.path;
      };

      try {
        const toHistoricalPath = await resolveDocPathAtCommit(
          shadow,
          docName,
          to,
          branch,
          renameLogIndex,
          pathFor,
          ancestorCache,
        );
        if (toHistoricalPath === null) {
          errorResponse(
            res,
            404,
            'urn:ok:error:doc-not-found',
            'Document did not exist at the target version.',
            { handler: 'diff' },
          );
          return;
        }
        const toContent = await sg.raw('show', `${to}:${toHistoricalPath}`);

        let fromContent: string;
        if (from && /^[0-9a-f]{40}$/i.test(from)) {
          const fromHistoricalPath = await resolveDocPathAtCommit(
            shadow,
            docName,
            from,
            branch,
            renameLogIndex,
            pathFor,
            ancestorCache,
          );
          if (fromHistoricalPath === null) {
            errorResponse(
              res,
              404,
              'urn:ok:error:doc-not-found',
              'Document did not exist at the source version.',
              { handler: 'diff' },
            );
            return;
          }
          fromContent = await sg.raw('show', `${from}:${fromHistoricalPath}`);
        } else {
          const doc = hocuspocus.documents.get(docName);
          if (!doc) {
            errorResponse(
              res,
              409,
              'urn:ok:error:doc-not-open',
              'Document is not currently open — open it in the editor first.',
              { handler: 'diff' },
            );
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

        successResponse(
          res,
          200,
          DiffSuccessSchema,
          { lines, additions, deletions },
          { handler: 'diff' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'diff',
          cause: e,
        });
      }
    },
    { handler: 'diff', method: 'GET', skipBodyParse: true },
  );

  const handleRollback = withValidation(
    RollbackRequestSchema,
    async (_req, res, body) => {
      const bodyObj = body as unknown as Record<string, unknown>;
      const actor = extractActorIdentity(bodyObj, getPrincipal);
      if (actor.kind === 'invalid-summary') {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Summary must be a string.', {
          handler: 'rollback',
        });
        return;
      }

      const shadow = shadowRef?.current;
      if (!shadow) {
        errorResponse(
          res,
          503,
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
      const sg = shadowGit(shadow);

      const t0 = Date.now();
      try {
        const renameLogIndex = getOrLoadRenameLogIndex(shadow.gitDir);
        const ancestorCache = createAncestorShaSetCache();
        const branch = getCurrentBranch?.() ?? 'main';
        const historicalPath = await resolveDocPathAtCommit(
          shadow,
          docName,
          commitSha,
          branch,
          renameLogIndex,
          (name) => {
            const p = safeDocPath(name, resolvedContentRoot);
            return 'error' in p ? `${name}.md` : p.path;
          },
          ancestorCache,
        );
        if (historicalPath === null) {
          errorResponse(
            res,
            404,
            'urn:ok:error:doc-not-found',
            `Commit ${commitSha.slice(0, 7)} does not contain document ${docName} at any known historical path.`,
            { handler: 'rollback' },
          );
          return;
        }

        const markdown = await sg.raw('show', `${commitSha}:${historicalPath}`);
        const timestamp = new Date().toISOString();

        await safetyCheckpoint(shadow, resolvedContentRoot, {
          action: 'rollback',
          context: { docName, targetSha: commitSha },
        });

        const document = hocuspocus.documents.get(docName);
        if (!document) {
          errorResponse(
            res,
            409,
            'urn:ok:error:doc-not-open',
            'Document is not currently open — open it in the editor first.',
            { handler: 'rollback' },
          );
          return;
        }

        const rollbackEmbedResolver = options.resolveEmbed
          ? { resolveEmbed: options.resolveEmbed, sourcePath: docName }
          : undefined;
        document.transact(() => {
          replaceRawBody(document, markdown, rollbackEmbedResolver);
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

        successResponse(
          res,
          200,
          RollbackSuccessSchema,
          {
            restoredFrom: commitSha,
            timestamp,
            ...(summaryResponse ? { summary: summaryResponse } : {}),
          },
          { handler: 'rollback' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to roll back.', {
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
        successResponse(res, 200, MetricsReconciliationSuccessSchema, getMetrics(), {
          handler: 'metrics-reconciliation',
        });
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
        successResponse(res, 200, MetricsParseHealthSuccessSchema, getParseHealth(), {
          handler: 'metrics-parse-health',
        });
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

  const handleServerInfo = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        const currentBranch = getActiveBranch();
        const currentDiskAckSVs = getDiskAckSVs?.();
        successResponse(
          res,
          200,
          ServerInfoSuccessSchema,
          {
            serverInstanceId,
            currentBranch,
            ...(currentDiskAckSVs !== undefined ? { currentDiskAckSVs } : {}),
          },
          {
            handler: 'server-info',
            extraHeaders: { 'Cache-Control': 'no-store' },
          },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'server-info',
          cause: e,
        });
      }
    },
    { handler: 'server-info', method: 'GET', skipBodyParse: true },
  );

  async function handlePrincipal(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    successResponse(res, 200, PrincipalSuccessSchema, principal, { handler: 'principal' });
  }

  async function handleMetricsAgentPresence(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
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
      const rawPresence = agentPresenceBroadcaster?.getPresenceMap() ?? {};
      const now = Date.now();
      const presence: typeof rawPresence = {};
      for (const [agentId, entry] of Object.entries(rawPresence)) {
        if (now - entry.ts < BROADCASTER_EVICTION_MS) {
          presence[agentId] = entry;
        }
      }
      successResponse(
        res,
        200,
        MetricsAgentPresenceSuccessSchema,
        { presence },
        { handler: 'metrics-agent-presence' },
      );
    } catch (e) {
      log.error({ err: e }, '[metrics-agent-presence] handler failed');
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
        handler: 'metrics-agent-presence',
        cause: e,
      });
    }
  }

  async function handleWorkspace(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
          'Workspace realpath failed.',
          { handler: 'workspace', detail: code ?? undefined, cause: err },
        );
        return;
      }
    }
    successResponse(
      res,
      200,
      WorkspaceSuccessSchema,
      {
        contentDir: resolvedContentDir,
        pathSeparator: sep,
        symlinkResolved,
      },
      { handler: 'workspace' },
    );
  }

  const handleAsset = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const assetPath = url.searchParams.get('path');
        if (!assetPath || assetPath.includes('\0')) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing asset path.', {
            handler: 'asset',
          });
          return;
        }
        const contentType = assetContentTypeForPath(assetPath);
        const assetExt = extname(assetPath).slice(1).toLowerCase();
        if (!contentType || !ASSET_EXTENSIONS.has(assetExt)) {
          errorResponse(
            res,
            415,
            'urn:ok:error:unsupported-asset-type',
            'Unsupported asset type.',
            { handler: 'asset' },
          );
          return;
        }
        const resolvedContentDir = realpathSync(contentDir);
        const requestedPath = resolve(resolvedContentDir, assetPath);
        let canonicalPath: string;
        try {
          canonicalPath = realpathSync(requestedPath);
        } catch {
          errorResponse(res, 404, 'urn:ok:error:asset-not-found', 'Asset not found.', {
            handler: 'asset',
          });
          return;
        }
        if (!isWithinContentDir(canonicalPath, resolvedContentDir)) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid asset path.', {
            handler: 'asset',
          });
          return;
        }
        let stat: ReturnType<typeof statSync>;
        try {
          stat = statSync(canonicalPath);
        } catch {
          errorResponse(res, 404, 'urn:ok:error:asset-not-found', 'Asset not found.', {
            handler: 'asset',
          });
          return;
        }
        if (!stat.isFile()) {
          errorResponse(res, 404, 'urn:ok:error:asset-not-found', 'Asset not found.', {
            handler: 'asset',
          });
          return;
        }
        const relativePath = toContentRelativePath(resolvedContentDir, canonicalPath);
        if (relativePath !== assetPath.split('\\').join('/')) {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid asset path.', {
            handler: 'asset',
          });
          return;
        }
        if (contentFilter?.isPathIgnored(relativePath)) {
          errorResponse(res, 404, 'urn:ok:error:asset-not-found', 'Asset not found.', {
            handler: 'asset',
          });
          return;
        }
        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Content-Length': String(stat.size),
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': INLINE_RENDERABLE_EXTENSIONS.has(assetExt)
            ? 'inline'
            : 'attachment',
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
          log.error(
            {
              event: 'api.asset.pipeline-failed',
              handler: 'asset',
              assetPath,
              err: streamError,
            },
            '[asset] pipeline failed mid-stream',
          );
          if (!res.destroyed) {
            res.destroy(streamError instanceof Error ? streamError : undefined);
          }
        }
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'asset',
          cause: e,
        });
      }
    },
    { handler: 'asset', method: 'GET', skipBodyParse: true },
  );

  const RESCUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  const handleRescueList = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        if (!shadowRef?.current) {
          successResponse(res, 200, RescueListSuccessSchema, [], { handler: 'rescue-list' });
          return;
        }

        const now = Date.now();
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
          } catch (err) {
            log.error({ err }, '[rescue] Failed to list flat-file rescue buffers');
          }
        }

        try {
          const branch = getCurrentBranch?.() ?? 'main';
          const timelineEntries = await listRescueCheckpoints(shadowRef.current, branch);
          for (const t of timelineEntries) {
            entries.push({ ...t, source: 'timeline' });
          }
        } catch (err) {
          log.error({ err }, '[rescue] Failed to list timeline-ref rescue checkpoints');
        }

        successResponse(res, 200, RescueListSuccessSchema, entries, { handler: 'rescue-list' });
      } catch (e) {
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
      errorResponse(res, 503, 'urn:ok:error:shadow-not-configured', 'Shadow repo not configured.', {
        handler: 'rescue-get',
      });
      return;
    }

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

    errorResponse(res, 404, 'urn:ok:error:not-found', 'Not found.', { handler: 'rescue-get' });
  }

  const handleCreatePage = withValidation(
    CreatePageRequestSchema,
    async (_req, res, body) => {
      try {
        const bodyObj = body as unknown as Record<string, unknown>;
        const actor = extractActorIdentity(bodyObj, getPrincipal);
        if (actor.kind === 'invalid-summary') {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Summary must be a string.', {
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
            'urn:ok:error:reserved-doc-name',
            `'${candidateDocName}' is a reserved document name.`,
            { handler: 'create-page' },
          );
          return;
        }
        const templateName =
          typeof (body as Record<string, unknown>).template === 'string'
            ? ((body as Record<string, unknown>).template as string).trim()
            : '';
        let initialContent = '';
        let templateScopeForLog: 'local' | 'inherited' | undefined;
        if (templateName.length > 0) {
          if (!/^[A-Za-z0-9_-]+$/.test(templateName)) {
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              'Template name must match [A-Za-z0-9_-]+.',
              { handler: 'create-page' },
            );
            return;
          }
          const parentFolder = filePath.includes('/')
            ? filePath.slice(0, filePath.lastIndexOf('/'))
            : '';
          const available = resolveTemplatesAvailable(resolvedContentDir, parentFolder);
          const matched = available.find((t) => t.name === templateName);
          if (!matched) {
            const availableLabel =
              available.length === 0
                ? '(none)'
                : available.map((t) => `"${t.name}" (${t.scope})`).join(', ');
            errorResponse(
              res,
              400,
              'urn:ok:error:invalid-request',
              `Template "${templateName}" does not resolve for folder "${parentFolder || '(root)'}". Available: ${availableLabel}`,
              { handler: 'create-page' },
            );
            return;
          }
          const templateAbs = resolve(resolvedContentDir, matched.path);
          let templateRaw: string;
          try {
            templateRaw = readFileSync(templateAbs, 'utf-8');
          } catch (err) {
            errorResponse(
              res,
              500,
              'urn:ok:error:internal-server-error',
              `Failed to read template at ${matched.path}.`,
              { handler: 'create-page', cause: err },
            );
            return;
          }
          const { body: templateBody } = stripFrontmatter(templateRaw);
          const userDisplayName =
            actor.kind === 'agent' || actor.kind === 'principal' ? (actor.displayName ?? '') : '';
          initialContent = applySubstitution(templateBody, {
            date: todayIsoUtc(),
            user: userDisplayName,
          });
          templateScopeForLog = matched.scope;
        }

        mkdirSync(dirname(fullPath), { recursive: true });
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
        recentlyRemovedDocs?.delete(docName);
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
        if (templateScopeForLog !== undefined) {
          console.warn(
            JSON.stringify({
              event: 'template-instantiate',
              templateName,
              templateScope: templateScopeForLog,
              docName,
            }),
          );
        }
        successResponse(res, 200, CreatePageSuccessSchema, { docName }, { handler: 'create-page' });
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to create page.', {
          handler: 'create-page',
          cause: e,
        });
      }
    },
    { handler: 'create-page', method: 'POST' },
  );

  const handleCreateFolder = withValidation(
    CreateFolderRequestSchema,
    async (_req, res, body) => {
      try {
        const bodyObj = body as unknown as Record<string, unknown>;
        const actor = extractActorIdentity(bodyObj, getPrincipal);
        if (actor.kind === 'invalid-summary') {
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Summary must be a string.', {
            handler: 'create-folder',
          });
          return;
        }
        const folderPath = body.path;
        if (!isValidRelativeContentPath(folderPath)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'path must be a relative content path.',
            { handler: 'create-folder' },
          );
          return;
        }
        if (folderPath === '.ok' || folderPath.startsWith('.ok/')) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-doc-name',
            "'.ok' is a reserved directory.",
            { handler: 'create-folder' },
          );
          return;
        }
        if (contentFilter?.isDirExcluded(folderPath)) {
          errorResponse(
            res,
            400,
            'urn:ok:error:invalid-request',
            'Destination folder is excluded by the workspace content config.',
            { handler: 'create-folder' },
          );
          return;
        }

        const fullPath = resolveContentEntryPath(contentDir, 'folder', folderPath);
        if (existsSync(fullPath)) {
          errorResponse(res, 409, 'urn:ok:error:doc-already-exists', 'Folder already exists.', {
            handler: 'create-folder',
          });
          return;
        }

        tracedMkdirSync(fullPath, { recursive: true });
        upsertFolderIndexPathSegments(folderPath);
        signalChannel?.('files');
        successResponse(
          res,
          200,
          CreateFolderSuccessSchema,
          { path: folderPath },
          { handler: 'create-folder' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to create folder.', {
          handler: 'create-folder',
          cause: e,
        });
      }
    },
    { handler: 'create-folder', method: 'POST' },
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
        successResponse(
          res,
          200,
          PageHeadingsSuccessSchema,
          { docName, headings },
          { handler: 'page-headings' },
        );
      } catch (e) {
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
          errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Summary must be a string.', {
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
            'urn:ok:error:reserved-doc-name',
            'Reserved document names cannot be renamed.',
            { handler: 'rename-path' },
          );
          return;
        }
        if (
          fromPath === '.ok' ||
          fromPath.startsWith('.ok/') ||
          toPath === '.ok' ||
          toPath.startsWith('.ok/')
        ) {
          errorResponse(
            res,
            400,
            'urn:ok:error:reserved-doc-name',
            '.ok is a reserved directory.',
            {
              handler: 'rename-path',
            },
          );
          return;
        }
        if (fromPath === toPath) {
          successResponse(
            res,
            200,
            RenamePathSuccessSchema,
            { renamed: [], rewrittenDocs: [] },
            { handler: 'rename-path' },
          );
          return;
        }
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

        const renameActor =
          actor.kind === 'agent' || actor.kind === 'principal'
            ? {
                writerId: actor.writerId,
                displayName: actor.displayName,
                colorSeed: actor.colorSeed,
                actorMetadata: actor.actor,
              }
            : undefined;

        let result: { renamed: RenamedDocMapping[]; rewrittenDocs: ManagedRenameRewrittenDoc[] };
        try {
          result = await _performManagedRenameForDocs(fromPath, toPath, kind, {
            ...(renameActor ? { actor: renameActor } : {}),
          });
        } catch (err) {
          if (err instanceof ManagedRenameCollisionError) {
            errorResponse(res, 409, 'urn:ok:error:doc-already-exists', withPeriod(err.message), {
              handler: 'rename-path',
              extensions: { colliding: err.colliding },
              cause: err,
            });
            return;
          }
          throw err;
        }

        if (result.renamed.length === 0) {
          successResponse(
            res,
            200,
            RenamePathSuccessSchema,
            { renamed: [], rewrittenDocs: [] },
            { handler: 'rename-path' },
          );
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
            for (let i = 0; i < result.renamed.length; i++) {
              const { fromDocName, toDocName } = result.renamed[i];
              recordContributor(
                toDocName,
                actor.writerId,
                actor.displayName,
                actor.colorSeed,
                formatRenameSubject(fromDocName, toDocName),
                actor.actor,
                i === 0 ? fields.stored : undefined,
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
            for (let i = 0; i < result.renamed.length; i++) {
              const { fromDocName, toDocName } = result.renamed[i];
              recordContributor(
                toDocName,
                actor.writerId,
                actor.displayName,
                actor.colorSeed,
                formatRenameSubject(fromDocName, toDocName),
                actor.actor,
                i === 0 ? fields.stored : undefined,
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

        if (flushContributors) {
          try {
            await flushContributors();
          } catch (flushErr) {
            console.warn(
              `[rename-path] flushContributors failed (commitSha backfill may be deferred):`,
              flushErr,
            );
          }
        }

        successResponse(
          res,
          200,
          RenamePathSuccessSchema,
          {
            renamed: result.renamed,
            rewrittenDocs: result.rewrittenDocs,
            ...(summaryResponse ? { summary: summaryResponse } : {}),
          },
          { handler: 'rename-path' },
        );
      } catch (e) {
        const { status, type, error } = toManagedRenamePublicError(e);
        errorResponse(res, status, type, error, {
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
        extractAgentIdentity(body as unknown as Record<string, unknown>); // attribution threading
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

        if (recentlyRemovedDocs) {
          for (const docName of deletedDocNames) {
            if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
            recentlyRemovedDocs.setDeleted(docName);
            console.info(
              JSON.stringify({
                event: 'recently-removed-docs-populate',
                docName,
                kind: 'deleted',
                source: 'handleDeletePath',
              }),
            );
          }
        }

        if (kind === 'file') {
          unlinkSync(targetPath);
        } else {
          rmSync(targetPath, { recursive: true, force: false });
          removeFolderIndexEntries(path);
        }

        const fileIndex = getFileIndex();
        if (fileIndex instanceof Map) {
          for (const docName of deletedDocNames) {
            updateFileIndex(
              {
                kind: 'delete',
                path: resolve(contentDir, `${docName}${getDocExtension(docName)}`),
                docName,
              },
              fileIndex as Map<string, FileIndexEntry>,
            );
          }
        }

        successResponse(
          res,
          200,
          DeletePathSuccessSchema,
          { deletedDocNames },
          { handler: 'delete-path' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to delete path.', {
          handler: 'delete-path',
          cause: e,
        });
      }
    },
    { handler: 'delete-path', method: 'POST' },
  );

  const handleTrashCleanup = withValidation(
    TrashCleanupRequestSchema,
    async (_req, res, body) => {
      return withSpan(
        'ok.fs.trash_cleanup',
        {
          attributes: {
            'ok.cleanup.kind': body.kind,
            'ok.cleanup.path': normalizeFsPath(body.path),
            'ok.cleanup.path.role': classifyFsPath(body.path),
          },
        },
        async () => {
          try {
            const bodyObj = body as unknown as Record<string, unknown>;
            const actor = extractActorIdentity(bodyObj, getPrincipal);
            if (actor.kind === 'invalid-summary') {
              errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Summary must be a string.', {
                handler: 'trash-cleanup',
              });
              return;
            }
            const { kind, path } = body;
            if (!isValidRelativeContentPath(path)) {
              errorResponse(
                res,
                400,
                'urn:ok:error:invalid-request',
                'path must be a relative content path.',
                { handler: 'trash-cleanup' },
              );
              return;
            }
            const isReservedFolder =
              kind === 'folder' &&
              (path === '__system__' ||
                path === '__config__' ||
                path === '__user__' ||
                path === '__local__' ||
                path.startsWith('__system__/') ||
                path.startsWith('__config__/') ||
                path.startsWith('__user__/') ||
                path.startsWith('__local__/'));
            if ((kind === 'file' && (isSystemDoc(path) || isConfigDoc(path))) || isReservedFolder) {
              errorResponse(
                res,
                400,
                'urn:ok:error:reserved-doc-name',
                `'${path}' is a reserved document name.`,
                { handler: 'trash-cleanup' },
              );
              return;
            }

            const initialIndex = getFileIndex();
            const deletedDocNames =
              kind === 'file'
                ? initialIndex.has(path)
                  ? [path]
                  : []
                : listAffectedDocNames(initialIndex, kind, path);

            if (deletedDocNames.length === 0) {
              successResponse(
                res,
                200,
                TrashCleanupSuccessSchema,
                { deletedDocNames: [] },
                { handler: 'trash-cleanup' },
              );
              return;
            }

            await captureAndCloseDocuments(deletedDocNames);

            if (recentlyRemovedDocs) {
              for (const docName of deletedDocNames) {
                if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
                recentlyRemovedDocs.setDeleted(docName);
                console.info(
                  JSON.stringify({
                    event: 'recently-removed-docs-populate',
                    docName,
                    kind: 'deleted',
                    source: 'handleTrashCleanup',
                  }),
                );
              }
            }

            const fileIndex = getFileIndex();
            if (fileIndex instanceof Map) {
              for (const docName of deletedDocNames) {
                updateFileIndex(
                  {
                    kind: 'delete',
                    path: resolve(contentDir, `${docName}${getDocExtension(docName)}`),
                    docName,
                  },
                  fileIndex as Map<string, FileIndexEntry>,
                );
              }
            }
            if (kind === 'folder') {
              removeFolderIndexEntries(path);
            }

            signalChannel?.('files');

            successResponse(
              res,
              200,
              TrashCleanupSuccessSchema,
              { deletedDocNames },
              { handler: 'trash-cleanup' },
            );
          } catch (e) {
            errorResponse(
              res,
              500,
              'urn:ok:error:internal-server-error',
              'Failed to clean up after trash.',
              {
                handler: 'trash-cleanup',
                cause: e,
              },
            );
          }
        },
      );
    },
    { handler: 'trash-cleanup', method: 'POST' },
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
        successResponse(res, 200, PagesSuccessSchema, { pages }, { handler: 'pages' });
      } catch (e) {
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
            'urn:ok:error:reserved-doc-name',
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
        successResponse(res, 200, SuggestLinksSuccessSchema, result, { handler: 'suggest-links' });
      } catch (error) {
        if (error instanceof SuggestLinksTargetNotFoundError) {
          errorResponse(res, 404, 'urn:ok:error:doc-not-found', 'Page not found.', {
            handler: 'suggest-links',
            cause: error,
          });
          return;
        }
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
      uploadResult = await readUploadBody(req, projectDir ?? contentDir);
    } catch (e) {
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

    const cleanupTempfile = () => {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {}
      }
    };

    const validated = validateBody(UploadRequestSchema, { parentDocName: rawParentDocName }, res, {
      handler: 'upload-asset',
    });
    if (!validated.ok) {
      cleanupTempfile();
      return;
    }
    const { parentDocName } = validated.value;

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
    try {
      assertNoSymlinkEscape(destDir, resolvedContentDir);
    } catch (err) {
      cleanupTempfile();
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith('symlink-escape:')) {
        errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
          handler: 'upload-asset',
        });
        return;
      }
      log.error({ err, destDir }, '[upload] failed to validate destination directory');
      errorResponse(res, 500, 'urn:ok:error:storage-error', 'Storage error.', {
        handler: 'upload-asset',
        cause: err,
      });
      return;
    }
    try {
      mkdirSync(destDir, { recursive: true });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        cleanupTempfile();
        const reason = classifyUploadErrno(err as NodeJS.ErrnoException);
        errorResponse(res, uploadStatusFor(reason), reason, uploadTitleFor(reason), {
          handler: 'upload-asset',
          cause: err,
          detail: 'failed to create attachment directory',
        });
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
        errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
          handler: 'upload-asset',
        });
        return;
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
      } else {
        cleanupTempfile();
        errorResponse(res, 400, 'urn:ok:error:path-escape', 'Path escape detected.', {
          handler: 'upload-asset',
          cause: e,
        });
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
        successResponse(
          res,
          200,
          UploadAssetSuccessSchema,
          { src: existing, path: relPath, deduped: true },
          { handler: 'upload-asset' },
        );
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
      successResponse(
        res,
        200,
        UploadAssetSuccessSchema,
        { src: destFilename, path: relPath, deduped: false },
        { handler: 'upload-asset' },
      );
    } catch (e) {
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

  const LOCAL_OP_CLONE_KEY = '/api/local-op/clone';
  const LOCAL_OP_OPEN_KEY = '/api/local-op/open';
  const LOCAL_OP_TIMEOUT_MS = 10 * 60 * 1000;
  const LOCAL_OP_OPEN_TIMEOUT_MS = 45_000;

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

    if (!isAllowedGitUrl(url)) {
      errorResponse(
        res,
        400,
        'urn:ok:error:url-not-allowed',
        'URL protocol is not allowed for clone.',
        { handler: HANDLE_LOCAL_OP_CLONE, cause: new Error(`url=${url}`) },
      );
      return;
    }
    if (!isSafeLocalPath(dir)) {
      errorResponse(
        res,
        400,
        'urn:ok:error:dir-outside-home',
        'Clone destination must be within the user home directory.',
        { handler: HANDLE_LOCAL_OP_CLONE, cause: new Error(`dir=${dir}`) },
      );
      return;
    }

    if (!localOpGuard.tryAcquire(LOCAL_OP_CLONE_KEY)) {
      errorResponse(
        res,
        429,
        'urn:ok:error:concurrent-operation',
        'A clone operation is already in progress.',
        { handler: HANDLE_LOCAL_OP_CLONE, extraHeaders: { 'Retry-After': '30' } },
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    const writeStreamError = createStreamingErrorWriter(res, HANDLE_LOCAL_OP_CLONE);

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
          writeStreamError(
            500,
            'urn:ok:error:clone-failed',
            'Clone subprocess reported an error.',
            {
              cause: event.message ? new Error(event.message) : undefined,
            },
          );
          return;
        }
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(`${JSON.stringify(event)}\n`);
          } catch {}
        }
      },
    });

    void (async () => {
      try {
        await flow.done;
        if (cloneCompleteDir && !res.writableEnded && !res.destroyed) {
          const result = await startServerAtDirAndGetPort(cloneCompleteDir);
          if (!res.writableEnded && !res.destroyed) {
            if ('port' in result) {
              res.write(
                `${JSON.stringify({ type: 'complete', port: result.port, dir: cloneCompleteDir })}\n`,
              );
            } else {
              writeStreamError(
                500,
                'urn:ok:error:server-start-failed',
                'Cloned successfully but failed to start the project server.',
                { cause: new Error(result.error) },
              );
            }
          }
        }
      } catch (err) {
        if (!res.writableEnded && !res.destroyed) {
          writeStreamError(
            500,
            'urn:ok:error:internal-server-error',
            'Unexpected error during clone post-processing.',
            { cause: err },
          );
        } else {
          log.error(
            { err, handler: HANDLE_LOCAL_OP_CLONE },
            'clone IIFE rejected after stream ended',
          );
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
    const lockDir = getLocalDir(absDir);

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
      env: { ...process.env, OK_LOCK_KIND: 'interactive' },
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

  const HANDLE_LOCAL_OP_OPEN = 'local-op-open';
  const handleLocalOpOpen = withValidation(
    LocalOpOpenRequestSchema,
    async (_req, res, body) => {
      const { dir } = body;

      if (!isSafeLocalPath(dir)) {
        errorResponse(
          res,
          400,
          'urn:ok:error:dir-outside-home',
          'dir must be within the user home directory.',
          { handler: HANDLE_LOCAL_OP_OPEN, cause: new Error(`dir=${dir}`) },
        );
        return;
      }

      if (!localOpGuard.tryAcquire(LOCAL_OP_OPEN_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'A server-open operation is already in progress.',
          { handler: HANDLE_LOCAL_OP_OPEN, extraHeaders: { 'Retry-After': '5' } },
        );
        return;
      }

      try {
        const result = await startServerAtDirAndGetPort(dir);
        if ('port' in result) {
          successResponse(
            res,
            200,
            LocalOpOpenSuccessSchema,
            { port: result.port },
            { handler: HANDLE_LOCAL_OP_OPEN },
          );
        } else {
          errorResponse(
            res,
            504,
            'urn:ok:error:server-open-failed',
            'Failed to open project server.',
            { handler: HANDLE_LOCAL_OP_OPEN, cause: new Error(result.error) },
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

  const LOCAL_OP_AUTH_LOGIN_KEY = '/api/local-op/auth/login';
  const LOCAL_OP_AUTH_STATUS_KEY = '/api/local-op/auth/status';
  const LOCAL_OP_AUTH_REPOS_KEY = '/api/local-op/auth/repos';
  const LOCAL_OP_AUTH_SIGNOUT_KEY = '/api/local-op/auth/signout';
  const LOCAL_OP_AUTH_PAT_KEY = '/api/local-op/auth/pat';

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
        { handler: HANDLE_LOCAL_OP_AUTH_LOGIN, extraHeaders: { 'Retry-After': '5' } },
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

    const writeStreamError = createStreamingErrorWriter(res, HANDLE_LOCAL_OP_AUTH_LOGIN);

    const flow = runDeviceFlowSubprocess({
      cliArgs: localOpCliArgs,
      host,
      timeoutMs: LOCAL_OP_TIMEOUT_MS,
      onEvent: (event: AuthEvent) => {
        if (event.type === 'error') {
          writeStreamError(500, 'urn:ok:error:auth-failed', 'Auth subprocess reported an error.', {
            cause: event.message ? new Error(event.message) : undefined,
          });
          return;
        }
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(`${JSON.stringify(event)}\n`);
          } catch {}
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
          { handler: HANDLE_LOCAL_OP_AUTH_STATUS, extraHeaders: { 'Retry-After': '5' } },
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
          let timedOut = false;
          const killTimer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, 30_000);
          const chunks: Buffer[] = [];
          child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
          child.on('close', () => {
            clearTimeout(killTimer);
            if (timedOut) {
              reject(new Error('auth status subprocess timed out after 30s'));
              return;
            }
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
          successResponse(res, 200, LocalOpAuthStatusSuccessSchema, parsed, {
            handler: HANDLE_LOCAL_OP_AUTH_STATUS,
          });
        } else {
          successResponse(
            res,
            200,
            LocalOpAuthStatusSuccessSchema,
            { authenticated: false },
            { handler: HANDLE_LOCAL_OP_AUTH_STATUS },
          );
        }
      } catch (err) {
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
        { handler: HANDLE_LOCAL_OP_AUTH_REPOS, extraHeaders: { 'Retry-After': '5' } },
      );
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    });

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
        } catch {}
        if (evt && evt.type === 'error') {
          const detail = typeof evt.message === 'string' ? evt.message : undefined;
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            'Auth repos subprocess reported an error.',
            { detail },
          );
          continue;
        }
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(`${line}\n`);
          } catch {}
        }
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
        localOpGuard.release(LOCAL_OP_AUTH_REPOS_KEY);
      }
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        if (!res.writableEnded) {
          writeStreamError(
            500,
            'urn:ok:error:auth-failed',
            'Failed to spawn the auth repos subprocess.',
            { cause: err },
          );
          res.end();
        }
        localOpGuard.release(LOCAL_OP_AUTH_REPOS_KEY);
      }
    });

    res.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(killTimer);
        child.kill('SIGTERM');
        localOpGuard.release(LOCAL_OP_AUTH_REPOS_KEY);
      }
    });
  }

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
          { handler: HANDLE_LOCAL_OP_AUTH_SIGNOUT, extraHeaders: { 'Retry-After': '5' } },
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

        successResponse(
          res,
          200,
          LocalOpAuthEmptySuccessSchema,
          {},
          {
            handler: HANDLE_LOCAL_OP_AUTH_SIGNOUT,
          },
        );
      } catch (err) {
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
          { handler: HANDLE_LOCAL_OP_AUTH_PAT, extraHeaders: { 'Retry-After': '5' } },
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
          successResponse(res, 200, LocalOpAuthPatSuccessSchema, parsed, {
            handler: HANDLE_LOCAL_OP_AUTH_PAT,
          });
        } else {
          successResponse(
            res,
            200,
            LocalOpAuthPatSuccessSchema,
            {},
            {
              handler: HANDLE_LOCAL_OP_AUTH_PAT,
            },
          );
        }
      } catch (err) {
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
      errorResponse(res, 503, 'urn:ok:error:no-project-dir', 'No project directory configured.', {
        handler: HANDLE_LOCAL_OP_AUTH_IDENTITY,
      });
      return;
    }
    try {
      const identity = await resolveGitIdentity(projectDir);
      successResponse(
        res,
        200,
        LocalOpAuthIdentitySuccessSchema,
        { identity },
        {
          handler: HANDLE_LOCAL_OP_AUTH_IDENTITY,
        },
      );
    } catch (err) {
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Identity resolution failed.', {
        handler: HANDLE_LOCAL_OP_AUTH_IDENTITY,
        cause: err,
      });
    }
  }

  const LOCAL_OP_AUTH_SET_IDENTITY_KEY = '/api/local-op/auth/set-identity';

  const HANDLE_LOCAL_OP_AUTH_SET_IDENTITY = 'local-op-auth-set-identity';
  const handleLocalOpAuthSetIdentity = withValidation(
    LocalOpAuthSetIdentityRequestSchema,
    async (_req, res, body) => {
      const name = body.name.trim();
      const email = body.email.trim();

      if (!projectDir) {
        errorResponse(res, 503, 'urn:ok:error:no-project-dir', 'No project directory configured.', {
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
          { handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY, extraHeaders: { 'Retry-After': '5' } },
        );
        return;
      }

      try {
        writeGitIdentity(projectDir, name, email);
        void getSyncEngine?.()
          ?.refreshIdentity()
          .catch(() => {});
        successResponse(
          res,
          200,
          LocalOpAuthEmptySuccessSchema,
          {},
          {
            handler: HANDLE_LOCAL_OP_AUTH_SET_IDENTITY,
          },
        );
      } catch (err) {
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
        successResponse(
          res,
          200,
          SyncStatusSchema,
          {
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
          },
          { handler: 'sync-status' },
        );
        return;
      }
      await engine.refreshRemote();
      successResponse(res, 200, SyncStatusSchema, engine.getStatus(), {
        handler: 'sync-status',
      });
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
        errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
          handler: 'sync-trigger',
        });
        return;
      }
      const op = body.op ?? 'sync';
      successResponse(res, 202, SyncTriggerSuccessSchema, { op }, { handler: 'sync-trigger' });
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
      successResponse(
        res,
        200,
        SyncConflictsSuccessSchema,
        { conflicts },
        {
          handler: 'sync-conflicts',
        },
      );
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
        errorResponse(res, 503, 'urn:ok:error:sync-not-active', 'Sync engine not active.', {
          handler: 'sync-resolve-conflict',
        });
        return;
      }
      const { file, strategy, content } = body;
      try {
        await engine.resolveConflict(file, strategy as ResolveStrategy, content);
        successResponse(
          res,
          200,
          SyncResolveConflictSuccessSchema,
          {},
          {
            handler: 'sync-resolve-conflict',
          },
        );
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
    if (file.includes('..') || file.startsWith('/')) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid file path.', {
        handler: 'sync-conflict-content',
      });
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
      successResponse(
        res,
        200,
        SyncConflictContentSuccessSchema,
        { file, base, ours, theirs },
        { handler: 'sync-conflict-content' },
      );
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
    const rawPackId = url.searchParams.get('packId');
    const packId = coercePackId(rawPackId);
    if (rawPackId !== null && rawPackId !== '' && packId === undefined) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Unknown packId.', {
        handler: 'seed-plan',
        detail: `Pack id "${rawPackId}" is not registered.`,
      });
      return;
    }
    try {
      const plan = await planSeed({ projectDir: contentDir, rootDir, packId });
      successResponse(res, 200, SeedPlanSuccessSchema, { plan }, { handler: 'seed-plan' });
    } catch (err) {
      if (err instanceof SeedPrerequisiteError) {
        errorResponse(
          res,
          422,
          'urn:ok:error:seed-prerequisite-missing',
          'Seed prerequisite missing.',
          { handler: 'seed-plan', cause: err },
        );
        return;
      }
      if (err instanceof SeedRootDirError) {
        errorResponse(res, 400, 'urn:ok:error:seed-invalid-root', 'Invalid seed root directory.', {
          handler: 'seed-plan',
          detail: 'The provided root directory is not within the workspace content directory.',
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
      const planValue = body.plan;
      if (!planValue || typeof planValue !== 'object') {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid plan payload.', {
          handler: 'seed-apply',
        });
        return;
      }
      const plan = planValue as ScaffoldPlan;
      const looseBody = body as { packId?: unknown };
      const rawPackId = looseBody.packId;
      const packId = coercePackId(rawPackId);
      if (typeof rawPackId === 'string' && rawPackId.length > 0 && packId === undefined) {
        errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Unknown packId.', {
          handler: 'seed-apply',
          detail: `Pack id "${rawPackId}" is not registered.`,
        });
        return;
      }
      try {
        const result = await applySeed(plan, { projectDir: contentDir, packId });
        successResponse(res, 200, SeedApplySuccessSchema, { result }, { handler: 'seed-apply' });
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

  async function handleSeedPacks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'seed-packs' })) return;
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'seed-packs',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    successResponse(
      res,
      200,
      SeedListPacksSuccessSchema,
      { packs: listStarterPacks() },
      { handler: 'seed-packs' },
    );
  }

  const handleInstallSkill = withValidation(
    InstallSkillRequestSchema,
    async (_req, res, body) => {
      if (body.out !== undefined && !isSafeLocalPath(body.out)) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          'Output path must be within home directory.',
          { handler: 'install-skill' },
        );
        return;
      }

      try {
        const result = await buildAndOpenSkill({
          ...(body.noOpen !== undefined ? { noOpen: body.noOpen } : {}),
          ...(body.out !== undefined ? { out: body.out } : {}),
        });
        successResponse(res, 200, InstallSkillSuccessSchema, result, {
          handler: 'install-skill',
        });
      } catch (err) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to install skill.', {
          handler: 'install-skill',
          cause: err,
        });
      }
    },
    {
      handler: 'install-skill',
      method: 'POST',
      preBodyGate: (req, res) => checkLocalOpSecurity(req, res, { handler: 'install-skill' }),
    },
  );

  async function handleInstalledAgentsRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'installed-agents' })) return;
    try {
      await handleInstalledAgents(req, res, installedAgentsCache.probeAll);
    } catch (e) {
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
      successResponse(
        res,
        200,
        SyncAbortMergeSuccessSchema,
        {},
        {
          handler: 'sync-abort-merge',
        },
      );
    } catch (e) {
      errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to abort merge.', {
        handler: 'sync-abort-merge',
        cause: e,
      });
    }
  }

  const handleTagsList = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      if (!tagIndex) {
        errorResponse(
          res,
          503,
          'urn:ok:error:tag-index-not-configured',
          'Tag index not configured.',
          { handler: 'tags-list' },
        );
        return;
      }
      try {
        const tags = tagIndex.getAllTags();
        successResponse(res, 200, TagsListSuccessSchema, { tags }, { handler: 'tags-list' });
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read tags.', {
          handler: 'tags-list',
          cause: e,
        });
      }
    },
    { handler: 'tags-list', method: 'GET', skipBodyParse: true },
  );

  async function handleTagsForName(
    req: IncomingMessage,
    res: ServerResponse,
    rawName: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
        handler: 'tags-for-name',
        extraHeaders: { Allow: 'GET' },
      });
      return;
    }
    if (!tagIndex) {
      errorResponse(
        res,
        503,
        'urn:ok:error:tag-index-not-configured',
        'Tag index not configured.',
        { handler: 'tags-for-name' },
      );
      return;
    }
    let name: string;
    try {
      name = decodeURIComponent(rawName);
    } catch {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Invalid tag name encoding.', {
        handler: 'tags-for-name',
      });
      return;
    }
    if (!name) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Missing tag name.', {
        handler: 'tags-for-name',
      });
      return;
    }
    try {
      const docs = tagIndex.getDocsForTagWithMatches(name).map(({ docName, matchingTags }) => ({
        docName,
        title: readPageTitleForDocName(docName),
        matchingTags,
        snippet: null,
      }));
      successResponse(
        res,
        200,
        TagsForNameSuccessSchema,
        { name, docs },
        {
          handler: 'tags-for-name',
        },
      );
    } catch (e) {
      errorResponse(
        res,
        500,
        'urn:ok:error:internal-server-error',
        'Failed to read tag membership.',
        { handler: 'tags-for-name', cause: e },
      );
    }
  }

  function validateFolderRel(
    raw: string,
    res: ServerResponse,
    label: 'path' | 'folder' = 'path',
    handler = 'folder-config',
  ): { folderRel: string; resolvedContentDir: string } | null {
    const folderRel = raw.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (folderRel.split('/').some((seg) => seg === '..') || raw.startsWith('/')) {
      errorResponse(
        res,
        400,
        'urn:ok:error:invalid-request',
        `Invalid ${label}: must be project-root-relative.`,
        { handler },
      );
      return null;
    }
    const resolvedContentDir = resolve(contentDir);
    const candidateAbs =
      folderRel === '' ? resolvedContentDir : resolve(resolvedContentDir, folderRel);
    if (
      candidateAbs !== resolvedContentDir &&
      !candidateAbs.startsWith(`${resolvedContentDir}${sep}`)
    ) {
      errorResponse(res, 400, 'urn:ok:error:invalid-request', 'Path escapes content directory.', {
        handler,
      });
      return null;
    }
    return { folderRel, resolvedContentDir };
  }

  const TEMPLATE_NAME_RE = /^[A-Za-z0-9_-]+$/;
  function validateTemplateName(name: string, res: ServerResponse, handler = 'template'): boolean {
    if (!name || !TEMPLATE_NAME_RE.test(name)) {
      errorResponse(
        res,
        400,
        'urn:ok:error:invalid-request',
        'Invalid name: must be letters / digits / `_` / `-` only (no `.md` extension).',
        { handler },
      );
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
    errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
      handler: 'folder-config',
      extraHeaders: { Allow: 'GET, PUT' },
    });
  }

  const handleFolderConfigGet = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const validated = validateFolderRel(
          url.searchParams.get('path') ?? '',
          res,
          'path',
          'folder-config-get',
        );
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
        successResponse(
          res,
          200,
          FolderConfigGetSuccessSchema,
          { folder: meta, frontmatter_local: frontmatterLocal },
          { handler: 'folder-config-get' },
        );
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read folder config.',
          { handler: 'folder-config-get', cause: e },
        );
      }
    },
    { handler: 'folder-config-get', method: 'GET', skipBodyParse: true },
  );

  const handleFolderConfigPut = withValidation(
    FolderConfigPutRequestSchema,
    async (_req, res, body) => {
      try {
        const validated = validateFolderRel(body.path, res, 'path', 'folder-config-put');
        if (!validated) return;

        const match = validated.folderRel === '' ? '**' : `${validated.folderRel}/**`;
        const result = applyNestedFolderRulesUpsert({
          projectDir: validated.resolvedContentDir,
          rules: [{ match, frontmatter: pickFrontmatterFields(body.frontmatter) }],
        });

        if (!result.ok) {
          const status =
            result.error.code === 'WRITE_ERROR' || result.error.code === 'BAD_PROJECT_DIR'
              ? 500
              : 400;
          const urn =
            status === 500 ? 'urn:ok:error:internal-server-error' : 'urn:ok:error:invalid-request';
          const title =
            status === 500 ? 'Failed to write folder config.' : 'Invalid folder config request.';
          errorResponse(res, status, urn, title, {
            handler: 'folder-config-put',
            detail: result.error.code,
            cause: new Error(result.error.message),
          });
          return;
        }

        successResponse(
          res,
          200,
          FolderConfigPutSuccessSchema,
          { applied: result.applied },
          { handler: 'folder-config-put' },
        );
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to write folder config.',
          { handler: 'folder-config-put', cause: e },
        );
      }
    },
    { handler: 'folder-config-put', method: 'PUT' },
  );

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
    errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
      handler: 'template',
      extraHeaders: { Allow: 'GET, PUT, DELETE' },
    });
  }

  const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const parseTemplateFile = (
    raw: string,
  ): { frontmatter: Record<string, unknown>; body: string } => {
    const match = raw.match(FRONTMATTER_RE);
    let frontmatter: Record<string, unknown> = {};
    let body = raw;
    if (match) {
      try {
        const parsed = parseYaml(match[1] ?? '');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch {}
      body = raw.slice(match[0].length);
    }
    return { frontmatter, body };
  };

  const handleTemplateGet = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = url.searchParams.get('name') ?? '';
        if (!validateTemplateName(name, res, 'template-get')) return;

        const validated = validateFolderRel(
          url.searchParams.get('folder') ?? '',
          res,
          'folder',
          'template-get',
        );
        if (!validated) return;
        const { folderRel, resolvedContentDir } = validated;

        const segments = folderRel === '' ? [] : folderRel.split('/');
        let foundAbs: string | null = null;
        let foundFolder: string | null = null;
        let foundScope: 'local' | 'inherited' | null = null;

        for (let depth = segments.length; depth >= 0; depth--) {
          const ancestorFolder = depth === 0 ? '' : segments.slice(0, depth).join('/');
          const ancestorAbs =
            ancestorFolder === ''
              ? resolvedContentDir
              : resolve(resolvedContentDir, ancestorFolder);
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
          errorResponse(res, 404, 'urn:ok:error:template-not-found', 'Template not found.', {
            handler: 'template-get',
            detail: `Template "${name}" not found for folder "${folderRel || '.'}". Walked leaf → root.`,
          });
          return;
        }

        const raw = await readFile(foundAbs, 'utf-8');
        const { frontmatter, body } = parseTemplateFile(raw);

        const relPath = relative(resolvedContentDir, foundAbs)
          .split(/[\\/]/)
          .filter(Boolean)
          .join('/');

        successResponse(
          res,
          200,
          TemplateGetSuccessSchema,
          {
            template: {
              name,
              folder: foundFolder,
              scope: foundScope,
              path: relPath,
              frontmatter,
              body,
            },
          },
          { handler: 'template-get' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to read template.', {
          handler: 'template-get',
          cause: e,
        });
      }
    },
    { handler: 'template-get', method: 'GET', skipBodyParse: true },
  );

  const handleTemplatePut = withValidation(
    TemplatePutRequestSchema,
    async (_req, res, body) => {
      try {
        const name = body.name;
        if (!validateTemplateName(name, res, 'template-put')) return;
        const validated = validateFolderRel(body.folder, res, 'folder', 'template-put');
        if (!validated) return;

        const writeInput: Parameters<typeof applyTemplateWrite>[0] = {
          projectDir: validated.resolvedContentDir,
          folder: validated.folderRel,
          name,
          body: typeof body.body === 'string' ? body.body : '',
          frontmatter: pickFrontmatterFields(body.frontmatter) satisfies TemplateFrontmatter,
        };
        const result = applyTemplateWrite(writeInput);
        if (!result.ok) {
          const status =
            result.error.code === 'WRITE_ERROR' || result.error.code === 'BAD_PROJECT_DIR'
              ? 500
              : 400;
          const urn =
            status === 500 ? 'urn:ok:error:internal-server-error' : 'urn:ok:error:invalid-request';
          const title = status === 500 ? 'Failed to write template.' : 'Invalid template request.';
          errorResponse(res, status, urn, title, {
            handler: 'template-put',
            detail: result.error.code,
            cause: new Error(result.error.message),
          });
          return;
        }
        successResponse(
          res,
          200,
          TemplatePutSuccessSchema,
          {
            path: result.path,
            created: result.created,
            warnings: result.warnings,
          },
          { handler: 'template-put' },
        );
      } catch (e) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Failed to write template.', {
          handler: 'template-put',
          cause: e,
        });
      }
    },
    { handler: 'template-put', method: 'PUT' },
  );

  const handleTemplateDelete = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = url.searchParams.get('name') ?? '';
        if (!validateTemplateName(name, res, 'template-delete')) return;
        const validated = validateFolderRel(
          url.searchParams.get('folder') ?? '',
          res,
          'folder',
          'template-delete',
        );
        if (!validated) return;

        const deleteInput: Parameters<typeof applyTemplateDelete>[0] = {
          projectDir: validated.resolvedContentDir,
          folder: validated.folderRel,
          name,
        };
        const result = applyTemplateDelete(deleteInput);
        if (!result.ok) {
          const status =
            result.error.code === 'WRITE_ERROR' ||
            result.error.code === 'UNLINK_FAILED' ||
            result.error.code === 'BAD_PROJECT_DIR'
              ? 500
              : 400;
          const urn =
            status === 500 ? 'urn:ok:error:internal-server-error' : 'urn:ok:error:invalid-request';
          const title = status === 500 ? 'Failed to delete template.' : 'Invalid template request.';
          errorResponse(res, status, urn, title, {
            handler: 'template-delete',
            detail: result.error.code,
            cause: new Error(result.error.message),
          });
          return;
        }
        successResponse(
          res,
          200,
          TemplateDeleteSuccessSchema,
          { existed: result.existed, path: result.path },
          { handler: 'template-delete' },
        );
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to delete template.',
          { handler: 'template-delete', cause: e },
        );
      }
    },
    { handler: 'template-delete', method: 'DELETE', skipBodyParse: true },
  );

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
    const prefix = start > 0 ? '…' : '';
    const suffix = end < content.length ? '…' : '';
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
          `${docName} ${entry.modified} ${entry.size} ${entry.canonicalPath} ${entry.inode} ${entry.aliases.join(',')}`,
      )
      .join('');
  }

  async function getWorkspaceSearchCorpus(): Promise<WorkspaceSearchCorpus> {
    const cacheKey = `${contentDir} ${projectDir ?? ''}`;
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
    if (req.method === 'GET') {
      return handleSearchGet(req, res);
    }
    if (req.method === 'POST') {
      return handleSearchPost(req, res);
    }
    errorResponse(res, 405, 'urn:ok:error:method-not-allowed', 'Method not allowed.', {
      handler: 'search',
      extraHeaders: { Allow: 'GET, POST' },
    });
  }

  const handleSearchGet = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      const limit = url.searchParams.get('limit');
      const query = url.searchParams.get('query') ?? '';
      const intent = parseSearchIntent(url.searchParams.get('intent'));
      const scopes = parseSearchScopes(
        url.searchParams.get('scope') ?? url.searchParams.get('scopes'),
      );
      const limitNum = limit === null ? undefined : Number(limit);

      if (query.length > 200) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          'Query is too long (max 200 chars).',
          { handler: 'search-get' },
        );
        return;
      }
      try {
        const startedAt = performance.now();
        const corpus = await getWorkspaceSearchCorpus();
        const results = searchWorkspaceCorpus(corpus, query, {
          intent,
          scopes,
          limit: limitNum,
        });
        successResponse(
          res,
          200,
          SearchSuccessSchema,
          {
            query,
            intent,
            results: results.map((result) => ({
              kind: result.document.kind,
              path: result.document.path,
              title: result.document.title,
              score: result.score,
              signals: result.signals,
              snippet:
                result.document.kind === 'page'
                  ? buildSearchSnippet(result.document.content, query)
                  : undefined,
            })),
            elapsedMs: Math.max(0, performance.now() - startedAt),
          },
          { handler: 'search-get' },
        );
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to search workspace.',
          { handler: 'search-get', cause: e },
        );
      }
    },
    { handler: 'search-get', method: 'GET', skipBodyParse: true },
  );

  const handleSearchPost = withValidation(
    SearchRequestSchema,
    async (_req, res, body) => {
      const query = typeof body.query === 'string' ? body.query : '';
      const intent = parseSearchIntent(body.intent);
      const scopes = parseSearchScopes(body.scopes ?? body.scope);
      const limit = typeof body.limit === 'number' ? body.limit : undefined;

      if (query.length > 200) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          'Query is too long (max 200 chars).',
          { handler: 'search-post' },
        );
        return;
      }
      try {
        const startedAt = performance.now();
        const corpus = await getWorkspaceSearchCorpus();
        const results = searchWorkspaceCorpus(corpus, query, {
          intent,
          scopes,
          limit,
        });
        successResponse(
          res,
          200,
          SearchSuccessSchema,
          {
            query,
            intent,
            results: results.map((result) => ({
              kind: result.document.kind,
              path: result.document.path,
              title: result.document.title,
              score: result.score,
              signals: result.signals,
              snippet:
                result.document.kind === 'page'
                  ? buildSearchSnippet(result.document.content, query)
                  : undefined,
            })),
            elapsedMs: Math.max(0, performance.now() - startedAt),
          },
          { handler: 'search-post' },
        );
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to search workspace.',
          { handler: 'search-post', cause: e },
        );
      }
    },
    { handler: 'search-post', method: 'POST' },
  );

  const handleSkillInstallState = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      try {
        const snapshot = await readSkillInstallStateSnapshot(homedir());
        successResponse(
          res,
          200,
          SkillInstallStateSuccessSchema,
          { ...snapshot },
          {
            handler: 'skill-install-state',
            extraHeaders: { 'Cache-Control': 'no-store' },
          },
        );
      } catch (e) {
        errorResponse(
          res,
          500,
          'urn:ok:error:internal-server-error',
          'Failed to read skill install state.',
          { handler: 'skill-install-state', cause: e },
        );
      }
    },
    {
      handler: 'skill-install-state',
      method: 'GET',
      skipBodyParse: true,
      preBodyGate: (req, res) => checkLocalOpSecurity(req, res, { handler: 'skill-install-state' }),
    },
  );

  async function handleHandoffDispatchRoute(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'handoff' })) return;
    try {
      await handleHandoffDispatch(req, res, {
        contentDir,
        platform: process.platform,
      });
    } catch (e) {
      if (!res.headersSent) {
        log.error({ err: e }, '[handoff] route wrapper failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'handoff',
          cause: e,
        });
      }
    }
  }

  async function handleSpawnCursorRoute(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!checkLocalOpSecurity(req, res, { handler: 'spawn-cursor' })) return;
    try {
      await handleSpawnCursor(req, res, {
        contentDir,
        platform: process.platform,
      });
    } catch (e) {
      if (!res.headersSent) {
        log.error({ err: e }, '[spawn-cursor] route wrapper failed');
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: 'spawn-cursor',
          cause: e,
        });
      }
    }
  }

  const handleShareConstructUrl = withValidation(
    ShareConstructUrlRequestSchema,
    async (_req, res, body) => {
      try {
        if (!projectDir) {
          emitShareConstructUrlLog('no-remote');
          successResponse(
            res,
            200,
            ShareConstructUrlResponseSchema,
            { ok: false, error: 'no-remote' },
            { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
          );
          return;
        }
        if (!isValidShareDocPath(body.docPath)) {
          emitShareConstructUrlLog('invalid-path');
          successResponse(
            res,
            200,
            ShareConstructUrlResponseSchema,
            { ok: false, error: 'invalid-path' },
            { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
          );
          return;
        }
        const branch = readGitHeadBranch(projectDir);
        if (branch === null) {
          const originPeek = readOriginGitHubRepo(projectDir);
          if (originPeek.kind === 'no-remote') {
            emitShareConstructUrlLog('no-remote');
            successResponse(
              res,
              200,
              ShareConstructUrlResponseSchema,
              { ok: false, error: 'no-remote' },
              { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
            );
            return;
          }
          emitShareConstructUrlLog('detached-head');
          successResponse(
            res,
            200,
            ShareConstructUrlResponseSchema,
            { ok: false, error: 'detached-head' },
            { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
          );
          return;
        }
        const origin = readOriginGitHubRepo(projectDir);
        if (origin.kind === 'no-remote') {
          emitShareConstructUrlLog('no-remote');
          successResponse(
            res,
            200,
            ShareConstructUrlResponseSchema,
            { ok: false, error: 'no-remote' },
            { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
          );
          return;
        }
        if (origin.kind === 'non-github') {
          emitShareConstructUrlLog('non-github-remote');
          successResponse(
            res,
            200,
            ShareConstructUrlResponseSchema,
            { ok: false, error: 'non-github-remote' },
            { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
          );
          return;
        }
        const branchExists = branchExistsOnOrigin(projectDir, branch);
        if (!branchExists) {
          emitShareConstructUrlLog('branch-not-on-origin', false);
          successResponse(
            res,
            200,
            ShareConstructUrlResponseSchema,
            { ok: false, error: 'branch-not-on-origin', branch },
            { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
          );
          return;
        }
        const blobUrl = buildGitHubBlobUrl(origin.owner, origin.repo, branch, body.docPath);
        const shareUrl = `${SHARE_BASE_URL}${encodeShareUrl(blobUrl)}`;
        emitShareConstructUrlLog('ok', true);
        successResponse(
          res,
          200,
          ShareConstructUrlResponseSchema,
          { ok: true, shareUrl, blobUrl, branch },
          { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG },
        );
      } catch (err) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: SHARE_CONSTRUCT_URL_HANDLER_TAG,
          cause: err,
        });
      }
    },
    {
      handler: SHARE_CONSTRUCT_URL_HANDLER_TAG,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: SHARE_CONSTRUCT_URL_HANDLER_TAG }),
    },
  );

  async function spawnShareSubprocess(
    args: readonly string[],
  ): Promise<{ stdout: string; code: number | null }> {
    const [cmd, ...baseArgs] = localOpCliArgs;
    const spawnArgs = [...baseArgs, ...args];
    return await new Promise<{ stdout: string; code: number | null }>((resolveSpawn, reject) => {
      const child = spawn(cmd, spawnArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
      let timedOut = false;
      const killTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, SHARE_PUBLISH_TIMEOUT_MS);
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
      child.on('close', (code) => {
        clearTimeout(killTimer);
        if (timedOut) {
          reject(new Error(`share subprocess timed out after ${SHARE_PUBLISH_TIMEOUT_MS}ms`));
          return;
        }
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8');
          const redacted = redactShareSubprocessStderr(stderr).slice(0, 500);
          console.warn(`[share] subprocess exited code=${code} stderr=${redacted}`);
        }
        resolveSpawn({ stdout, code });
      });
      child.on('error', (err) => {
        clearTimeout(killTimer);
        reject(err);
      });
    });
  }

  const handleSharePublishOwners = withValidation(
    EmptyRequestSchema,
    async (_req, res) => {
      if (!localOpGuard.tryAcquire(SHARE_PUBLISH_OWNERS_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'A share owners operation is already in progress.',
          { handler: SHARE_PUBLISH_OWNERS_HANDLER_TAG, extraHeaders: { 'Retry-After': '5' } },
        );
        return;
      }
      try {
        const { stdout } = await spawnShareSubprocess(['share', 'owners', '--json']);
        const event = pickTerminalJsonLine(stdout);
        const body = parseOwnersEvent(event);
        emitSharePublishLog(
          'owners-list',
          body.ok ? 'ok' : body.error,
          body.ok ? { count: body.owners.length } : undefined,
        );
        successResponse(res, 200, SharePublishOwnersResponseSchema, body, {
          handler: SHARE_PUBLISH_OWNERS_HANDLER_TAG,
        });
      } catch (err) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: SHARE_PUBLISH_OWNERS_HANDLER_TAG,
          cause: err,
        });
      } finally {
        localOpGuard.release(SHARE_PUBLISH_OWNERS_KEY);
      }
    },
    {
      handler: SHARE_PUBLISH_OWNERS_HANDLER_TAG,
      method: 'GET',
      skipBodyParse: true,
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: SHARE_PUBLISH_OWNERS_HANDLER_TAG }),
    },
  );

  const handleSharePublishNameCheck = withValidation(
    EmptyRequestSchema,
    async (req, res) => {
      const url = new URL(req.url ?? '', 'http://localhost');
      const owner = url.searchParams.get('owner') ?? '';
      const name = url.searchParams.get('name') ?? '';
      if (!isValidShareOwnerName(owner) || !isValidShareRepoName(name)) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          'owner and name query params must be valid GitHub identifiers.',
          { handler: SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG },
        );
        return;
      }
      if (!localOpGuard.tryAcquire(SHARE_PUBLISH_NAME_CHECK_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'A share name-check operation is already in progress.',
          { handler: SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG, extraHeaders: { 'Retry-After': '5' } },
        );
        return;
      }
      try {
        const { stdout } = await spawnShareSubprocess([
          'share',
          'name-check',
          '--owner',
          owner,
          '--name',
          name,
          '--json',
        ]);
        const event = pickTerminalJsonLine(stdout);
        const body = parseNameCheckEvent(event);
        emitSharePublishLog(
          'name-check',
          body.ok ? 'ok' : body.error,
          body.ok ? { available: body.available } : undefined,
        );
        successResponse(res, 200, SharePublishNameCheckResponseSchema, body, {
          handler: SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG,
        });
      } catch (err) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG,
          cause: err,
        });
      } finally {
        localOpGuard.release(SHARE_PUBLISH_NAME_CHECK_KEY);
      }
    },
    {
      handler: SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG,
      method: 'GET',
      skipBodyParse: true,
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: SHARE_PUBLISH_NAME_CHECK_HANDLER_TAG }),
    },
  );

  const handleSharePublish = withValidation(
    SharePublishRequestSchema,
    async (_req, res, body) => {
      if (!projectDir) {
        emitSharePublishLog('publish-create', 'no-project');
        successResponse(
          res,
          200,
          SharePublishResponseSchema,
          { ok: false, error: 'no-project' },
          { handler: SHARE_PUBLISH_HANDLER_TAG },
        );
        return;
      }
      if (!isValidShareOwnerName(body.owner) || !isValidShareRepoName(body.name)) {
        errorResponse(
          res,
          400,
          'urn:ok:error:invalid-request',
          'owner and name must be valid GitHub identifiers.',
          { handler: SHARE_PUBLISH_HANDLER_TAG },
        );
        return;
      }
      if (!localOpGuard.tryAcquire(SHARE_PUBLISH_KEY)) {
        errorResponse(
          res,
          429,
          'urn:ok:error:concurrent-operation',
          'A share publish operation is already in progress.',
          { handler: SHARE_PUBLISH_HANDLER_TAG, extraHeaders: { 'Retry-After': '5' } },
        );
        return;
      }
      try {
        const args = [
          'share',
          'publish',
          '--owner',
          body.owner,
          '--name',
          body.name,
          '--visibility',
          body.visibility,
          '--project-dir',
          projectDir,
          '--json',
        ];
        if (body.description !== undefined && body.description.length > 0) {
          args.push('--description', body.description);
        }
        const { stdout } = await spawnShareSubprocess(args);
        const event = pickTerminalJsonLine(stdout);
        const responseBody = parsePublishEvent(event);
        emitSharePublishLog('publish-create', responseBody.ok ? 'ok' : responseBody.error);
        successResponse(res, 200, SharePublishResponseSchema, responseBody, {
          handler: SHARE_PUBLISH_HANDLER_TAG,
        });
      } catch (err) {
        errorResponse(res, 500, 'urn:ok:error:internal-server-error', 'Internal server error.', {
          handler: SHARE_PUBLISH_HANDLER_TAG,
          cause: err,
        });
      } finally {
        localOpGuard.release(SHARE_PUBLISH_KEY);
      }
    },
    {
      handler: SHARE_PUBLISH_HANDLER_TAG,
      method: 'POST',
      preBodyGate: (req, res) =>
        checkLocalOpSecurity(req, res, { handler: SHARE_PUBLISH_HANDLER_TAG }),
    },
  );

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
    '/api/asset': handleAsset,
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
    '/api/create-folder': handleCreateFolder,
    '/api/rename-path': handleRenamePath,
    '/api/delete-path': handleDeletePath,
    '/api/trash/cleanup': handleTrashCleanup,
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
    '/api/share/construct-url': handleShareConstructUrl,
    '/api/share/publish/owners': handleSharePublishOwners,
    '/api/share/publish/name-check': handleSharePublishNameCheck,
    '/api/share/publish': handleSharePublish,
    '/api/principal': handlePrincipal,
    '/api/rescue': handleRescueList,
    '/api/workspace': handleWorkspace,
    '/api/sync/status': handleSyncStatus,
    '/api/sync/trigger': handleSyncTrigger,
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
    '/api/spawn-cursor': handleSpawnCursorRoute,
    '/api/handoff': handleHandoffDispatchRoute,
    '/api/install-skill': handleInstallSkill,
    '/api/skill/install-state': handleSkillInstallState,
    '/api/seed/plan': handleSeedPlan,
    '/api/seed/apply': handleSeedApply,
    '/api/seed/packs': handleSeedPacks,
  };

  if (enableTestRoutes) {
    routes['/api/test-reset'] = handleTestReset;
    routes['/api/test-rescan-backlinks'] = handleTestRescanBacklinks;
    routes['/api/test-rescan-files'] = handleTestRescanFiles;
  }

  const MUTATING_ROUTES: ReadonlySet<string> = new Set([
    '/api/upload',
    '/api/create-page',
    '/api/create-folder',
    '/api/rename-path',
    '/api/delete-path',
    '/api/trash/cleanup',
    '/api/agent-write',
    '/api/agent-write-md',
    '/api/agent-patch',
    '/api/agent-undo',
    '/api/save-version',
    '/api/rollback',
    '/api/sync/trigger',
    '/api/sync/resolve-conflict',
    '/api/sync/abort-merge',
    '/api/test-reset',
    '/api/test-rescan-backlinks',
    '/api/test-rescan-files',
    '/api/install-skill',
    '/api/folder-config',
    '/api/template',
    '/api/seed/apply',
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

      if (!url.startsWith('/api/')) return;

      const extractedCtx = propagation.extract(context.active(), request.headers);
      const method = request.method ?? 'GET';
      let routeTemplate = url;
      if (url.startsWith('/api/rescue/')) routeTemplate = '/api/rescue/:docName';
      else if (url.startsWith('/api/history/')) routeTemplate = '/api/history/:sha';
      else if (url.startsWith('/api/tags/')) routeTemplate = '/api/tags/:name';
      else if (!routes[url]) routeTemplate = '/api/*';

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
              let dispatched = false;
              if (handler) {
                dispatched = true;
                await handler(request, response);
              } else if (url.startsWith('/api/rescue/')) {
                const docName = decodeURIComponent(url.slice('/api/rescue/'.length));
                if (docName) {
                  dispatched = true;
                  await handleRescueGet(request, response, docName);
                }
              } else if (url.startsWith('/api/history/')) {
                const sha = decodeURIComponent(url.slice('/api/history/'.length));
                if (sha) {
                  dispatched = true;
                  await handleHistoryVersion(request, response, sha);
                }
              } else if (url.startsWith('/api/tags/')) {
                const rawName = url.slice('/api/tags/'.length);
                if (rawName) {
                  dispatched = true;
                  await handleTagsForName(request, response, rawName);
                }
              }

              if (!dispatched) {
                errorResponse(response, 404, 'urn:ok:error:not-found', 'API endpoint not found.', {
                  handler: 'api-dispatch',
                  detail: `No handler for ${method} ${url}`,
                });
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
              if (!response.headersSent && !response.writableEnded && !response.destroyed) {
                errorResponse(
                  response,
                  500,
                  'urn:ok:error:internal-server-error',
                  'Internal server error.',
                  {
                    handler: routeTemplate,
                    cause: err,
                  },
                );
              }
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
