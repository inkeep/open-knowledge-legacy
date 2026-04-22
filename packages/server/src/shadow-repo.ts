/**
 * Shadow repo — attribution journal at `<projectRoot>/.git/open-knowledge/`.
 *
 * A bare repo (core.bare unset, core.worktree → project root) that stores
 * per-writer WIP refs and upstream-import commits. Isolated from the project
 * repo so user staging area and history are never touched.
 *
 * Single-mode layout (SPEC 2026-04-21-shadow-repo-single-mode):
 *   - Shadow always lives inside `<projectRoot>/.git/open-knowledge/`.
 *   - Projects without `.git/` get auto-init'd by `ensureProjectGit` before
 *     `initShadowRepo` runs (R2 / D12 fail-fast).
 *   - Pre-spec integrated shadows at `.git/openknowledge/` (legacy path) are
 *     silently rename-migrated in-place once per repo (R9 shim below).
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatCheckpointBodyLine,
  type ParsedCheckpoint,
  parseCheckpoint,
  resolveShadowDir,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
import simpleGit from 'simple-git';
import { acquireLock, releaseLock } from './shadow-lock.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShadowHandle {
  gitDir: string;
  workTree: string;
}

/** Mutable ref to a ShadowHandle — allows deferred initialization after construction. */
export interface ShadowRef {
  current: ShadowHandle | undefined;
}

export interface WriterIdentity {
  id: string;
  name: string;
  email: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GIT_TIMEOUT_MS = 30_000;

/** Create a simple-git instance pointed at the shadow bare repo. */
export function shadowGit(shadow: ShadowHandle) {
  return simpleGit({
    baseDir: shadow.workTree,
    timeout: { block: GIT_TIMEOUT_MS },
  }).env({
    GIT_DIR: shadow.gitDir,
    GIT_WORK_TREE: shadow.workTree,
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Initialize the shadow bare repo at `<projectRoot>/.git/open-knowledge/`.
 *
 * Assumes the project already has a `.git/` — `ensureProjectGit` is responsible
 * for that guarantee upstream (SPEC R2 / D12).
 *
 * Legacy migration (R9): if `<projectRoot>/.git/openknowledge/` exists from a
 * pre-spec integrated-mode install, silently `renameSync` it to the canonical
 * `.git/open-knowledge/` path. One-shot, lossless — preserves all refs and
 * commits. Defensive: if BOTH directories are present (shouldn't happen), log
 * and no-op.
 */
export async function initShadowRepo(projectRoot: string): Promise<ShadowHandle> {
  // Path resolution lives in @inkeep/open-knowledge-core so the CLI read path
  // and this server write path use exactly the same rule (D22).
  const shadowDir = resolveShadowDir(projectRoot);

  // R9 legacy-rename shim — runs before any other shadow op.
  const legacyDir = resolve(projectRoot, '.git/openknowledge');
  const legacyExists = existsSync(legacyDir);
  const newExists = existsSync(shadowDir);
  if (legacyExists && !newExists) {
    renameSync(legacyDir, shadowDir);
  } else if (legacyExists && newExists) {
    console.warn('[shadow-repo] unexpected legacy + new shadow both present — no rename performed');
  }

  // Skip init if already valid
  const alreadyInit = existsSync(resolve(shadowDir, 'HEAD'));
  if (!alreadyInit) {
    mkdirSync(shadowDir, { recursive: true });

    const git = simpleGit({ baseDir: projectRoot, timeout: { block: GIT_TIMEOUT_MS } });
    await git.raw('init', '--bare', shadowDir);

    const sg = simpleGit({ timeout: { block: GIT_TIMEOUT_MS } }).env({ GIT_DIR: shadowDir });
    await sg.raw('config', '--unset', 'core.bare');
    await sg.raw('config', 'core.worktree', projectRoot);
    await sg.raw('config', 'user.name', 'openknowledge');
    await sg.raw('config', 'user.email', 'noreply@openknowledge.local');
  }

  // Acquire exclusive writer lock
  acquireLock(shadowDir, projectRoot);

  return { gitDir: shadowDir, workTree: projectRoot };
}

/**
 * Release the exclusive writer lock on a shadow repo.
 * Called during graceful shutdown.
 */
export function destroyShadowRepo(shadow: ShadowHandle): void {
  releaseLock(shadow.gitDir);
}

// ─── WIP commits ─────────────────────────────────────────────────────────────

/**
 * Commit content changes to a per-writer, per-branch WIP ref in the shadow.
 *
 * Uses commit-tree plumbing with GIT_INDEX_FILE isolation so we never
 * touch any user-visible staging area.
 *
 * @param branch - Project branch name (e.g. 'main', 'feature/xyz'). When omitted, defaults to 'main'.
 */
export async function commitWip(
  shadow: ShadowHandle,
  writer: WriterIdentity,
  contentRoot: string,
  message: string,
  branch = 'main',
): Promise<string> {
  const tmpIndex = resolve(shadow.gitDir, `index-wip-${writer.id}`);
  const ref = `refs/wip/${branch}/${writer.id}`;
  const sg = shadowGit(shadow);
  const gitPathspec = contentRoot || '.';

  try {
    // Seed index from current ref state (if exists)
    try {
      const refTree = (await sg.raw('rev-parse', `${ref}^{tree}`)).trim();
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('read-tree', refTree);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('unknown revision') || msg.includes('bad revision')) {
        // Expected: first commit on this ref — start fresh
      } else {
        console.error(`[shadow-repo] Unexpected error seeding index for ${ref}:`, e);
        throw e;
      }
    }

    // Stage content files
    await sg
      .env({
        GIT_DIR: shadow.gitDir,
        GIT_WORK_TREE: shadow.workTree,
        GIT_INDEX_FILE: tmpIndex,
      })
      .raw('add', gitPathspec);
    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await sg.raw('rev-parse', ref)).trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('unknown revision') && !msg.includes('bad revision')) {
        console.error(`[shadow-repo] Unexpected error resolving ${ref}:`, e);
        throw e;
      }
      // Expected: no parent — first commit on this ref
    }

    // Create commit with writer identity
    const args = ['commit-tree', treeSha, '-m', message];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: writer.name,
          GIT_AUTHOR_EMAIL: writer.email,
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
        })
        .raw(...args)
    ).trim();

    await sg.raw('update-ref', ref, commitSha);
    return commitSha;
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore cleanup failure
    }
  }
}

