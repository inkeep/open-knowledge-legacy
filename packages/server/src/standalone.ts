import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import { prependFrontmatter } from '@inkeep/open-knowledge-core';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import simpleGit from 'simple-git';
import { AgentFocusBroadcaster } from './agent-focus.ts';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { BacklinkIndex } from './backlink-index.ts';
import { CC1Broadcaster, isSystemDoc, SYSTEM_DOC_NAME } from './cc1-broadcast.ts';
import { type ContentFilter, createContentFilter } from './content-filter.ts';
import { getDocExtension } from './doc-extensions.ts';
import { applyExternalChange } from './external-change.ts';
import { contentHash, type DiskEvent, startWatcher, type WatcherHandle } from './file-watcher.ts';
import { type HeadWatcherHandle, startHeadWatcher } from './head-watcher.ts';
import {
  commitUpstreamImport,
  destroyHistoryRepo,
  type HistoryHandle,
  type HistoryRef,
  historyGit,
  initHistoryRepo,
  type ParkableDoc,
  parkBranch,
  readParkedState,
  saveInMemoryCheckpoint,
} from './history-repo.ts';
import { createLiveDerivedIndexExtension } from './live-derived-index.ts';
import { getLogger } from './logger.ts';
import { recoverPendingManagedRename } from './managed-rename-journal.ts';
import { mdManager, schema } from './md-manager.ts';
import {
  incrementBatch,
  incrementBranchSwitch,
  incrementConflict,
  incrementPark,
  incrementReconcile,
  incrementRescueBuffer,
  incrementUpstreamImport,
} from './metrics.ts';
import {
  createPersistenceExtension,
  deleteReconciledBase,
  getActiveBranch,
  getReconciledBase,
  isBatchInProgress,
  type PersistenceOptions,
  safeContentPath,
  setBatchInProgress,
  setReconciledBase,
  switchReconciledBaseScope,
} from './persistence.ts';
import { reconcile } from './reconciliation.ts';
import { acquireServerLock, releaseServerLock } from './server-lock.ts';
import { createServerObserverExtension } from './server-observer-extension.ts';
import { SyncEngine } from './sync-engine.ts';

export interface ServerOptions {
  port?: number;
  host?: string;
  contentDir: string;
  projectDir?: string;
  quiet?: boolean;
  debounce?: number;
  maxDebounce?: number;
  gitEnabled?: boolean;
  commitDebounceMs?: number;
  wipRef?: string;
  /**
   * When true, register test-only routes (currently `/api/test-reset`).
   * Defaults to `false` — these routes allow any client to destroy document
   * state and must never be exposed in production. Enable only in tests.
   */
  enableTestRoutes?: boolean;
  /** Shadow repo handle — passed to persistence. */
  historyRepo?: HistoryHandle;
  /** Content root relative to project dir. */
  contentRoot?: string;
  /** Glob patterns for files to include (default: ['**\/*.md']). */
  includePatterns?: string[];
  /** Glob patterns for files to explicitly exclude. */
  excludePatterns?: string[];
  /**
   * Maximum time (ms) `destroy()` waits for all pending stores to drain
   * before giving up and continuing with the rest of the shutdown sequence.
   * Defaults to 10_000. Tune lower in tests (e.g., 500) to reclaim CI wall-time.
   * Tune higher on slow-disk / NFS environments where a legitimate L1 flush
   * could take more than 10s.
   */
  destroyTimeoutMs?: number;
  /**
   * Optional. Called after every successful agent write (write_document /
   * edit_document) via the MCP API. The CLI uses this to open the browser
   * on the first agent edit per session; consumers that don't care can omit.
   */
  onAgentWrite?: () => void;
  /**
   * CLI argv prefix for /api/local-op/* relay endpoints.
   * Defaults to ['open-knowledge'] (CLI on PATH).
   * Pass [process.execPath, process.argv[1]] from start.ts to use the exact
   * runtime that launched this server — necessary in dev (bun + .ts entry).
   */
  localOpCliArgs?: string[];
}

export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  cc1Broadcaster: CC1Broadcaster;
  agentFocusBroadcaster: AgentFocusBroadcaster;
  contentFilter: ContentFilter;
  destroy: () => Promise<void>;
  /** Resolves when async init (shadow repo, file watcher subscription) is complete. */
  ready: Promise<void>;
  /**
   * Names of subsystems that failed to initialize during boot.
   * Read AFTER `await ready` for a stable list; reads before may return a partial result.
   * Empty array means all subsystems initialized successfully.
   * Possible values: `'shadow-repo'`, `'managed-rename-recovery'`, `'file-watcher'`,
   * `'head-watcher'`.
   */
  readonly degraded: readonly string[];
  /**
   * Directory holding the server lock (`<contentDir>/.open-knowledge`).
   * Callers update the lock's port field via `updateServerLockPort(lockDir, port)`
   * once the HTTP listener has bound to a kernel-assigned port.
   */
  readonly lockDir: string;
  /** Active sync engine instance, or null if dormant / no remote detected. */
  readonly syncEngine: SyncEngine | null;
}

