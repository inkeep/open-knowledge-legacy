import { mkdirSync, writeFileSync } from 'node:fs';
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
import { type AsyncSubscription, type DiskEvent, startWatcher } from './file-watcher.ts';
import { type HeadWatcherHandle, startHeadWatcher } from './head-watcher.ts';
import {
  createPersistenceExtension,
  isBatchInProgress,
  type PersistenceOptions,
  reconciledBase,
  setBatchInProgress,
} from './persistence.ts';
import { reconcile } from './reconciliation.ts';
import {
  commitUpstreamImport,
  initShadowRepo,
  type ShadowHandle,
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

  const persistenceOpts: PersistenceOptions = {
    contentDir,
    projectDir,
    gitEnabled,
    commitDebounceMs,
    wipRef,
    shadowRepo,
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
    shadowRepo,
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

          const base = reconciledBase.get(docName) ?? '';
          const ours = serializeDoc(docName) ?? base;

          const result = reconcile({ docName, base, ours, theirs });

          switch (result.kind) {
            case 'noop':
              break;

            case 'clean':
              applyToDoc(docName, result.newContent);
              reconciledBase.set(docName, result.newContent);
              console.log(`[reconcile] Clean apply: ${docName}`);
              break;

            case 'merged':
              applyToDoc(docName, result.newContent);
              reconciledBase.set(docName, result.newContent);
              console.log(`[reconcile] Merged: ${docName} (${result.mergedBlocks} blocks)`);
              break;

            case 'conflicts': {
              applyToDoc(docName, result.newContent);
              reconciledBase.set(docName, result.newContent);
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
              console.log(`[reconcile] Conflicts: ${docName} (${result.conflicts.length} blocks)`);
              break;
            }

            case 'refused': {
              const lifecycleMap = document.getMap('lifecycle');
              lifecycleMap.set('status', 'conflict');
              lifecycleMap.set('reason', result.reason);
              console.log(`[reconcile] Refused: ${docName} (${result.reason})`);
              break;
            }
          }
          break;
        }

        case 'delete': {
          const { docName } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) return;

          const base = reconciledBase.get(docName) ?? '';
          const ours = serializeDoc(docName) ?? '';
          const isDirty = ours !== base;

          if (isDirty && shadowRepo) {
            const rescueDir = `${shadowRepo.gitDir}/rescue`;
            mkdirSync(dirname(`${rescueDir}/${docName}.md`), { recursive: true });
            writeFileSync(`${rescueDir}/${docName}.md`, ours, 'utf-8');
            console.log(`[reconcile] Rescue buffer saved: ${docName}`);
          }

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'deleted-upstream');

          reconciledBase.delete(docName);
          console.log(`[reconcile] Delete: ${docName} (dirty=${isDirty})`);
          break;
        }

        case 'rename': {
          const { oldDocName, newDocName, content } = event;
          const document = hocuspocus.documents.get(oldDocName);

          reconciledBase.delete(oldDocName);
          reconciledBase.set(newDocName, content);

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
      const docName = 'docName' in event ? event.docName : 'unknown';
      console.error(`[reconcile] Failed to handle ${event.kind} for ${docName}:`, err);
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

  let watcher: AsyncSubscription | null = null;
  let headWatcher: HeadWatcherHandle | null = null;
  let resolvedShadow: ShadowHandle | undefined = shadowRepo;

  async function destroy(): Promise<void> {
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
  }

  /** Async initialization: shadow repo, file watcher, HEAD watcher. */
  async function initAsync(): Promise<void> {
    // Auto-initialize shadow repo if not provided
    if (!resolvedShadow) {
      try {
        resolvedShadow = await initShadowRepo(projectDir);
        console.log(`[server] Shadow repo initialized at ${resolvedShadow.gitDir}`);
      } catch (e) {
        console.error('[server] Shadow repo init failed:', e);
      }
    }

    // Verify shadow repo integrity — reinit if corrupted
    if (resolvedShadow) {
      try {
        const sg = shadowGit(resolvedShadow);
        await sg.raw('rev-parse', '--git-dir');
      } catch {
        console.warn('[server] Shadow repo appears corrupted — reinitializing');
        try {
          resolvedShadow = await initShadowRepo(projectDir);
        } catch (e) {
          console.error('[server] Shadow repo reinit failed:', e);
          resolvedShadow = undefined;
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
        // onBatchBegin
        () => {
          console.log('[batch] begin');
          hocuspocus.flushPendingStores();
          persistence.flushPendingGitCommit();
          setBatchInProgress(true);
        },
        // onBatchEnd
        async (info) => {
          setBatchInProgress(false);

          const bufferedCount = eventBuffer.length;
          await drainEventBuffer();

          console.log(
            `[batch] end (${bufferedCount} docs reconciled, headMoved=${info.headMoved}${info.timeout ? ', timeout' : ''})`,
          );

          // Record upstream import if HEAD moved and content files were affected
          if (info.headMoved && info.newHead && resolvedShadow && bufferedCount > 0) {
            const contentRootForShadow = contentRoot ?? 'content';
            try {
              const sha = await commitUpstreamImport(
                resolvedShadow,
                contentRootForShadow,
                info.oldHead,
                info.newHead,
              );
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