// ─── Upstream import ─────────────────────────────────────────────────────────

const UPSTREAM_WRITER: WriterIdentity = {
  id: 'upstream',
  name: 'upstream',
  email: 'noreply@openknowledge.local',
};

/**
 * Record an upstream-import commit in the shadow.
 *
 * Called when HEAD moves (e.g., git pull) to attribute the incoming changes
 * to "upstream" in the attribution journal.
 *
 * @param branch - Project branch name for ref scoping. Defaults to 'main'.
 */
export async function commitUpstreamImport(
  shadow: ShadowHandle,
  contentRoot: string,
  oldHead: string | null,
  newHead: string,
  branch = 'main',
): Promise<string> {
  const message = oldHead
    ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
    : `upstream: initial import at ${newHead.slice(0, 8)}`;

  return commitWip(shadow, UPSTREAM_WRITER, contentRoot, message, branch);
}

// ─── Safety checkpoint ──────────────────────────────────────────────────────

/**
 * Generic safety-checkpoint primitive (TQ14, greenfield §2).
 *
 * Snapshots the current working tree to the shadow repo's WIP ref *before*
 * a destructive action so the user can recover pre-action state from the
 * timeline. Rollback is the first caller; future coarse actions (apply-draft,
 * etc.) reuse the same primitive.
 *
 * Inspired by Figma's "two checkpoints around restore" pattern — one before,
 * one after the destructive operation. The "after" checkpoint is handled by
 * the normal L2 persistence pipeline (commitWip on debounce).
 */
export interface SafetyCheckpointParams {
  action: string;
  context: Record<string, unknown>;
}

const SAFETY_WRITER: WriterIdentity = {
  id: 'openknowledge-server',
  name: 'openknowledge-server',
  email: 'noreply@openknowledge.local',
};

export async function safetyCheckpoint(
  shadow: ShadowHandle,
  contentRoot: string,
  params: SafetyCheckpointParams,
  branch = 'main',
): Promise<string> {
  const message = `safety-checkpoint: pre-${params.action}`;
  return commitWip(shadow, SAFETY_WRITER, contentRoot, message, branch);
}

// ─── In-memory checkpoint (bridge-correctness SPEC §6 R7a) ──────────────────

