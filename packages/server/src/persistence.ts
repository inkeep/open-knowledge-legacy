/**
 * Git auto-persistence pipeline.
 *
 * Layer 1 (CRDT → disk): onStoreDocument serializes Y.Doc → markdown → .md file
 * Layer 2 (disk → git): afterStoreDocument commits to shadow repo via git plumbing
 *
 * Hocuspocus config: debounce=2000, maxDebounce=10000 (L1)
 * Git commit debounced separately: 30s idle after last disk write (L2)
 */
import { existsSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { mkdir, realpath, rename, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { Extension } from '@hocuspocus/server';
import {
  prependFrontmatter,
  sharedExtensions,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { type BacklinkIndex, extractWikiLinksFromProsemirrorJson } from './backlink-index.ts';
import { contentHash, registerWrite } from './file-watcher.ts';
import { getLogger } from './logger.ts';
import type { ShadowRef, WriterIdentity } from './shadow-repo.ts';
import { commitWip, shadowGit } from './shadow-repo.ts';

const log = getLogger('persistence');

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
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

export function safeContentPath(documentName: string, contentDir: string): string {
  if (documentName.includes('\x00')) {
    throw new Error(`Invalid document name: ${documentName}`);
  }
  const filePath = resolve(contentDir, `${documentName}.md`);
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

/**
 * Legacy flat accessor — returns the active branch's map.
 * Used by standalone.ts for event-driven reconciliation where the flat
 * Map interface is expected.
 */
export const reconciledBase = {
  get(docName: string): string | undefined {
    return getReconciledBase(docName);
  },
  set(docName: string, content: string): void {
    setReconciledBase(docName, content);
  },
  delete(docName: string): void {
    deleteReconciledBase(docName);
  },
};

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
  const contentDir = existsSync(contentDirRaw) ? realpathSync(contentDirRaw) : contentDirRaw;
  const projectDir = options?.projectDir ?? process.cwd();
  const shadowRef = options?.shadowRef;
  const contentRoot = options?.contentRoot ?? (relative(projectDir, contentDir) || 'content');
  const backlinkIndex = options?.backlinkIndex;

  // Per-instance frontmatter cache — tracks frontmatter per document for round-trip fidelity.
  // Lives inside the closure so multiple server instances don't share mutable state.
  const frontmatterCache = new Map<string, string>();

  // reconciledBase and batchInProgress use the module-level systems
  // (reconciledBaseByBranch via get/setReconciledBase, and isBatchInProgress)
  // so that standalone.ts and persistence stay in sync.

  const gitEnabled = options?.gitEnabled ?? true;
  const commitDebounceMs = options?.commitDebounceMs ?? 30_000;
  const wipRef = options?.wipRef ?? 'refs/wip/main';

  // Default writer identity for L2 commits
  const defaultWriter: WriterIdentity = {
    id: 'server',
    name: 'openknowledge-server',
    email: 'noreply@openknowledge.local',
  };

  // Debounce git commits
  let gitCommitTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveGitFailures = 0;
  let commitInFlight: Promise<void> | null = null;
  let pendingAfterCommit = false;

  async function commitToWipRef(): Promise<void> {
    // Read shadow ref at commit time (not construction time) so deferred init propagates
    const shadow = shadowRef?.current;
    if (shadow) {
      // L2 commits go to shadow repo
      try {
        const sha = await commitWip(
          shadow,
          defaultWriter,
          contentRoot,
          `WIP auto-save ${new Date().toISOString()}`,
        );
        consecutiveGitFailures = 0;
        log.info(
          { sha: sha.slice(0, 8), writer: defaultWriter.id },
          `[persistence] Shadow WIP commit: ${sha.slice(0, 8)} on refs/wip/${defaultWriter.id}`,
        );
      } catch (e) {
        consecutiveGitFailures++;
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
      log.info(
        { documentName, connections: document.getConnectionsCount?.() ?? '?' },
        `[persistence] onLoadDocument called for ${documentName} (connections: ${document.getConnectionsCount?.() ?? '?'})`,
      );
      const filePath = safeContentPath(documentName, contentDir);
      if (!existsSync(filePath)) return;

      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = stripFrontmatter(raw);

      if (frontmatter) {
        frontmatterCache.set(documentName, frontmatter);
        const metaMap = document.getMap('metadata');
        metaMap.set('frontmatter', frontmatter);
      }

      const json = mdManager.parse(body);
      if (json) {
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
        const normalizedBody = mdManager.serialize(yXmlFragmentToProsemirrorJSON(xmlFragment));
        setReconciledBase(documentName, prependFrontmatter(frontmatter, normalizedBody));
      } else {
        // Unparseable body (empty file etc.) — fall back to raw so reconciliation
        // has a base to work with if a watcher event fires later.
        setReconciledBase(documentName, raw);
      }
    },

    async onStoreDocument({ document, documentName }) {
      if (isBatchInProgress()) return;

      const xmlFragment = document.getXmlFragment('default');
      const json = yXmlFragmentToProsemirrorJSON(xmlFragment);

      const body = mdManager.serialize(json);
      const metaMap = document.getMap('metadata');
      const fmFromDoc = metaMap.get('frontmatter');
      const frontmatter =
        typeof fmFromDoc === 'string' ? fmFromDoc : frontmatterCache.get(documentName) || '';
      const markdown = prependFrontmatter(frontmatter, body);

      // Debug: detect duplication before writing
      const currentBase = getReconciledBase(documentName);
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
          console.warn(`[persistence] broken-symlink fallback`, {
            docName: documentName,
            reason: 'broken-symlink',
          });
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

      const tmpPath = `${canonicalPath}.tmp`;
      try {
        await writeFile(tmpPath, markdown, 'utf-8');
        await rename(tmpPath, canonicalPath);
        registerWrite(canonicalPath, contentHash(markdown));
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
        backlinkIndex.updateDocument(documentName, extractWikiLinksFromProsemirrorJson(json));
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
