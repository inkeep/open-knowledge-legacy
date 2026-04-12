import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import { prependFrontmatter, sharedExtensions } from '@inkeep/open-knowledge-core';
import { MarkdownManager } from '@tiptap/markdown';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { createContentFilter } from './content-filter.ts';
import { applyExternalChange } from './external-change.ts';
import { contentHash, type DiskEvent, startWatcher, type WatcherHandle } from './file-watcher.ts';
import { type HeadWatcherHandle, startHeadWatcher } from './head-watcher.ts';
import { getLogger } from './logger.ts';
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
import {
  commitUpstreamImport,
  destroyShadowRepo,
  initShadowRepo,
  type ParkableDoc,
  parkBranch,
  readParkedState,
  type ShadowHandle,
  type ShadowRef,
  shadowGit,
} from './shadow-repo.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// Startup fidelity canary (R17): verify the patch is applied and round-trip works.
{
  const canaryLogger = getLogger('fidelity');
  const canaryInput = '# H&M Store\n';
  try {
    const canaryOutput = mdManager.serialize(mdManager.parse(canaryInput));
    if (canaryOutput.includes('H&M') && !canaryOutput.includes('&amp;')) {
      canaryLogger.info({}, 'startup canary: PASS — entity bypass verified');
    } else {
      canaryLogger.warn({}, 'startup canary: FAIL — entity encoding detected in round-trip');
    }
  } catch (e) {
    canaryLogger.warn({ err: e }, 'startup canary: ERROR');
  }
}

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
  shadowRepo?: ShadowHandle;
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
}

