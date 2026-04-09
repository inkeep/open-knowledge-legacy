import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LocalTransactionOrigin } from '@hocuspocus/server';
import { Hocuspocus } from '@hocuspocus/server';
import {
  prependFrontmatter,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import {
  type AsyncSubscription,
  contentHash,
  type DiskEvent,
  startWatcher,
} from './file-watcher.ts';
import { type HeadWatcherHandle, startHeadWatcher } from './head-watcher.ts';
import {
  incrementBatch,
  incrementConflict,
  incrementReconcile,
  incrementRescueBuffer,
  incrementUpstreamImport,
} from './metrics.ts';
import {
  createPersistenceExtension,
  getActiveBranch,
  getReconciledBase,
  isBatchInProgress,
  type PersistenceOptions,
  reconciledBase,
  safeContentPath,
  setBatchInProgress,
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
const schema = getSchema(sharedExtensions);

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
}

export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;
  /** Promise that resolves when async init (shadow repo, watchers) is complete. */
  ready: Promise<void>;
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
  } = options;

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
  const apiExtension = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    enableTestRoutes,
    shadowRef,
    projectRoot: projectDir,
    contentRoot,
  });
  hocuspocus.configuration.extensions.push(apiExtension);

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

  /** Apply markdown content to Y.Doc with skipStoreHooks. */
  function applyToDoc(docName: string, content: string): void {
    const document = hocuspocus.documents.get(docName);
    if (!document) return;
    const { frontmatter, body } = stripFrontmatter(content);
    const parsedJson = mdManager.parse(body);
    const pmNode = schema.nodeFromJSON(parsedJson);
    const xmlFragment = document.getXmlFragment('default');

    document.transact(
      () => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(document, xmlFragment, pmNode, meta);
        const metaMap = document.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);

        const ytext = document.getText('source');
        const currentText = ytext.toString();
        if (currentText !== content) {
          ytext.delete(0, currentText.length);
          ytext.insert(0, content);
        }
      },
      {
        source: 'local',
        skipStoreHooks: true,
        context: { origin: 'file-watcher' },
      } satisfies LocalTransactionOrigin,
    );
  }

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

          const base = persistence.reconciledBase.get(docName) ?? '';
          const ours = serializeDoc(docName) ?? base;

          const result = reconcile({ docName, base, ours, theirs });

          // Structured log with content hashes
          const baseH = contentHash(base).slice(0, 8);
          const oursH = contentHash(ours).slice(0, 8);
          const theirsH = contentHash(theirs).slice(0, 8);
          console.log(
            `[reconcile] ${docName} base=${baseH} ours=${oursH} theirs=${theirsH} result=${result.kind}`,
          );

          switch (result.kind) {
            case 'noop':
              break;

            case 'clean':
              try {
                applyToDoc(docName, result.newContent);
              } catch (e) {
                console.error(
                  `[reconcile] Failed to apply clean content to Y.Doc for ${docName}:`,
                  e,
                );
              }
              // Always update base to track disk state — prevents cascading merge errors
              persistence.reconciledBase.set(docName, result.newContent);
              incrementReconcile();
              break;

            case 'merged':
              try {
                applyToDoc(docName, result.newContent);
              } catch (e) {
                console.error(
                  `[reconcile] Failed to apply merged content to Y.Doc for ${docName}:`,
                  e,
                );
              }
              persistence.reconciledBase.set(docName, result.newContent);
              incrementReconcile();
              break;

            case 'conflicts': {
              try {
                applyToDoc(docName, result.newContent);
              } catch (e) {
                console.error(
                  `[reconcile] Failed to apply conflict content to Y.Doc for ${docName}:`,
                  e,
                );
              }
              persistence.reconciledBase.set(docName, result.newContent);
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

          const base = persistence.reconciledBase.get(docName) ?? '';
          const ours = serializeDoc(docName) ?? '';
          const isDirty = ours !== base;

          if (isDirty && shadowRef.current) {
            const rescueDir = `${shadowRef.current.gitDir}/rescue`;
            await mkdir(dirname(`${rescueDir}/${docName}.md`), { recursive: true });
            await writeFile(`${rescueDir}/${docName}.md`, ours, 'utf-8');
            incrementRescueBuffer();
            console.log(`[reconcile] Rescue buffer saved: ${docName}`);
          }

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'deleted-upstream');

          persistence.reconciledBase.delete(docName);
          console.log(`[reconcile] Delete: ${docName} (dirty=${isDirty})`);

          // Unload document to prevent re-creation on next persistence cycle
          hocuspocus.closeConnections(docName);
          await hocuspocus.unloadDocument(document);
          break;
        }

        case 'rename': {
          const { oldDocName, newDocName, content } = event;
          const document = hocuspocus.documents.get(oldDocName);

          persistence.reconciledBase.delete(oldDocName);
          persistence.reconciledBase.set(newDocName, content);

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
    if (persistence.isBatchInProgress()) {
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

  let watcher: AsyncSubscription | null = null;
  let headWatcher: HeadWatcherHandle | null = null;

  async function destroy(): Promise<void> {
    // Wait for async init to complete before cleanup — prevents leaked watcher
    // subscriptions if destroy() is called during startup (e.g., Ctrl+C)
    await ready.catch(() => {});

    // Flush pending git commit before stopping watchers
    persistence.flushPendingGitCommit();
    await persistence.awaitPendingCommit();

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
    hocuspocus.closeConnections();
    // Release shadow-root writer lock
    if (resolvedShadow) {
      destroyShadowRepo(resolvedShadow);
    }
  }

  /** Async initialization: shadow repo, file watcher, HEAD watcher. */
  async function initAsync(): Promise<void> {
    // Auto-initialize shadow repo if not provided
    if (!shadowRef.current) {
      try {
        shadowRef.current = await initShadowRepo(projectDir);
        console.log(`[server] Shadow repo initialized at ${shadowRef.current.gitDir}`);
      } catch (e) {
        console.error('[server] Shadow repo init failed:', e);
      }
    }

    // Verify shadow repo integrity — reinit if corrupted
    if (shadowRef.current) {
      try {
        const sg = shadowGit(shadowRef.current);
        await sg.raw('rev-parse', '--git-dir');
      } catch {
        console.warn('[server] Shadow repo appears corrupted — reinitializing');
        try {
          shadowRef.current = await initShadowRepo(projectDir);
        } catch (e) {
          console.error('[server] Shadow repo reinit failed:', e);
          shadowRef.current = undefined;
        }
      }
    }

    // Start file watcher
    try {
      watcher = await startWatcher(contentDir, onDiskEvent);
    } catch (err) {
      console.error('[server] Disk bridge watcher failed to start:', err);
    }

    // Start HEAD watcher (only if project .git/ exists)
    try {
      headWatcher = await startHeadWatcher(
        projectDir,
        // onBatchBegin — park current branch context before git modifies working tree
        async () => {
          console.log('[batch] begin');
          incrementBatch();
          hocuspocus.flushPendingStores();
          persistence.flushPendingGitCommit();

          // Park current branch's Y.Doc state to shadow refs
          if (resolvedShadow) {
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
                const sha = await parkBranch(resolvedShadow, currentBranch, 'server', docs);
                if (sha) {
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

          persistence.setBatchInProgress(false);

          console.log(
            `[batch] end kind=${info.batchKind} headMoved=${info.headMoved} docs=${bufferedCount}${info.timeout ? ' timeout' : ''}`,
          );

          if (info.batchKind === 'within-branch') {
            // Pull, merge, rebase on same branch — reconcile buffered events
            await drainEventBuffer();
          } else {
            // Cross-branch or detached-head — discard buffered events (wrong branch state)
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

                  if (isDirty && resolvedShadow) {
                    const rescueDir = `${resolvedShadow.gitDir}/rescue`;
                    mkdirSync(dirname(`${rescueDir}/${docName}.md`), { recursive: true });
                    writeFileSync(`${rescueDir}/${docName}.md`, ours, 'utf-8');
                    incrementRescueBuffer();
                    console.log(`[reconcile] Rescue buffer saved on branch switch: ${docName}`);
                  }

                  const lifecycleMap = document.getMap('lifecycle');
                  lifecycleMap.set('status', 'deleted-upstream');
                  console.log(`[branch-switch] tombstone: ${docName} (not on ${newBranch})`);
                  continue;
                }

                // Reset Y.Doc from disk
                const diskContent = readFileSync(filePath, 'utf-8');
                applyToDoc(docName, diskContent);
                reconciledBase.set(docName, diskContent);
                console.log(`[branch-switch] reset: ${docName}`);
              } catch (e) {
                console.error(`[branch-switch] failed to reset ${docName}:`, e);
              }
            }

            console.log(
              `[branch-switch] loaded branch ${newBranch} (${hocuspocus.documents.size} docs)`,
            );

            // Restore parked WIP if exists (three-way merge parked state against current disk)
            if (resolvedShadow && info.batchKind === 'cross-branch') {
              let restoredCount = 0;
              for (const [docName] of hocuspocus.documents) {
                try {
                  const parked = await readParkedState(
                    resolvedShadow,
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
                      reconciledBase.set(docName, outcome.newContent);
                      restoredCount++;
                      break;
                    case 'conflicts': {
                      applyToDoc(docName, outcome.newContent);
                      reconciledBase.set(docName, outcome.newContent);
                      const document = hocuspocus.documents.get(docName);
                      if (document) {
                        const conflictsMap = document.getMap('conflicts');
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
            if (info.oldBranch?.startsWith('detached-') && resolvedShadow) {
              try {
                const sg = shadowGit(resolvedShadow);
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

          // Record upstream import if HEAD moved and content files were affected
          if (info.headMoved && info.newHead && resolvedShadow) {
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
    }
  }

  const ready = initAsync();

  return { hocuspocus, sessionManager, destroy, ready };
}