/**
 * Kind-discriminated parameters for {@link saveInMemoryCheckpoint}. Each
 * kind carries typed metadata that `parseCheckpoint` in
 * `@inkeep/open-knowledge-core/shadow-repo-layout` can round-trip.
 *
 * - `bridge-merge-loss` — Observer A Path B fired `mergeThreeWay`, the
 *   content-preservation post-condition flagged the result, and we want a
 *   silent Notion-style restore artifact on the timeline. `contents` is the
 *   pre-merge baseline (the state the user saw before the conflict merge).
 * - `external-change-rescue` — an external disk write (reconcile-delete or
 *   branch-switch path) would otherwise have discarded dirty Y.Doc content.
 *   `contents` is the rescued in-memory markdown; `incomingDiskSha` names
 *   the disk SHA we chose over it.
 */
export type InMemoryCheckpointParams =
  | {
      kind: 'bridge-merge-loss';
      docName: string;
      contents: string;
      label: string;
      branch?: string;
      metadata: { lostSubstrings: string[] };
    }
  | {
      kind: 'external-change-rescue';
      docName: string;
      contents: string;
      label: string;
      branch?: string;
      metadata: { incomingDiskSha: string };
    };

/**
 * Silent in-memory checkpoint — writes `contents` as a blob at
 * `<docName>.md` in an isolated git tree, commits with body
 * `checkpoint: ${label}\n\nok-checkpoint-v1: ${JSON}`, and updates the ref
 * `refs/checkpoints/<branch>/<sha>`. Never touches `refs/wip/*` — this is a
 * one-shot recovery artifact, not part of the per-writer WIP chain
 * (contrast `saveVersion` which resets WIP).
 *
 * **Concurrent safety (Q8 audit).** Each call uses a unique tmp-index file
 * name derived from a random UUID so two in-flight calls on the same shadow
 * do not contend at the index level. The ref-update is atomic at the git
 * layer. Callers fire-and-forget via `queueMicrotask(() =>
 * saveInMemoryCheckpoint(...).catch(...))` — the hot bridge-merge path
 * never awaits the commit.
 *
 * @returns the commit sha (which also appears in the ref name).
 */
export async function saveInMemoryCheckpoint(
  shadow: ShadowHandle,
  contentRoot: string,
  params: InMemoryCheckpointParams,
): Promise<string> {
  const branch = params.branch ?? 'main';
  const sg = shadowGit(shadow);
  const token = randomUUID();
  const tmpIndex = resolve(shadow.gitDir, `index-checkpoint-${token}`);
  const tmpBlobFile = resolve(shadow.gitDir, `tmp-checkpoint-blob-${token}`);

  // Path inside the tree mirrors the real content layout so TimelinePanel's
  // existing per-doc view logic (walks the tree at the commit's docName)
  // resolves identically for silent-checkpoint artifacts.
  const treePath = contentRoot
    ? `${contentRoot.replace(/\/$/, '')}/${params.docName}`
    : params.docName;
  // Byte-size of the rescued content; encoded in metadata so the rescue
  // read path can render the listing without spawning a per-ref `git ls-tree`
  // subprocess (bridge-correctness review iteration 5).
  const size = Buffer.byteLength(params.contents, 'utf-8');
  const parsed: ParsedCheckpoint =
    params.kind === 'bridge-merge-loss'
      ? {
          kind: 'bridge-merge-loss',
          docName: params.docName,
          size,
          metadata: params.metadata,
        }
      : {
          kind: 'external-change-rescue',
          docName: params.docName,
          size,
          metadata: params.metadata,
        };
  const bodyLine = formatCheckpointBodyLine(parsed);
  const message = `checkpoint: ${params.label}\n\n${bodyLine}`;

  try {
    writeFileSync(tmpBlobFile, params.contents, 'utf-8');
    const blobSha = (
      await sg
        .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
        .raw('hash-object', '-w', tmpBlobFile)
    ).trim();
    await sg
      .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
      .raw('update-index', '--add', '--cacheinfo', `100644,${blobSha},${treePath}`);
    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: 'openknowledge',
          GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
        })
        .raw('commit-tree', treeSha, '-m', message)
    ).trim();

    await sg.raw('update-ref', `refs/checkpoints/${branch}/${commitSha}`, commitSha);
    return commitSha;
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore cleanup failure
    }
    try {
      rmSync(tmpBlobFile);
    } catch {
      // ignore cleanup failure
    }
  }
}

