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
  /** Subdirectory of contentDir where uploaded files are stored. Defaults to 'uploads'. */
  uploadsDir?: string;
  /** Glob patterns for files to include (default: ['**\/*.md']). */
  includePatterns?: string[];
  /** Glob patterns for files to explicitly exclude. */
  excludePatterns?: string[];
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
    uploadsDir = 'uploads',
    includePatterns = ['**/*.md'],
    excludePatterns = [],
  } = options;

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
    uploadsDir,
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
          console.log(`[reconcile] Create: ${event.docName}`);
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
          console.log(
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
                console.error(
                  `[reconcile] Failed to apply clean content to Y.Doc for ${docName}:`,
                  e,
                );
              }
              break;

            case 'merged':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
              } catch (e) {
                console.error(
                  `[reconcile] Failed to apply merged content to Y.Doc for ${docName}:`,
                  e,
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
                console.error(
                  `[reconcile] Failed to apply conflict content to Y.Doc for ${docName}:`,
                  e,
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
              console.log(`[reconcile] Rescue buffer saved: ${docName}`);
            }
          }

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'deleted-upstream');

          deleteReconciledBase(docName);
          console.log(`[reconcile] Delete: ${docName} (dirty=${isDirty})`);

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

          console.log(`[reconcile] Rename: ${oldDocName} → ${newDocName}`);
          break;
        }

        case 'conflict': {
          const { docName } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) return;

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'conflict');
          lifecycleMap.set('reason', 'conflict-markers');
          console.log(`[reconcile] Conflict markers detected: ${docName}`);
          break;
        }
      }
    } catch (err) {
      console.error(
        `[reconcile] Failed to handle ${event.kind} for ${diskEventDocName(event)}:`,
        err,
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

  async function destroy(): Promise<void> {
    // Wait for async init to complete before cleanup — prevents leaked watcher
    // subscriptions if destroy() is called during startup (e.g., Ctrl+C)
    await ready.catch(() => {});

    // Flush pending git commit before stopping watchers
    await persistence.flushPendingGitCommit();
    await persistence.waitForPendingCommits();

    if (headWatcher) {
      await headWatcher.unsubscribe();
      headWatcher = null;
    }
    if (watcher) {
      await watcher.unsubscribe();
      watcher = null;
    }
    await sessionManager.closeAll();
    hocuspocus.flushPendingStores();
    await persistence.waitForPendingCommits();
    hocuspocus.closeConnections();
    // Release shadow-root writer lock
    if (shadowRef.current) {
      destroyShadowRepo(shadowRef.current);
    }
  }

  /** Subsystems that failed during initAsync — populated on catch, read after `await ready`. */
  const degraded: string[] = [];

  /** Async initialization: shadow repo, file watcher, HEAD watcher. */
  async function initAsync(): Promise<void> {
    // Auto-initialize shadow repo if not provided
    if (!shadowRef.current) {
      try {
        shadowRef.current = await initShadowRepo(projectDir);
        console.log(`[server] Shadow repo initialized at ${shadowRef.current.gitDir}`);
      } catch (e) {
        console.error('[server] Shadow repo init failed:', e);
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
          console.warn('[server] Shadow repo appears corrupted — reinitializing');
          try {
            shadowRef.current = await initShadowRepo(projectDir);
          } catch (e2) {
            console.error('[server] Shadow repo reinit failed:', e2);
            shadowRef.current = undefined;
            if (!degraded.includes('shadow-repo')) degraded.push('shadow-repo');
          }
        } else {
          console.error('[server] Shadow repo check failed (transient?):', e);
        }
      }
    }

    // Start file watcher (with content filter for gitignore + config exclude)
    try {
      watcher = await startWatcher(contentDir, onDiskEvent, contentFilter);
    } catch (err) {
      console.error('[server] Disk bridge watcher failed to start:', err);
      degraded.push('file-watcher');
    }

    // Start HEAD watcher (only if project .git/ exists)
    try {
      headWatcher = await startHeadWatcher(
        projectDir,
        // onBatchBegin — park current branch context before git modifies working tree
        async ({ trigger }) => {
          console.log(`[batch] begin trigger=${trigger}`);
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
                  console.log(
                    `[shadow] parked ${docs.length} docs on ${currentBranch} → ${sha.slice(0, 8)}`,
                  );
                }
              } catch (e) {
                console.error('[shadow] park failed:', e);
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

          console.log(
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
                      console.log(`[reconcile] Rescue buffer saved on branch switch: ${docName}`);
                    }
                  }

                  const lifecycleMap = document.getMap('lifecycle');
                  lifecycleMap.set('status', 'deleted-upstream');
                  console.log(`[branch-switch] tombstone: ${docName} (not on ${newBranch})`);
                  continue;
                }

                // Reset Y.Doc from disk
                const diskContent = readFileSync(filePath, 'utf-8');
                applyToDoc(docName, diskContent);
                setReconciledBase(docName, diskContent);
                console.log(`[branch-switch] reset: ${docName}`);
              } catch (e) {
                console.error(`[branch-switch] failed to reset ${docName}:`, e);
              }
            }

            console.log(
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
                  console.error(`[branch-switch] restore WIP failed for ${docName}:`, e);
                }
              }
              if (restoredCount > 0) {
                console.log(
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
                  console.log(`[branch-switch] cleaned up detached context ${info.oldBranch}`);
                }
              } catch (e) {
                console.error(`[branch-switch] detached cleanup failed:`, e);
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
              console.log(
                `[shadow] upstream-import from ${info.oldHead?.slice(0, 8) ?? 'null'}..${info.newHead.slice(0, 8)} → ${sha.slice(0, 8)}`,
              );
            } catch (e) {
              console.error('[shadow] upstream-import failed:', e);
            }
          }
        },
      );
    } catch (err) {
      console.error('[server] HEAD watcher failed to start:', err);
      degraded.push('head-watcher');
    }
  }

  const ready = initAsync();

  return { hocuspocus, sessionManager, destroy, ready, degraded };
}