export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;
  /** Resolves when async init (shadow repo, file watcher subscription) is complete. */
  ready: Promise<void>;
  /**
   * Names of subsystems that failed to initialize during boot.
   * Read AFTER `await ready` for a stable list; reads before may return a partial result.
   * Empty array means all subsystems initialized successfully.
   * Possible values: `'shadow-repo'`, `'file-watcher'`, `'head-watcher'`.
   */
  readonly degraded: readonly string[];
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
    shadowRepo,
    contentRoot,
    includePatterns = ['**/*.md'],
    excludePatterns = [],
    destroyTimeoutMs = 10_000,
  } = options;

  const log = getLogger('server');

  // Create content filter — unified exclusion logic (gitignore + config.content.exclude)
  const contentFilter = createContentFilter({
    projectDir,
    contentDir,
    includePatterns,
    excludePatterns,
  });

  // Mutable ref so deferred init (initAsync) propagates to persistence and API
  const shadowRef: ShadowRef = { current: shadowRepo };

  const persistenceOpts: PersistenceOptions = {
    contentDir,
    projectDir,
    gitEnabled,
    commitDebounceMs,
    wipRef,
    shadowRef,
    contentRoot,
  };

  const persistence = createPersistenceExtension(persistenceOpts);

  const hocuspocus = new Hocuspocus({
    quiet,
    debounce,
    maxDebounce,
    extensions: [persistence.extension],
  });

  const sessionManager = new AgentSessionManager(hocuspocus);

  // Add API extension — push directly onto the extensions array rather than
  // calling hocuspocus.configure({ extensions: [...] }), which uses spread
  // and would REPLACE the existing persistence extension.
  // getFileIndex delegates to the watcher once it's ready (watcher starts async in initAsync).
  const apiExtension = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    getFileIndex: () => (watcher ? watcher.getFileIndex() : new Map()),
    enableTestRoutes,
    shadowRef,
    projectRoot: projectDir,
    contentRoot,
  });
  hocuspocus.configuration.extensions.push(apiExtension);

  /** Resolve a safe rescue buffer path, returning null if traversal is detected. */
  function safeRescuePath(shadowGitDir: string, docName: string): string | null {
    const rescueBase = resolve(shadowGitDir, 'rescue');
    const filePath = resolve(rescueBase, `${docName}.md`);
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
          break;
        }

        case 'update': {
          const { docName, content: theirs } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) return;

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
              break;

            case 'clean':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply clean content to Y.Doc for ${docName}`,
                );
              }
              break;

            case 'merged':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply merged content to Y.Doc for ${docName}`,
                );
              }
              break;

            case 'conflicts': {
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                incrementConflict();
                const conflictsMap = document.getMap('conflicts');
                for (const c of result.conflicts) {
                  conflictsMap.set(String(c.blockIndex), {
                    blockIndex: c.blockIndex,
                    base: c.base,
                    ours: c.ours,
                    theirs: c.theirs,
                    resolution: 'pending',
                  });
                }
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply conflict content to Y.Doc for ${docName}`,
                );
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
          if (!document) return;

          const base = getReconciledBase(docName) ?? '';
          const ours = serializeDoc(docName) ?? '';
          const isDirty = ours !== base;

          if (isDirty && shadowRef.current) {
            const rescuePath = safeRescuePath(shadowRef.current.gitDir, docName);
            if (rescuePath) {
              mkdirSync(dirname(rescuePath), { recursive: true });
              writeFileSync(rescuePath, ours, 'utf-8');
              incrementRescueBuffer();
              log.info({ docName }, `[reconcile] rescue buffer saved: ${docName}`);
            }
          }

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'deleted-upstream');

          deleteReconciledBase(docName);
          log.info({ docName, isDirty }, `[reconcile] delete: ${docName} (dirty=${isDirty})`);

          // Unload document to prevent re-creation on next persistence cycle
          hocuspocus.closeConnections(docName);
          await hocuspocus.unloadDocument(document);
          break;
        }

        case 'rename': {
          const { oldDocName, newDocName, content } = event;
          const document = hocuspocus.documents.get(oldDocName);

          deleteReconciledBase(oldDocName);
          setReconciledBase(newDocName, content);

          if (document) {
            const lifecycleMap = document.getMap('lifecycle');
            lifecycleMap.set('status', 'renamed');
            lifecycleMap.set('newPath', newDocName);
          }

          log.info({ oldDocName, newDocName }, `[reconcile] rename: ${oldDocName} → ${newDocName}`);
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
        if (shadowRef.current) {
          for (const docName of stillLoaded) {
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
              const rescuePath = safeRescuePath(shadowRef.current.gitDir, docName);
              if (!rescuePath) {
                // Path-traversal guard fired — docName tried to escape the
                // rescue/ directory. Log at warn level since this is
                // security-relevant, not just a write failure.
                log.warn(
                  { docName, gitDir: shadowRef.current.gitDir },
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
      // Log init errors at debug level so operators investigating a shutdown
      // issue can confirm whether the server ever reached ready.
      await ready.catch((err) => log.debug({ err }, '[server] init incomplete during shutdown'));

      // Capture after ready so the count reflects documents loaded during init
      const documentCount = hocuspocus.documents.size;

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
        try {
          await persistence.flushPendingGitCommit();
          await persistence.waitForPendingCommits();
        } catch (err) {
          phaseErrors.push({
            phase: 'git-commit-flush',
            error: err instanceof Error ? err.message : String(err),
          });
          log.error({ err }, '[server] shutdown phase-4 git commit flush failed');
        }
      } finally {
        // Phase 5: shadow repo release — ALWAYS runs
        if (shadowRef.current) {
          try {
            destroyShadowRepo(shadowRef.current);
          } catch (err) {
            phaseErrors.push({
              phase: 'shadow-repo-release',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-5 destroyShadowRepo failed');
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
    })();

    return inflightDestroy;
  }

  /** Subsystems that failed during initAsync — populated on catch, read after `await ready`. */
  const degraded: string[] = [];

  /** Async initialization: shadow repo, file watcher, HEAD watcher. */
  async function initAsync(): Promise<void> {
    // Auto-initialize shadow repo if not provided
    if (!shadowRef.current) {
      try {
        shadowRef.current = await initShadowRepo(projectDir);
        log.info(
          { gitDir: shadowRef.current.gitDir },
          `[server] shadow repo initialized at ${shadowRef.current.gitDir}`,
        );
      } catch (e) {
        log.error({ err: e }, '[server] shadow repo init failed');
        degraded.push('shadow-repo');
      }
    }

    // Verify shadow repo integrity — reinit only on structural corruption, not transient errors
    if (shadowRef.current) {
      try {
        const sg = shadowGit(shadowRef.current);
        await sg.raw('rev-parse', '--git-dir');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not a git repository') || msg.includes('invalid object')) {
          log.warn({}, '[server] shadow repo appears corrupted — reinitializing');
          try {
            shadowRef.current = await initShadowRepo(projectDir);
          } catch (e2) {
            log.error({ err: e2 }, '[server] shadow repo reinit failed');
            shadowRef.current = undefined;
            if (!degraded.includes('shadow-repo')) degraded.push('shadow-repo');
          }
        } else {
          log.error({ err: e }, '[server] shadow repo check failed (transient?)');
        }
      }
    }

    // Start file watcher (with content filter for gitignore + config exclude)
    try {
      watcher = await startWatcher(contentDir, onDiskEvent, contentFilter);
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
          if (shadowRef.current) {
            const currentBranch = getActiveBranch();
            const docs: ParkableDoc[] = [];
            for (const [docName] of hocuspocus.documents) {
              const markdown = serializeDoc(docName);
              if (markdown === null) continue;
              const diskSnapshot = getReconciledBase(docName) ?? markdown;
              docs.push({ docName, markdown, diskSnapshot });
            }
            if (docs.length > 0) {
              try {
                const sha = await parkBranch(shadowRef.current, currentBranch, 'server', docs);
                if (sha) {
                  incrementPark();
                  log.info(
                    { count: docs.length, branch: currentBranch, sha: sha.slice(0, 8) },
                    `[shadow] parked ${docs.length} docs on ${currentBranch} → ${sha.slice(0, 8)}`,
                  );
                }
              } catch (e) {
                log.error({ err: e }, '[shadow] park failed');
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

            // Reset all open Y.Docs from the target branch's disk content
            for (const [docName, document] of hocuspocus.documents) {
              try {
                const filePath = safeContentPath(docName, contentDir);
                if (!existsSync(filePath)) {
                  // File doesn't exist on target branch — tombstone
                  const base = getReconciledBase(docName) ?? '';
                  const ours = serializeDoc(docName) ?? '';
                  const isDirty = ours !== base;

                  if (isDirty && shadowRef.current) {
                    const rescuePath = safeRescuePath(shadowRef.current.gitDir, docName);
                    if (rescuePath) {
                      mkdirSync(dirname(rescuePath), { recursive: true });
                      writeFileSync(rescuePath, ours, 'utf-8');
                      incrementRescueBuffer();
                      log.info(
                        { docName },
                        `[reconcile] rescue buffer saved on branch switch: ${docName}`,
                      );
                    }
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

            // Restore parked WIP if exists (three-way merge parked state against current disk)
            if (shadowRef.current && info.batchKind === 'cross-branch') {
              let restoredCount = 0;
              for (const [docName] of hocuspocus.documents) {
                try {
                  const parked = await readParkedState(
                    shadowRef.current,
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
                      const conflictDoc = hocuspocus.documents.get(docName);
                      if (conflictDoc) {
                        const conflictsMap = conflictDoc.getMap('conflicts');
                        for (const c of outcome.conflicts) {
                          conflictsMap.set(String(c.blockIndex), {
                            blockIndex: c.blockIndex,
                            base: c.base,
                            ours: c.ours,
                            theirs: c.theirs,
                            resolution: 'pending',
                          });
                        }
                      }
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
            if (info.oldBranch?.startsWith('detached-') && shadowRef.current) {
              try {
                const sg = shadowGit(shadowRef.current);
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
          if (info.headMoved && info.newHead && shadowRef.current && bufferedCount > 0) {
            const contentRootForShadow = contentRoot ?? 'content';
            try {
              const sha = await commitUpstreamImport(
                shadowRef.current,
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
                `[shadow] upstream-import from ${info.oldHead?.slice(0, 8) ?? 'null'}..${info.newHead.slice(0, 8)} → ${sha.slice(0, 8)}`,
              );
            } catch (e) {
              log.error({ err: e }, '[shadow] upstream-import failed');
            }
          }
        },
      );
    } catch (err) {
      log.error({ err }, '[server] HEAD watcher failed to start');
      degraded.push('head-watcher');
    }
  }

  const ready = initAsync();

  return { hocuspocus, sessionManager, destroy, ready, degraded };
}
