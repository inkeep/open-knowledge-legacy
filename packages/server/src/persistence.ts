import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { Extension } from '@hocuspocus/server';
import {
  type ConfigValidationError,
  normalizeBridge,
  type Principal,
  prependFrontmatter,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import {
  composeCommitSubject,
  formatOkActor,
  formatWipSubject,
  type OkActorEntry,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import type { JSONContent } from '@tiptap/core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import type { BacklinkIndex } from './backlink-index.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { type ConfigPersistenceCtx, loadConfigDoc, storeConfigDoc } from './config-persistence.ts';
import type { ContributorEntry } from './contributor-tracker.ts';
import {
  contributorCount,
  hasContributor,
  recordContributor,
  restoreContributorEntry,
  restoreContributors,
  swapContributors,
} from './contributor-tracker.ts';
import { getDocExtension } from './doc-extensions.ts';
import { applyDiskContentToDoc } from './external-change.ts';
import { contentHash, registerWrite } from './file-watcher.ts';
import { tracedMkdir, tracedRename, tracedUnlinkSync, tracedWriteFile } from './fs-traced.ts';
import { getLogger } from './logger.ts';
import { mdManager, schema } from './md-manager.ts';
import {
  incrementGitAutoSaveFailure,
  incrementGitWriterCommitFailure,
  incrementPersistenceDiskWrite,
} from './metrics.ts';
import { classifyDuplication } from './persistence-tripwire.ts';
import type { ShadowRef, WriterIdentity } from './shadow-repo.ts';
import {
  buildWipTree,
  commitWip,
  commitWipFromTree,
  FILE_SYSTEM_WRITER,
  GIT_UPSTREAM_WRITER,
  SERVICE_WRITER,
  shadowGit,
} from './shadow-repo.ts';
import { getMeter, setActiveSpanAttributes, withSpan } from './telemetry.ts';

const log = getLogger('persistence');

export function resolveWriterFromOrigin(
  origin: unknown,
  getPrincipal?: () => Principal | null,
): WriterIdentity | null {
  if (!origin || typeof origin !== 'object') return null;
  const o = origin as Record<string, unknown>;

  if (o.source === 'local') {
    const ctx = o.context as Record<string, unknown> | undefined;
    if (!ctx) return null;

    if (typeof ctx.session_id === 'string') {
      const sessionId = ctx.session_id;
      return {
        id: `agent-${sessionId}`,
        name: `Agent (${sessionId.slice(0, 8)})`,
        email: `agent-${sessionId}@openknowledge.local`,
      };
    }

    if (ctx.origin === 'file-watcher') return FILE_SYSTEM_WRITER;
    if (ctx.origin === 'upstream-import' || ctx.origin === 'git-upstream') {
      return GIT_UPSTREAM_WRITER;
    }
    return SERVICE_WRITER;
  }

  if (o.source === 'connection') {
    const conn = o.connection as Record<string, unknown> | undefined;
    const ctx = conn?.context as Record<string, unknown> | undefined;
    if (typeof ctx?.principalId === 'string') {
      const principalId = ctx.principalId as string;
      const loaded = getPrincipal?.();
      if (loaded && loaded.id === principalId && loaded.display_name && loaded.display_email) {
        return {
          id: loaded.id,
          name: loaded.display_name,
          email: loaded.display_email,
        };
      }
      return {
        id: principalId,
        name: 'Local User',
        email: `${principalId}@openknowledge.local`,
      };
    }
    return SERVICE_WRITER;
  }

  return null;
}

export interface PersistenceOptions {
  contentDir: string;
  projectDir: string;
  gitEnabled?: boolean;
  commitDebounceMs?: number;
  wipRef?: string;
  shadowRef?: ShadowRef;
  contentRoot?: string;
  backlinkIndex?: BacklinkIndex;
  getCurrentBranch?: () => string | null;
  resolveEmbed?: (basename: string, sourcePath: string) => string | null;
  getPrincipal?: () => Principal | null;
  onAgentCommit?: () => void;
  onDiskFlush?: (docName: string, sv: Uint8Array) => void;
  applyDiskContentToDoc?: (document: Y.Doc, content: string) => void;
  configHomedirOverride?: string;
  onConfigRejected?: (docName: string, error: ConfigValidationError) => void;
}

export function captureDocSnapshotForPersistence(document: Y.Doc): {
  readonly sv: Uint8Array;
  readonly json: JSONContent;
} {
  return {
    sv: Y.encodeStateVector(document),
    json: yXmlFragmentToProseMirrorRootNode(document.getXmlFragment('default'), schema).toJSON(),
  };
}

export function safeContentPath(documentName: string, contentDir: string): string {
  if (documentName.includes('\x00')) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  const ext = getDocExtension(documentName);
  const filePath = resolve(contentDir, `${documentName}${ext}`);
  if (!filePath.startsWith(`${contentDir}/`)) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  return filePath;
}

export function isWithinContentDir(p: string, contentDir: string): boolean {
  return p === contentDir || p.startsWith(contentDir + sep);
}

const reconciledBaseByBranch = new Map<string, Map<string, string>>();

let activeBranch = 'main';

export function switchReconciledBaseScope(branch: string): void {
  activeBranch = branch;
  if (!reconciledBaseByBranch.has(branch)) {
    reconciledBaseByBranch.set(branch, new Map());
  }
}

export function getActiveBranch(): string {
  return activeBranch;
}

export function getReconciledBase(docName: string): string | undefined {
  return reconciledBaseByBranch.get(activeBranch)?.get(docName);
}

export function setReconciledBase(docName: string, content: string): void {
  if (!reconciledBaseByBranch.has(activeBranch)) {
    reconciledBaseByBranch.set(activeBranch, new Map());
  }
  reconciledBaseByBranch.get(activeBranch)?.set(docName, content);
}

export function deleteReconciledBase(docName: string): void {
  reconciledBaseByBranch.get(activeBranch)?.delete(docName);
}

let batchInProgress = false;

export function setBatchInProgress(value: boolean): void {
  batchInProgress = value;
}

export function isBatchInProgress(): boolean {
  return batchInProgress;
}

export interface PersistenceHandle {
  extension: Extension;
  flushDeferredStores: (mode?: 'within-branch' | 'discard-stale') => Promise<void>;
  flushPendingGitCommit: () => Promise<void>;
  waitForPendingCommits: () => Promise<void>;
  readonly configPersistenceCtx: ConfigPersistenceCtx;
}

export function createPersistenceExtension(options?: PersistenceOptions): PersistenceHandle {
  const contentDirRaw = options?.contentDir ?? process.cwd();
  let contentDir: string;
  try {
    contentDir = realpathSync(contentDirRaw);
  } catch {
    contentDir = contentDirRaw;
  }
  const projectDir = options?.projectDir ?? process.cwd();
  const shadowRef = options?.shadowRef;
  const contentRoot = options?.contentRoot ?? (relative(projectDir, contentDir) || '.');
  const backlinkIndex = options?.backlinkIndex;
  const getPrincipal = options?.getPrincipal;
  const onAgentCommit = options?.onAgentCommit;
  const onDiskFlush = options?.onDiskFlush;

  const configLkgCache = new Map<string, string>();
  const configPersistenceCtx: ConfigPersistenceCtx = {
    projectDir,
    lkgCache: configLkgCache,
    homedirOverride: options?.configHomedirOverride,
    onConfigRejected: options?.onConfigRejected,
  };

  const tripwireResetFailedDocs = new Set<string>();
  const applyDiskContent = options?.applyDiskContentToDoc ?? applyDiskContentToDoc;
  let pendingDeferredStoreFlushMode: 'within-branch' | 'discard-stale' | null = null;


  const gitEnabled = options?.gitEnabled ?? true;
  const commitDebounceMs = options?.commitDebounceMs ?? 15_000;
  const wipRef = options?.wipRef ?? 'refs/wip/main';
  const getCurrentBranch = options?.getCurrentBranch;


  let gitCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveGitFailures = 0;
  let commitInFlight: Promise<void> | null = null;
  let pendingAfterCommit = false;
  let deferredStoreDrainInFlight: Promise<void> | null = null;
  const deferredStores = new Map<
    string,
    {
      branch: string;
      document: Y.Doc;
      lastTransactionOrigin: unknown;
    }
  >();

  async function commitToWipRef(): Promise<void> {
    ensureHistograms();
    const started = Date.now();
    return withSpan('persistence.commitToWipRef', undefined, async () => {
      const result = await commitToWipRefInner();
      return result;
    }).finally(() => {
      commitDurationHist?.record((Date.now() - started) / 1000);
    });
  }

  async function commitToWipRefInner(): Promise<void> {
    const shadow = shadowRef?.current;
    if (shadow) {
      const snapshot = swapContributors(); // atomic drain — new writes go to fresh map
      const branch = getCurrentBranch?.() ?? 'main';

      if (snapshot.size === 0) {
        const serviceActorEntry: OkActorEntry = {
          v: 1,
          writer_id: SERVICE_WRITER.id,
          principal: null,
          agent_session: null,
          agent_type: null,
          client_name: null,
          client_version: null,
          label: null,
          display_name: SERVICE_WRITER.name,
          color_seed: SERVICE_WRITER.id,
          docs: [],
        };
        const serviceMessage = `${formatWipSubject([])}\n\n${formatOkActor(serviceActorEntry)}`;
        try {
          const sha = await commitWip(shadow, SERVICE_WRITER, contentRoot, serviceMessage, branch);
          consecutiveGitFailures = 0;
          log.info(
            { sha: sha.slice(0, 8), writer: SERVICE_WRITER.id },
            `[persistence] Shadow WIP commit: ${sha.slice(0, 8)} on refs/wip/${SERVICE_WRITER.id}`,
          );
        } catch (e) {
          consecutiveGitFailures++;
          incrementGitAutoSaveFailure();
          log.error(
            { err: e, attempt: consecutiveGitFailures },
            `[persistence] Shadow commit failed (attempt ${consecutiveGitFailures})`,
          );
          if (consecutiveGitFailures >= 3) {
            log.error(
              { attempt: consecutiveGitFailures },
              '[persistence] CRITICAL: Git auto-save has failed 3+ times. Version history is NOT being recorded.',
            );
          }
        }
        return;
      }

      let treeSha: string;
      try {
        treeSha = await buildWipTree(shadow, contentRoot);
      } catch (e) {
        restoreContributors(snapshot);
        consecutiveGitFailures++;
        incrementGitAutoSaveFailure();
        log.error(
          { err: e, attempt: consecutiveGitFailures },
          `[persistence] Shadow WIP tree build failed (attempt ${consecutiveGitFailures})`,
        );
        return;
      }

      let anySuccess = false;
      for (const [writerId, entry] of snapshot as Map<string, ContributorEntry>) {
        const writer: WriterIdentity = {
          id: writerId,
          name: entry.displayName,
          email: `${writerId}@openknowledge.local`,
        };
        const docs = [...entry.docs];
        const a = entry.actor;
        const summaries = [...entry.summaries];
        const actorEntry: OkActorEntry = {
          v: 1,
          writer_id: writerId,
          principal: a?.principalId ?? null,
          agent_session: writerId.startsWith('agent-') ? writerId.slice(6) : null,
          agent_type: a?.agentType ?? null,
          client_name: a?.clientName ?? null,
          client_version: a?.clientVersion ?? null,
          label: a?.label ?? null,
          display_name: entry.displayName,
          color_seed: entry.colorSeed,
          docs,
          ...(summaries.length > 0 ? { summaries } : {}),
        };
        const baseSubject = entry.subjectOverride ?? formatWipSubject(docs);
        const subject = composeCommitSubject(baseSubject, summaries);
        const writerMessage = `${subject}\n\n${formatOkActor(actorEntry)}`;
        try {
          const sha = await commitWipFromTree(shadow, writer, treeSha, writerMessage, branch);
          anySuccess = true;
          log.info(
            { sha: sha.slice(0, 8), writer: writerId, tree: treeSha.slice(0, 8) },
            `[persistence] Shadow WIP commit: ${sha.slice(0, 8)} on refs/wip/${writerId}`,
          );
          if (writerId.startsWith('agent-')) {
            onAgentCommit?.();
          }
        } catch (e) {
          restoreContributorEntry(writerId, entry);
          incrementGitWriterCommitFailure();
          log.error(
            { err: e, writer: writerId },
            `[persistence] Per-writer shadow commit failed for ${writerId}`,
          );
        }
      }

      if (anySuccess) {
        consecutiveGitFailures = 0;
      } else {
        consecutiveGitFailures++;
        incrementGitAutoSaveFailure();
        if (consecutiveGitFailures >= 3) {
          log.error(
            { attempt: consecutiveGitFailures },
            '[persistence] CRITICAL: Git auto-save has failed 3+ times. Version history is NOT being recorded.',
          );
        }
      }
      return;
    }

    const sg = shadowGit({
      gitDir: resolve(projectDir, '.git'),
      workTree: projectDir,
    });
    const tmpIndex = resolve(projectDir, '.git/index-wip');
    const env = { GIT_INDEX_FILE: tmpIndex };
    try {
      try {
        const headTree = (await sg.raw('rev-parse', 'HEAD^{tree}')).trim();
        await sg.env(env).raw('read-tree', headTree);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('unknown revision') || msg.includes('bad revision')) {
          log.info({}, '[persistence] Empty repo — starting with empty index');
        } else {
          log.error(
            { err: e },
            '[persistence] Failed to read HEAD tree, falling back to empty index',
          );
        }
      }

      await sg.env(env).raw('add', contentRoot);
      const treeSha = (await sg.env(env).raw('write-tree')).trim();

      let parentSha: string | null = null;
      try {
        parentSha = (await sg.raw('rev-parse', wipRef)).trim();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
          throw e;
        }
      }

      const args = ['commit-tree', treeSha, '-m', `WIP auto-save ${new Date().toISOString()}`];
      if (parentSha) args.push('-p', parentSha);

      const commitSha = (await sg.raw(...args)).trim();
      await sg.raw('update-ref', wipRef, commitSha);
      consecutiveGitFailures = 0;
      log.info(
        { sha: commitSha.slice(0, 8), wipRef },
        `[persistence] Git commit: ${commitSha.slice(0, 8)} on ${wipRef}`,
      );
    } catch (e) {
      consecutiveGitFailures++;
      incrementGitAutoSaveFailure();
      log.error(
        { err: e, attempt: consecutiveGitFailures },
        `[persistence] Git commit failed (attempt ${consecutiveGitFailures})`,
      );
      if (consecutiveGitFailures >= 3) {
        log.error(
          { attempt: consecutiveGitFailures },
          '[persistence] CRITICAL: Git auto-save has failed 3+ times. Version history is NOT being recorded.',
        );
      }
    } finally {
      try {
        tracedUnlinkSync(tmpIndex);
      } catch {
      }
    }
  }

  function computeCommitDelay(failures: number): number {
    if (failures <= 0) return commitDebounceMs;
    const exponent = Math.min(failures, 5);
    const multiplier = 2 ** exponent;
    const jitter = Math.random() * 0.25 * commitDebounceMs;
    return commitDebounceMs * multiplier + jitter;
  }

  function scheduleGitCommit(): void {
    if (!gitEnabled) return;
    if (isBatchInProgress()) return;
    if (gitCommitTimer) clearTimeout(gitCommitTimer);
    gitCommitTimer = setTimeout(() => {
      gitCommitTimer = null;
      if (commitInFlight) {
        pendingAfterCommit = true;
        return;
      }
      commitInFlight = commitToWipRef().finally(() => {
        commitInFlight = null;
        if (pendingAfterCommit) {
          pendingAfterCommit = false;
          scheduleGitCommit();
        }
      });
    }, computeCommitDelay(consecutiveGitFailures));
  }

  async function flushPendingGitCommit(): Promise<void> {
    if (gitCommitTimer) {
      clearTimeout(gitCommitTimer);
      gitCommitTimer = null;
      if (!commitInFlight) {
        commitInFlight = commitToWipRef().finally(() => {
          commitInFlight = null;
          if (pendingAfterCommit) {
            pendingAfterCommit = false;
            scheduleGitCommit();
          }
        });
      }
    }
    if (commitInFlight) await commitInFlight;
  }

  async function _awaitPendingCommit(): Promise<void> {
    if (commitInFlight) await commitInFlight;
  }

  let loadDurationHist: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
  let storeDurationHist: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
  let commitDurationHist: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
  function ensureHistograms(): void {
    if (loadDurationHist) return;
    const meter = getMeter();
    loadDurationHist = meter.createHistogram('ok.persistence.load.duration', {
      description: 'Duration of persistence.onLoadDocument in seconds',
      unit: 's',
    });
    storeDurationHist = meter.createHistogram('ok.persistence.store.duration', {
      description: 'Duration of persistence.onStoreDocument in seconds',
      unit: 's',
    });
    commitDurationHist = meter.createHistogram('ok.persistence.git_commit.duration', {
      description: 'Duration of commitToWipRef drain in seconds',
      unit: 's',
    });
  }

  async function storeDocumentNow({
    document,
    documentName,
    lastTransactionOrigin,
  }: {
    document: Y.Doc;
    documentName: string;
    lastTransactionOrigin: unknown;
  }): Promise<void> {
    ensureHistograms();
    const started = Date.now();
    return withSpan(
      'persistence.onStoreDocument',
      { attributes: { 'doc.name': documentName } },
      async () => {
        const lifecycleStatus = document.getMap('lifecycle').get('status');
        if (lifecycleStatus === 'deleted-upstream' || lifecycleStatus === 'renamed') {
          log.info(
            { documentName, lifecycleStatus },
            `[persistence] Skipped store for ${documentName}: lifecycle=${lifecycleStatus}`,
          );
          return;
        }

        const { sv: stateVectorAtRead, json } = captureDocSnapshotForPersistence(document);

        const body = mdManager.serialize(json);
        const ytextSnapshot = document.getText('source').toString();
        const { frontmatter } = stripFrontmatter(ytextSnapshot);
        const markdown = prependFrontmatter(frontmatter, body);

        const currentBase = getReconciledBase(documentName);
        const markdownSemanticallyUnchanged =
          currentBase !== undefined && normalizeBridge(markdown) === normalizeBridge(currentBase);
        if (markdownSemanticallyUnchanged) {
          if (contributorCount() > 0) scheduleGitCommit();
          return;
        }

        if (currentBase === undefined && normalizeBridge(markdown) === '') {
          log.warn(
            { documentName },
            `[persistence] Skipped phantom write for ${documentName}: empty Y.Doc with no reconciled base`,
          );
          return;
        }

        const writer = resolveWriterFromOrigin(lastTransactionOrigin, getPrincipal);
        if (writer && writer.id !== SERVICE_WRITER.id) {
          if (!hasContributor(writer.id)) {
            recordContributor(documentName, writer.id, writer.name, writer.id);
          }
        }

        if (currentBase !== undefined) {
          const classification = classifyDuplication(markdown, currentBase);
          if (classification.kind === 'block') {
            if (tripwireResetFailedDocs.has(documentName)) {
              log.warn(
                { documentName },
                `[persistence] Tripwire breaker active — skipping duplicate store for ${documentName}`,
              );
              return;
            }
            const fragmentChildren = document.getXmlFragment('default').length;
            console.warn(
              JSON.stringify({
                event: 'ok-persistence-duplication-blocked',
                'doc.name': documentName,
                candidateBytes: markdown.length,
                baseBytes: currentBase.length,
                fragmentChildren,
                copies: classification.copies,
                reason: classification.reason,
              }),
            );
            try {
              const requestedDiskPath = safeContentPath(documentName, contentDir);
              const diskContent = existsSync(requestedDiskPath)
                ? readFileSync(requestedDiskPath, 'utf-8')
                : currentBase;
              applyDiskContent(document, diskContent);
              tripwireResetFailedDocs.delete(documentName);
            } catch (err) {
              tripwireResetFailedDocs.add(documentName);
              log.error(
                { err, documentName },
                `[persistence] Tripwire reset failed for ${documentName}`,
              );
            }
            return;
          }
        }

        const requestedPath = safeContentPath(documentName, contentDir);
        await tracedMkdir(dirname(requestedPath), { recursive: true });

        let canonicalPath: string;
        try {
          canonicalPath = await realpath(requestedPath);
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') {
            let isBrokenSymlink = false;
            try {
              isBrokenSymlink = lstatSync(requestedPath).isSymbolicLink();
            } catch (lstatErr) {
              if ((lstatErr as NodeJS.ErrnoException).code !== 'ENOENT') {
                log.warn(
                  { err: lstatErr, path: requestedPath },
                  '[persistence] lstat failed during broken-symlink check',
                );
              }
            }
            if (isBrokenSymlink) {
              console.warn(`[persistence] broken-symlink fallback`, {
                docName: documentName,
                reason: 'broken-symlink',
              });
            }
            canonicalPath = requestedPath;
          } else if (code === 'ELOOP') {
            console.error(`[persistence] Symlink cycle at ${requestedPath}`);
            throw new Error(`Symlink cycle detected at ${requestedPath}`);
          } else {
            throw e;
          }
        }

        if (!isWithinContentDir(canonicalPath, contentDir)) {
          const msg = `symlink-escape: ${requestedPath} resolves to ${canonicalPath} outside ${contentDir}`;
          console.error(`[persistence] ${msg}`, {
            docName: documentName,
            originalPath: requestedPath,
            canonical: canonicalPath,
            contentDir,
          });
          throw new Error(msg);
        }

        const tmpPath = `${canonicalPath}.tmp.${crypto.randomUUID()}`;
        try {
          await tracedWriteFile(tmpPath, markdown, 'utf-8');
          await tracedRename(tmpPath, canonicalPath);
          registerWrite(canonicalPath, contentHash(markdown));
          incrementPersistenceDiskWrite();
          onDiskFlush?.(documentName, stateVectorAtRead);
        } catch (e) {
          try {
            tracedUnlinkSync(tmpPath);
          } catch {
          }
          log.error({ err: e, documentName }, `[persistence] Failed to save ${documentName}`);
          throw e;
        }
        log.info(
          { filePath: canonicalPath, bytes: markdown.length },
          `[persistence] Wrote ${canonicalPath} (${markdown.length} bytes)`,
        );

        setReconciledBase(documentName, markdown);
        tripwireResetFailedDocs.delete(documentName);

        if (backlinkIndex) {
          backlinkIndex.updateDocumentFromMarkdown(documentName, markdown);
          void backlinkIndex.saveToDisk().catch((err) => {
            log.warn(
              { err, documentName },
              `[backlinks] Failed to persist cache for ${documentName}`,
            );
          });
        }

        setActiveSpanAttributes({ 'persistence.bytes': markdown.length });
        scheduleGitCommit();
      },
    ).finally(() => {
      storeDurationHist?.record((Date.now() - started) / 1000);
    });
  }

  function deferStore({
    document,
    documentName,
    lastTransactionOrigin,
  }: {
    document: Y.Doc;
    documentName: string;
    lastTransactionOrigin: unknown;
  }): void {
    deferredStores.set(documentName, {
      branch: getActiveBranch(),
      document,
      lastTransactionOrigin,
    });
  }

  async function flushDeferredStores(mode: 'within-branch' | 'discard-stale' = 'within-branch') {
    if (deferredStoreDrainInFlight) {
      pendingDeferredStoreFlushMode =
        pendingDeferredStoreFlushMode === 'discard-stale' || mode === 'discard-stale'
          ? 'discard-stale'
          : 'within-branch';
      return deferredStoreDrainInFlight;
    }

    deferredStoreDrainInFlight = (async () => {
      let drainMode = mode;
      while (true) {
        const entries = [...deferredStores.entries()];
        deferredStores.clear();

        if (drainMode !== 'discard-stale') {
          for (const [documentName, entry] of entries) {
            if (entry.branch !== getActiveBranch()) continue;
            try {
              await storeDocumentNow({
                document: entry.document,
                documentName,
                lastTransactionOrigin: entry.lastTransactionOrigin,
              });
            } catch (err) {
              log.error(
                { err, documentName },
                `[persistence] Deferred store failed for ${documentName}`,
              );
            }
          }
        }

        const nextMode = pendingDeferredStoreFlushMode;
        pendingDeferredStoreFlushMode = null;
        if (deferredStores.size === 0 && nextMode === null) break;
        drainMode = nextMode ?? 'within-branch';
      }
    })().finally(() => {
      deferredStoreDrainInFlight = null;
    });

    return deferredStoreDrainInFlight;
  }

  const extension: Extension = {
    async onLoadDocument({ document, documentName, context: _context }) {
      if (isSystemDoc(documentName)) return;
      if (isConfigDoc(documentName)) {
        loadConfigDoc(document, documentName, configPersistenceCtx);
        return;
      }
      ensureHistograms();
      const started = Date.now();
      return withSpan(
        'persistence.onLoadDocument',
        { attributes: { 'doc.name': documentName } },
        async () => {
          log.info(
            { documentName, connections: document.getConnectionsCount?.() ?? '?' },
            `[persistence] onLoadDocument called for ${documentName} (connections: ${document.getConnectionsCount?.() ?? '?'})`,
          );
          const filePath = safeContentPath(documentName, contentDir);
          if (!existsSync(filePath)) return;

          try {
            const canonical = realpathSync(filePath);
            if (!isWithinContentDir(canonical, contentDir)) {
              console.warn(
                `[persistence] symlink-escape on load: ${filePath} → ${canonical}, refusing`,
              );
              return;
            }
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (code === 'ELOOP') {
              console.warn(`[persistence] Symlink cycle on load: ${filePath}, refusing`);
              return;
            }
          }

          const raw = readFileSync(filePath, 'utf-8');
          const { frontmatter } = stripFrontmatter(raw);

          const xmlFragment = document.getXmlFragment('default');
          log.info(
            { documentName, fragmentLength: xmlFragment.length },
            `[persistence] onLoadDocument ${documentName}: fragment.length=${xmlFragment.length} before update`,
          );

          if (xmlFragment.length === 0) {
            applyDiskContentToDoc(document, raw, options?.resolveEmbed, documentName);
            log.info(
              { filePath, children: xmlFragment.length },
              `[persistence] Loaded ${filePath} into Y.Doc (${xmlFragment.length} children)`,
            );
            xmlFragment.observeDeep(() => {
              log.info(
                { documentName, fragmentLength: xmlFragment.length },
                `[persistence] MUTATION on ${documentName}: fragment.length=${xmlFragment.length}`,
              );
            });
          } else {
            log.info(
              { documentName, children: xmlFragment.length },
              `[persistence] Skipped load for ${documentName} — fragment already has ${xmlFragment.length} children`,
            );
          }

          const normalizedBody = mdManager.serialize(
            yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
          );
          setReconciledBase(documentName, prependFrontmatter(frontmatter, normalizedBody));
        },
      ).finally(() => {
        loadDurationHist?.record((Date.now() - started) / 1000);
      });
    },

    async onStoreDocument({
      document,
      documentName,
      lastTransactionOrigin,
      lastContext: _lastContext,
    }) {
      if (isSystemDoc(documentName)) return;
      if (isConfigDoc(documentName)) {
        await storeConfigDoc(document, documentName, lastTransactionOrigin, configPersistenceCtx);
        return;
      }
      if (isBatchInProgress()) {
        deferStore({ document, documentName, lastTransactionOrigin });
        return;
      }
      return storeDocumentNow({
        document,
        documentName,
        lastTransactionOrigin,
      });
    },
  };

  async function waitForPendingCommits(): Promise<void> {
    if (commitInFlight) await commitInFlight;
  }

  return {
    extension,
    flushDeferredStores,
    flushPendingGitCommit,
    waitForPendingCommits,
    configPersistenceCtx,
  };
}