/**
 * A single `kind: 'external-change-rescue'` rescue entry reconstructed from
 * the shadow repo's `refs/checkpoints/<branch>/*` namespace. Shape mirrors
 * the flat-file rescue listing at `/api/rescue` so the two sources can be
 * merged into one unified response (bridge-correctness SPEC §6 R7f).
 */
export interface TimelineRescueEntry {
  docName: string;
  timestamp: string;
  size: number;
  /** Commit SHA of the checkpoint, so the caller can request the raw content. */
  sha: string;
  /** Commit message (first line); surfaces the human-readable label. */
  label: string;
  /** SHA of the incoming disk content that overrode the in-memory state. */
  incomingDiskSha: string;
}

/**
 * List every `external-change-rescue` checkpoint on `refs/checkpoints/<branch>/*`
 * by walking the refs, reading each commit's body via `parseCheckpoint`,
 * and filtering by kind. Does not walk ancestry — each ref is resolved
 * directly via `git log --no-walk`. Returns an empty array on any git error
 * to match the graceful-degradation posture of `getDocumentHistory`.
 *
 * Bridge-correctness review iteration 5: `docName` + `size` are now read
 * from the parsed `ok-checkpoint-v1:` metadata body line. The per-ref
 * `git ls-tree` fan-out the prior implementation performed is retained
 * only as a backward-compat fallback for checkpoints written before the
 * metadata was enriched (none in a fresh install; included for robustness
 * on worktrees carrying earlier-iteration artifacts).
 */
export async function listRescueCheckpoints(
  shadow: ShadowHandle,
  branch = 'main',
): Promise<TimelineRescueEntry[]> {
  const sg = shadowGit(shadow);
  let refOutput: string;
  try {
    refOutput = await sg.raw(
      'for-each-ref',
      '--format=%(objectname)',
      `refs/checkpoints/${branch}/`,
    );
  } catch {
    return [];
  }
  const shas = refOutput
    .trim()
    .split('\n')
    .filter((s) => s.length === 40);
  if (shas.length === 0) return [];

  let logRaw: string;
  try {
    logRaw = await sg.raw(
      'log',
      '--no-walk',
      '--author-date-order',
      '--format=%H%x00%aI%x00%s%x00%B%x1e',
      ...shas,
    );
  } catch {
    return [];
  }

  const out: TimelineRescueEntry[] = [];
  for (const record of logRaw.split('\x1e')) {
    const trimmed = record.trimStart();
    if (!trimmed) continue;
    const [sha = '', timestamp = '', subject = '', body = ''] = trimmed.split('\x00');
    const parsed = parseCheckpoint(body);
    if (parsed?.kind !== 'external-change-rescue') continue;

    // Fast path: metadata carries docName + size directly (bridge-correctness
    // review iteration 5). Per-commit subprocess skipped in this path.
    let docName = parsed.docName ?? '';
    let size = parsed.size ?? 0;

    // Backward-compat fallback for any pre-enrichment checkpoints on this
    // branch. Safe no-op for fresh commits since the fast-path already
    // populated both fields.
    if (!docName) {
      try {
        const tree = (await sg.raw('ls-tree', '-r', '--long', sha)).trim();
        const line = tree.split('\n')[0];
        if (line) {
          const cols = line.split(/\s+/);
          const pathIdx = 4;
          const sizeIdx = 3;
          if (size === 0) size = Number(cols[sizeIdx] ?? '0');
          docName =
            (cols[pathIdx] ?? '')
              .replace(/\.mdx?$/, '')
              .split('/')
              .slice(-1)[0] ?? '';
        }
      } catch {
        // ignore — docName stays empty; caller treats as unparseable
      }
    }
    if (!docName) continue;
    out.push({
      docName,
      timestamp,
      size,
      sha,
      label: subject.replace(/^checkpoint:\s*/, ''),
      incomingDiskSha: parsed.metadata.incomingDiskSha,
    });
  }
  return out;
}

// ─── Checkpoint GC (bridge-correctness SPEC §6 R7 + review iteration 5) ────