export function createServer(options: ServerOptions): ServerInstance {
  const {
    contentDir,
    projectDir = contentDir,
    quiet = true,
    debounce = 2000,
    maxDebounce = 10000,
    gitEnabled = true,
    commitDebounceMs = 30_000,
    wipRef = 'refs/wip/main',
    enableTestRoutes = false,
    historyRepo,
    contentRoot,
    includePatterns = ['**/*.md', '**/*.mdx'],
    excludePatterns = [],
    destroyTimeoutMs = 10_000,
    localOpCliArgs,
  } = options;

  const log = getLogger('server');

  // Acquire server lock BEFORE any side effects (shadow repo init, file watcher,
  // HTTP listen, etc.). Collides fast with another running server in the same
  // contentDir. Port may be 0 here — the CLI rewrites it post-listen via
  // `updateServerLockPort(lockDir, realPort)`. See V0-1 spec.
  const lockDir = resolve(contentDir, '.open-knowledge');
  acquireServerLock(lockDir, {
    port: options.port ?? 0,
    worktreeRoot: projectDir,
  });

  // Synchronous init — if any constructor throws, release the lock before propagating.
  let contentFilter: ReturnType<typeof createContentFilter>;
  let backlinkIndex: BacklinkIndex;
  let historyRef: HistoryRef;
  let persistence: ReturnType<typeof createPersistenceExtension>;
  let hocuspocus: Hocuspocus;
  let sessionManager: AgentSessionManager;
  let cc1Broadcaster: CC1Broadcaster | null = null;
  let agentFocusBroadcaster: AgentFocusBroadcaster | null = null;

  function signalChannel(channel: 'files' | 'backlinks' | 'graph'): void {
    cc1Broadcaster?.signal(channel);
  }
  try {
    contentFilter = createContentFilter({
      projectDir,
      contentDir,
      includePatterns,
      excludePatterns,
    });
    backlinkIndex = new BacklinkIndex({ projectDir, contentDir, contentFilter });

    historyRef = { current: historyRepo };

    const persistenceOpts: PersistenceOptions = {
      contentDir,
      projectDir,
      gitEnabled,
      commitDebounceMs,
      wipRef,
      historyRef,
      contentRoot,
      backlinkIndex,
      getCurrentBranch: () => headWatcher?.getLastKnownBranch() ?? null,
    };

    persistence = createPersistenceExtension(persistenceOpts);

    hocuspocus = new Hocuspocus({
      quiet,
      debounce,
      maxDebounce,
      extensions: [persistence.extension],
    });
    cc1Broadcaster = new CC1Broadcaster(hocuspocus);
    agentFocusBroadcaster = new AgentFocusBroadcaster(hocuspocus);

    sessionManager = new AgentSessionManager(hocuspocus);
    const liveDerivedIndexExtension = createLiveDerivedIndexExtension({
      backlinkIndex,
      signalChannel,
    });
    hocuspocus.configuration.extensions.push(liveDerivedIndexExtension);

    const apiExtension = createApiExtension({
      hocuspocus,
      sessionManager,
      contentDir,
      getFileIndex: () => (watcher ? watcher.getFileIndex() : new Map()),
      getAliasMap: () => (watcher ? watcher.getAliasMap() : new Map()),
      enableTestRoutes,
      historyRef,
      flushGitCommit: () => persistence.flushPendingGitCommit(),
      getCurrentBranch: () => headWatcher?.getLastKnownBranch() ?? null,
      contentRoot,
      backlinkIndex,
      signalChannel,
      agentFocusBroadcaster,
      onAgentWrite: options.onAgentWrite,
      getSyncEngine: () => syncEngine,
      localOpCliArgs,
      projectDir,
    });
    hocuspocus.configuration.extensions.push(apiExtension);

    hocuspocus.configuration.extensions.push(
      createServerObserverExtension({
        mdManager,
        schema,
        historyRef,
        contentRoot,
        getCurrentBranch: () => headWatcher?.getLastKnownBranch() ?? null,
      }),
    );
  } catch (err) {
    releaseServerLock(lockDir);
    throw err;
  }
  let systemDocConnection: Awaited<ReturnType<Hocuspocus['openDirectConnection']>> | null = null;

  /** Resolve a safe rescue buffer path, returning null if traversal is detected. */
  function safeRescuePath(historyGitDir: string, docName: string): string | null {
    const rescueBase = resolve(historyGitDir, 'rescue');
    const filePath = resolve(rescueBase, `${docName}${getDocExtension(docName)}`);
    if (!filePath.startsWith(`${rescueBase}/`)) return null;
    return filePath;
  }

  /** Serialize current Y.Doc to markdown for reconciliation. */
  function serializeDoc(docName: string): string | null {
    const document = hocuspocus.documents.get(docName);
    if (!document) return null;
    const xmlFragment = document.getXmlFragment('default');
    const json = yXmlFragmentToProsemirrorJSON(xmlFragment);
    const body = mdManager.serialize(json);
    const metaMap = document.getMap('metadata');
    const fm = metaMap.get('frontmatter');
    const frontmatter = typeof fm === 'string' ? fm : '';
    return prependFrontmatter(frontmatter, body);
  }

  /** Apply markdown content to Y.Doc — delegates to the shared throwing helper. */
  const applyToDoc = (docName: string, content: string): void =>
    applyExternalChange(hocuspocus, docName, content);

  /** Helper to extract docName from any DiskEvent variant. */
  function diskEventDocName(event: DiskEvent): string {
    return event.kind === 'rename' ? event.newDocName : event.docName;
  }

  /** Reconciliation-aware dispatch for all DiskEvent types. */
  async function handleDiskEvent(event: DiskEvent): Promise<void> {
    try {
      switch (event.kind) {
        case 'create': {
          log.info({ docName: event.docName }, `[reconcile] create: ${event.docName}`);
          backlinkIndex.updateDocumentFromMarkdown(event.docName, event.content);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(`[backlinks] Failed to persist create for ${event.docName}:`, err);
          });
          signalChannel('files');
          signalChannel('backlinks');
          signalChannel('graph');
          break;
        }

        case 'update': {
          const { docName, content: theirs } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) {
            backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
            void backlinkIndex.saveToDisk().catch((err) => {
              console.warn(`[backlinks] Failed to persist closed-doc update for ${docName}:`, err);
            });
            signalChannel('backlinks');
            signalChannel('graph');
            return;
          }

          const base = getReconciledBase(docName) ?? '';
          const ours = serializeDoc(docName) ?? base;

          const result = reconcile({ docName, base, ours, theirs });

          // Structured log with content hashes
          const baseH = contentHash(base).slice(0, 6);
          const oursH = contentHash(ours).slice(0, 6);
          const theirsH = contentHash(theirs).slice(0, 6);
          log.info(
            { docName, base: baseH, ours: oursH, theirs: theirsH, result: result.kind },
            `[reconcile] ${docName} base=${baseH} ours=${oursH} theirs=${theirsH} result=${result.kind}`,
          );

          switch (result.kind) {
            case 'noop':
              backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
              void backlinkIndex.saveToDisk().catch((err) => {
                console.warn(`[backlinks] Failed to persist noop update for ${docName}:`, err);
              });
              signalChannel('backlinks');
              signalChannel('graph');
              break;

            case 'clean':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
                void backlinkIndex.saveToDisk().catch((err) => {
                  console.warn(`[backlinks] Failed to persist clean update for ${docName}:`, err);
                });
                signalChannel('backlinks');
                signalChannel('graph');
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply clean content to Y.Doc for ${docName}`,
                );
                // Disk is source of truth — keep base in sync even if Y.Doc update failed
                setReconciledBase(docName, theirs);
              }
              break;

            case 'merged':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
                void backlinkIndex.saveToDisk().catch((err) => {
                  console.warn(`[backlinks] Failed to persist merged update for ${docName}:`, err);
                });
                signalChannel('backlinks');
                signalChannel('graph');
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply merged content to Y.Doc for ${docName}`,
                );
                // Disk is source of truth — keep base in sync even if Y.Doc update failed
                setReconciledBase(docName, theirs);
              }
              break;

            case 'conflicts': {
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                incrementConflict();
                backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
                void backlinkIndex.saveToDisk().catch((err) => {
                  console.warn(
                    `[backlinks] Failed to persist conflict update for ${docName}:`,
                    err,
                  );
                });
                signalChannel('backlinks');
                signalChannel('graph');
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply conflict content to Y.Doc for ${docName}`,
                );
                // Disk is source of truth — keep base in sync even if Y.Doc update failed
                setReconciledBase(docName, theirs);
              }
              break;
            }

            case 'refused': {
              incrementConflict();
              const lifecycleMap = document.getMap('lifecycle');
              lifecycleMap.set('status', 'conflict');
              lifecycleMap.set('reason', result.reason);
              break;
            }
          }
          break;
        }

        case 'delete': {
          const { docName } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) {
            backlinkIndex.deleteDocument(docName);
            void backlinkIndex.saveToDisk().catch((err) => {
              console.warn(`[backlinks] Failed to persist closed-doc delete for ${docName}:`, err);
            });
            signalChannel('files');
            signalChannel('backlinks');
            signalChannel('graph');
            return;
          }

          const base = getReconciledBase(docName) ?? '';
          const ours = serializeDoc(docName) ?? '';
          const isDirty = ours !== base;

          if (isDirty && historyRef.current) {
            // Silent rescue checkpoint (SPEC §6 R7e) — preserve in-memory
            // content on a timeline ref so TimelinePanel renders it as an
            // 'external-change-rescue' row. Fire-and-forget; failures warn
            // but don't block the delete lifecycle.
            const shadowForCheckpoint = historyRef.current;
            const branch = headWatcher?.getLastKnownBranch() ?? 'main';
            queueMicrotask(() => {
              saveInMemoryCheckpoint(shadowForCheckpoint, contentRoot ?? '', {
                kind: 'external-change-rescue',
                docName,
                contents: ours,
                label: `External change recovered @ ${new Date().toISOString()}`,
                branch,
                // Delete event has no incoming disk content — sentinel empty
                // string so the TimelineRescueEntry shape round-trips.
                metadata: { incomingDiskSha: '' },
              })
                .then(() => {
                  incrementRescueBuffer();
                  log.info({ docName }, `[reconcile] rescue checkpoint saved (delete): ${docName}`);
                })
                .catch((e: unknown) => {
                  log.error(
                    { docName, err: e },
                    `[reconcile] rescue checkpoint write failed: ${docName}`,
                  );
                });
            });
          }

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'deleted-upstream');

          deleteReconciledBase(docName);
          backlinkIndex.deleteDocument(docName);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(`[backlinks] Failed to persist delete for ${docName}:`, err);
          });
          log.info({ docName, isDirty }, `[reconcile] delete: ${docName} (dirty=${isDirty})`);

          // Unload document to prevent re-creation on next persistence cycle
          hocuspocus.closeConnections(docName);
          await hocuspocus.unloadDocument(document);
          signalChannel('files');
          signalChannel('backlinks');
          signalChannel('graph');
          break;
        }

        case 'rename': {
          const { oldDocName, newDocName, content } = event;
          const document = hocuspocus.documents.get(oldDocName);

          deleteReconciledBase(oldDocName);
          setReconciledBase(newDocName, content);
          backlinkIndex.renameDocument(oldDocName, newDocName, content);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(
              `[backlinks] Failed to persist rename for ${oldDocName} -> ${newDocName}:`,
              err,
            );
          });

          if (document) {
            const lifecycleMap = document.getMap('lifecycle');
            lifecycleMap.set('status', 'renamed');
            lifecycleMap.set('newPath', newDocName);
          }

          log.info({ oldDocName, newDocName }, `[reconcile] rename: ${oldDocName} → ${newDocName}`);
          signalChannel('files');
          signalChannel('backlinks');
          signalChannel('graph');
          break;
        }

        case 'conflict': {
          const { docName } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) return;

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'conflict');
          lifecycleMap.set('reason', 'conflict-markers');
          log.info({ docName }, `[reconcile] conflict markers detected: ${docName}`);
          break;
        }
      }
    } catch (err) {
      log.error(
        { err, kind: event.kind, docName: diskEventDocName(event) },
        `[reconcile] failed to handle ${event.kind} for ${diskEventDocName(event)}`,
      );
    }
  }

  // ─── Batch buffering ──────────────────────────────────────────────────────

  const eventBuffer: DiskEvent[] = [];

  /** Wrapper that buffers events during batch operations. */
  async function onDiskEvent(event: DiskEvent): Promise<void> {
    if (isBatchInProgress()) {
      eventBuffer.push(event);
      return;
    }
    await handleDiskEvent(event);
  }

  /** Drain buffered events after batch ends. */
  async function drainEventBuffer(): Promise<void> {
    const events = eventBuffer.splice(0, eventBuffer.length);
    for (const event of events) {
      await handleDiskEvent(event);
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  let watcher: WatcherHandle | null = null;
  let headWatcher: HeadWatcherHandle | null = null;
  let syncEngine: SyncEngine | null = null;
  let inflightDestroy: Promise<void> | null = null;

  // This helper mirrors @hocuspocus/server's internal Server.destroy() pattern
  // at node_modules/@hocuspocus/server/src/Server.ts:200-225. We can't use
  // Server.destroy() directly because Server owns its own httpServer + crossws
  // WebSocket adapter + signal binding, which conflicts with OK's shared HTTP
  // server + /api/* routing + static asset serving + /collab-only upgrade.
  async function flushAllStoresAndWait(timeoutMs: number): Promise<void> {
    if (hocuspocus.documents.size === 0) return;

    let resolved = false;
    const allDone = new Promise<void>((resolve) => {
      hocuspocus.configuration.extensions.push({
        async afterUnloadDocument({ instance }) {
          if (!resolved && instance.getDocumentsCount() === 0) {
            resolved = true;
            resolve();
          }
        },
      });
    });

    // Capture doc names before the race so the timeout error can name the
    // documents that failed to unload — actionable context for operators
    // debugging hung flushes, and the target list for the rescue-buffer
    // dump below (D15 / OQ-P2-02).
    const pendingDocNames = Array.from(hocuspocus.documents.keys());

    hocuspocus.closeConnections();
    hocuspocus.flushPendingStores();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        resolved = true;
        const stillLoaded = Array.from(hocuspocus.documents.keys());

        // D15 / OQ-P2-02: rescue-buffer dump on flush timeout. onStoreDocument
        // did not complete for these docs, so the in-memory Y.Doc state IS the
        // data-of-record — dump it to the shadow rescue/ tree so the user can
        // recover via the existing /api/rescue endpoints. Best-effort per doc
        // so one serialization failure doesn't block the others. Unconditional
        // (no isDirty check like the reconcile-path rescue uses) because the
        // hang semantic means diff-vs-reconciled-base is not the right gate.
        const rescued: string[] = [];
        const rescueFailed: string[] = [];
        if (historyRef.current) {
          for (const docName of stillLoaded) {
            if (isSystemDoc(docName)) continue;
            try {
              const ours = serializeDoc(docName);
              if (ours === null) {
                // Doc was removed from hocuspocus.documents between the
                // stillLoaded snapshot and this loop — race during teardown.
                log.warn(
                  { docName },
                  `[rescue] skipping ${docName} — document dropped from map mid-rescue`,
                );
                rescueFailed.push(docName);
                continue;
              }
              const rescuePath = safeRescuePath(historyRef.current.gitDir, docName);
              if (!rescuePath) {
                // Path-traversal guard fired — docName tried to escape the
                // rescue/ directory. Log at warn level since this is
                // security-relevant, not just a write failure.
                log.warn(
                  { docName, gitDir: historyRef.current.gitDir },
                  `[rescue] path-traversal guard rejected docName: ${docName}`,
                );
                rescueFailed.push(docName);
                continue;
              }
              mkdirSync(dirname(rescuePath), { recursive: true });
              writeFileSync(rescuePath, ours, 'utf-8');
              incrementRescueBuffer();
              rescued.push(docName);
              log.info({ docName }, `[rescue] rescue buffer saved on flush timeout: ${docName}`);
            } catch (e) {
              rescueFailed.push(docName);
              log.error(
                { err: e, docName },
                `[rescue] failed to write rescue buffer for ${docName}`,
              );
            }
          }
        } else {
          // Shadow repo unavailable (initAsync failed earlier) — nothing to
          // write into. Warn rather than fail silently so operators seeing a
          // `lost [...]` array in the timeout error can distinguish "no shadow
          // repo" from per-doc write failures.
          log.warn(
            { stillLoadedCount: stillLoaded.length },
            `[rescue] shadow repo unavailable at flush timeout — ${stillLoaded.length} doc(s) will be lost: [${stillLoaded.join(', ')}]`,
          );
          rescueFailed.push(...stillLoaded);
        }

        const rescueSummary =
          rescued.length > 0 || rescueFailed.length > 0
            ? ` — rescued [${rescued.join(', ')}]${
                rescueFailed.length > 0 ? `, lost [${rescueFailed.join(', ')}]` : ''
              }`
            : '';

        reject(
          new Error(
            `flushAllStoresAndWait timeout after ${timeoutMs}ms — ${stillLoaded.length}/${pendingDocNames.length} docs did not unload: [${stillLoaded.join(', ')}]${rescueSummary}`,
          ),
        );
      }, timeoutMs);
    });

    try {
      await Promise.race([allDone, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  async function destroy(): Promise<void> {
    if (inflightDestroy) return inflightDestroy;

    inflightDestroy = (async () => {
      const t0 = Date.now();
      const phaseErrors: Array<{ phase: string; error: string }> = [];

      // Wait for async init to complete before cleanup — prevents leaked watcher
      // subscriptions if destroy() is called during startup (e.g., Ctrl+C).
      // Bounded to 5s so destroy() doesn't hang indefinitely if init is stuck
      // (e.g., waiting for a shadow repo git lock held by another process).
      let initTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const initSettled = await Promise.race([
        ready.then(
          () => 'completed' as const,
          (err) => {
            log.debug({ err }, '[server] init incomplete during shutdown');
            return 'failed' as const;
          },
        ),
        new Promise<'timeout'>((r) => {
          initTimeoutId = setTimeout(() => r('timeout'), 5_000);
        }),
      ]);
      if (initTimeoutId !== undefined) clearTimeout(initTimeoutId);
      if (initSettled === 'timeout') {
        log.warn({}, '[server] init did not complete within 5s during shutdown');
      }

      // Capture after ready so the count reflects documents loaded during init
      const documentCount = hocuspocus.documents.size;

      try {
        try {
          // Phase 1: stop watchers FIRST so L1 disk writes don't trigger reconcile loops
          try {
            if (headWatcher) {
              await headWatcher.unsubscribe();
              headWatcher = null;
            }
            if (watcher) {
              await watcher.unsubscribe();
              watcher = null;
            }
          } catch (err) {
            phaseErrors.push({
              phase: 'watcher-unsubscribe',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-1 watcher unsubscribe failed');
          }

          // Phase 1b: tear down CC1 broadcaster + __system__ direct connection
          try {
            cc1Broadcaster?.destroy();
            if (systemDocConnection) {
              await systemDocConnection.disconnect();
              systemDocConnection = null;
            }
          } catch (err) {
            phaseErrors.push({
              phase: 'cc1-teardown',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-1b CC1 teardown failed');
          }

          // Phase 2: drain agent sessions (intrinsic per-session try/catch at agent-sessions.ts:168-177)
          try {
            await sessionManager.closeAll();
          } catch (err) {
            phaseErrors.push({
              phase: 'agent-session-drain',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-2 agent session drain failed');
          }

          // Phase 3: drain L1 (Y.Doc → markdown → disk) via afterUnloadDocument hook
          try {
            await flushAllStoresAndWait(destroyTimeoutMs);
          } catch (err) {
            phaseErrors.push({
              phase: 'flush-all-stores',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-3 flush failed');
          }

          // Phase 4: drain L2 (disk → git) — only meaningful AFTER L1 has run
          // Bounded to destroyTimeoutMs so a stuck git process doesn't hang shutdown.
          let l2TimeoutId: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              (async () => {
                await persistence.flushPendingGitCommit();
                await persistence.waitForPendingCommits();
              })(),
              new Promise<void>((_, reject) => {
                l2TimeoutId = setTimeout(
                  () => reject(new Error('L2 git flush timeout')),
                  destroyTimeoutMs,
                );
              }),
            ]);
          } catch (err) {
            phaseErrors.push({
              phase: 'git-commit-flush',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-4 git commit flush failed');
          } finally {
            if (l2TimeoutId !== undefined) clearTimeout(l2TimeoutId);
          }
          // Phase 4.5: stop sync engine (CC8 Phase 5 per spec)
          try {
            if (syncEngine) {
              await syncEngine.destroy();
              syncEngine = null;
            }
          } catch (err) {
            phaseErrors.push({
              phase: 'sync-engine-stop',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown sync-engine-stop failed');
          }
        } finally {
          // Phase 5: shadow repo release — ALWAYS runs
          if (historyRef.current) {
            // Persist current HEAD before releasing shadow lock (FR11)
            try {
              const projectGit = simpleGit({ baseDir: projectDir, timeout: { block: 5_000 } });
              const currentHead = (await projectGit.revparse('HEAD')).trim();
              if (currentHead) {
                writeFileSync(
                  resolve(historyRef.current.gitDir, 'last-known-head'),
                  currentHead,
                  'utf-8',
                );
              }
            } catch {
              // Fresh repo with no commits, or git not available — skip silently
            }

            try {
              destroyHistoryRepo(historyRef.current);
            } catch (err) {
              phaseErrors.push({
                phase: 'shadow-repo-release',
                error: err instanceof Error ? err.message : String(err),
              });
              log.error({ err }, '[server] shutdown phase-5 destroyHistoryRepo failed');
            }
          }

          const durationMs = Date.now() - t0;
          if (phaseErrors.length === 0) {
            log.info(
              { documentCount, durationMs },
              `[server] shutdown flushed ${documentCount} documents in ${durationMs}ms`,
            );
          } else {
            log.warn(
              { documentCount, durationMs, phaseErrors },
              `[server] shutdown flushed ${documentCount} documents in ${durationMs}ms with ${phaseErrors.length} phase error(s)`,
            );
          }
        }
      } finally {
        // Phase 6 (CC8): release server lock LAST — after shadow repo release,
        // agent session drain, L1/L2 flush. If an earlier phase threw, we still
        // release so a subsequent start can succeed. Invariant: no other process
        // may acquire this lock until every prior phase has run.
        try {
          releaseServerLock(lockDir);
        } catch (err) {
          phaseErrors.push({
            phase: 'server-lock-release',
            error: err instanceof Error ? err.message : String(err),
          });
          log.error({ err }, '[server] shutdown phase-6 releaseServerLock failed');
        }
      }
    })();

    return inflightDestroy;
  }

  /** Subsystems that failed during initAsync — populated on catch, read after `await ready`. */
  const degraded: string[] = [];

  /** Async initialization: shadow repo, file watcher, HEAD watcher. */
  async function initAsync(): Promise<void> {
    // Auto-initialize shadow repo if not provided
    if (!historyRef.current) {
      try {
        historyRef.current = await initHistoryRepo(projectDir);
        log.info(
          { gitDir: historyRef.current.gitDir },
          `[server] history repo initialized at ${historyRef.current.gitDir}`,
        );
      } catch (e) {
        log.error({ err: e }, '[server] history repo init failed');
        degraded.push('shadow-repo');
      }
    }

    // Verify shadow repo integrity — reinit only on structural corruption, not transient errors
    if (historyRef.current) {
      try {
        const sg = historyGit(historyRef.current);
        await sg.raw('rev-parse', '--git-dir');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not a git repository') || msg.includes('invalid object')) {
          log.warn({}, '[server] history repo appears corrupted — reinitializing');
          try {
            historyRef.current = await initHistoryRepo(projectDir);
          } catch (e2) {
            log.error({ err: e2 }, '[server] history repo reinit failed');
            historyRef.current = undefined;
            if (!degraded.includes('shadow-repo')) degraded.push('shadow-repo');
          }
        } else {
          log.error({ err: e }, '[server] history repo check failed (transient?)');
        }
      }
    }

    // HEAD-drift check (FR11): detect git operations that occurred while offline
    // Compare stored last-known-head against current HEAD SHA and import if diverged
    if (historyRef.current) {
      try {
        const lastKnownHeadPath = resolve(historyRef.current.gitDir, 'last-known-head');

        // Read last persisted HEAD SHA
        let lastKnownHead: string | null = null;
        try {
          lastKnownHead = readFileSync(lastKnownHeadPath, 'utf-8').trim() || null;
        } catch {
          // File doesn't exist yet — first run
        }

        // Read current HEAD SHA from project repo
        let currentHead: string | null = null;
        try {
          const projectGit = simpleGit({ baseDir: projectDir, timeout: { block: 10_000 } });
          currentHead = (await projectGit.revparse('HEAD')).trim() || null;
        } catch {
          // Fresh repo with no commits — skip drift check
        }

        if (currentHead !== null) {
          if (currentHead !== lastKnownHead) {
            // Drift detected (includes null → SHA for fresh clone T0 case)
            let branch = 'main';
            try {
              const projectGit = simpleGit({ baseDir: projectDir, timeout: { block: 10_000 } });
              const b = (await projectGit.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
              if (b && b !== 'HEAD') branch = b;
            } catch {
              // Detached HEAD or error — fallback to 'main'
            }

            log.info(
              { lastKnownHead, currentHead, branch },
              `[head-drift] lastKnownHead=${lastKnownHead ?? 'null'}, currentHead=${currentHead}, action=import`,
            );

            try {
              await commitUpstreamImport(
                historyRef.current,
                contentRoot ?? '',
                lastKnownHead,
                currentHead,
                branch,
              );
              incrementUpstreamImport();
            } catch (e) {
              log.warn({ err: e }, '[head-drift] commitUpstreamImport failed — continuing');
            }
          } else {
            log.info(
              { currentHead },
              `[head-drift] lastKnownHead=${lastKnownHead ?? 'null'}, currentHead=${currentHead}, action=noop`,
            );
          }

          // Always persist current HEAD so next startup has an accurate baseline
          try {
            writeFileSync(lastKnownHeadPath, currentHead, 'utf-8');
          } catch (e) {
            log.warn({ err: e }, '[head-drift] failed to write last-known-head');
          }
        }
      } catch (e) {
        log.warn({ err: e }, '[head-drift] check failed — continuing');
      }
    }

    try {
      const recovery = recoverPendingManagedRename(contentDir);
      if (recovery.recovered && recovery.journal) {
        log.warn(
          {
            sourceDocName: recovery.journal.sourceDocName,
            destinationDocName: recovery.journal.destinationDocName,
            restoredDocNames: recovery.restoredDocNames,
          },
          `[managed-rename] recovered pending rename ${recovery.journal.sourceDocName} -> ${recovery.journal.destinationDocName}`,
        );
      }
    } catch (err) {
      log.error({ err }, '[server] managed rename recovery failed');
      degraded.push('managed-rename-recovery');
    }

    // Pre-materialize __system__ Y.Doc so CC1 broadcaster has a target before
    // any browser connects. Must happen before the file watcher starts.
    try {
      systemDocConnection = await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME);
    } catch (err) {
      log.error(
        { err },
        '[server] failed to open __system__ direct connection — CC1 push disabled',
      );
      degraded.push('cc1-push');
    }

    // Start file watcher (with content filter for gitignore + config exclude)
    try {
      watcher = await startWatcher(contentDir, onDiskEvent, contentFilter);
      backlinkIndex.rebuildFromDisk(getActiveBranch());
      void backlinkIndex.saveToDisk().catch((err) => {
        console.warn(`[backlinks] Failed to persist startup cache for ${getActiveBranch()}:`, err);
      });
    } catch (err) {
      log.error({ err }, '[server] disk bridge watcher failed to start');
      degraded.push('file-watcher');
    }

    // Start HEAD watcher (only if project .git/ exists)
    try {
      headWatcher = await startHeadWatcher(
        projectDir,
        // onBatchBegin — park current branch context before git modifies working tree
        async ({ trigger }) => {
          log.info({ trigger }, `[batch] begin trigger=${trigger}`);
          incrementBatch();
          hocuspocus.flushPendingStores();
          await persistence.flushPendingGitCommit();

          // Park current branch's Y.Doc state to shadow refs
          if (historyRef.current) {
            const currentBranch = getActiveBranch();
            const docs: ParkableDoc[] = [];
            for (const [docName] of hocuspocus.documents) {
              if (isSystemDoc(docName)) continue;
              const markdown = serializeDoc(docName);
              if (markdown === null) continue;
              const diskSnapshot = getReconciledBase(docName) ?? markdown;
              docs.push({ docName, markdown, diskSnapshot });
            }
            if (docs.length > 0) {
              try {
                const sha = await parkBranch(historyRef.current, currentBranch, 'server', docs);
                if (sha) {
                  incrementPark();
                  log.info(
                    { count: docs.length, branch: currentBranch, sha: sha.slice(0, 8) },
                    `[history] parked ${docs.length} docs on ${currentBranch} → ${sha.slice(0, 8)}`,
                  );
                }
              } catch (e) {
                log.error({ err: e }, '[history] park failed');
              }
            }
          }

          setBatchInProgress(true);
        },
        // onBatchEnd — dispatch on BatchKind
        async (info) => {
          const bufferedCount = eventBuffer.length;
          const newBranch = info.newBranch ?? 'main';

          setBatchInProgress(false);

          log.info(
            {
              kind: info.batchKind,
              headMoved: info.headMoved,
              docs: bufferedCount,
              timeout: !!info.timeout,
            },
            `[batch] end kind=${info.batchKind} headMoved=${info.headMoved} docs=${bufferedCount}${info.timeout ? ' timeout' : ''}`,
          );

          if (info.batchKind === 'within-branch') {
            // Pull, merge, rebase on same branch — reconcile buffered events
            await drainEventBuffer();
          } else {
            // Cross-branch or detached-head — discard buffered events (wrong branch state)
            incrementBranchSwitch();
            eventBuffer.splice(0, eventBuffer.length);

            // Switch reconciledBase scope to target branch
            switchReconciledBaseScope(newBranch);
            backlinkIndex.switchBranch(newBranch);

            // Reset all open Y.Docs from the target branch's disk content
            for (const [docName, document] of hocuspocus.documents) {
              if (isSystemDoc(docName)) continue;
              try {
                const filePath = safeContentPath(docName, contentDir);
                if (!existsSync(filePath)) {
                  // File doesn't exist on target branch — tombstone
                  const base = getReconciledBase(docName) ?? '';
                  const ours = serializeDoc(docName) ?? '';
                  const isDirty = ours !== base;

                  if (isDirty && historyRef.current) {
                    // Silent rescue checkpoint on branch-switch tombstone
                    // (SPEC §6 R7e). Same pattern as reconcile-delete above.
                    const shadowForCheckpoint = historyRef.current;
                    queueMicrotask(() => {
                      saveInMemoryCheckpoint(shadowForCheckpoint, contentRoot ?? '', {
                        kind: 'external-change-rescue',
                        docName,
                        contents: ours,
                        label: `External change recovered @ ${new Date().toISOString()}`,
                        branch: newBranch,
                        metadata: { incomingDiskSha: '' },
                      })
                        .then(() => {
                          incrementRescueBuffer();
                          log.info(
                            { docName },
                            `[reconcile] rescue checkpoint saved on branch switch: ${docName}`,
                          );
                        })
                        .catch((e: unknown) => {
                          log.error(
                            { docName, err: e },
                            `[reconcile] rescue checkpoint write failed: ${docName}`,
                          );
                        });
                    });
                  }

                  const lifecycleMap = document.getMap('lifecycle');
                  lifecycleMap.set('status', 'deleted-upstream');
                  log.info(
                    { docName, branch: newBranch },
                    `[branch-switch] tombstone: ${docName} (not on ${newBranch})`,
                  );
                  continue;
                }

                // Reset Y.Doc from disk
                const diskContent = readFileSync(filePath, 'utf-8');
                applyToDoc(docName, diskContent);
                setReconciledBase(docName, diskContent);
                log.info({ docName }, `[branch-switch] reset: ${docName}`);
              } catch (e) {
                log.error({ err: e, docName }, `[branch-switch] failed to reset ${docName}`);
              }
            }

            log.info(
              { branch: newBranch, docCount: hocuspocus.documents.size },
              `[branch-switch] loaded branch ${newBranch} (${hocuspocus.documents.size} docs)`,
            );
            backlinkIndex.rebuildFromDisk(newBranch);
            void backlinkIndex.saveToDisk(newBranch).catch((err) => {
              console.warn(`[backlinks] Failed to persist branch cache for ${newBranch}:`, err);
            });

            // Restore parked WIP if exists (three-way merge parked state against current disk)
            if (historyRef.current && info.batchKind === 'cross-branch') {
              let restoredCount = 0;
              for (const [docName] of hocuspocus.documents) {
                if (isSystemDoc(docName)) continue;
                try {
                  const parked = await readParkedState(
                    historyRef.current,
                    newBranch,
                    'server',
                    docName,
                  );
                  if (!parked) continue;
                  // Skip if no in-flight edits were parked
                  if (parked.markdown === parked.diskSnapshot) continue;

                  const currentDisk = getReconciledBase(docName);
                  if (!currentDisk) continue;

                  const outcome = reconcile({
                    docName,
                    base: parked.diskSnapshot,
                    ours: parked.markdown,
                    theirs: currentDisk,
                  });

                  switch (outcome.kind) {
                    case 'merged':
                    case 'clean':
                      applyToDoc(docName, outcome.newContent);
                      setReconciledBase(docName, outcome.newContent);
                      restoredCount++;
                      break;
                    case 'conflicts': {
                      applyToDoc(docName, outcome.newContent);
                      setReconciledBase(docName, outcome.newContent);
                      incrementConflict();
                      restoredCount++;
                      break;
                    }
                    case 'noop':
                    case 'refused':
                      break;
                  }
                } catch (e) {
                  log.error(
                    { err: e, docName },
                    `[branch-switch] restore WIP failed for ${docName}`,
                  );
                }
              }
              if (restoredCount > 0) {
                log.info(
                  { count: restoredCount, branch: newBranch },
                  `[branch-switch] restored ${restoredCount} parked docs on ${newBranch}`,
                );
              }
            }

            // Clean up detached HEAD context if switching FROM detached TO named branch
            if (info.oldBranch?.startsWith('detached-') && historyRef.current) {
              try {
                const sg = historyGit(historyRef.current);
                // List refs under the detached context
                const refs = (
                  await sg.raw('for-each-ref', `refs/wip/${info.oldBranch}/`, '--format=%(refname)')
                ).trim();
                if (refs) {
                  for (const ref of refs.split('\n')) {
                    if (ref) {
                      await sg.raw('update-ref', '-d', ref);
                    }
                  }
                  log.info(
                    { context: info.oldBranch },
                    `[branch-switch] cleaned up detached context ${info.oldBranch}`,
                  );
                }
              } catch (e) {
                log.error({ err: e }, '[branch-switch] detached cleanup failed');
              }
            }
          }

          // Record upstream import if HEAD moved AND content files were affected.
          // A user's own `git commit` moves HEAD but doesn't change the working tree
          // (files were already written by the user/editor). Only `git pull`, `git merge`,
          // `git rebase`, or `git checkout` produce buffered file-watcher events, so
          // bufferedCount > 0 distinguishes "upstream brought changes" from "user committed".
          if (info.headMoved && info.newHead && historyRef.current && bufferedCount > 0) {
            const contentRootForShadow = contentRoot ?? 'content';
            try {
              const sha = await commitUpstreamImport(
                historyRef.current,
                contentRootForShadow,
                info.oldHead,
                info.newHead,
                newBranch,
              );
              incrementUpstreamImport();
              log.info(
                {
                  oldHead: info.oldHead?.slice(0, 8) ?? 'null',
                  newHead: info.newHead.slice(0, 8),
                  sha: sha.slice(0, 8),
                },
                `[history] upstream-import from ${info.oldHead?.slice(0, 8) ?? 'null'}..${info.newHead.slice(0, 8)} → ${sha.slice(0, 8)}`,
              );
            } catch (e) {
              log.error({ err: e }, '[history] upstream-import failed');
            }
          }
        },
      );
    } catch (err) {
      log.error({ err }, '[server] HEAD watcher failed to start');
      degraded.push('head-watcher');
    }

    // Start SyncEngine (FR21): remote detection + auto-sync
    // Build credentialArgs from localOpCliArgs so git fetch/push can authenticate.
    // Pattern: ['-c', 'credential.helper=!<cli-binary> auth git-credential']
    const cliCmd = localOpCliArgs?.[0] ?? 'open-knowledge';
    const cliPrefix =
      localOpCliArgs && localOpCliArgs.length > 1 ? localOpCliArgs.join(' ') : cliCmd;
    const syncCredentialArgs = ['-c', `credential.helper=!${cliPrefix} auth git-credential`];
    try {
      syncEngine = new SyncEngine({
        projectDir,
        contentDir,
        contentFilter,
        contentRoot,
        credentialArgs: syncCredentialArgs,
        cc1Broadcaster,
        setBatchInProgress,
        onStateChange: (state) => {
          log.info({ state }, `[sync] state → ${state}`);
        },
      });
      await syncEngine.start();
    } catch (err) {
      log.warn({ err }, '[server] SyncEngine failed to start — sync disabled');
      syncEngine = null;
    }
  }

  const ready = initAsync();

  return {
    hocuspocus,
    sessionManager,
    cc1Broadcaster,
    agentFocusBroadcaster,
    contentFilter,
    destroy,
    ready,
    degraded,
    lockDir,
    get syncEngine() {
      return syncEngine;
    },
  };
}
