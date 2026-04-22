/**
 * Git auto-persistence pipeline.
 *
 * Layer 1 (CRDT → disk): onStoreDocument serializes Y.Doc → markdown → .md file
 * Layer 2 (disk → git): afterStoreDocument commits to shadow repo via git plumbing
 *
 * Hocuspocus config: debounce=2000, maxDebounce=10000 (L1)
 * Git commit debounced separately: 30s idle after last disk write (L2)
 */
import { existsSync, lstatSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { mkdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { Extension } from '@hocuspocus/server';
import { type Principal, prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import {
  formatOkActor,
  formatWipSubject,
  type OkActorEntry,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { updateYFragment, yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type { BacklinkIndex } from './backlink-index.ts';
import { isSystemDoc } from './cc1-broadcast.ts';
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
import { contentHash, registerWrite } from './file-watcher.ts';
import { getLogger } from './logger.ts';
import { mdManager, schema } from './md-manager.ts';
import {
  incrementGitAutoSaveFailure,
  incrementGitWriterCommitFailure,
  incrementPersistenceDiskWrite,
} from './metrics.ts';
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

const log = getLogger('persistence');

/**
 * Derive a WriterIdentity from a Hocuspocus transaction origin (D31, D32, FR-16).
 *
 * Called from onStoreDocument to determine which writer triggered the store.
 * Handles the three origin shapes Hocuspocus surfaces:
 *   - local  + context.session_id  → per-session agent writer
 *   - local  + context.origin      → classified service writer
 *   - connection + principalId     → human-browser principal writer (US-024)
 *
 * precedent #1 — origins are LocalTransactionOrigin object refs, not strings.
 * Exported for unit-testing the dispatch table without spinning up a server.
 */
export function resolveWriterFromOrigin(
  origin: unknown,
  getPrincipal?: () => Principal | null,
): WriterIdentity | null {
  if (!origin || typeof origin !== 'object') return null;
  const o = origin as Record<string, unknown>;

  if (o.source === 'local') {
    const ctx = o.context as Record<string, unknown> | undefined;
    if (!ctx) return null;

    // Per-session origin (agent write, agent undo) — session_id is the connectionId
    if (typeof ctx.session_id === 'string') {
      const sessionId = ctx.session_id;
      return {
        id: `agent-${sessionId}`,
        name: `Agent (${sessionId.slice(0, 8)})`,
        email: `agent-${sessionId}@openknowledge.local`,
      };
    }

    // Classified local origins by context.origin value
    if (ctx.origin === 'file-watcher') return FILE_SYSTEM_WRITER;
    if (ctx.origin === 'upstream-import' || ctx.origin === 'git-upstream') {
      return GIT_UPSTREAM_WRITER;
    }
    // park-snapshot, rollback-apply, managed-rename → service fallback
    return SERVICE_WRITER;
  }

  if (o.source === 'connection') {
    // Human browser write — principalId set via onAuthenticate (D50, US-024)
    const conn = o.connection as Record<string, unknown> | undefined;
    const ctx = conn?.context as Record<string, unknown> | undefined;
    if (typeof ctx?.principalId === 'string') {
      const principalId = ctx.principalId as string;
      // Post-QA review fix: when the claimed principalId matches the loaded
      // principal record, use the real display_name / display_email (e.g.
      // git-config user.name) so `ok-actor:` body + Co-Authored-By trailers
      // mirror the user's git identity. Fall back to a stub only when the
      // server has no principal loaded or the claim doesn't match.
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
  /** Shadow repo ref — read at commit time so deferred init propagates. */
  shadowRef?: ShadowRef;
  /** Content root relative to project dir (e.g., 'content/docs'). Used for shadow repo staging. */
  contentRoot?: string;
  backlinkIndex?: BacklinkIndex;
  /** Accessor for the current branch from the HEAD watcher. Used to scope WIP refs per branch. */
  getCurrentBranch?: () => string | null;
  /**
   * US-013 FR-3b: resolves `![[photo.png]]` embed targets to disk-relative
   * paths before PM dispatch. Consumed by `onLoadDocument`'s
   * `mdManager.parseWithFallback` call so image-extension embeds materialize
   * as PM `image` nodes with the resolved `src` (not the literal target).
   */
  resolveEmbed?: (basename: string, sourcePath: string) => string | null;
  /**
   * Accessor for the server's principal record. When a browser connection's
   * `ctx.principalId` matches `loadedPrincipal.id`, `resolveWriterFromOrigin`
   * emits WriterIdentity with the real display_name / display_email instead
   * of a "Local User" stub (post-QA review fix).
   */
  getPrincipal?: () => Principal | null;
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

/**
 * Reconciled base: last known-good markdown for each document, scoped by branch.
 * Updated on load, store, and reconciliation. Used as the merge base
 * for three-way reconciliation.
 *
 * Outer key = branch name (e.g. "main", "feature/xyz", "detached-abc123def456")
 * Inner key = docName, value = last-synced markdown content
 */
const reconciledBaseByBranch = new Map<string, Map<string, string>>();

/** Active branch scope for reconciledBase lookups. Defaults to 'main'. */
let activeBranch = 'main';

/** Switch the active branch scope. Creates a fresh scope if first visit. */
export function switchReconciledBaseScope(branch: string): void {
  activeBranch = branch;
  if (!reconciledBaseByBranch.has(branch)) {
    reconciledBaseByBranch.set(branch, new Map());
  }
}

/** Get the active branch name for reconciledBase. */
export function getActiveBranch(): string {
  return activeBranch;
}

/** Get the reconciledBase value for a doc in the active branch scope. */
export function getReconciledBase(docName: string): string | undefined {
  return reconciledBaseByBranch.get(activeBranch)?.get(docName);
}

/** Set the reconciledBase value for a doc in the active branch scope. */
export function setReconciledBase(docName: string, content: string): void {
  if (!reconciledBaseByBranch.has(activeBranch)) {
    reconciledBaseByBranch.set(activeBranch, new Map());
  }
  reconciledBaseByBranch.get(activeBranch)?.set(docName, content);
}

/** Delete the reconciledBase entry for a doc in the active branch scope. */
export function deleteReconciledBase(docName: string): void {
  reconciledBaseByBranch.get(activeBranch)?.delete(docName);
}

/** Batch-in-progress flag — gates L1 writes and L2 commits during coordinated git operations. */
let batchInProgress = false;

export function setBatchInProgress(value: boolean): void {
  batchInProgress = value;
}

export function isBatchInProgress(): boolean {
  return batchInProgress;
}

export interface PersistenceHandle {
  extension: Extension;
  flushPendingGitCommit: () => Promise<void>;
  waitForPendingCommits: () => Promise<void>;
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
  const contentRoot = options?.contentRoot ?? (relative(projectDir, contentDir) || 'content');
  const backlinkIndex = options?.backlinkIndex;
  const getPrincipal = options?.getPrincipal;

  // Per-instance frontmatter cache — tracks frontmatter per document for round-trip fidelity.
  // Lives inside the closure so multiple server instances don't share mutable state.
  const frontmatterCache = new Map<string, string>();

  // reconciledBase and batchInProgress use the module-level systems
  // (reconciledBaseByBranch via get/setReconciledBase, and isBatchInProgress)
  // so that standalone.ts and persistence stay in sync.

  const gitEnabled = options?.gitEnabled ?? true;
  const commitDebounceMs = options?.commitDebounceMs ?? 15_000;
  const wipRef = options?.wipRef ?? 'refs/wip/main';
  const getCurrentBranch = options?.getCurrentBranch;

  // No longer hardcoded — resolved from contributor snapshot (D32, FR-16)

  // Debounce git commits
  let gitCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveGitFailures = 0;
  let commitInFlight: Promise<void> | null = null;
  let pendingAfterCommit = false;

  async function commitToWipRef(): Promise<void> {
    // Read shadow ref at commit time (not construction time) so deferred init propagates
    const shadow = shadowRef?.current;
    if (shadow) {
      const snapshot = swapContributors(); // atomic drain — new writes go to fresh map
      const branch = getCurrentBranch?.() ?? 'main';

      if (snapshot.size === 0) {
        // No attributed contributors — fall back to single SERVICE_WRITER commit (D32)
        const serviceActorEntry: OkActorEntry = {
          v: 1,
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

      // Per-writer fan-out (FR-7, US-014, precedent #25): build tree once, commit per writer.
      // All per-writer commits share the same tree SHA for this drain cycle.
      // Writer IDs follow the taxonomy in parseWriterId (shadow-repo-layout.ts): agent-<connId>,
      // principal-<UUID>, file-system, git-upstream, openknowledge-service.
      let treeSha: string;
      try {
        treeSha = await buildWipTree(shadow, contentRoot);
      } catch (e) {
        // Tree build failed — restore all contributors and abort this cycle
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
        // FR-8 / §8.7 — populate full actor tuple from ContributorEntry.actor when present.
        // Classified writers (file-system, git-upstream, openknowledge-service) leave these
        // null because they have no principal/agent attribution at record time.
        const a = entry.actor;
        const actorEntry: OkActorEntry = {
          v: 1,
          principal: a?.principalId ?? null,
          agent_session: writerId.startsWith('agent-') ? writerId.slice(6) : null,
          agent_type: a?.agentType ?? null,
          client_name: a?.clientName ?? null,
          client_version: a?.clientVersion ?? null,
          label: a?.label ?? null,
          display_name: entry.displayName,
          color_seed: entry.colorSeed,
          docs,
        };
        const contributorLine = `ok-contributors: ${JSON.stringify({
          v: 1,
          id: writerId,
          name: entry.displayName,
          colorSeed: entry.colorSeed,
          docs,
        })}`;
        const subject = entry.subjectOverride ?? formatWipSubject(docs);
        const writerMessage = `${subject}\n\n${contributorLine}\n${formatOkActor(actorEntry)}`;
        try {
          const sha = await commitWipFromTree(shadow, writer, treeSha, writerMessage, branch);
          anySuccess = true;
          log.info(
            { sha: sha.slice(0, 8), writer: writerId, tree: treeSha.slice(0, 8) },
            `[persistence] Shadow WIP commit: ${sha.slice(0, 8)} on refs/wip/${writerId}`,
          );
        } catch (e) {
          // Per-writer failure — restore this writer's entry, let others succeed (D38)
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

    // Legacy path: commit to project repo (used when no shadow repo is configured)
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
        unlinkSync(tmpIndex);
      } catch {
        // ignore cleanup failure
      }
    }
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
    }, commitDebounceMs);
  }

  /** Flush pending L1 writes by forcing the Hocuspocus store cycle. */
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

  /** Await any in-flight git commit (for graceful shutdown). */
  async function _awaitPendingCommit(): Promise<void> {
    if (commitInFlight) await commitInFlight;
  }

  const extension: Extension = {
    async onLoadDocument({ document, documentName, context: _context }) {
      if (isSystemDoc(documentName)) return;
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
      const { frontmatter, body } = stripFrontmatter(raw);

      if (frontmatter) {
        frontmatterCache.set(documentName, frontmatter);
        const metaMap = document.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }

      // parseWithFallback — never throws (R6). On parse failure with position
      // info, degrades to block-level rawMdxFallback preserving surrounding
      // structure. On position-less error, splits at blank-line boundaries
      // per-block. Only falls through to whole-doc raw text when every block
      // fails — strictly better than parse() throwing on broken MDX.
      const parseOpts = options?.resolveEmbed
        ? { resolveEmbed: options.resolveEmbed, sourcePath: documentName }
        : undefined;
      const json = mdManager.parseWithFallback(body, parseOpts);

      const xmlFragment = document.getXmlFragment('default');
      log.info(
        { documentName, fragmentLength: xmlFragment.length },
        `[persistence] onLoadDocument ${documentName}: fragment.length=${xmlFragment.length} before update`,
      );
      if (xmlFragment.length === 0) {
        const pmNode = schema.nodeFromJSON(json);
        updateYFragment(document, xmlFragment, pmNode, {
          mapping: new Map(),
          isOMark: new Map(),
        });
        log.info(
          { filePath, children: xmlFragment.length },
          `[persistence] Loaded ${filePath} into Y.Doc (${xmlFragment.length} children)`,
        );
        // Watch for unexpected mutations
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
      // Use normalized serialization as the base so onStoreDocument doesn't
      // false-positive on the first store after load. Raw file content may
      // differ from TipTap's output (blank lines, trailing newlines, list
      // formatting) without any actual content change.
      const normalizedBody = mdManager.serialize(
        yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON(),
      );
      setReconciledBase(documentName, prependFrontmatter(frontmatter, normalizedBody));
    },

    async onStoreDocument({
      document,
      documentName,
      lastTransactionOrigin,
      lastContext: _lastContext,
    }) {
      if (isSystemDoc(documentName)) return;
      if (isBatchInProgress()) return;

      // Thread origin → contributor tracker (D31, D32, FR-16).
      // This is a safety-net for writes that bypass api-extension.ts handlers.
      // Agent write handlers already call recordContributor explicitly; this
      // handles human-browser connection writes (US-024) and any other origin
      // that doesn't go through a handler. The call is idempotent: if the
      // handler already recorded the session, only the docs Set is updated.
      const writer = resolveWriterFromOrigin(lastTransactionOrigin, getPrincipal);
      if (writer && writer.id !== SERVICE_WRITER.id) {
        // Post-QA review fix (safety-net-metadata-races-handler, Minor 2):
        // api-extension handlers register rich WriterIdentity BEFORE the Y.Doc
        // transact fires; onStoreDocument runs on Hocuspocus's 2s debounce, so
        // the handler-path entry is in the tracker by the time we get here.
        // The safety-net only fills in for writes that never pass through an
        // /api/* handler — specifically browser-principal writes (US-024,
        // `source: 'connection'`). Skipping when the entry already exists
        // guarantees the stub `Agent (<short>)` displayName can never
        // overwrite the handler's rich identity under any ordering edge case
        // (post-restart replay, test harness, future extension ordering changes).
        if (!hasContributor(writer.id)) {
          recordContributor(documentName, writer.id, writer.name, writer.id);
        }
        // else: entry exists with rich handler-path identity; keep it untouched.
        // The docs Set is still correct because the handler path recorded this
        // docName already when it fired recordContributor for this write.
      }

      const xmlFragment = document.getXmlFragment('default');
      const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();

      const body = mdManager.serialize(json);
      const metaMap = document.getMap('metadata');
      const fmFromDoc = metaMap.get('frontmatter');
      const frontmatter =
        typeof fmFromDoc === 'string' ? fmFromDoc : frontmatterCache.get(documentName) || '';
      const markdown = prependFrontmatter(frontmatter, body);

      // Skip the write when the serialized output matches the load-time
      // baseline. Hocuspocus fires onStoreDocument after any Y.Doc mutation,
      // including the first-pass observer sync that populates Y.Text from the
      // freshly-loaded XmlFragment — that mutation is semantically a no-op
      // but would otherwise rewrite the file in normalized form (padded
      // tables, added backslash-escapes, etc.), polluting the user's git
      // working tree on mere file open.
      const currentBase = getReconciledBase(documentName);
      if (currentBase !== undefined && markdown === currentBase) {
        // Content unchanged since last reconcile — skip the disk write. But
        // applyExternalChange uses skipStoreHooks:true so onStoreDocument never
        // fires for file-watcher transactions; the contributor is recorded
        // directly yet scheduleGitCommit() is never called. Schedule it here
        // so the L2 drain fires at graceful shutdown (D41, US-016, FR-6).
        if (contributorCount() > 0) scheduleGitCommit();
        return;
      }

      // Debug: detect duplication before writing
      if (currentBase && markdown.length > currentBase.length * 1.5) {
        log.warn(
          { documentName, markdownLength: markdown.length, baseLength: currentBase.length },
          `[persistence] WARNING: serialized content is ${markdown.length} bytes vs base ${currentBase.length} bytes for ${documentName} — possible duplication`,
        );
        log.warn(
          { documentName, children: document.getXmlFragment('default').length },
          `[persistence] Fragment children: ${document.getXmlFragment('default').length}`,
        );
      }

      const requestedPath = safeContentPath(documentName, contentDir);
      await mkdir(dirname(requestedPath), { recursive: true });

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
        await writeFile(tmpPath, markdown, 'utf-8');
        await rename(tmpPath, canonicalPath);
        registerWrite(canonicalPath, contentHash(markdown));
        // Increment disk-write counter after the atomic rename succeeds.
        // Used as the Mutation F regression gate — if OBSERVER_SYNC_ORIGIN
        // drops skipStoreHooks, observer writes trigger onStoreDocument
        // and produce amplified disk writes per user/agent edit.
        incrementPersistenceDiskWrite();
      } catch (e) {
        try {
          unlinkSync(tmpPath);
        } catch {
          /* cleanup best-effort */
        }
        log.error({ err: e, documentName }, `[persistence] Failed to save ${documentName}`);
        throw e;
      }
      log.info(
        { filePath: canonicalPath, bytes: markdown.length },
        `[persistence] Wrote ${canonicalPath} (${markdown.length} bytes)`,
      );

      // Update reconciled base after successful store
      setReconciledBase(documentName, markdown);

      if (backlinkIndex) {
        backlinkIndex.updateDocumentFromMarkdown(documentName, markdown);
        void backlinkIndex.saveToDisk().catch((err) => {
          console.warn(`[backlinks] Failed to persist cache for ${documentName}:`, err);
        });
      }

      scheduleGitCommit();
    },
  };

  async function waitForPendingCommits(): Promise<void> {
    if (commitInFlight) await commitInFlight;
  }

  return { extension, flushPendingGitCommit, waitForPendingCommits };
}