/** Per-kind retention policy for `refs/checkpoints/<branch>/*`. */
export interface CheckpointRetentionPolicy {
  /**
   * Maximum `bridge-merge-loss` checkpoints to keep per branch. These are
   * written on every Observer A Path B post-condition violation. Default 50.
   */
  maxBridgeMergeLoss: number;
  /**
   * Maximum `external-change-rescue` checkpoints to keep per branch. These
   * are written on reconcile-delete / branch-switch disk-overrode-memory
   * paths. Default 50.
   */
  maxExternalChangeRescue: number;
  /**
   * `ok-checkpoint-v1`-tagged checkpoints older than this TTL (ms) are
   * GC-eligible regardless of count. Default 30 days. `Save Version`
   * checkpoints (no `ok-checkpoint-v1:` body line) are NOT affected —
   * their retention was set at PR inception as permanent.
   */
  ttlMs: number;
}

export const DEFAULT_CHECKPOINT_RETENTION: CheckpointRetentionPolicy = {
  maxBridgeMergeLoss: 50,
  maxExternalChangeRescue: 50,
  ttlMs: 30 * 24 * 60 * 60 * 1000,
};

export interface CheckpointGcResult {
  scanned: number;
  deletedBridgeMergeLoss: number;
  deletedExternalChangeRescue: number;
  retained: number;
}

/**
 * GC `refs/checkpoints/<branch>/*` kind-aware: keep the most-recent N per
 * kind (per policy), delete older entries, apply TTL as a lower bound.
 * Untyped checkpoints (no `ok-checkpoint-v1:` body line — i.e. user-
 * triggered `Save Version` artifacts) are always retained to preserve the
 * permanent-history contract.
 *
 * Batched: single `for-each-ref` + single `git log --no-walk` regardless of
 * ref count. Deletion is one `update-ref -d` per eligible ref.
 */
export async function gcCheckpointRefs(
  shadow: ShadowHandle,
  branch = 'main',
  policy: CheckpointRetentionPolicy = DEFAULT_CHECKPOINT_RETENTION,
): Promise<CheckpointGcResult> {
  const result: CheckpointGcResult = {
    scanned: 0,
    deletedBridgeMergeLoss: 0,
    deletedExternalChangeRescue: 0,
    retained: 0,
  };
  const sg = shadowGit(shadow);
  let refOutput: string;
  try {
    refOutput = await sg.raw(
      'for-each-ref',
      '--format=%(objectname) %(refname)',
      `refs/checkpoints/${branch}/`,
    );
  } catch {
    return result;
  }
  const refLines = refOutput
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (refLines.length === 0) return result;

  // Maintain the ref → sha mapping so we can delete by refname (stable even
  // if a future rewrite changes the sha-under-ref naming convention).
  const shaToRef = new Map<string, string>();
  const shas: string[] = [];
  for (const line of refLines) {
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx < 0) continue;
    const sha = line.slice(0, spaceIdx);
    const ref = line.slice(spaceIdx + 1);
    if (sha.length !== 40) continue;
    shaToRef.set(sha, ref);
    shas.push(sha);
  }
  result.scanned = shas.length;
  if (shas.length === 0) return result;

  let logRaw: string;
  try {
    logRaw = await sg.raw(
      'log',
      '--no-walk',
      '--author-date-order',
      '--format=%H%x00%aI%x00%B%x1e',
      ...shas,
    );
  } catch {
    return result;
  }

  interface Entry {
    sha: string;
    timestamp: number; // ms since epoch
    kind: 'bridge-merge-loss' | 'external-change-rescue' | null;
  }
  const entries: Entry[] = [];
  for (const record of logRaw.split('\x1e')) {
    const trimmed = record.trimStart();
    if (!trimmed) continue;
    const [sha = '', timestamp = '', body = ''] = trimmed.split('\x00');
    if (!sha) continue;
    const parsed = parseCheckpoint(body);
    const kind = parsed?.kind ?? null;
    const ts = Date.parse(timestamp);
    entries.push({ sha, timestamp: Number.isFinite(ts) ? ts : 0, kind });
  }

  // Partition by kind. Save-Version (kind=null) entries are always retained.
  const byKind: Record<'bridge-merge-loss' | 'external-change-rescue', Entry[]> = {
    'bridge-merge-loss': [],
    'external-change-rescue': [],
  };
  let retainedUntyped = 0;
  for (const e of entries) {
    if (e.kind === null) {
      retainedUntyped++;
      continue;
    }
    byKind[e.kind].push(e);
  }

  const now = Date.now();
  const deleteRefs: string[] = [];
  const planDeletions = (
    list: Entry[],
    limit: number,
    counter: 'deletedBridgeMergeLoss' | 'deletedExternalChangeRescue',
  ): void => {
    // Newest first so the count-based keep-N is trivial.
    list.sort((a, b) => b.timestamp - a.timestamp);
    for (let i = 0; i < list.length; i++) {
      const entry = list[i];
      if (!entry) continue;
      const overCount = i >= limit;
      const overTtl =
        policy.ttlMs > 0 && entry.timestamp > 0 && now - entry.timestamp > policy.ttlMs;
      if (overCount || overTtl) {
        const ref = shaToRef.get(entry.sha);
        if (ref) {
          deleteRefs.push(ref);
          result[counter]++;
        }
      }
    }
  };
  planDeletions(byKind['bridge-merge-loss'], policy.maxBridgeMergeLoss, 'deletedBridgeMergeLoss');
  planDeletions(
    byKind['external-change-rescue'],
    policy.maxExternalChangeRescue,
    'deletedExternalChangeRescue',
  );

  for (const ref of deleteRefs) {
    try {
      await sg.raw('update-ref', '-d', ref);
    } catch (err) {
      console.warn('[checkpoint-gc] failed to delete', ref, err);
    }
  }

  result.retained = retainedUntyped + (result.scanned - deleteRefs.length - retainedUntyped);
  return result;
}

