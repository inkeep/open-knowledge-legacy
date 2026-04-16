/**
 * ConflictStore — persistent storage and resolution logic for merge conflicts.
 *
 * Conflicts are stored at <contentDir>/.open-knowledge/conflicts.json (schema v1).
 * Each conflict entry records the file path and optional git object SHAs for
 * ours/theirs/base, enabling strategy-based resolution.
 *
 * US-014: CRUD + resolve strategies ('mine' | 'theirs' | 'content').
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Avoid importing pino-backed logger — it has a broken symlink in the server
// package's local node_modules (pre-existing environment issue). Use console directly.
const log = {
  warn: (ctx: Record<string, unknown>, msg: string) => console.warn('[conflict-storage]', msg, ctx),
  info: (ctx: Record<string, unknown>, msg: string) => console.info('[conflict-storage]', msg, ctx),
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConflictEntry {
  /** Path of the conflicted file, relative to projectDir (git root). */
  file: string;
  /** ISO-8601 timestamp when the conflict was detected. */
  detectedAt: string;
  /** SHA of our version at conflict time (optional). */
  oursSha?: string;
  /** SHA of their version at conflict time (optional). */
  theirsSha?: string;
  /** SHA of the merge base at conflict time (optional). */
  baseSha?: string;
}

export type ResolveStrategy = 'mine' | 'theirs' | 'content';

/** Schema v1 stored in conflicts.json. */
interface ConflictsJson {
  version: 1;
  branch: string;
  conflicts: ConflictEntry[];
}

// ─── ConflictStore ───────────────────────────────────────────────────────────

export class ConflictStore {
  private readonly storePath: string;
  private readonly projectDir: string;
  private branch: string;
  private conflicts: ConflictEntry[] = [];

  constructor(contentDir: string, projectDir: string, branch = 'main') {
    this.storePath = join(contentDir, '.open-knowledge', 'conflicts.json');
    this.projectDir = projectDir;
    this.branch = branch;
    this.load();
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  /** Load conflict state from disk. No-op if file doesn't exist. */
  load(): void {
    if (!existsSync(this.storePath)) {
      this.conflicts = [];
      return;
    }
    try {
      const raw = readFileSync(this.storePath, 'utf-8');
      const data = JSON.parse(raw) as Partial<ConflictsJson>;
      if (data.version !== 1) {
        log.warn({ path: this.storePath }, '[conflicts] unknown schema version — resetting');
        this.conflicts = [];
        return;
      }
      this.branch = data.branch ?? this.branch;
      this.conflicts = data.conflicts ?? [];
    } catch (e) {
      log.warn({ err: e }, '[conflicts] failed to load conflicts.json — starting empty');
      this.conflicts = [];
    }
  }

  /** Persist current state to disk. */
  save(): void {
    try {
      const dir = dirname(this.storePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data: ConflictsJson = {
        version: 1,
        branch: this.branch,
        conflicts: this.conflicts,
      };
      writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      log.warn({ err: e }, '[conflicts] failed to save conflicts.json');
    }
  }

  /** Add a new conflict entry (idempotent by file path). */
  addConflict(entry: ConflictEntry): void {
    const existing = this.conflicts.findIndex((c) => c.file === entry.file);
    if (existing !== -1) {
      this.conflicts[existing] = entry; // update if already tracked
    } else {
      this.conflicts.push(entry);
    }
    this.save();
  }

  /** Remove a conflict entry by file path. */
  removeConflict(file: string): void {
    this.conflicts = this.conflicts.filter((c) => c.file !== file);
    this.save();
  }

  /** Remove all conflicts for the current branch. */
  clear(): void {
    this.conflicts = [];
    this.save();
  }

  /** Number of unresolved conflicts. */
  count(): number {
    return this.conflicts.length;
  }

  /** All unresolved conflicts. */
  list(): ConflictEntry[] {
    return [...this.conflicts];
  }

  /** True if there are any unresolved conflicts. */
  hasConflicts(): boolean {
    return this.conflicts.length > 0;
  }

  /** Update the active branch (called on branch switch). */
  setBranch(branch: string): void {
    this.branch = branch;
  }

  // ─── Resolution ──────────────────────────────────────────────────────────

  /**
   * Resolve a single conflict.
   *
   * Strategy:
   *   'mine'    — checkout --ours  <file> + git add
   *   'theirs'  — checkout --theirs <file> + git add
   *   'content' — write provided content to disk, then git add
   *
   * After resolving, the entry is removed from the store.
   * If all conflicts are now resolved, a merge commit is created to finalise the merge.
   *
   * @param file     File path relative to projectDir.
   * @param strategy How to resolve.
   * @param content  Required when strategy === 'content'.
   * @param credentialArgs  Credential args for the git handle.
   */
  async resolveConflict(
    file: string,
    strategy: ResolveStrategy,
    content?: string,
    credentialArgs: string[] = [],
  ): Promise<void> {
    const entry = this.conflicts.find((c) => c.file === file);
    if (!entry) {
      throw new Error(`[conflicts] no conflict tracked for file: ${file}`);
    }

    // Validate strategy-specific params before touching git
    if (strategy === 'content' && content === undefined) {
      throw new Error(`[conflicts] strategy 'content' requires content parameter`);
    }

    // Dynamic import so CRUD tests don't load simple-git (broken symlink in test env)
    const { createGitInstance } = await import('./git-handle.ts');
    const handle = createGitInstance(this.projectDir, { credentialArgs });

    switch (strategy) {
      case 'mine':
        await handle.git.raw(['checkout', '--ours', '--', file]);
        await handle.git.raw(['add', '--', file]);
        break;

      case 'theirs':
        await handle.git.raw(['checkout', '--theirs', '--', file]);
        await handle.git.raw(['add', '--', file]);
        break;

      case 'content': {
        // content is guaranteed non-undefined here (validated above in early-return guard)
        if (!content) throw new Error(`[conflicts] strategy 'content' requires content parameter`);
        const absPath = join(this.projectDir, file);
        writeFileSync(absPath, content, 'utf-8');
        await handle.git.raw(['add', '--', file]);
        break;
      }

      default: {
        const exhaustive: never = strategy;
        throw new Error(`[conflicts] unknown resolve strategy: ${exhaustive}`);
      }
    }

    // Remove from store
    this.removeConflict(file);

    // If all conflicts resolved, create the merge commit
    if (!this.hasConflicts()) {
      try {
        await handle.git.raw(['commit', '--no-edit']);
        log.info({ file }, '[conflicts] all conflicts resolved — merge commit created');
      } catch (e) {
        log.warn(
          { err: e },
          '[conflicts] failed to commit merge after all conflicts resolved — manual commit may be needed',
        );
      }
    }
  }
}
