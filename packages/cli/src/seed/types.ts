import type { FolderRule } from '../config/schema.ts';

/**
 * A filesystem entry that the scaffolder will create on apply.
 */
export interface FileEntry {
  /** Path relative to the project root. */
  path: string;
  kind: 'folder' | 'file';
  /** For files, first N lines of the content to be written. Omitted for folders. */
  contentPreview?: string;
}

/**
 * An entry the scaffolder detected but will NOT write because it's already present
 * or would collide with user content. Surfaced so the plan is fully transparent.
 */
export interface SkipEntry {
  path: string;
  reason: 'already-exists' | 'user-content' | 'glob-collision';
}

/**
 * A config.yml edit that the scaffolder will apply by appending to the `folders:`
 * array. The entry matches the existing `FolderRuleSchema` shape — no schema change.
 */
export interface ConfigEdit {
  /** Absolute or project-relative path to the config.yml being edited. */
  configPath: string;
  /** The glob pattern that the entry matches (keyed for collision detection). */
  folderMatch: string;
  /** The new folder rule to append. */
  entry: FolderRule;
}

/**
 * The full plan the scaffolder computed. A pure, read-only description of what
 * applySeed() would do — never performs writes itself.
 */
export interface ScaffoldPlan {
  /** Folders + files that will be newly created. */
  created: FileEntry[];
  /** Entries detected but skipped. */
  skipped: SkipEntry[];
  /** config.yml edits queued for append. */
  configEdits: ConfigEdit[];
  /** Non-fatal warnings surfaced during planning. */
  warnings: string[];
}

/**
 * Result of applying a ScaffoldPlan.
 *
 * Rollback semantics: on partial failure (e.g. EACCES mid-write), successfully-written
 * entries remain on disk; `errors` lists what failed. Not atomic.
 */
export interface ApplyResult {
  /** Count of folders/files/config-edits successfully written. */
  applied: number;
  /** Per-path errors captured during apply. */
  errors: ApplyError[];
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface ApplyError {
  /** Path that failed. */
  path: string;
  /** Error message. */
  error: string;
}

/**
 * Options accepted by planSeed() / applySeed(). `projectDir` defaults to cwd.
 */
export interface SeedOptions {
  projectDir?: string;
}

/**
 * Thrown by planSeed() when `.open-knowledge/` is absent (user must run `ok init` first).
 */
export class SeedPrerequisiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedPrerequisiteError';
  }
}