// ─── Park / Load / Restore ──────────────────────────────────────────────────

/** A document's serialized state for parking. */
export interface ParkableDoc {
  docName: string;
  /** Current Y.Doc serialized to markdown (from memory). */
  markdown: string;
  /** Last known disk content (reconciledBase) — used as merge base for restore. */
  diskSnapshot: string;
}

/**
 * Park the current branch context by committing Y.Doc in-memory state
 * to the shadow repo. Each document's state and its disk snapshot are
 * stored so that `restoreBranchWIP` can three-way merge later.
 *
 * Park commits use message prefix "park:" for identification.
 */
export async function parkBranch(
  shadow: ShadowHandle,
  branch: string,
  sessionId: string,
  documents: ParkableDoc[],
): Promise<string | null> {
  if (documents.length === 0) return null;

  const sg = shadowGit(shadow);
  const tmpIndex = resolve(shadow.gitDir, `index-park-${branch.replace(/\//g, '-')}`);
  const ref = `refs/wip/${branch}/human-${sessionId}`;

  const tmpBlobFile = resolve(shadow.gitDir, 'tmp-park-blob');
  try {
    // Build a tree with both Y.Doc state and disk snapshots
    for (const doc of documents) {
      // Store Y.Doc state at the doc's path
      writeFileSync(tmpBlobFile, doc.markdown, 'utf-8');
      const blobSha = (
        await sg
          .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
          .raw('hash-object', '-w', tmpBlobFile)
      ).trim();
      await sg
        .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
        .raw('update-index', '--add', '--cacheinfo', `100644,${blobSha},${doc.docName}`);

      // Store disk snapshot at .park-base/<docName>
      writeFileSync(tmpBlobFile, doc.diskSnapshot, 'utf-8');
      const baseSha = (
        await sg
          .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
          .raw('hash-object', '-w', tmpBlobFile)
      ).trim();
      await sg
        .env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex })
        .raw('update-index', '--add', '--cacheinfo', `100644,${baseSha},.park-base/${doc.docName}`);
    }

    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await sg.raw('rev-parse', ref)).trim();
    } catch {
      // No prior WIP on this branch for this session
    }

    const args = [
      'commit-tree',
      treeSha,
      '-m',
      `park: branch context at ${new Date().toISOString()}`,
    ];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: 'openknowledge',
          GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
        })
        .raw(...args)
    ).trim();

    await sg.raw('update-ref', ref, commitSha);
    return commitSha;
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore cleanup failure
    }
    try {
      rmSync(tmpBlobFile);
    } catch {
      // ignore cleanup failure
    }
  }
}

/**
 * Read parked Y.Doc state and disk snapshot from a park commit.
 * Returns null if the ref doesn't exist or the latest commit isn't a park.
 */
export async function readParkedState(
  shadow: ShadowHandle,
  branch: string,
  sessionId: string,
  docName: string,
): Promise<{ markdown: string; diskSnapshot: string } | null> {
  const sg = shadowGit(shadow);
  const ref = `refs/wip/${branch}/human-${sessionId}`;

  // Check if ref exists — expected to be missing on first visit to a branch
  let refSha: string;
  try {
    refSha = (await sg.raw('rev-parse', ref)).trim();
  } catch {
    return null; // ref doesn't exist — no parked state
  }

  // Ref exists — read park commit data. Errors here are unexpected and should propagate.
  try {
    const msg = (await sg.raw('log', '-1', '--format=%s', refSha)).trim();
    if (!msg.startsWith('park:')) return null;

    const markdown = (await sg.raw('show', `${refSha}:${docName}`)).trim();
    const diskSnapshot = (await sg.raw('show', `${refSha}:.park-base/${docName}`)).trim();
    return { markdown, diskSnapshot };
  } catch (e) {
    console.error(`[shadow] Failed to read parked state for ${docName} from ${ref}:`, e);
    throw e;
  }
}

// ─── Save Version ────────────────────────────────────────────────────────────

export interface SaveVersionResult {
  checkpointRef: string;
}

/**
 * Save Version — checkpoint in shadow repo only:
 * 1. Write a checkpoint ref in the shadow with full tree snapshot
 * 2. Reset per-writer WIP refs so subsequent WIP tracks only post-checkpoint deltas
 *
 * @param branch - Project branch name for ref scoping. Defaults to 'main'.
 */
export async function saveVersion(
  shadow: ShadowHandle,
  contentRoot: string,
  writers: WriterIdentity[],
  branch = 'main',
): Promise<SaveVersionResult> {
  const sg = shadowGit(shadow);
  // git rejects an empty string pathspec — use '.' (repo root) when
  // contentRoot is '' (content dir === project root).
  const gitPathspec = contentRoot || '.';

  // ── Step 1: Checkpoint ref in shadow with full tree snapshot ──

  const shadowTmpIndex = resolve(shadow.gitDir, 'index-checkpoint');
  try {
    await sg
      .env({
        GIT_DIR: shadow.gitDir,
        GIT_WORK_TREE: shadow.workTree,
        GIT_INDEX_FILE: shadowTmpIndex,
      })
      .raw('add', gitPathspec);
    const shadowTreeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: shadowTmpIndex }).raw('write-tree')
    ).trim();

    // Collect ALL writer WIP refs + upstream ref as checkpoint parents
    // (preserves all per-writer chains across the checkpoint boundary)
    const shadowParentShas: string[] = [];
    for (const w of [...writers, { id: 'upstream' }]) {
      try {
        const sha = (await sg.raw('rev-parse', `refs/wip/${branch}/${w.id}`)).trim();
        shadowParentShas.push(sha);
      } catch {
        // ref doesn't exist for this writer — skip
      }
    }
    // Deduplicate (upstream may alias a writer ref in edge cases)
    const uniqueParents = [...new Set(shadowParentShas)];

    // Fallback: no WIP activity since last checkpoint — parent on the latest checkpoint
    if (uniqueParents.length === 0) {
      try {
        const refs = (
          await sg.raw(
            'for-each-ref',
            '--sort=-creatordate',
            '--format=%(objectname)',
            `refs/checkpoints/${branch}/`,
          )
        )
          .trim()
          .split('\n')
          .filter(Boolean);
        if (refs[0]) uniqueParents.push(refs[0]);
      } catch {
        // no prior checkpoints — this is the first one, parentless is fine
      }
    }

    const checkpointArgs = ['commit-tree', shadowTreeSha, '-m', 'checkpoint: Checkpoint version'];
    for (const p of uniqueParents) {
      checkpointArgs.push('-p', p);
    }

    const checkpointSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: 'openknowledge',
          GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
        })
        .raw(...checkpointArgs)
    ).trim();

    const checkpointRef = `refs/checkpoints/${branch}/${checkpointSha}`;
    await sg.raw('update-ref', checkpointRef, checkpointSha);

    // ── Step 2: Reset WIP refs (branch-scoped) ──
    // Delete per-writer WIP refs so subsequent WIP tracks only post-checkpoint deltas
    for (const w of writers) {
      try {
        await sg.raw('update-ref', '-d', `refs/wip/${branch}/${w.id}`);
      } catch {
        // ref may not exist
      }
    }
    // Also reset upstream WIP for this branch
    try {
      await sg.raw('update-ref', '-d', `refs/wip/${branch}/upstream`);
    } catch {
      // may not exist
    }

    return { checkpointRef };
  } finally {
    try {
      rmSync(shadowTmpIndex);
    } catch {
      // ignore
    }
  }
}
